# Orbit

Orbit is an AI math tutor for Algebra 1. A student solves a problem by writing
lines of work on paper (or a canvas); the app recognizes each line as LaTeX via
Mathpix, the student confirms the reading, and a SymPy-based checker validates
every line-to-line transition symbolically, pinpointing the **first line where
the work departs from valid algebra** (the "divergent line"). Checking is purely
symbolic — never string matching — so any mathematically valid solution route is
accepted, not just a scripted one.

## Monorepo layout

- `api/` — FastAPI + SymPy backend: problem bank, Mathpix recognition client,
  symbolic transition checker, REST endpoints.
- `web/` — Next.js frontend (built separately; consumes the fixed API contract
  exposed by `api/`).

## Local development

### API (`api/`)

Requires Python 3.12.

```bash
cd api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run the tests:

```bash
cd api
source .venv/bin/activate
python -m pytest
```

Useful environment variables (see `api/.env.example` style usage — all optional
locally):

- `MATHPIX_MOCK=true` (default when keys are absent) — deterministic mock
  recognition so the dev loop works with zero credentials.
- `MATHPIX_MOCK_SCENARIO=correct|sign_error|distribution_error` — pick which
  canned line sequence the mock returns.
- `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` — live Mathpix credentials.
- `WEB_ORIGIN=http://localhost:3000` — CORS origin for the frontend.

### Web (`web/`)

See `web/README.md`. The frontend expects the API at `http://localhost:8000`.

## Deployment (Railway)

Deploy as **two services** from this one repo:

1. **api** — root directory `api/`. Python service; start command
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. **web** — root directory `web/`. Next.js service.

Mathpix credentials are managed via the **Railway secrets manager** on the `api`
service — never commit them:

- `MATHPIX_APP_ID`
- `MATHPIX_APP_KEY`
- `MATHPIX_MOCK=false` (required in production so the live client is used)

Also set `WEB_ORIGIN` on `api` to the deployed web URL, and point `web` at the
deployed `api` URL.
