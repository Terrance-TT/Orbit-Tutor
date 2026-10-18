# Orbit — Development Handoff

**Read this first in any new chat.** This document is the current source of truth for the project. It supersedes the implementation details of the original "Orbit — Product Specification" (which remains the product *vision*, but described a native iPad app and an earlier architecture).

---

## 1. What Orbit is

Orbit is an AI math tutor that locates the exact step where a student's reasoning broke, instead of just marking the final answer right/wrong. The core loop:

1. Student is shown an Algebra problem and writes their solution by hand (Apple Pencil on iPad).
2. Each handwritten line is recognized as LaTeX via **Mathpix**.
3. The student **confirms the recognized reading** (diagnosis never proceeds on an unconfirmed reading).
4. A **SymPy checker** validates every line-to-line transition symbolically and reports the **first divergent line**.
5. The tutor diagnoses the misconception at that line and gives a short explanation (built; live LLM output requires `TUTOR_API_KEY`). Still not built: resume-from-last-correct-line and a follow-up verification problem.

Design principles: silent by default (no mid-work interruption), symbolic checking only (never string matching), any mathematically valid solution route is accepted.

## 2. Current status (what works today)

Deployed and working end-to-end:

- **App (iPad or any browser):** https://web-production-b030b.up.railway.app
- **API:** https://api-production-ea51.up.railway.app
- Problem picker with **19 Algebra 1 problems** (one/two-step equations, distribution, combining like terms, simple factoring).
- Full-screen Pencil-only writing with instant ink, rapid successive strokes work, palm/finger rejection.
- Live Mathpix recognition with per-line reading confirmation (edit + confirm-all; low-confidence badges).
- Symbolic checking with divergent-line highlighting in the student's own work; quiet success state on correct answers.
- **Tutor diagnosis at the divergent line:** misconception classification (`arithmetic_slip`, `sign_error`, `distribution_error`, `concept_misconception`, `misread_problem`, `other`), summary, micro-explanation, and fix hint. Uses Kimi/Moonshot; deterministic mock tutor for local dev. Production needs `TUTOR_API_KEY`.
- "Type instead" mode (enter LaTeX lines without handwriting; still passes through confirmation).
- `/ink-test` diagnostic page and `?debug=1` pointer-event HUD for device debugging.

**Not built yet:** resume-from-last-correct-line flow, follow-up verification problems, learner model/memory, explanation-style personalization, hesitation/stroke analytics, voice, accounts/database.

## 3. Repository & stack

Repo: `/Users/adam/Orbit` (git, monorepo). Everything below is committed.
GitHub remote (private): https://github.com/Terrance-TT/Orbit-Tutor — `main` tracks `origin/main`; push with `git push`.

```
Orbit/
├── api/                  # FastAPI + SymPy backend (Python 3.12)
│   ├── app/
│   │   ├── main.py           # Endpoints + CORS + recognition/diagnosis
│   │   ├── checker.py        # Symbolic transition checker (the core)
│   │   ├── mathpix_client.py # Live + mock Mathpix clients
│   │   ├── tutor.py          # Kimi/Moonshot diagnosis client + prompt/parser + mock
│   │   ├── problems.py       # Problem bank loader
│   │   └── schemas.py        # Pydantic API models
│   ├── problems/         # 5 JSON files, 19 problems total
│   ├── tests/            # pytest: 19 tests incl. checker fixtures + tutor tests
│   ├── requirements.txt
│   └── Dockerfile
├── web/                  # Next.js 16.4 (App Router, Turbopack) + React 19 + TS + Tailwind v4
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Screen state machine: picker → solve → confirm → result
│   │   │   ├── layout.tsx        # iPad viewport/PWA metadata
│   │   │   ├── globals.css       # Includes global touch-action: manipulation
│   │   │   ├── manifest.ts       # PWA manifest
│   │   │   └── ink-test/route.ts # Raw-HTML diagnostic page
│   │   ├── components/
│   │   │   ├── DrawingCanvas.tsx     # ⚠ SVG ink engine — read before editing (§6)
│   │   │   ├── SolveScreen.tsx       # Full-screen writing + type-instead mode
│   │   │   ├── ConfirmationScreen.tsx
│   │   │   ├── ResultScreen.tsx
│   │   │   ├── ProblemPicker.tsx
│   │   │   └── Latex.tsx             # KaTeX via renderToString (no react-katex)
│   │   └── lib/
│   │       ├── api.ts          # Typed fetch wrappers (screens never call fetch directly)
│   │       ├── types.ts        # Stroke = { points: [{x, y, t}] }, API types
│   │       ├── segment.ts      # Strokes → capped per-line JPEGs for Mathpix
│   │       ├── ink.ts          # Ink constants + canvas drawing helpers (export only)
│   │       └── storage.ts      # localStorage persistence (SSR-guarded)
│   ├── public/ink-test.js + public/vendor/signature_pad.umd.min.js
│   └── Dockerfile
├── .railway/railway.ts   # Railway IaC (pulled from the deployed project)
└── README.md             # Setup + deploy docs
```

