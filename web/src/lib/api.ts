import type {
  CheckResponse,
  DiagnoseResponse,
  ProblemDetail,
  ProblemSummary,
  RecognizeResponse,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(
      `Could not reach the Orbit server at ${BASE_URL}. Is the backend running?`,
    );
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep generic detail
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export function getProblems(): Promise<ProblemSummary[]> {
  return request<ProblemSummary[]>("/problems");
}

export function getProblem(id: string): Promise<ProblemDetail> {
  return request<ProblemDetail>(`/problems/${encodeURIComponent(id)}`);
}

export function recognize(images: string[]): Promise<RecognizeResponse> {
  return request<RecognizeResponse>("/recognize", {
    method: "POST",
    body: JSON.stringify({ images }),
  });
}

export function checkWork(
  problemId: string,
  lines: string[],
): Promise<CheckResponse> {
  return request<CheckResponse>("/check", {
    method: "POST",
    body: JSON.stringify({ problem_id: problemId, lines }),
  });
}

export function diagnose(
  problemId: string,
  lines: string[],
  divergentLineIndex: number,
): Promise<DiagnoseResponse> {
  return request<DiagnoseResponse>("/diagnose", {
    method: "POST",
    body: JSON.stringify({
      problem_id: problemId,
      lines,
      divergent_line_index: divergentLineIndex,
    }),
  });
}
