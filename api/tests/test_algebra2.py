"""Algebra 2 domain tests: hook rules, registry isolation, and tutor prompt
integration. The domain module must never load on a core (algebra-1) path.
"""

import sys

import pytest
import sympy as sp

from app import checker
from app.domains import registry
from app.domains.algebra2 import HOOKS
from app.problems import get_problem
from app.tutor import ERROR_TYPES, build_messages, parse_diagnosis


@pytest.fixture(autouse=True)
def clean_registry_cache():
    registry._clear_cache()
    yield
    registry._clear_cache()


def _parse(text):
    expr, err = checker.parse_line(text)
    assert expr is not None, err
    return expr


# --- transition rule: root branching -------------------------------------


def test_root_branch_is_valid_against_problem_set():
    problem = get_problem("quad-01")  # x^2-x-6=0, roots -2 and 3
    var = checker.problem_variable(problem)
    prev = _parse("(x+2)(x-3)=0")
    branch = _parse("x=-2")
    assert HOOKS.transition_status(prev, branch, var, problem) == "valid"


def test_wrong_root_defers_to_core_and_is_invalid():
    problem = get_problem("quad-01")
    var = checker.problem_variable(problem)
    prev = _parse("(x+2)(x-3)=0")
    wrong = _parse("x=2")
    assert HOOKS.transition_status(prev, wrong, var, problem) is None
    assert checker._transition_status(prev, wrong, var) == "invalid"


# --- final answer: branch union -------------------------------------------


def test_final_answer_union_of_branches():
    problem = get_problem("quad-01")
    var = checker.problem_variable(problem)
    answer = _parse(problem["answer_latex"])
    both = HOOKS.final_answer_ok([_parse("x=-2"), _parse("x=3")], answer, var, problem)
    assert both is True
    one = HOOKS.final_answer_ok([_parse("x=-2")], answer, var, problem)
    assert one is False  # dropped a root


def test_final_answer_single_root_problem():
    problem = get_problem("quad-03")  # x=5
    var = checker.problem_variable(problem)
    answer = _parse(problem["answer_latex"])
    assert HOOKS.final_answer_ok([_parse("x=5")], answer, var, problem) is True
    assert HOOKS.final_answer_ok([_parse("x=-5")], answer, var, problem) is False


# --- form gates -------------------------------------------------------------


def test_factored_gate():
    problem = get_problem("a2fact-01")
    assert HOOKS.final_form_ok(_parse("(x+2)(x+3)"), problem) is True
    assert HOOKS.final_form_ok(_parse("(x-4)^2"), problem) is True
    assert HOOKS.final_form_ok(_parse("x^2+5x+6"), problem) is False


def test_expanded_gate():
    problem = get_problem("poly-01")
    assert HOOKS.final_form_ok(_parse("x^2+5x+6"), problem) is True
    assert HOOKS.final_form_ok(_parse("x^2+2x+3x+6"), problem) is True
    assert HOOKS.final_form_ok(_parse("(x+2)(x+3)"), problem) is False
    assert HOOKS.final_form_ok(_parse("(x+2)^2"), problem) is False


def test_simplified_gate():
    problem = get_problem("simp-01")
    assert HOOKS.final_form_ok(_parse("5x-4"), problem) is True
    assert HOOKS.final_form_ok(_parse("5x-5+1"), problem) is False
    assert HOOKS.final_form_ok(_parse("3x+2x-4"), problem) is False
    rational = get_problem("simp-02")
    assert HOOKS.final_form_ok(_parse("x+2"), rational) is True
    assert HOOKS.final_form_ok(_parse("\\frac{x^2-4}{x-2}"), rational) is False


# --- registry isolation ------------------------------------------------------


def test_unknown_domain_falls_back_to_core():
    problem = dict(get_problem("ts-01"))
    problem["domain"] = "does_not_exist"
    result = checker.check(problem, ["2x+3=11", "2x=8", "x=4"])
    assert result["correct"] is True


def test_core_check_does_not_import_domain_module():
    sys.modules.pop("app.domains.algebra2", None)
    registry._clear_cache()
    problem = get_problem("ts-01")  # no "domain" key
    result = checker.check(problem, ["2x+3=11", "2x=8", "x=4"])
    assert result["correct"] is True
    assert "app.domains.algebra2" not in sys.modules


def test_broken_domain_hook_cannot_affect_core_problems(monkeypatch):
    import dataclasses

    def boom(*args, **kwargs):
        raise RuntimeError("domain fault")

    broken = dataclasses.replace(HOOKS, transition_status=boom)
    monkeypatch.setitem(registry._cache, "algebra2", broken)
    # algebra-1 problem: hooks are never fetched, fault is unreachable
    result = checker.check(get_problem("ts-01"), ["2x+3=11", "2x=8", "x=4"])
    assert result["correct"] is True
    # algebra-2 problem: the fault surfaces there only
    with pytest.raises(RuntimeError):
        checker.check(get_problem("quad-01"), ["x^2-x-6=0"])


# --- tutor integration -------------------------------------------------------


def test_parse_diagnosis_extended_error_types():
    text = '{"error_type": "factoring_pair_error", "summary": "s", "explanation": "e", "fix_hint": "f"}'
    assert parse_diagnosis(text)["error_type"] == "other"
    allowed = ERROR_TYPES | set(HOOKS.extra_error_types)
    assert parse_diagnosis(text, allowed)["error_type"] == "factoring_pair_error"


def test_build_messages_includes_addendum_for_algebra2_only():
    problem = get_problem("a2fact-01")
    user = build_messages(problem, ["(x+1)(x+6)"], 0)[1]["content"]
    assert "Domain context (Algebra 2)" in user
    assert "factored form" in user

    core_problem = get_problem("ts-01")
    core_user = build_messages(core_problem, ["2x+3=11", "2x=9"], 1)[1]["content"]
    assert "Domain context" not in core_user


def test_build_messages_marks_form_failure_on_final_line():
    problem = get_problem("a2fact-01")
    user = build_messages(problem, ["x^2+5x+6"], 0)[1]["content"]
    assert "(final answer not in the requested form)" in user

    # a genuinely wrong line gets the plain marker
    user2 = build_messages(problem, ["(x+1)(x+6)"], 0)[1]["content"]
    assert "(final answer not in the requested form)" not in user2
