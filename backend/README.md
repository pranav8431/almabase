# Structured Questionnaire Answering Tool

## What I built
This project is an end-to-end AI-powered questionnaire assistant with:

1. User signup/login (JWT authentication)
2. Persistent database storage (SQLite locally, Postgres-ready via `DATABASE_URL`)
3. Questionnaire upload (`.txt`)
4. Answer generation from static company references
5. One-question ask mode (`/ask`) for quick Q&A

## Industry & fictional company
- **Industry:** FinTech SaaS
- **Company:** LedgerShield
- LedgerShield helps regulated finance teams complete security and compliance questionnaires using approved internal policy documents.

## Assignment checklist mapping
- **Authentication:** `POST /signup`, `POST /login`
- **Persistent DB:** SQLAlchemy models (`users`, `answers`)
- **Upload to generate flow:** Upload questionnaire → generate answers
- **AI work:** Retrieval + grounded LLM answer generation
- **Grounding with citations:** citations are returned with each generated answer

## API flow
1. `POST /signup`
2. `POST /login`
3. `POST /upload-questionnaire`
4. `GET /references` (view static company reference files)
5. `POST /generate`
6. `POST /ask`

Bonus endpoint:
- Already included in core flow: one-off question answering.

## Nice-to-have features implemented
1. Confidence score (`confidence`)
2. Evidence snippets (`evidence_snippets`)
3. Coverage summary in `/generate`

## Assumptions
- Questionnaire file is plain text (`.txt`) with one question per line.
- Reference docs are static `.txt` files in `reference_docs/`.

## Trade-offs
- Simple and reliable local setup (SQLite) over advanced infra complexity.
- Focused MVP architecture (single FastAPI app + simple frontend).
- Text-only questionnaire input for assignment speed and clarity.
git init
## What I would improve with more time
- Add PDF/Excel questionnaire parsing.
- Add version history of multiple generation runs.
- Add tests (API + integration) and migrations (Alembic).
- Add stronger validation and finer-grained role permissions.

## Run locally
1. `pip install -r requirements.txt`
2. Create `.env`:
   ```env
   SECRET_KEY=replace_with_strong_secret
   GROQ_API_KEY=your_groq_key
   GROQ_MODEL=llama-3.1-8b-instant
   DATABASE_URL=sqlite:///./app.db
   ```
3. `uvicorn main:app --reload`
4. Open UI: `http://127.0.0.1:8000/`
5. Open docs: `http://127.0.0.1:8000/docs`

## Free deployment (Render + Neon)
1. Push repo to GitHub.
2. Create free Postgres on Neon.
3. Deploy with `render.yaml` (root dir: `backend`).
4. Set env vars in Render: `SECRET_KEY`, `GROQ_API_KEY`, `DATABASE_URL`.
