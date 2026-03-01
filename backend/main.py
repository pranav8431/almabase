import os
import re
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import (
	ACCESS_TOKEN_EXPIRE_MINUTES,
	create_access_token,
	get_current_user,
	get_db,
	get_password_hash,
	verify_password,
)
from database import Base, engine
from llm import LLMGenerator
from models import Answer, User
from rag import SimpleRAG

load_dotenv()

app = FastAPI(title="Company Questionnaire Bot API")

UPLOADS_DIR = Path("uploads")
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
FRONTEND_PATH = FRONTEND_DIR / "index.html"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

QUESTION_PATTERN = re.compile(r"^\s*\d+[\).:-]?\s*(.+)$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


class SignupRequest(BaseModel):
	email: str
	password: str


class AskRequest(BaseModel):
	question: str


class UpdateAnswerRequest(BaseModel):
	answer: str


def resolve_reference_docs_dir() -> str:
	candidates = ["reference_docs", "refrence_docs"]
	for candidate in candidates:
		if os.path.isdir(candidate):
			return candidate
	raise FileNotFoundError(
		"Could not find reference docs folder. Expected one of: reference_docs/, refrence_docs/"
	)


def parse_questions_from_lines(lines: List[str]) -> List[str]:
	questions: List[str] = []
	for line in lines:
		stripped = line.strip()
		if not stripped:
			continue
		matched = QUESTION_PATTERN.match(stripped)
		question_text = matched.group(1).strip() if matched else stripped
		if question_text:
			questions.append(question_text)
	return questions


def parse_questionnaire(file_path: Path) -> List[str]:
	if not file_path.exists():
		raise FileNotFoundError(f"Questionnaire file not found: {file_path}")

	with file_path.open("r", encoding="utf-8") as file:
		lines = file.readlines()
	return parse_questions_from_lines(lines)


def parse_questionnaire_entries(file_path: Path) -> List[dict]:
	if not file_path.exists():
		raise FileNotFoundError(f"Questionnaire file not found: {file_path}")

	entries: List[dict] = []
	with file_path.open("r", encoding="utf-8") as file:
		for line in file.readlines():
			original = line.rstrip("\n")
			stripped = original.strip()
			if not stripped:
				continue
			matched = QUESTION_PATTERN.match(stripped)
			normalized = matched.group(1).strip() if matched else stripped
			if normalized:
				entries.append({"original": original, "normalized": normalized})
	return entries


def get_questionnaire_path(user_id: int) -> Path:
	return UPLOADS_DIR / f"user_{user_id}_questionnaire.txt"


def build_reference_index() -> None:
	docs_dir = resolve_reference_docs_dir()
	rag_mode = os.getenv("RAG_MODE")
	if not rag_mode:
		rag_mode = "keyword" if os.getenv("RENDER") else "semantic"
	rag = SimpleRAG(model_name="all-MiniLM-L6-v2", mode=rag_mode)
	rag.load_documents(docs_dir)
	rag.build_index()
	app.state.rag = rag


def get_reference_filenames() -> List[str]:
	docs_dir = Path(resolve_reference_docs_dir())
	return sorted([path.name for path in docs_dir.glob("*.txt") if path.is_file()])


@app.on_event("startup")
def startup_event() -> None:
	Base.metadata.create_all(bind=engine)
	build_reference_index()

	groq_api_key = os.getenv("GROQ_API_KEY")
	if not groq_api_key:
		raise ValueError("GROQ_API_KEY is not set.")
	app.state.llm = LLMGenerator(api_key=groq_api_key)


@app.get("/")
def frontend() -> FileResponse:
	return FileResponse(path=str(FRONTEND_PATH), media_type="text/html")


@app.get("/references")
def list_references() -> dict:
	return {"references": get_reference_filenames()}


@app.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> dict:
	if not EMAIL_PATTERN.match(payload.email.strip()):
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter correct email")

	existing_user = db.query(User).filter(User.email == payload.email).first()
	if existing_user:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

	user = User(email=payload.email, hashed_password=get_password_hash(payload.password))
	db.add(user)
	db.commit()
	db.refresh(user)
	return {"id": user.id, "email": user.email}


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> dict:
	if not EMAIL_PATTERN.match(form_data.username.strip()):
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter correct email")

	user = db.query(User).filter(User.email == form_data.username).first()
	if not user or not verify_password(form_data.password, user.hashed_password):
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Incorrect email or password",
			headers={"WWW-Authenticate": "Bearer"},
		)

	token = create_access_token(subject=user.email)
	return {
		"access_token": token,
		"token_type": "bearer",
		"expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
	}


@app.post("/upload-questionnaire")
def upload_questionnaire(
	file: UploadFile = File(...),
	current_user: User = Depends(get_current_user),
) -> dict:
	if not file.filename.lower().endswith(".txt"):
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .txt files are allowed")

	destination = get_questionnaire_path(current_user.id)
	destination.write_bytes(file.file.read())

	return {
		"message": "Questionnaire uploaded successfully.",
		"filename": destination.name,
	}


