# Structured Questionnaire Answering Tool

## Submission
- **Live app link:** [`link`](https://almabase-27zc.onrender.com/)
- **GitHub repository:** [`https://github.com/pranav8431/almabase`](https://github.com/pranav8431/almabase)

## What I built
An end-to-end AI-powered questionnaire assistant that supports:

1. User authentication (sign up and log in with JWT)
2. Persistent storage of users and generated answers (SQLAlchemy + DB)
3. Questionnaire upload and parsing into structured questions
4. Retrieval + LLM-based grounded answer generation
5. Citations attached to each generated answer
6. Review/edit answers before final export
7. Export as a downloadable document preserving question order/structure

The app is fully functional as a complete workflow from upload to export.

## Industry & fictional company (required)
- **Industry chosen:** FinTech SaaS
- **Fictional company:** **LedgerShield**

LedgerShield provides compliance tooling for regulated finance teams. It helps teams respond to security and vendor due-diligence questionnaires using approved internal policy documents. The product focus is reliable, auditable responses with clear source references.

## Assignment assets created
- **Questionnaire (8–15 questions):** `backend/questionnaire.txt` (9 questions)
- **Reference documents (3–8 docs):** `backend/reference_docs/`
  - `Compliance.txt`
  - `Data_Protection.txt`
  - `Incident_Response.txt`
  - `Infrastructure.txt`
  - `Security_Policy.txt`

## Repository structure
- `backend/` - FastAPI API, authentication, database, RAG, LLM integration
- `frontend/` - Single-page web UI (HTML/CSS/JS)

## How the system works

### Phase 1: Core workflow
User flow:
1. Sign up / log in
2. Upload questionnaire document
3. Generate answers

System behavior:
1. Parses uploaded questionnaire into individual questions
2. Retrieves relevant passages from reference docs
3. Generates one answer per question
4. Adds citations for each supported answer
5. Returns **`Not found in references.`** when evidence is missing

Web output includes:
- Question
- Generated answer
- Citation(s)

### Phase 2: Review & export
After generation, user can:
1. Review generated answers
2. Edit answers
3. Export final document

Export behavior:
- Preserves original question order and structure
- Keeps original question text unchanged
- Inserts answer directly under each question
- Includes citations with each answer

## Required expectations checklist
- ✅ Actual coding/scripting: FastAPI backend + frontend JS
- ✅ Functional end-to-end system
- ✅ User authentication
- ✅ Persistent database storage
- ✅ Clear upload → generate → review/edit → export flow
- ✅ AI does meaningful work (retrieval + grounded generation)
- ✅ Grounded outputs with citations

## API endpoints (evaluator map)
- `POST /signup` - register
- `POST /login` - authenticate
- `POST /upload-questionnaire` - upload questionnaire
- `GET /references` - list stored reference documents
- `POST /generate` - generate answers from questionnaire
- `GET /answers` - load saved answers
- `PUT /answers/{answer_id}` - edit/save answer
- `POST /ask` - one-off Q&A against references
- `GET /export` - download final structured output document

## Nice-to-have features implemented (2+)
1. **Confidence score** (`confidence`)
2. **Evidence snippets** (`evidence_snippets`)
3. **Coverage summary** in generation response (total, answered, not-found)

## Assumptions
- Questionnaire input is currently plain-text format (`.txt`) with one question per line.
- Reference documents are stored as static company source-of-truth files in `backend/reference_docs/`.
- Users are authenticated before generation/edit/export actions.
- If the LLM key is unavailable, unsupported content still safely falls back to `Not found in references.`

## Trade-offs
- Chose a complete MVP workflow over broad file-format support (PDF/XLSX parsing deferred).
- Kept architecture simple (single FastAPI service + lightweight frontend) for reliability and clarity.
- Prioritized groundedness and reviewer control (citations + edit-before-export) over UI polish.

## What I would improve with more time
- Add robust PDF/XLSX parsing and template-preserving exports for more formats.
- Add partial regeneration for selected questions.
- Add version history and answer comparisons across runs.
- Add automated tests and DB migrations (Alembic).
- Improve citation quality scoring and evaluator diagnostics.

## Run locally
1. Create/activate Python virtual environment.
2. Install dependencies:
	```bash
	pip install -r backend/requirements.txt
	```
3. Create `backend/.env`:
	```env
	SECRET_KEY=replace_with_strong_secret
	GROQ_API_KEY=your_groq_key
	GROQ_MODEL=llama-3.1-8b-instant
	DATABASE_URL=sqlite:///./app.db
	```
4. Start backend from `backend/`:
	```bash
	uvicorn main:app --reload
	```
5. Open app: `http://127.0.0.1:8000/`
6. Open API docs: `http://127.0.0.1:8000/docs`

## Quick demo flow
1. Sign up or sign in.
2. Upload the sample questionnaire (`backend/questionnaire.txt`) from UI.
3. Click **Generate From Questionnaire**.
4. Review/edit answers and save edits.
5. Click **Export Document** to download the final output.

## Deployment notes (Render + Neon)
1. Push repo to GitHub.
2. Provision managed Postgres (e.g., Neon).
3. Deploy using `backend/render.yaml`.
4. Configure env vars in Render:
	- `SECRET_KEY`
	- `DATABASE_URL`
	- `GROQ_API_KEY` (recommended for full LLM generation)
