"use client";

import type { CheckResponse } from "@/lib/types";
import Latex from "./Latex";

interface ResultScreenProps {
  lines: string[];
  result: CheckResponse;
  onNextProblem: () => void;
  onTryAgain: () => void;
}

export default function ResultScreen({
  lines,
  result,
  onNextProblem,
  onTryAgain,
}: ResultScreenProps) {
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

  const divergent = result.divergent_line_index;

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

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-slate-500">
        Tutor explanation (coming soon)
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onTryAgain}
          className="min-h-14 flex-1 rounded-2xl border border-slate-300 text-lg text-slate-700"
        >
          Revise my work
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
