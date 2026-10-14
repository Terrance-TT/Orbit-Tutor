"""FastAPI entrypoint for the Orbit core diagnostic loop.

Endpoints (the fixed contract the web frontend is built against):
  GET  /problems       -> [ProblemSummary]
  GET  /problems/{id}  -> ProblemDetail
  POST /recognize      -> per-line LaTeX via the Mathpix client (mock by default)
  POST /check          -> symbolic verdict + divergent line via the checker
"""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import checker
from .mathpix_client import get_client
from .problems import get_problem, load_problems
from .schemas import (
    CheckRequest,
    CheckResponse,
    ProblemDetail,
    ProblemSummary,
    RecognizeRequest,
    RecognizeResponse,
    RecognizedLine,
)

app = FastAPI(title="Orbit API", version="0.1.0")

web_origin = os.environ.get("WEB_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[web_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/problems", response_model=list[ProblemSummary])
def list_problems() -> list[dict]:
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "prompt_latex": p["prompt_latex"],
            "skills": p["skills"],
        }
        for p in load_problems()
    ]


@app.get("/problems/{problem_id}", response_model=ProblemDetail)
def problem_detail(problem_id: str) -> dict:
    problem = get_problem(problem_id)
    if problem is None:
        raise HTTPException(status_code=404, detail=f"unknown problem {problem_id!r}")
    return problem


@app.post("/recognize", response_model=RecognizeResponse)
def recognize(request: RecognizeRequest) -> dict:
    client = get_client()
    lines: list[dict] = []
    for image in request.images:
        lines.extend(client.recognize_detailed(image))
    return {"lines": [RecognizedLine(**line).model_dump() for line in lines]}


@app.post("/check", response_model=CheckResponse)
def check_work(request: CheckRequest) -> dict:
    problem = get_problem(request.problem_id)
    if problem is None:
        raise HTTPException(
            status_code=404, detail=f"unknown problem {request.problem_id!r}"
        )
    return checker.check(problem, request.lines)
