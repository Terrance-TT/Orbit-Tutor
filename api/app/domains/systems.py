"""Systems of equations domain: 2x2 linear systems in x and y.

This module is lazy-imported by domains/registry.py only when a problem
declares "domain": "systems" — a fault here cannot affect other problems.

Systems don't fit the core anchor loop: a step like "2x=6" is not a
consequence of the previous line alone ("x-y=1") — it follows from the
WHOLE trusted prefix. So this domain takes over checking entirely
(check_all) with a consequence rule:

- Each line must be a linear equation in x, y. A line is VALID if its
  coefficient row (a, b, c) for a*x + b*y = c lies in the span of the
  trusted rows (rank does not increase) — i.e. it is a linear combination
  of everything trusted so far, which is exactly what adding/subtracting
  multiples of equations produces.
- The first line that raises the rank is divergent (wrong arithmetic when
  combining equations, or an invented equation).
- The final answer is correct only when the student's own lines pin both
  variables — at least one consequence row of the form (a, 0, c) fixing x
  and one (0, b, c) fixing y, matching the answer point. Restating the
  prompt equations does not count.

Machine fields in the problem JSON (prompt_latex stays a display string
for KaTeX, since antlr cannot parse \\begin{cases}):
  "equations": ["x+y=5", "x-y=1"]        — the system, one entry per line
  "answer_equations": ["x=3", "y=2"]     — the unique solution
"""

from __future__ import annotations

import sympy as sp
from sympy.core.relational import Equality

from .. import checker
from .registry import DomainHooks

X = sp.Symbol("x")
Y = sp.Symbol("y")


def _allowed_symbols(problem: dict) -> set[sp.Symbol]:
    return {X, Y}


def _row(expr: sp.Basic) -> tuple | None:
    """(a, b, c) for a*x + b*y = c, or None if not a linear equation."""
    if not isinstance(expr, Equality):
        return None
    try:
        poly = sp.Poly(sp.expand(expr.lhs - expr.rhs), X, Y)
    except Exception:
        return None
    if poly.total_degree() > 1:
        return None
    a = sp.Rational(poly.coeff_monomial(X))
    b = sp.Rational(poly.coeff_monomial(Y))
    c = sp.Rational(-poly.coeff_monomial(1))
    return (a, b, c)


def _problem_rows(problem: dict) -> list[tuple]:
    rows = []
    for latex in problem["equations"]:
        expr, err = checker.parse_line(latex, {X, Y})
        if expr is None:
            raise ValueError(f"system equation failed to parse: {latex!r}: {err}")
        row = _row(expr)
        if row is None:
            raise ValueError(f"system equation is not linear in x, y: {latex!r}")
        rows.append(row)
    return rows


def _answer_point(problem: dict) -> dict[sp.Symbol, sp.Rational]:
    point = {}
    for latex in problem["answer_equations"]:
        expr, err = checker.parse_line(latex, {X, Y})
        if expr is None or not isinstance(expr, Equality):
            raise ValueError(f"answer equation failed to parse: {latex!r}")
        if expr.lhs in (X, Y):
            point[expr.lhs] = sp.Rational(expr.rhs)
        elif expr.rhs in (X, Y):
            point[expr.rhs] = sp.Rational(expr.lhs)
        else:
            raise ValueError(f"answer equation is not x=.. or y=..: {latex!r}")
    return point


def _check_all(problem: dict, exprs) -> tuple[int | None, bool]:
    trusted = _problem_rows(problem)
    trusted_rank = sp.Matrix(trusted).rank()

    divergent_line_index = None
    student_rows: list[tuple] = []
    for i, expr in enumerate(exprs):
        if expr is None:
            continue  # unparseable: reported via parsed_lines, not divergent
        row = _row(expr)
        if row is None:
            continue  # not a linear equation: unknown, keep trusted state
        if row == (0, 0, 0):
            continue  # 0=0: no information, neither right nor wrong
        if sp.Matrix(trusted + [row]).rank() == trusted_rank:
            trusted.append(row)  # consequence of the trusted prefix
            student_rows.append(row)
        else:
            divergent_line_index = i
            break

    # The student must actually state both variables' values: a consequence
    # row pinning x (b == 0) and one pinning y (a == 0), matching the answer.
    final_answer_correct = False
    if divergent_line_index is None:
        point = _answer_point(problem)
        x_vals = [r[2] / r[0] for r in student_rows if r[1] == 0 and r[0] != 0]
        y_vals = [r[2] / r[1] for r in student_rows if r[0] == 0 and r[1] != 0]
        final_answer_correct = (
            point.get(X) in x_vals and point.get(Y) in y_vals
        )

    return divergent_line_index, final_answer_correct


def _tutor_prompt_addendum(problem: dict) -> str:
    equations = ", ".join(f"${e}$" for e in problem.get("equations", []))
    return (
        "Domain context (systems of equations):\n"
        f"- The task is to solve the system {equations} for both $x$ and $y$; "
        "the student may work by elimination or substitution, and may state "
        "$x$ and $y$ on separate lines in either order.\n"
        "- Every student line has been verified as a true consequence of the "
        "system so far; the marked line is the first that does not follow.\n"
        "Common misconceptions in this domain:\n"
        "- Arithmetic slips when adding/subtracting equations, especially "
        "sign errors when subtracting a negative term.\n"
        "- Combining only parts of equations (adding the left sides but not "
        "the right sides).\n"
        "- Solving for one variable and stopping, or forgetting to "
        "substitute back for the other."
    )


HOOKS = DomainHooks(
    name="systems",
    allowed_symbols=_allowed_symbols,
    check_all=_check_all,
    tutor_prompt_addendum=_tutor_prompt_addendum,
)
