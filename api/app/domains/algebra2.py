"""Algebra 2 domain: quadratics, polynomial arithmetic, factoring,
expression simplification.

This module is lazy-imported by domains/registry.py only when a problem
declares "domain": "algebra2" — a fault here cannot affect other problems.

Rules beyond the core checker:
- Root branching: an equation line whose solution set is a non-empty subset
  of the problem's own solution set is valid, even if it names just one root
  of a two-root quadratic. Branch lines are checked against the problem's
  full set, not the previous line, so x=-2 then x=3 both validate.
- Branch union final answer: the final answer is correct when the union of
  the student's subset-of-answer lines equals the answer set.
- Polynomial inequality: for expression tasks, expand(a-b) != 0 as a
  polynomial PROVES non-equivalence (simplify alone can only prove equality),
  so wrong factor pairs are flagged divergent instead of "unknown".
- Final-form gates ("form" in the problem JSON): factored / expanded /
  simplified. An equivalent line in the wrong form is not complete.
"""

from __future__ import annotations

import sympy as sp
from sympy.core.relational import Equality

from .. import checker
from .registry import DomainHooks

VALID = "valid"


def _solution_set(expr: sp.Basic, var: sp.Symbol):
    if not isinstance(expr, Equality):
        return None
    try:
        return sp.solveset(expr, var, domain=sp.S.Reals)
    except Exception:
        return None


def _problem_solution_set(problem: dict, var: sp.Symbol):
    prompt, err = checker.parse_line(problem["prompt_latex"])
    if prompt is None:
        return None
    return _solution_set(prompt, var)


def _transition_status(prev, curr, var, problem) -> str | None:
    """Domain transition rule; None defers to the core rule."""
    if isinstance(curr, Equality):
        problem_set = _problem_solution_set(problem, var)
        if problem_set is None:
            return None
        curr_set = _solution_set(curr, var)
        if curr_set is None or curr_set == sp.S.EmptySet:
            return None
        # Root branching: naming one (or some) of the problem's roots is a
        # valid step, checked against the problem's set rather than prev.
        if curr_set.is_subset(problem_set):
            return VALID
        return None
    # Expression task: a nonzero polynomial difference proves the lines are
    # NOT equivalent — core simplify can only prove equivalence, never
    # disprove it, which would leave wrong factor pairs as "unknown".
    if isinstance(prev, Equality):
        return None
    try:
        diff = sp.expand(prev - curr)
    except Exception:
        return None
    if diff == 0:
        return VALID
    try:
        sp.Poly(diff, var)
    except Exception:
        return None  # rational/other: defer to core simplify
    return "invalid"  # nonzero polynomial difference: provably not equivalent


def _final_answer_ok(exprs, answer_expr, var, problem) -> bool | None:
    """Branch-union final answer for equation answers; None defers to core."""
    if not isinstance(answer_expr, Equality):
        return None  # expression task: core equivalence + form gate
    answer_set = _solution_set(answer_expr, var)
    if answer_set is None:
        return None
    # A final line whose solution set matches the answer outright (single
    # root, or a restated full equation) finishes the problem directly.
    if exprs:
        last_set = _solution_set(exprs[-1], var)
        if last_set is not None and last_set == answer_set:
            return True
    # Otherwise the student must have stated the roots as branches: only
    # strict-subset lines count, so restating the problem does not.
    collected = sp.S.EmptySet
    for expr in exprs:
        s = _solution_set(expr, var)
        if s is None or s == sp.S.EmptySet or s == answer_set:
            continue
        if s.is_subset(answer_set):
            collected = collected.union(s)
    return collected == answer_set


def _is_factored(expr: sp.Basic) -> bool:
    if isinstance(expr, sp.Pow):
        base, exp = expr.args
        return isinstance(base, sp.Add) and exp.is_number
    if isinstance(expr, sp.Mul):
        return any(
            isinstance(a, sp.Add)
            or (isinstance(a, sp.Pow) and isinstance(a.args[0], sp.Add))
            for a in expr.args
        )
    return False


def _canon(expr: sp.Basic) -> sp.Basic:
    """Re-parse through sstr so antlr's nested Adds compare equal to
    SymPy's canonical flat form (e.g. (x**2 + 5*x) + 6 vs x**2 + 5*x + 6)."""
    return sp.sympify(sp.sstr(expr))


def _terms(expr: sp.Basic) -> list:
    """Flatten nested Adds (antlr keeps '3x+2x-5+1' uncollected and nested)."""
    out = []

    def walk(node):
        if isinstance(node, sp.Add):
            for arg in node.args:
                walk(arg)
        else:
            out.append(node)

    walk(expr)
    return out


def _like_terms_collected(expr: sp.Basic, var: sp.Symbol) -> bool:
    seen = set()
    for term in _terms(expr):
        _, sym_part = term.as_independent(var, as_Add=False)
        key = sp.sstr(sym_part)
        if key in seen:
            return False
        seen.add(key)
    return True


def _is_simplified(expr: sp.Basic, var: sp.Symbol) -> bool:
    if not _like_terms_collected(expr, var):
        return False
    # Catches cancellable rational parts and unexpanded pieces; the canon
    # round-trip makes the comparison immune to antlr's nesting.
    return _canon(sp.simplify(expr)) == _canon(expr)


def _final_form_ok(expr, problem) -> bool | None:
    form = problem.get("form")
    if form is None or isinstance(expr, Equality):
        return None
    if form == "factored":
        return _is_factored(expr)
    if form == "expanded":
        return not _is_factored(expr)
    if form == "simplified":
        var = checker.problem_variable(problem)
        try:
            return _is_simplified(expr, var)
        except Exception:
            return None
    return None


_TASK_LABELS = {
    "factored": "rewrite an expression in fully factored form",
    "expanded": "rewrite an expression in expanded form",
    "simplified": "simplify an expression",
}

_COMMON_MISCONCEPTIONS = (
    "- Wrong factor pairs: factors of the constant term whose sum is not the "
    "middle coefficient, or sum/product swapped.\n"
    "- Sign errors when distributing a negative, e.g. $(2x-3)^2 \\neq 4x^2-12x-9$.\n"
    "- Quadratic-formula arithmetic slips, especially under the square root.\n"
    "- Dropping one root of a two-root equation.\n"
    "- Stopping at an equivalent expression that is not in the requested form."
)


def _tutor_prompt_addendum(problem: dict) -> str:
    form = problem.get("form")
    if form is None:
        task = "solve a quadratic equation (there may be two roots — the student may state them on separate lines)"
    else:
        task = _TASK_LABELS.get(form, f"put the answer in {form} form")
    return (
        "Domain context (Algebra 2):\n"
        f"- The task is to {task}.\n"
        "- Form matters: if the marked line is tagged as not in the requested "
        "form, the student's math is equivalent but they stopped early — "
        'explain what the requested form means. Use error_type '
        '"incomplete_form" for that case.\n'
        "- In addition to the standard error types, you may use "
        '"factoring_pair_error", "expansion_error", and "incomplete_form".\n'
        "Common misconceptions in this domain:\n" + _COMMON_MISCONCEPTIONS
    )


HOOKS = DomainHooks(
    name="algebra2",
    transition_status=_transition_status,
    final_answer_ok=_final_answer_ok,
    final_form_ok=_final_form_ok,
    tutor_prompt_addendum=_tutor_prompt_addendum,
    extra_error_types=frozenset(
        {"factoring_pair_error", "expansion_error", "incomplete_form"}
    ),
)
