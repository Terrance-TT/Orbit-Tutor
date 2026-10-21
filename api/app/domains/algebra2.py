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
- Extraneous-prone steps: for radical or rational equations (squaring /
  multiplying by a denominator can introduce roots), a transition whose
  solution set GROWS is accepted; the final answer is still checked against
  the problem's own set, so an extraneous root stated as an answer is caught.
- Final-form gates ("form" in the problem JSON): factored (all Add factors
  irreducible over the integers) / expanded / simplified. An equivalent line
  in the wrong form is not complete.
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


def _is_extraneous_prone(problem: dict) -> bool:
    """True when valid algebra can grow the solution set: radicals (squaring
    adds roots) or the variable in a denominator (clearing it adds roots)."""
    prompt, err = checker.parse_line(problem["prompt_latex"])
    if prompt is None or not isinstance(prompt, Equality):
        return False
    if prompt.has(sp.sqrt):
        return True
    for pow_ in prompt.atoms(sp.Pow):
        base, exp = pow_.args
        if exp.is_number and not exp.is_integer:  # fractional exponent == radical
            return True
        if exp.is_negative and base.free_symbols:  # variable in denominator
            return True
    return False


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
        # Squaring a radical / clearing a denominator may introduce
        # extraneous roots: accept a growing solution set; the final-answer
        # check (against the problem's own set) catches the extra roots.
        if _is_extraneous_prone(problem):
            prev_set = _solution_set(prev, var)
            if prev_set is not None and prev_set.is_subset(curr_set):
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


def _incomplete_answer(problem, exprs) -> dict | None:
    """Dropped-case detection for multi-solution equations.

    When every line is valid but the branch union doesn't cover the answer
    set (e.g. |2x+1|=7 solved only via 2x+1=7, never 2x+1=-7), no transition
    is invalid — so without this hook there is no divergent line and no
    diagnosis. Returns the first line that committed to a strict subset of
    the answer set — the point where the other case was dropped.
    """
    if problem.get("form") is not None:
        return None  # expression tasks: the form gate owns incompleteness
    answer, err = checker.parse_line(problem["answer_latex"])
    if answer is None or not isinstance(answer, Equality):
        return None
    var = checker.problem_variable(problem)
    answer_set = _solution_set(answer, var)
    if not isinstance(answer_set, sp.sets.sets.FiniteSet) or len(answer_set) < 2:
        return None  # single-root problems: incompleteness is just unfinished
    branch_indices: list[int] = []
    collected = sp.S.EmptySet
    for i, expr in enumerate(exprs):
        s = _solution_set(expr, var)
        if s is None or s == sp.S.EmptySet or s == answer_set:
            continue
        if s.is_subset(answer_set):
            collected = collected.union(s)
            branch_indices.append(i)
    if not branch_indices or collected == answer_set:
        return None
    return {
        "line_index": branch_indices[0],
        "note": (
            "this line is valid, but it follows only one case — the equation "
            "has another solution that the work never covers"
        ),
    }


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


def _is_factored(expr: sp.Basic, var: sp.Symbol) -> bool:
    """Product of irreducible factors: Mul of Adds / Pow of Add, where every
    Add factor is irreducible over the integers — (x^2-4)(x+3) does NOT
    count, since x^2-4 factors further."""
    if isinstance(expr, sp.Pow):
        factors = [expr.args[0]]
    elif isinstance(expr, sp.Mul):
        factors = list(expr.args)
    else:
        return False
    adds = [f for f in factors if isinstance(f, sp.Add)]
    if not adds:
        return False
    for f in adds:
        try:
            _, factor_list = sp.factor_list(f, var)
        except Exception:
            return False
        if len(factor_list) > 1:
            return False
    return True


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
    var = checker.problem_variable(problem)
    if form == "factored":
        try:
            return _is_factored(expr, var)
        except Exception:
            return None
    if form == "expanded":
        try:
            return not _is_factored(expr, var)
        except Exception:
            return None
    if form == "simplified":
        try:
            return _is_simplified(expr, var)
        except Exception:
            return None
    return None


_TASK_LABELS = {
    "factored": "rewrite an expression in fully factored form",
    "expanded": "rewrite an expression in expanded form",
    "simplified": "simplify an expression",
    "solve": "solve an equation",
}

_COMMON_MISCONCEPTIONS = (
    "- Wrong factor pairs: factors of the constant term whose sum is not the "
    "middle coefficient, or sum/product swapped.\n"
    "- Sign errors when distributing a negative, e.g. $(2x-3)^2 \\neq 4x^2-12x-9$.\n"
    "- Quadratic-formula arithmetic slips, especially under the square root.\n"
    "- Dropping one root of a two-root equation.\n"
    "- Stopping at an equivalent expression that is not in the requested form."
)

_EXTRANEOUS_MISCONCEPTIONS = (
    "- Forgetting that squaring both sides (or clearing a denominator) can "
    "introduce extraneous roots — every candidate root must be substituted "
    "back into the ORIGINAL equation.\n"
    "- Sign errors when expanding the squared side, e.g. $(x-1)^2 \\neq x^2-1$.\n"
    "- Log/exponential slips: $\\log_b(x)=c$ means $x=b^c$, and "
    "$\\log$ requires a positive argument."
)


def _tutor_prompt_addendum(problem: dict) -> str:
    form = problem.get("form")
    if form is None:
        if _is_extraneous_prone(problem):
            task = (
                "solve a radical or rational equation (squaring or clearing a "
                "denominator may introduce extraneous roots — the student must "
                "check candidates against the original equation)"
            )
            misconceptions = _EXTRANEOUS_MISCONCEPTIONS
        else:
            task = "solve an equation (there may be two roots — the student may state them on separate lines)"
            misconceptions = _COMMON_MISCONCEPTIONS
    else:
        task = _TASK_LABELS.get(form, f"put the answer in {form} form")
        misconceptions = _COMMON_MISCONCEPTIONS
    return (
        "Domain context (Algebra 2):\n"
        f"- The task is to {task}.\n"
        "- Form matters: if the marked line is tagged as not in the requested "
        "form, the student's math is equivalent but they stopped early — "
        'explain what the requested form means. Use error_type '
        '"incomplete_form" for that case.\n'
        "- In addition to the standard error types, you may use "
        '"factoring_pair_error", "expansion_error", and "incomplete_form".\n'
        "Common misconceptions in this domain:\n" + misconceptions
    )


HOOKS = DomainHooks(
    name="algebra2",
    transition_status=_transition_status,
    final_answer_ok=_final_answer_ok,
    final_form_ok=_final_form_ok,
    tutor_prompt_addendum=_tutor_prompt_addendum,
    incomplete_answer=_incomplete_answer,
    extra_error_types=frozenset(
        {"factoring_pair_error", "expansion_error", "incomplete_form"}
    ),
)
