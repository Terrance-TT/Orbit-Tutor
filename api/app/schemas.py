"""Pydantic models — the fixed API contract the frontend is built against."""

from pydantic import BaseModel


class ProblemSummary(BaseModel):
    id: str
    title: str
    prompt_latex: str
    skills: list[str]


class ProblemDetail(ProblemSummary):
    answer_latex: str


class RecognizeRequest(BaseModel):
    images: list[str]  # data URLs, e.g. "data:image/png;base64,..."


class RecognizedLine(BaseModel):
    latex: str
    confidence: float


class RecognizeResponse(BaseModel):
    lines: list[RecognizedLine]


class CheckRequest(BaseModel):
    problem_id: str
    lines: list[str]  # confirmed per-line LaTeX


class ParsedLine(BaseModel):
    raw: str
    parsed: str | None
    status: str  # "ok" | "unparseable"


class CheckResponse(BaseModel):
    correct: bool
    divergent_line_index: int | None
    final_answer_correct: bool
    parsed_lines: list[ParsedLine]


class DiagnoseRequest(BaseModel):
    problem_id: str
    lines: list[str]  # confirmed per-line LaTeX
    divergent_line_index: int | None = None  # recomputed when omitted


class DiagnoseResponse(BaseModel):
    error_type: str
    summary: str
    explanation: str
    fix_hint: str
