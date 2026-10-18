"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, diagnose } from "@/lib/api";
import type { CheckResponse, DiagnoseResponse } from "@/lib/types";
import Latex from "./Latex";

interface ResultScreenProps {
  problemId: string | null;
  lines: string[];
  result: CheckResponse;
  onNextProblem: () => void;
  onTryAgain: () => void;
}

interface DiagnosisState {
  loading: boolean;
  error: string | null;
}

// Render plain tutor text with inline $...$ math passed through KaTeX.
function TutorText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 1 && part.startsWith("$") && part.endsWith("$") ? (
          <Latex key={i} latex={part.slice(1, -1)} />
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function ResultScreen({
  problemId,
  lines,
  result,
  onNextProblem,
  onTryAgain,
}: ResultScreenProps) {
  const divergent = result.divergent_line_index;
  const [diagnosis, setDiagnosis] = useState<DiagnoseResponse | null>(null);
  const [diagnosisState, setDiagnosisState] = useState<DiagnosisState>({
    loading: false,
    error: null,
  });

  const loadDiagnosis = useCallback(async () => {
    if (result.correct || !problemId || divergent === null) return;
    setDiagnosisState({ loading: true, error: null });
    try {
      const data = await diagnose(problemId, lines, divergent);
      setDiagnosis(data);
      setDiagnosisState({ loading: false, error: null });
    } catch (err) {
      setDiagnosisState({
        loading: false,
        error:
          err instanceof ApiError
            ? err.message
            : "Something went wrong loading the tutor diagnosis.",
      });
    }
  }, [result.correct, problemId, lines, divergent]);

  useEffect(() => {
    if (result.correct || !problemId || divergent === null) return;
    // Defer the async fetch so no state updates happen synchronously in the
    // effect body.
    const timer = setTimeout(() => void loadDiagnosis(), 0);
    return () => clearTimeout(timer);
  }, [loadDiagnosis, result.correct, problemId, divergent]);

  if (result.correct) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">
          ✓
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Correct.</h2>
          <p className="mt-2 text-slate-600">
            Every line follows, and the final answer is right.
          </p>
        </div>
        <button
          type="button"
          onClick={onNextProblem}
          className="min-h-14 rounded-2xl bg-indigo-600 px-8 text-xl font-medium text-white"
        >
          Next problem
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Not quite — let&apos;s look at your work.
        </h2>
        <p className="mt-1 text-base text-slate-600">
          {divergent !== null && divergent > 0
            ? `Your work is correct through line ${divergent}. The problem starts here:`
            : divergent === 0
              ? "The problem starts on your very first line:"
              : result.final_answer_correct
                ? "Your final answer is right, but some steps couldn't be followed:"
                : "Your reasoning is fine, but the final answer doesn't match:"}
        </p>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {lines.map((line, i) => {
          const isDivergent = i === divergent;
          const parsed = result.parsed_lines[i];
          return (
            <li
              key={i}
              className={`rounded-xl border px-5 py-3 ${
                isDivergent
                  ? "border-amber-400 bg-amber-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-right text-slate-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 overflow-x-auto text-xl">
                  <Latex latex={line} />
                </div>
                {isDivergent && (
                  <span className="shrink-0 rounded-full bg-amber-200 px-3 py-1 text-xs font-medium text-amber-900">
                    starts here
                  </span>
                )}
              </div>
              {parsed && parsed.status !== "ok" && (
                <p className="mt-1 pl-11 text-sm text-slate-500">
                  Couldn&apos;t parse this line ({parsed.status})
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {problemId && divergent !== null && (
        <section className="shrink-0 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-800">
            Orbit&apos;s diagnosis
          </h3>
          {diagnosisState.loading ? (
            <p className="mt-3 text-slate-600">
              Thinking about where your reasoning went…
            </p>
          ) : diagnosisState.error ? (
            <div className="mt-3">
              <p className="text-sm text-red-700">{diagnosisState.error}</p>
              <button
                type="button"
                onClick={() => void loadDiagnosis()}
                className="mt-2 min-h-10 rounded-lg border border-indigo-300 px-4 text-sm text-indigo-700"
              >
                Retry diagnosis
              </button>
            </div>
          ) : diagnosis ? (
            <div className="mt-3 space-y-3 text-slate-800">
              <span className="inline-block rounded-full bg-white px-3 py-1 text-xs font-medium capitalize text-indigo-700">
                {diagnosis.error_type.replaceAll("_", " ")}
              </span>
              <p className="text-lg font-medium">
                <TutorText text={diagnosis.summary} />
              </p>
              <div className="space-y-2 leading-relaxed">
                {diagnosis.explanation.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i}>
                    <TutorText text={paragraph} />
                  </p>
                ))}
              </div>
              <p className="rounded-xl bg-white px-4 py-3">
                <span className="font-medium text-indigo-800">Try this: </span>
                <TutorText text={diagnosis.fix_hint} />
              </p>
            </div>
          ) : null}
        </section>
      )}

      <div className="flex shrink-0 gap-3">
        <button
          type="button"
          onClick={onTryAgain}
          className="min-h-14 flex-1 rounded-2xl border border-slate-300 text-lg text-slate-700"
        >
          {divergent !== null ? `Fix from line ${divergent + 1}` : "Revise my work"}
        </button>
        <button
          type="button"
          onClick={onNextProblem}
          className="min-h-14 flex-1 rounded-2xl bg-indigo-600 text-lg font-medium text-white"
        >
          Next problem
        </button>
      </div>
    </div>
  );
}