@app.post("/generate")
def generate_answers(
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> dict:
	questionnaire_path = get_questionnaire_path(current_user.id)
	if not questionnaire_path.exists():
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Questionnaire not uploaded")

	questions = parse_questionnaire(questionnaire_path)
	entries = parse_questionnaire_entries(questionnaire_path)
	if len(entries) != len(questions):
		entries = [{"original": question, "normalized": question} for question in questions]
	rag: SimpleRAG = app.state.rag
	llm: LLMGenerator = app.state.llm

	db.query(Answer).filter(Answer.user_id == current_user.id).delete()

	results: List[dict] = []
	covered_count = 0
	not_found_count = 0

	for entry in entries:
		question = str(entry["normalized"])
		retrieved = rag.retrieve(question, k=3, threshold=0.35)

		if not retrieved:
			answer_text = "Not found in references."
			citations: List[str] = []
			evidence: List[str] = []
			confidence = 0.0
			not_found_count += 1
		else:
			answer_text = llm.generate(question, retrieved)
			citations = sorted({str(item["source"]) for item in retrieved if "source" in item})
			evidence = [str(item["text"]) for item in retrieved[:2]]
			confidence = round(float(retrieved[0].get("score", 0.0)), 4)
			if answer_text == "Not found in references.":
				not_found_count += 1
			else:
				covered_count += 1

		row = Answer(
			user_id=current_user.id,
			question=question,
			answer=answer_text,
			citation=", ".join(citations),
		)
		db.add(row)
		db.flush()

		results.append(
			{
				"id": row.id,
				"question": question,
				"answer": answer_text,
				"citations": citations,
				"confidence": confidence,
				"evidence_snippets": evidence,
			}
		)

	db.commit()

	return {
		"summary": {
			"total_questions": len(entries),
			"answered_with_citations": covered_count,
			"not_found": not_found_count,
		},
		"results": results,
	}


@app.get("/answers")
def list_answers(
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> dict:
	rows = (
		db.query(Answer)
		.filter(Answer.user_id == current_user.id)
		.order_by(Answer.id.asc())
		.all()
	)

	results = []
	for row in rows:
		citations = [item.strip() for item in (row.citation or "").split(",") if item.strip()]
		results.append(
			{
				"id": row.id,
				"question": row.question,
				"answer": row.answer,
				"citations": citations,
			}
		)

	return {"results": results}


@app.put("/answers/{answer_id}")
def update_answer(
	answer_id: int,
	payload: UpdateAnswerRequest,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> dict:
	row = (
		db.query(Answer)
		.filter(Answer.id == answer_id, Answer.user_id == current_user.id)
		.first()
	)
	if not row:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found")

	updated_answer = payload.answer.strip()
	if not updated_answer:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer cannot be empty")

	row.answer = updated_answer
	db.commit()
	db.refresh(row)

	return {
		"id": row.id,
		"question": row.question,
		"answer": row.answer,
		"citations": [item.strip() for item in (row.citation or "").split(",") if item.strip()],
	}


@app.get("/export")
def export_answers(
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> StreamingResponse:
	questionnaire_path = get_questionnaire_path(current_user.id)
	if not questionnaire_path.exists():
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Questionnaire not uploaded")

	entries = parse_questionnaire_entries(questionnaire_path)
	if not entries:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No questions found in questionnaire")

	rows = (
		db.query(Answer)
		.filter(Answer.user_id == current_user.id)
		.order_by(Answer.id.asc())
		.all()
	)
	if not rows:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No generated answers to export")

	blocks: List[str] = []
	for idx, entry in enumerate(entries):
		question_line = str(entry["original"])
		row = rows[idx] if idx < len(rows) else None
		answer_text = row.answer if row else "Not found in references."
		citation_text = row.citation if row and row.citation.strip() else "None"
		blocks.append(
			f"{question_line}\nAnswer: {answer_text}\nCitations: {citation_text}"
		)

	content = "\n\n".join(blocks)
	filename = f"questionnaire_answers_user_{current_user.id}.txt"
	return StreamingResponse(
		iter([content]),
		media_type="text/plain",
		headers={"Content-Disposition": f'attachment; filename="{filename}"'},
	)


@app.post("/ask")
def ask_question(
	payload: AskRequest,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user),
) -> dict:
	question = payload.question.strip()
	if not question:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question cannot be empty")

	rag: SimpleRAG = app.state.rag
	llm: LLMGenerator = app.state.llm
	retrieved = rag.retrieve(question, k=3, threshold=0.35)

	if not retrieved:
		answer_text = "Not found in references."
		citations: List[str] = []
		evidence: List[str] = []
		confidence = 0.0
	else:
		answer_text = llm.generate(question, retrieved)
		citations = sorted({str(item["source"]) for item in retrieved if "source" in item})
		evidence = [str(item["text"]) for item in retrieved[:2]]
		confidence = round(float(retrieved[0].get("score", 0.0)), 4)

	row = Answer(
		user_id=current_user.id,
		question=question,
		answer=answer_text,
		citation=", ".join(citations),
	)
	db.add(row)
	db.commit()
	db.refresh(row)

	return {
		"id": row.id,
		"question": question,
		"answer": answer_text,
		"citations": citations,
		"confidence": confidence,
		"evidence_snippets": evidence,
	}