Other dependencies: `katex`, `signature_pad` (only used by `/ink-test`), `playwright` (dev, for browser repro). Backend: `sympy` 1.13 + `antlr4-python3-runtime==4.11` (LaTeX parsing), `httpx`, `fastapi`, `uvicorn`, `pydantic`, `pytest`.

## 4. Run, test, deploy

**Local dev:**
```bash
cd api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
MATHPIX_MOCK=true TUTOR_MOCK=true .venv/bin/python -m uvicorn app.main:app --port 8000   # mock OCR + tutor, no keys needed
cd web && npm install && npm run dev                                      # http://localhost:3000
```

**Checks before committing:**
```bash
cd api && .venv/bin/python -m pytest tests/ -q     # expect 21 passed
cd web && npm run lint && npm run build            # expect clean
```

**Deploy (each subdirectory is linked to its own Railway service):**
```bash
cd api && railway up -d     # deploys backend
cd web && railway up -d     # deploys frontend
railway deployment list -s web   # confirm SUCCESS (from repo root)
```
Deploying from the repo root uploads the whole monorepo and Railpack fails — always deploy from within `api/` or `web/`.

**Railway project:** https://railway.com/project/f4ae078c-d1f3-49bc-9a6a-08f556b1a003 (project `orbit`, services `api` + `web`, each with a Dockerfile detected at its upload root).

**Environment variables:**
- `api`: `MATHPIX_APP_ID`, `MATHPIX_APP_KEY`, `TUTOR_API_KEY` (all via Railway secrets), `MATHPIX_MOCK=false`, `TUTOR_MOCK=false`, `WEB_ORIGIN=https://web-production-b030b.up.railway.app`.
- Optional tutor overrides: `TUTOR_BASE_URL` (default `https://api.moonshot.ai/v1`) and `TUTOR_MODEL` (default `kimi-k2.6`). If Moonshot rejects the default model ID, set `TUTOR_MODEL` to a model enabled on the account (query `GET /v1/models` with the account key).
- `web`: `NEXT_PUBLIC_API_URL=https://api-production-ea51.up.railway.app` — **build-time** (inlined into the bundle); changing it requires a rebuild/redeploy.
- Local mock mode: `MATHPIX_MOCK=true`, `TUTOR_MOCK=true`; optional `MATHPIX_MOCK_SCENARIO=correct|sign_error|distribution_error`.

## 5. Backend behavior that matters

**API contract (frontend depends on exact shapes):**
- `GET /problems` → `[{id, title, prompt_latex, skills}]`
- `GET /problems/{id}` → same + `answer_latex`
- `POST /recognize` — body `{images: [dataURL,...], problem_id?}` → `{lines: [{latex, confidence, warning}]}`. When `problem_id` is provided, lines containing symbols outside the problem variable get `warning: "Possible misread…"` (OCR confidence alone is not a plausibility check); valid lines have `warning: null`.
- `POST /check` — body `{problem_id, lines: [latex,...]}` → `{correct, divergent_line_index, final_answer_correct, parsed_lines: [{raw, parsed, status}]}`
- `POST /diagnose` — body `{problem_id, lines: [latex,...], divergent_line_index?}` → `{error_type, summary, explanation, fix_hint}`. If the index is omitted, the server recomputes it with the checker; correct/no-divergence work returns 400.

**Checker (`checker.py`):**
- LaTeX parsed with `sympy.parsing.latex.parse_latex` (antlr). Parsing is isolated behind `parse_line()` so the engine can be swapped.
- Each line is validated against the previous trusted line (starting at the problem prompt): for equations, **solution sets must match** (`solveset` over the reals). First line whose transition fails = `divergent_line_index` (0-based). This is why alternative valid methods are accepted by construction.
- Lines with free symbols other than the problem variable are marked **unparseable** (antlr reads garbage like "garbage" as `g*a*r*b*a*g*e`, so syntax success ≠ real math). Unparseable ≠ invalid, but blocks `correct`.
- Expression (non-equation) lines fall back to `simplify(a-b)==0` equivalence; `unknown` transitions keep the previous anchor.

**Mathpix client (`mathpix_client.py`):**
- Request: `POST https://api.mathpix.com/v3/text` with `app_id`/`app_key` headers, body `{src: dataURL, formats: ["text", "latex_styled"], include_line_data: true}`. **`include_line_data` is top-level** — nesting it under `data_options` silently breaks parsing.
- Response: prefer `line_data[]` entries (skip `included: false`), take `latex` or `text`, strip `\(...\)` / `$...$` delimiters; fall back to whole-result `latex_styled`/`text` split by newlines.
- Errors: missing credentials with `MATHPIX_MOCK=false` → **503 naming the missing variable** (never silently mock in prod — that once looked like "awful recognition"); Mathpix `error_info` or empty result → 502. Per-image calls fan out via `ThreadPoolExecutor(max_workers=4)`.
- Mock client returns canned lines for local dev only.

