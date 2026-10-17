"""FastAPI entrypoint for the Orbit core diagnostic loop.

Endpoints (the fixed contract the web frontend is built against):
  GET  /problems       -> [ProblemSummary]
  GET  /problems/{id}  -> ProblemDetail
  POST /recognize      -> per-line LaTeX via the Mathpix client (mock by default)
  POST /check          -> symbolic verdict + divergent line via the checker
  POST /diagnose       -> tutor misconception diagnosis at the divergent line
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import checker
from .mathpix_client import (
    MathpixNotConfiguredError,
    MathpixRecognitionError,
    get_client,
)
from .problems import get_problem, load_problems
from .schemas import (
    CheckRequest,
    CheckResponse,
    DiagnoseRequest,
    DiagnoseResponse,
    ProblemDetail,
    ProblemSummary,
    RecognizeRequest,
    RecognizeResponse,
    RecognizedLine,
)
from .tutor import TutorError, TutorNotConfiguredError, get_tutor_client

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
    try:
        client = get_client()
    except MathpixNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        # Live Mathpix calls are sequential-network-bound; fan them out so a
        # multi-line submission doesn't take N × the per-line latency.
        with ThreadPoolExecutor(max_workers=4) as pool:
            per_image = list(pool.map(client.recognize_detailed, request.images))
    except MathpixRecognitionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail=f"Mathpix request failed: {exc}"
        ) from exc
    lines = [line for image_lines in per_image for line in image_lines]
    return {"lines": [RecognizedLine(**line).model_dump() for line in lines]}


@app.post("/check", response_model=CheckResponse)
def check_work(request: CheckRequest) -> dict:
    problem = get_problem(request.problem_id)
    if problem is None:
        raise HTTPException(
            status_code=404, detail=f"unknown problem {request.problem_id!r}"
        )
    return checker.check(problem, request.lines)


@app.post("/diagnose", response_model=DiagnoseResponse)
def diagnose(request: DiagnoseRequest) -> dict:
    problem = get_problem(request.problem_id)
    if problem is None:
        raise HTTPException(
            status_code=404, detail=f"unknown problem {request.problem_id!r}"
        )

    divergent_line_index = request.divergent_line_index
    if divergent_line_index is None:
        divergent_line_index = checker.check(problem, request.lines)[
            "divergent_line_index"
        ]
    if divergent_line_index is None:
        raise HTTPException(
            status_code=400, detail="no divergent line to diagnose"
        )
    if not 0 <= divergent_line_index < len(request.lines):
        raise HTTPException(
            status_code=400, detail="divergent_line_index is out of range"
        )

    try:
        client = get_tutor_client()
    except TutorNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        return client.diagnose(problem, request.lines, divergent_line_index)
    except TutorError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail=f"tutor request failed: {exc}"
        ) from exc
