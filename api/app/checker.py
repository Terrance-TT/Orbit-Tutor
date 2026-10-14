"""Symbolic transition checker — the heart of Orbit.

Checks a student's line-by-line work symbolically (never by string matching):
each consecutive pair of equation lines must preserve the solution set, so any
mathematically valid route is accepted and the first line where the work
departs from valid algebra is reported as the divergent line.

Parsing is isolated behind parse_line() — swap the LaTeX engine there only.
"""

from __future__ import annotations

import sympy as sp
from sympy.core.relational import Equality
from sympy.parsing.latex import parse_latex

VALID, INVALID, UNKNOWN = "valid", "invalid", "unknown"


def parse_line(raw: str, allowed_symbols: set[sp.Symbol] | None = None):
    """Parse one LaTeX line into a SymPy object.

    Returns (expr, None) on success or (None, error_message) on failure.
    Equations become sympy Equality; anything else becomes a plain expression.
    When allowed_symbols is given, any other free symbol marks the line as
    unparseable — antlr happily reads "garbage" as g*a*r*b*a*g*e, so syntax
    success alone does not mean the line is math from this problem.
    """
    text = (raw or "").strip()
    if not text:
        return None, "empty line"
    try:
        expr = parse_latex(text)
    except Exception as exc:  # antlr raises a variety of error types
        return None, f"latex parse error: {exc}"
    if expr is None:
        return None, "parse produced nothing"
    if allowed_symbols is not None:
        unexpected = expr.free_symbols - allowed_symbols
        if unexpected:
            names = ", ".join(sorted(str(s) for s in unexpected))
            return None, f"unexpected symbols: {names}"
    return expr, None


def _problem_variable(problem: dict) -> sp.Symbol:
    expr, _ = parse_line(problem["prompt_latex"])
    symbols = sorted(expr.free_symbols, key=str) if expr is not None else []
    if symbols:
        return symbols[0]
    return sp.Symbol("x")


def _solution_set(expr: sp.Basic, var: sp.Symbol):
    """Solution set over the reals for an Equality, else None."""
    if not isinstance(expr, Equality):
        return None
    try:
        return sp.solveset(expr, var, domain=sp.S.Reals)
    except Exception:
        return None


def _expressions_equivalent(a: sp.Basic, b: sp.Basic) -> bool | None:
    try:
        diff = sp.simplify(a - b)
    except Exception:
        return None
    if diff == 0:
        return True
    if diff.is_number:
        return False
    return None


def _transition_status(prev: sp.Basic, curr: sp.Basic, var: sp.Symbol) -> str:
    """Classify the step from prev to curr as valid / invalid / unknown.

    'unknown' means the checker cannot validate the step (e.g. a bare
    expression line against an equation) — distinct from 'invalid'.
    """
    prev_set = _solution_set(prev, var)
    curr_set = _solution_set(curr, var)
    if prev_set is not None and curr_set is not None:
        return VALID if prev_set == curr_set else INVALID
    if isinstance(prev, Equality) or isinstance(curr, Equality):
        return UNKNOWN
    equivalent = _expressions_equivalent(prev, curr)
    if equivalent is None:
        return UNKNOWN
    return VALID if equivalent else INVALID


def _final_answer_correct(last: sp.Basic | None, answer: sp.Basic | None, var: sp.Symbol) -> bool:
    if last is None or answer is None:
        return False
    last_set = _solution_set(last, var)
    answer_set = _solution_set(answer, var)
    if last_set is not None and answer_set is not None:
        return last_set == answer_set
    if isinstance(last, Equality) or isinstance(answer, Equality):
        return False
    return _expressions_equivalent(last, answer) is True


def check(problem: dict, lines: list[str]) -> dict:
    """Check a student's lines against a problem.

    Returns {correct, divergent_line_index, final_answer_correct, parsed_lines}.
    Line 0 is checked against the problem prompt itself, so a wrong first step
    diverges at index 0. Unparseable lines are reported distinctly and never
    counted as divergent, but they do make the attempt not certifiably correct.
    """
    var = _problem_variable(problem)
    prompt_expr, _ = parse_line(problem["prompt_latex"])
    answer_expr, _ = parse_line(problem["answer_latex"])

    exprs: list[sp.Basic | None] = []
    parsed_lines: list[dict] = []
    for raw in lines:
        expr, err = parse_line(raw, {var})
        exprs.append(expr)
        parsed_lines.append(
            {
                "raw": raw,
                "parsed": sp.latex(expr) if expr is not None else None,
                "status": "ok" if expr is not None else "unparseable",
            }
        )

    divergent_line_index: int | None = None
    anchor = prompt_expr  # last trusted line; starts at the problem statement
    for i, expr in enumerate(exprs):
        if anchor is None or expr is None:
            continue  # cannot validate this step; keep the previous anchor
        status = _transition_status(anchor, expr, var)
        if status == INVALID:
            divergent_line_index = i
            break
        if status == VALID:
            anchor = expr
        # UNKNOWN: keep the previous anchor for the next comparison

    final_answer_correct = bool(exprs) and _final_answer_correct(exprs[-1], answer_expr, var)
    all_parsed = all(e is not None for e in exprs)
    correct = bool(exprs) and divergent_line_index is None and all_parsed and final_answer_correct

    return {
        "correct": correct,
        "divergent_line_index": divergent_line_index,
        "final_answer_correct": final_answer_correct,
        "parsed_lines": parsed_lines,
    }
