# Structured Questionnaire Answering Tool

## Submission
- **Live app link:** `ADD_YOUR_LIVE_RENDER_URL_HERE`
- **GitHub repository:** `ADD_YOUR_GITHUB_REPO_URL_HERE`

## Overview
This project is an end-to-end AI-powered questionnaire assistant with:

1. User signup/login (JWT authentication)
2. Persistent database storage (SQLite locally, Postgres-ready via `DATABASE_URL`)
3. Questionnaire upload (`.txt`) with auto-upload on file selection
4. Answer generation from static company references
5. Review and edit answers before export
6. Export of answered questionnaire as downloadable document
7. One-question ask mode (`/ask`) for quick Q&A
8. Single-page UI where all non-auth functionality is visible only after sign-in

## Repository structure
- `backend/` → FastAPI API, DB models, auth, RAG + LLM integration
- `frontend/` → simple web UI (HTML/CSS/JS)
- `project_guide/` → beginner-friendly walkthrough documents

## Industry & fictional company
- **Industry:** FinTech SaaS
- **Company:** LedgerShield
- LedgerShield helps regulated finance teams complete security and compliance questionnaires using approved internal policy documents.

## Created assignment assets
- **Questionnaire:** `backend/questionnaire.txt` with 9 realistic questions (within required 8–15 range)
- **Reference documents:** 5 source-of-truth files in `backend/reference_docs/` (within required 3–8 range)

## Assignment checklist mapping
- **Authentication:** `POST /signup`, `POST /login`
- **Persistent DB:** SQLAlchemy models (`users`, `answers`)
- **Upload/store references requirement:** references are stored as static source-of-truth files and exposed via `GET /references`
- **Upload to generate flow:** Upload questionnaire → parse questions → generate answers
- **AI work:** Retrieval + grounded LLM answer generation
- **Grounding with citations:** citations are returned with each generated answer; unsupported answers return `Not found in references.`
- **Review & edit:** `GET /answers`, `PUT /answers/{answer_id}`
- **Export document:** `GET /export` (downloadable `.txt` preserving original question order and question text, with answers + citations)

## Phase 1 compliance (Core Workflow)
- Sign up / log in from frontend
- Upload questionnaire and generate answers
- Structured web output includes **Question**, **Generated Answer**, and **Citation(s)**

## Phase 2 compliance (Review & Export)
- Review and edit generated answers before export (`Save Edit`)
- Export downloadable document (`Export Document`) with:
	- original structure/order preserved
	- original question text unchanged
	- answer inserted for each question
	- citations included for each answer

## Frontend testing map (for evaluators)
- **Sign up:** `Sign Up` button
- **Sign in:** `Sign In` button
- **Sign out:** `Sign Out` button
- **Upload questionnaire:** choose a `.txt` file in file picker (auto-calls upload)
- **Generate answers:** `Generate From Questionnaire`
- **Review saved answers:** `Load Saved Answers`
- **Edit answer:** update text and click `Save Edit`
- **Export final document:** `Export Document`
- **Ask one-off question:** enter text and click `Get Answer`
- **Reload references list:** `Reload References`

## API flow
1. `POST /signup`
2. `POST /login`
3. `POST /upload-questionnaire`
4. `GET /references` (view static company reference files)
5. `POST /generate`
6. `GET /answers` and `PUT /answers/{answer_id}` for review/edit
7. `GET /export` to download final document
8. `POST /ask`

## Nice-to-have features implemented
1. Confidence score (`confidence`)
2. Evidence snippets (`evidence_snippets`)
3. Coverage summary in `/generate`

## Assumptions
- Questionnaire file is plain text (`.txt`) with one question per line.
- Reference docs are static `.txt` files in `backend/reference_docs/`.
- A sample questionnaire is included at `backend/questionnaire.txt`.
- Non-auth sections are hidden until a user signs in.

## Trade-offs
- Simple and reliable local setup (SQLite) over advanced infra complexity.
- Focused MVP architecture (single FastAPI app + simple frontend).
- Text-only questionnaire input for assignment speed and clarity.

## What I would improve with more time
- Add PDF/Excel questionnaire parsing.
- Add version history of multiple generation runs.
- Add tests (API + integration) and migrations (Alembic).
- Add stronger validation and finer-grained role permissions.

## Run locally
1. Create/activate your virtual environment.
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
1. Sign up (or sign in if already registered).
2. Select `backend/questionnaire.txt` in the questionnaire file picker.
3. Click `Generate From Questionnaire`.
4. Edit any generated answer and click `Save Edit`.
5. Click `Export Document` and verify download.
6. Ask one custom question in the ask section.

## Free deployment (Render + Neon)
1. Push repo to GitHub.
2. Create free Postgres on Neon.
3. Deploy with `backend/render.yaml` (root dir: `backend`).
4. Set env vars in Render: `SECRET_KEY`, `GROQ_API_KEY`, `DATABASE_URL`.
