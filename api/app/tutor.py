"""Tutor diagnosis: classify the misconception at the divergent line and
generate a short, student-friendly micro-explanation.

The divergent line is found deterministically by checker.py — the LLM only
explains it. Uses Moonshot/Kimi's OpenAI-compatible chat completions API.
A deterministic mock keeps local dev keyless; production must never silently
fall back to mock (same rule as the Mathpix client).
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Protocol

import httpx

DEFAULT_BASE_URL = "https://api.moonshot.ai/v1"
DEFAULT_MODEL = "kimi-k2-0905-preview"

ERROR_TYPES = {
    "arithmetic_slip",
    "sign_error",
    "distribution_error",
    "concept_misconception",
    "misread_problem",
    "other",
}

SYSTEM_PROMPT = (
    "You are Orbit, a math tutor for middle- and high-school students. "
    "You are given a problem and a student's line-by-line work. Exactly one "
    "line is marked as the FIRST line where the student's reasoning went "
    "wrong (determined symbolically, trust it). Your job is to explain the "
    "misconception behind that step — not to solve the problem for them. "
    "Be warm, concise, and never condescending. Write for a student reading "
    "on an iPad. Use inline LaTeX $...$ for any math. "
    "Respond with a single JSON object and nothing else."
)

USER_TEMPLATE = """Problem: {prompt}
Known correct final answer: {answer}

The student's work (all transitions BEFORE the marked line are valid):
{numbered_lines}

Return JSON with exactly these keys:
- "error_type": one of "arithmetic_slip", "sign_error", "distribution_error", "concept_misconception", "misread_problem", "other"
- "summary": one sentence telling the student what went wrong at the marked line, referring to it by line number.
- "explanation": 2-5 sentences teaching the underlying idea behind the mistake, with one small concrete example if it helps. This is a micro-explanation, not a full lesson.
- "fix_hint": 1-2 sentences telling the student how to redo that step themselves, without giving away the final answer.
"""


class TutorNotConfiguredError(RuntimeError):
    """Live tutor required but credentials missing."""


class TutorError(RuntimeError):
    """Upstream tutor call failed or returned unusable output."""


def build_messages(
    problem: dict, lines: list[str], divergent_line_index: int
) -> list[dict]:
    numbered = []
    for i, line in enumerate(lines):
        marker = "   <-- FIRST WRONG LINE" if i == divergent_line_index else ""
        numbered.append(f"Line {i + 1}: {line}{marker}")
    user = USER_TEMPLATE.format(
        prompt=problem["prompt_latex"],
        answer=problem["answer_latex"],
        numbered_lines="\n".join(numbered),
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def parse_diagnosis(text: str) -> dict:
    """Extract and validate the JSON diagnosis from raw model output."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise TutorError(f"tutor returned no JSON object: {text[:200]!r}")
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise TutorError(f"tutor returned invalid JSON: {exc}") from exc
    error_type = data.get("error_type")
    if error_type not in ERROR_TYPES:
        error_type = "other"
    return {
        "error_type": error_type,
        "summary": str(data.get("summary") or ""),
        "explanation": str(data.get("explanation") or ""),
        "fix_hint": str(data.get("fix_hint") or ""),
    }


class TutorClient(Protocol):
    def diagnose(
        self, problem: dict, lines: list[str], divergent_line_index: int
    ) -> dict: ...


class MockTutorClient:
    """Deterministic, keyless diagnosis for local development."""

    def diagnose(
        self, problem: dict, lines: list[str], divergent_line_index: int
    ) -> dict:
        n = divergent_line_index + 1
        previous = lines[divergent_line_index - 1] if n > 1 else problem["prompt_latex"]
        current = lines[divergent_line_index]
        return {
            "error_type": "concept_misconception",
            "summary": f"Mock diagnosis: the step on line {n} changed the problem in a way that isn't allowed.",
            "explanation": (
                f"This is a placeholder explanation for local development. "
                f"Line {n - 1} was ${previous}$, and line {n} became ${current}$. "
                "A real tutor would identify the specific misconception here."
            ),
            "fix_hint": f"Go back to line {n - 1} and redo that step, checking each operation against the rules of algebra.",
        }


class KimiTutorClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        model: str = DEFAULT_MODEL,
        timeout: float = 45.0,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    def diagnose(
        self, problem: dict, lines: list[str], divergent_line_index: int
    ) -> dict:
        response = httpx.post(
            f"{self._base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={
                "model": self._model,
                "messages": build_messages(problem, lines, divergent_line_index),
                "temperature": 0.2,
            },
            timeout=self._timeout,
        )
        if response.status_code != 200:
            raise TutorError(
                f"tutor API returned {response.status_code}: {response.text[:300]}"
            )
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise TutorError("tutor API returned an unexpected response shape") from exc
        return parse_diagnosis(content)


@lru_cache(maxsize=1)
def get_tutor_client() -> TutorClient:
    mock_env = os.environ.get("TUTOR_MOCK", "").strip().lower()
    api_key = os.environ.get("TUTOR_API_KEY")
    if api_key and mock_env != "true":
        return KimiTutorClient(
            api_key,
            base_url=os.environ.get("TUTOR_BASE_URL", DEFAULT_BASE_URL),
            model=os.environ.get("TUTOR_MODEL", DEFAULT_MODEL),
        )
    if mock_env == "false":
        raise TutorNotConfiguredError(
            "Tutor diagnosis is enabled (TUTOR_MOCK=false) but TUTOR_API_KEY "
            "is missing. Set it on the api service, or set TUTOR_MOCK=true "
            "for demo mode."
        )
    return MockTutorClient()
