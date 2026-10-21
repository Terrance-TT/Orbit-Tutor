"""Systems domain tests: consequence-rule checking, final-answer semantics,
symbol allowlist, and tutor prompt integration.
"""

import pytest

from app import checker
from app.domains import registry
from app.domains.systems import HOOKS
from app.problems import get_problem
from app.tutor import build_messages


@pytest.fixture(autouse=True)
def clean_registry_cache():
    registry._clear_cache()
    yield
    registry._clear_cache()


def test_allowed_symbols_admits_y():
    problem = get_problem("sys-01")
    result = checker.check(problem, ["x+y=5", "x-y=1", "x=3", "y=2"])
    statuses = [p["status"] for p in result["parsed_lines"]]
    assert statuses == ["ok"] * 4
    assert result["correct"] is True


def test_consequence_of_prefix_not_just_previous_line():
    """2x=6 follows from the whole prefix, not from the previous line alone."""
    problem = get_problem("sys-01")
    result = checker.check(problem, ["x+y=5", "x-y=1", "2x=6", "x=3", "y=2"])
    assert result["divergent_line_index"] is None


def test_wrong_combination_diverges():
    problem = get_problem("sys-01")
    result = checker.check(problem, ["x+y=5", "x-y=1", "2x=8"])
    assert result["divergent_line_index"] == 2
    assert result["correct"] is False


def test_invented_equation_diverges():
    problem = get_problem("sys-01")
    # x+2y must equal 7 as a combination of the system; 9 is invented
    result = checker.check(problem, ["x+2y=9"])
    assert result["divergent_line_index"] == 0


def test_restating_the_problem_is_not_an_answer():
    """Copying the system earns no credit: the student must pin x and y."""
    problem = get_problem("sys-01")
    result = checker.check(problem, ["x+y=5", "x-y=1"])
    assert result["divergent_line_index"] is None  # nothing wrong...
    assert result["final_answer_correct"] is False  # ...but not finished
    assert result["correct"] is False


def test_partial_answer_only_x():
    problem = get_problem("sys-01")
    result = checker.check(problem, ["x+y=5", "x-y=1", "2x=6", "x=3"])
    assert result["final_answer_correct"] is False
    assert result["correct"] is False


def test_nonlinear_line_is_unknown_not_divergent():
    problem = get_problem("sys-01")
    result = checker.check(problem, ["x^2+y^2=29", "x=3", "y=2"])
    assert result["divergent_line_index"] is None
    assert result["correct"] is True


def test_tutor_addendum_for_systems():
    problem = get_problem("sys-01")
    user = build_messages(problem, ["x+y=5", "x-y=1", "2x=8"], 2)[1]["content"]
    assert "Domain context (systems of equations)" in user
    assert "$x+y=5$" in user


def test_systems_module_not_imported_for_other_domains():
    import sys

    sys.modules.pop("app.domains.systems", None)
    registry._clear_cache()
    checker.check(get_problem("ts-01"), ["2x+3=11", "2x=8", "x=4"])
    checker.check(get_problem("quad-01"), ["x^2-x-6=0", "(x+2)(x-3)=0", "x=-2", "x=3"])
    assert "app.domains.systems" not in sys.modules
