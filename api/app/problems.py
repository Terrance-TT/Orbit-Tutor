"""Problem bank loader.

Problem JSON files live in api/problems/. Each file is a list of problems:
{id, title, prompt_latex, answer_latex, skills}. No scripted solution paths —
valid routes emerge from symbolic transition checking.
"""

import json
from functools import lru_cache
from pathlib import Path

PROBLEMS_DIR = Path(__file__).resolve().parent.parent / "problems"

REQUIRED_FIELDS = {"id", "title", "prompt_latex", "answer_latex", "skills"}


@lru_cache(maxsize=1)
def load_problems() -> list[dict]:
    problems: list[dict] = []
    seen_ids: set[str] = set()
    for path in sorted(PROBLEMS_DIR.glob("*.json")):
        entries = json.loads(path.read_text())
        if isinstance(entries, dict):
            entries = entries.get("problems", [])
        for entry in entries:
            missing = REQUIRED_FIELDS - entry.keys()
            if missing:
                raise ValueError(f"{path.name}: problem missing fields {missing}")
            if entry["id"] in seen_ids:
                raise ValueError(f"{path.name}: duplicate problem id {entry['id']}")
            seen_ids.add(entry["id"])
            problems.append(entry)
    return problems


def get_problem(problem_id: str) -> dict | None:
    for problem in load_problems():
        if problem["id"] == problem_id:
            return problem
    return None
