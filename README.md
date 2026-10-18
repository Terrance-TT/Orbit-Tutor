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
- `TUTOR_MOCK=true` (default when no tutor key is present) — deterministic mock
  diagnosis for local dev.
- `TUTOR_API_KEY` — Moonshot/Kimi key for live tutor diagnoses.
- `TUTOR_BASE_URL` / `TUTOR_MODEL` — optional overrides (defaults
  `https://api.moonshot.ai/v1` and `kimi-k2.6`).
- `WEB_ORIGIN=http://localhost:3000` — CORS origin for the frontend.

### Web (`web/`)

See `web/README.md`. The frontend expects the API at `http://localhost:8000`.

## Deployment (Railway)

Deploy as **two services** from this one repo. Each service ships a
`Dockerfile`, which Railway detects automatically:

1. **api** — root directory `api/` (`api/Dockerfile`; starts uvicorn on
   `$PORT`).
2. **web** — root directory `web/` (`web/Dockerfile`; `npm run build` then
   `npm run start` on `$PORT`).

Mathpix and tutor credentials are managed via the **Railway secrets manager** on
the `api` service — never commit them:

- `MATHPIX_APP_ID`
- `MATHPIX_APP_KEY`
- `MATHPIX_MOCK=false` (required in production so the live client is used)
- `TUTOR_API_KEY`
- `TUTOR_MOCK=false` (required in production for live diagnoses)

Also set:

- `WEB_ORIGIN` on `api` — the deployed web URL (CORS).
- `NEXT_PUBLIC_API_URL` on `web` — the deployed api URL. This is a **build-time**
  variable (inlined into the Next.js bundle); in Railway, add it under the web
  service's build variables so the Docker build sees it, and redeploy the web
  service if the api URL ever changes.
