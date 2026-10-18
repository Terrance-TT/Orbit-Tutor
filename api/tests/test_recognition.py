"""Recognition response tests, including problem-aware misread warnings."""

from fastapi.testclient import TestClient

from app import main


class FakeClient:
    def __init__(self, latex: str):
        self.latex = latex

    def recognize_detailed(self, _image: str) -> list[dict]:
        return [{"latex": self.latex, "confidence": 0.99}]


def test_implausible_recognition_gets_warning(monkeypatch):
    monkeypatch.setattr(
        main, "get_client", lambda: FakeClient("\\alpha=x \\varphi")
    )
    client = TestClient(main.app)
    response = client.post(
        "/recognize",
        json={"images": ["data:image/jpeg;base64,AAAA"], "problem_id": "ts-01"},
    )
    assert response.status_code == 200
    line = response.json()["lines"][0]
    assert line["latex"] == "\\alpha=x \\varphi"
    assert "Possible misread" in line["warning"]


def test_plausible_recognition_has_no_warning(monkeypatch):
    monkeypatch.setattr(main, "get_client", lambda: FakeClient("5x=20"))
    client = TestClient(main.app)
    response = client.post(
        "/recognize",
        json={"images": ["data:image/jpeg;base64,AAAA"], "problem_id": "ts-01"},
    )
    assert response.status_code == 200
    assert response.json()["lines"][0]["warning"] is None
