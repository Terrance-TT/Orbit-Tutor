"""Mathpix recognition client: interface + mock + live implementations.

The mock is the default whenever MATHPIX_MOCK=true or credentials are absent,
so the dev loop works with zero keys. Credentials are only ever sent as
request headers — never logged or persisted.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Protocol

import httpx

MATHPIX_ENDPOINT = "https://api.mathpix.com/v3/text"

# Deterministic canned line sequences so the frontend dev loop works offline.
# Keys map to problem bank entries: correct -> ts-01, sign_error -> dist-03,
# distribution_error -> dist-01.
MOCK_SCENARIOS: dict[str, list[str]] = {
    "correct": ["2x+3=11", "2x=8", "x=4"],
    "sign_error": ["-2(x-6)=8", "-2x-12=8", "-2x=20", "x=-10"],
    "distribution_error": [
        "3(x-4)=15",
        "3x-4=15",
        "3x=19",
        "x=\\frac{19}{3}",
    ],
}

DEFAULT_SCENARIO = "correct"


class MathpixClient(Protocol):
    def recognize(self, image_b64: str) -> list[str]:
        """Recognize an image into per-line LaTeX."""
        ...

    def recognize_detailed(self, image_b64: str) -> list[dict]:
        """Recognize an image into [{latex, confidence}] entries."""
        ...


class MockMathpixClient:
    """Deterministic client driven by MATHPIX_MOCK_SCENARIO."""

    def __init__(self, scenario: str = DEFAULT_SCENARIO):
        if scenario not in MOCK_SCENARIOS:
            raise ValueError(
                f"unknown mock scenario {scenario!r}; "
                f"expected one of {sorted(MOCK_SCENARIOS)}"
            )
        self.scenario = scenario

    def recognize_detailed(self, image_b64: str) -> list[dict]:
        return [
            {"latex": line, "confidence": 0.99}
            for line in MOCK_SCENARIOS[self.scenario]
        ]

    def recognize(self, image_b64: str) -> list[str]:
        return [entry["latex"] for entry in self.recognize_detailed(image_b64)]


class LiveMathpixClient:
    def __init__(self, app_id: str, app_key: str, timeout: float = 30.0):
        self._headers = {"app_id": app_id, "app_key": app_key}
        self._timeout = timeout

    def recognize_detailed(self, image_b64: str) -> list[dict]:
        payload = {
            "src": image_b64,
            "formats": ["text", "latex_styled"],
            "data_options": {
                "include_latex": True,
                "include_line_data": True,
            },
        }
        response = httpx.post(
            MATHPIX_ENDPOINT,
            headers=self._headers,
            json=payload,
            timeout=self._timeout,
        )
        response.raise_for_status()
        return self._parse_lines(response.json())

    def recognize(self, image_b64: str) -> list[str]:
        return [entry["latex"] for entry in self.recognize_detailed(image_b64)]

    @staticmethod
    def _parse_lines(data: dict) -> list[dict]:
        lines: list[dict] = []
        for entry in data.get("line_data") or []:
            latex = (entry.get("latex") or "").strip()
            if latex:
                lines.append(
                    {
                        "latex": latex,
                        "confidence": float(entry.get("confidence", 1.0)),
                    }
                )
        if not lines:
            # Fall back to the whole-result text, split into lines.
            text = data.get("latex_styled") or data.get("text") or ""
            confidence = float(data.get("confidence", 1.0))
            lines = [
                {"latex": line.strip(), "confidence": confidence}
                for line in text.splitlines()
                if line.strip()
            ]
        return lines


@lru_cache(maxsize=1)
def get_client() -> MathpixClient:
    """Live client when explicitly enabled with credentials; mock otherwise."""
    mock_flag = os.environ.get("MATHPIX_MOCK", "").strip().lower() == "true"
    app_id = os.environ.get("MATHPIX_APP_ID")
    app_key = os.environ.get("MATHPIX_APP_KEY")
    if mock_flag or not (app_id and app_key):
        scenario = os.environ.get("MATHPIX_MOCK_SCENARIO", DEFAULT_SCENARIO)
        return MockMathpixClient(scenario)
    return LiveMathpixClient(app_id, app_key)
