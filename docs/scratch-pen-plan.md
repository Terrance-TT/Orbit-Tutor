# Scratch pen with SymPy scratch analysis + tutor visibility

**Status:** approved design, not yet implemented. Implement this in a fresh chat after reading `HANDOFF.md` (especially §5 API contract and §6 ink-engine invariants).

## Core idea

Students get a **scratch pen**: a mode for rough work on the solve and correction screens. Scratch work is captured but kept out of the ordered solution derivation — the checker validates an ordered chain, and scratch violates that contract by design (dead ends, false starts, fragments). However, scratch lines are still parseable math, so SymPy analyzes them separately and the tutor receives **structured symbolic findings** — not just raw scratch text.

Three sound SymPy operations over scratch lines:

1. **Evaluate fragments.** A scratch line like `11-3=9` is deterministically false (`simplify(lhs-rhs) != 0`). Many divergent solution lines are arithmetic slips copied from scratch — find the slip at its source.
2. **Link scratch errors to the divergent line.** When solution line N diverges, find a false scratch fragment whose (wrong) claimed result appears as a SymPy atom in line N. The diagnosis becomes a fact: "the 9 in `2x=9` came from your scratch computation `11-3=9`, and `11-3=8`."
3. **Justification search (note only).** BFS over trusted solution lines + scratch lines, using the core transition rule as the edge condition (solution-set match for equations, equivalence for expressions). If a valid path from the anchor to the divergent line exists through scratch, the tutor says "your scratch justifies this — write those steps into your solution." **Verdicts never change** — scratch never alters `correct`/`divergent_line_index` (this was the explicit product decision; letting scratch rescue a jump was rejected).

The checker never *fails* scratch work either — dead ends and unreadable lines are allowed and silently skipped.

## Phase 1 — Scratch layer (capture)

- `scratchStrokes: Stroke[]` in `web/src/app/page.tsx`, fully separate from `strokes`. Separate per-problem localStorage key following `lib/storage.ts` conventions. Both layers survive reload independently.
- Solve/Scratch segmented toggle on the solve screen AND the correction screen (same visual idiom as the Write/Type toggle).
- `DrawingCanvas` gains an `inkColor` prop only; scratch strokes render in a lighter gray. **Input lifecycle per HANDOFF §6 is untouched** — no changes to listeners, stroke starts, pointerId handling, or commit logic.
- Undo/Clear scoped to the active layer. Scratch never enters `strokesToLineImages`, `/recognize` (for the solution), or `/check`.

## Phase 2 — Scratch analysis

Trigger: check result is wrong (divergent line, form-gate failure, or wrong final answer) AND `scratchStrokes.length > 0`. Correct answers skip scratch entirely (silent by default).

1. **OCR (frontend):** render ALL scratch strokes into one padded, dimension-capped JPEG (helper in `lib/segment.ts`, same cap as line crops) → `POST /recognize` with no `problem_id`. One call; Mathpix `line_data` splits lines. On failure/empty → proceed silently without scratch context. Never block diagnosis on scratch.
2. **Analyze (backend, new `api/app/scratch_analysis.py`)**, called from `/diagnose` when `scratch_lines` are provided:
   - Parse each scratch line with `checker.parse_line` (problem's symbols allowed). Unparseable → marked `unreadable`, skipped.
   - **False-fragment detection:** equation-shaped lines are evaluated for truth; record `{line, claimed_result, actual_result}` for false ones. Bare expressions evaluate to a value.
   - **Link:** for each false fragment, check whether `claimed_result` appears as an atom in the divergent solution line.
   - **Justify search:** BFS over trusted prefix + scratch lines with the core transition rule as edge condition (promote the checker's private transition helper to a public one — a one-line change). Output `rescued: bool` + path when found.
3. **Tutor prompt (`api/app/tutor.py`):** `build_messages` gains an optional scratch parameter and appends a structured **Scratch findings** block when present:
   - Verified facts: "Scratch line K (`11-3=9`) is arithmetically false; `11-3 = 8`. The value 9 appears in the student's wrong solution line N."
   - Justify note: "The jump at line N is actually justified by scratch lines J, K."
   - Raw scratch lines (truncated) for full context.
   - The LLM is instructed to treat findings as verified facts and weave them into summary/explanation/fix_hint.
4. `/diagnose` accepts optional `scratch_lines: list[str]` (`schemas.py`; old clients unaffected). `MockTutorClient` unchanged (bypasses prompts). Domain addendums (algebra2/systems) compose unchanged.

Cost: one Mathpix call per wrong-with-scratch result + trivial SymPy work.

## Phase 3 (NOT this implementation)

Auto-detection of scratch strokes from toggle-labeled data; vision-based reading of cross-outs (Kimi k2.6 image input); learner-model integration.

## Files

- **api/**: `app/scratch_analysis.py` (new), `app/tutor.py` (scratch-findings prompt section), `app/schemas.py` (`DiagnoseRequest.scratch_lines`), `app/main.py` (analyze + pass through), `app/checker.py` (promote transition helper to public — one line), `tests/test_scratch_analysis.py` + tutor prompt tests.
- **web/**: `src/app/page.tsx` (scratch state + wrong-result scratch flow), `src/components/SolveScreen.tsx` (toggle), `src/components/DrawingCanvas.tsx` (`inkColor` prop only), `src/lib/storage.ts`, `src/lib/segment.ts`, `src/lib/api.ts`, `src/lib/types.ts`.
- **Docs:** update `HANDOFF.md` §2 (feature) and §5 (`scratch_lines` contract) when done.

## Verification

- `cd api && .venv/bin/python -m pytest tests/ -q` — existing 77 tests still pass + new: false-fragment detection with a real slip, value linking into the divergent line, justify-path found/not-found, unparseable scratch skipped, `/diagnose` forwards scratch.
- `cd web && npm run lint && npm run build` — clean.
- Browser test (mock OCR + mock tutor, local servers): draw solution + scratch, submit a wrong answer → `/check` payload contains only solution lines; `/diagnose` payload contains `scratch_lines`; scratch OCR failure still yields a normal diagnosis; Undo/Clear scoped per layer; both layers persist across reload.
- Deploy: `cd api && railway up -d`, `cd web && railway up -d`, confirm SUCCESS. Push to GitHub and update `HANDOFF.md`.