**Recognition image pipeline (`web/src/lib/segment.ts`):** line crops are JPEGs (quality 0.92) scaled by `min(3, 1800/width, 600/height)`. Do not restore a fixed 3× export — oversized images triggered Mathpix `sys_request_too_large` and recognition hiccups. The confirmation screen displays the backend's `warning` beside any suspicious reading so the student can correct it before checking.

**Tutor (`tutor.py`):**
- The checker finds the divergent line deterministically; the LLM only classifies and explains it. Prompt includes the problem, known answer, and numbered student lines with `FIRST WRONG LINE` marked. Response must be JSON with `error_type`, `summary`, `explanation`, `fix_hint`; fenced/prose-wrapped JSON is tolerated and unknown error types map to `other`.
- Uses Moonshot/Kimi's OpenAI-compatible `POST {TUTOR_BASE_URL}/chat/completions` with bearer `TUTOR_API_KEY`. `TUTOR_MOCK=false` with no key → 503 (never silently mock in prod); upstream/parse failures → 502. `MockTutorClient` is for local dev only.

**Problem bank:** each JSON file is a list of `{id, title, prompt_latex, answer_latex, skills}`. No scripted solution paths — valid routes emerge from symbolic checking. Add problems by adding entries; IDs must be unique.

## 6. The ink engine — do not casually rewrite

`web/src/components/DrawingCanvas.tsx` works on iPad after a long debugging saga. These invariants are load-bearing:

- **SVG, not canvas.** Completed strokes are React-rendered `<path>` elements (`d` = `M x y L x y ...`); the active stroke is one `<path>` updated **imperatively** via `setAttribute("d", ...)`. No React state updates mid-stroke, no `requestAnimationFrame` (iPad Safari suspends rAF during Pencil contact), no canvas bitmap.
- **Native DOM listeners**, attached to the SVG in one `useEffect`: no React synthetic pointer props, no `setPointerCapture`, no `getCoalescedEvents`. Releases outside the surface are caught on `window`.
- **Strokes start on `pointerdown` OR on any pen-contact `pointermove`.** iOS can swallow `pointerdown` for a rapid second stroke; requiring it drops the stroke. Contact = `e.buttons !== 0 || e.pressure > 0`.
- **pointerId-aware lifecycle.** A new contact ID finalizes the stale stroke (old `pointerup` can arrive *after* the new `pointerdown`); late events from old IDs are ignored.
- **Pencil-only:** every handler starts with `if (e.pointerType === "touch") return;` (palms/fingers can't draw; mouse allowed for desktop).
- **Gesture suppression:** `touch-action: manipulation` on `html, body` (kills double-tap zoom globally — this was the root cause of dropped rapid second strokes), `touch-action: none` + `select-none` + `WebkitTouchCallout: none` on the SVG, and non-passive `preventDefault()` on `touchstart/move/end`, `dblclick`, `gesturestart`.
- **Atomic commits:** on stroke finish, the internal `strokesRef` is updated synchronously before `onStrokesChange(next)` so rapid commits can't overwrite each other.
- Data model is the only coupling to the rest of the app: `Stroke = { points: [{x, y, t}] }`, flowing to `lib/segment.ts` → Mathpix. Timestamps are captured for future V2 hesitation analytics.

## 7. Debugging tools already built

- `/ink-test` (also on the deployed site): three input stacks side by side with stroke/event counters, for on-device comparison. Uses `signature_pad` as a reference implementation.
- `?debug=1` on the main app: bottom-left HUD showing raw pointer events and the ink build marker (`build ink-v8 (contact-driven)`).
- Browser repro pattern (Playwright + WebKit, run against local servers): verify ink appears **during** a stroke and that **three rapid strokes** all persist; also simulate a swallowed `pointerdown` by dispatching only `pointermove` events with `buttons: 1`.

## 8. What to build next (in priority order)

1. **Follow-up verification problem** after a fix + resume-from-last-correct-line flow (the diagnosis itself is now built).
2. **Explanation-style escalation and self-correction first** — where appropriate, tell the student an error exists between lines N–M before showing the full diagnosis; if one explanation style doesn't land, try another (visual, numeric example, analogy).
3. **Expand math coverage** as a family of checkers behind one interface: next easiest = quadratics, systems of equations, expression simplification (equivalence rather than solution-set mode), each with pytest fixtures and domain-specific tutor prompts. Trig/calculus later (LaTeX parsing gets fragile). Word problems/geometry/proofs need an LLM-based checker, not SymPy.
4. **Learner model** (misconception log, explanation-style preferences) — needs a database (none yet; all state is client-side + localStorage).

Original spec sections still worth honoring: privacy/COPPA stance (no camera ever, data export/delete, no ads), silence-by-default, self-correction before explanation.

## 9. Suggested first message for a new chat

> I'm building Orbit at `/Users/adam/Orbit`. Start by reading `HANDOFF.md` in the repo root — it has the architecture, deploy commands, API contract, and the ink-engine invariants. The deployed app works end-to-end. Don't rewrite `web/src/components/DrawingCanvas.tsx`'s input model without reading §6 of that doc. Next task: [pick one from §8].
