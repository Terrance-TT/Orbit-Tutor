"""Checker test corpus.

Fixtures live in tests/fixtures/*.json and each declares a problem id from the
bank, a sequence of LaTeX lines, and the exact expected verdict — including the
exact divergent line index where applicable.
"""

import json
from pathlib import Path

import pytest

from app import checker
from app.problems import get_problem, load_problems

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_fixtures():
    fixtures = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        data = json.loads(path.read_text())
        data["_fixture_file"] = path.name
        fixtures.append(data)
    return fixtures


FIXTURES = _load_fixtures()


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_solution_fixture(fixture):
    problem = get_problem(fixture["problem_id"])
    assert problem is not None, f"fixture references unknown problem {fixture['problem_id']}"

    result = checker.check(problem, fixture["lines"])

    expected = fixture["expected"]
    assert result["correct"] == expected["correct"], (
        f"{fixture['name']}: correct={result['correct']}, "
        f"divergent={result['divergent_line_index']}, "
        f"parsed={result['parsed_lines']}"
    )
    assert result["divergent_line_index"] == expected["divergent_line_index"], (
        f"{fixture['name']}: divergent_line_index="
        f"{result['divergent_line_index']} (expected "
        f"{expected['divergent_line_index']})"
    )
    assert result["final_answer_correct"] == expected["final_answer_correct"]
    if "form_ok" in expected:
        assert result["form_ok"] == expected["form_ok"]
    assert len(result["parsed_lines"]) == len(fixture["lines"])


def test_first_line_departure_is_divergent_at_index_zero():
    """A wrong first step (line 0) diverges immediately against the prompt."""
    problem = get_problem("ts-01")  # 2x+3=11
    result = checker.check(problem, ["2x=10", "x=5"])
    assert result["divergent_line_index"] == 0
    assert result["correct"] is False


def test_unparseable_line_status_is_distinct_from_invalid():
    problem = get_problem("ts-01")
    result = checker.check(problem, ["2x+3=11", "not math at all !!!", "x=4"])
    statuses = [p["status"] for p in result["parsed_lines"]]
    assert statuses[1] == "unparseable"
    assert statuses[0] == "ok"
    assert result["divergent_line_index"] is None


def test_parse_coverage_of_problem_bank():
    """Every prompt and answer in the bank must parse through the one parsing entry point."""
    problems = load_problems()
    assert len(problems) >= 15
    for problem in problems:
        expr, err = checker.parse_line(problem["prompt_latex"])
        assert expr is not None, f"{problem['id']} prompt failed to parse: {err}"
        expr, err = checker.parse_line(problem["answer_latex"])
        assert expr is not None, f"{problem['id']} answer failed to parse: {err}"


def test_final_answer_equivalence_not_string_matching():
    """Equivalent-but-differently-written final answers are accepted."""
    problem = get_problem("ts-01")  # answer x=4
    result = checker.check(problem, ["2x+3=11", "2x=8", "x=\\frac{8}{2}"])
    assert result["final_answer_correct"] is True
    assert result["correct"] is True


def test_check_result_shape():
    problem = get_problem("ts-01")
    result = checker.check(problem, ["x=4"])
    assert set(result.keys()) == {
        "correct",
        "divergent_line_index",
        "final_answer_correct",
        "form_ok",
        "parsed_lines",
    }
    assert result["form_ok"] is True  # no domain form gate on algebra-1 problems
    for entry in result["parsed_lines"]:
        assert set(entry.keys()) == {"raw", "parsed", "status"}
