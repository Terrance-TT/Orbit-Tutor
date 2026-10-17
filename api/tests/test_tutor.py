"""Tutor diagnosis tests: prompt construction, response parsing, and the
/diagnose endpoint with a deterministic mock client."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.problems import get_problem
from app.tutor import build_messages, get_tutor_client, parse_diagnosis


@pytest.fixture(autouse=True)
def mock_tutor(monkeypatch):
    monkeypatch.setenv("TUTOR_MOCK", "true")
    get_tutor_client.cache_clear()
    yield
    get_tutor_client.cache_clear()


def test_build_messages_marks_divergent_line():
    problem = get_problem("ts-01")
    messages = build_messages(problem, ["2x+3=11", "2x=9", "x=4.5"], 1)
    assert messages[0]["role"] == "system"
    user = messages[1]["content"]
    assert "Line 1: 2x+3=11\n" in user
    assert "Line 2: 2x=9   <-- FIRST WRONG LINE" in user
    assert "Line 3: x=4.5" in user
    assert problem["answer_latex"] in user


def test_parse_diagnosis_accepts_fenced_json():
    raw = """Here is the diagnosis:
```json
{"error_type": "sign_error", "summary": "Line 2 dropped a negative.",
 "explanation": "Distribute $-2$ carefully.", "fix_hint": "Redo line 2."}
```"""
    result = parse_diagnosis(raw)
    assert result == {
        "error_type": "sign_error",
        "summary": "Line 2 dropped a negative.",
        "explanation": "Distribute $-2$ carefully.",
        "fix_hint": "Redo line 2.",
    }


def test_parse_diagnosis_unknown_error_type_becomes_other():
    result = parse_diagnosis(
        '{"error_type": "invented", "summary": "s", "explanation": "e", "fix_hint": "f"}'
    )
    assert result["error_type"] == "other"


def test_diagnose_endpoint_returns_mock_diagnosis():
    client = TestClient(app)
    response = client.post(
        "/diagnose",
        json={
            "problem_id": "ts-01",
            "lines": ["2x+3=11", "2x=9", "x=4.5"],
            "divergent_line_index": 1,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["error_type"] == "concept_misconception"
    assert "line 2" in data["summary"]
    assert data["explanation"]
    assert data["fix_hint"]


def test_diagnose_endpoint_recomputes_divergent_line_when_omitted():
    client = TestClient(app)
    response = client.post(
        "/diagnose",
        json={"problem_id": "ts-01", "lines": ["2x+3=11", "2x=9", "x=4.5"]},
    )
    assert response.status_code == 200
    assert "line 2" in response.json()["summary"]


def test_diagnose_endpoint_rejects_correct_work():
    client = TestClient(app)
    response = client.post(
        "/diagnose",
        json={"problem_id": "ts-01", "lines": ["2x+3=11", "2x=8", "x=4"]},
    )
    assert response.status_code == 400
    assert "no divergent line" in response.json()["detail"]


def test_live_tutor_without_key_fails_loudly(monkeypatch):
    monkeypatch.setenv("TUTOR_MOCK", "false")
    monkeypatch.delenv("TUTOR_API_KEY", raising=False)
    get_tutor_client.cache_clear()
    client = TestClient(app)
    response = client.post(
        "/diagnose",
        json={"problem_id": "ts-01", "lines": ["2x+3=11", "2x=9", "x=4.5"]},
    )
    assert response.status_code == 503
    assert "TUTOR_API_KEY" in response.json()["detail"]
