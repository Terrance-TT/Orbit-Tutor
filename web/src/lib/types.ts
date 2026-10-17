// API contract types — must stay in sync with the FastAPI backend.

export interface ProblemSummary {
  id: string;
  title: string;
  prompt_latex: string;
  skills: string[];
}

export interface ProblemDetail extends ProblemSummary {
  answer_latex: string;
}

export interface RecognizedLine {
  latex: string;
  confidence: number;
}

export interface RecognizeResponse {
  lines: RecognizedLine[];
}

export interface ParsedLine {
  raw: string;
  parsed: string | null;
  status: string;
}

export interface CheckResponse {
  correct: boolean;
  divergent_line_index: number | null;
  final_answer_correct: boolean;
  parsed_lines: ParsedLine[];
}

export interface DiagnoseResponse {
  error_type: string;
  summary: string;
  explanation: string;
  fix_hint: string;
}

// Handwriting capture types (V2 will analyze timing; keep timestamps now).
export interface StrokePoint {
  x: number;
  y: number;
  t: number;
}

export interface Stroke {
  points: StrokePoint[];
}
