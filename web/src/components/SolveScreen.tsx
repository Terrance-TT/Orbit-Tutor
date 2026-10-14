"use client";

import { useState } from "react";
import type { ProblemDetail, Stroke } from "@/lib/types";
import DrawingCanvas from "./DrawingCanvas";
import Latex from "./Latex";

interface SolveScreenProps {
  problem: ProblemDetail;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  busy: boolean;
  onSubmitHandwriting: () => void;
  onSubmitTyped: (lines: string[]) => void;
  onBack: () => void;
}

type InputMode = "draw" | "type";

export default function SolveScreen({
  problem,
  strokes,
  onStrokesChange,
  busy,
  onSubmitHandwriting,
  onSubmitTyped,
  onBack,
}: SolveScreenProps) {
  const [mode, setMode] = useState<InputMode>("draw");
  const [typedLines, setTypedLines] = useState<string[]>([""]);

  const submitDisabled =
    busy ||
    (mode === "draw"
      ? strokes.length === 0
      : typedLines.every((line) => line.trim() === ""));

  const handleSubmit = () => {
    if (mode === "draw") {
      onSubmitHandwriting();
    } else {
      onSubmitTyped(typedLines.filter((line) => line.trim() !== ""));
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 min-h-11 text-base text-indigo-700"
          >
            ← All problems
          </button>
          <h2 className="text-xl font-semibold text-slate-900">
            {problem.title}
          </h2>
        </div>
        <div className="flex shrink-0 rounded-xl border border-slate-300 p-1">
          {(["draw", "type"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-lg px-4 text-base ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600"
              }`}
            >
              {m === "draw" ? "Write" : "Type instead"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-indigo-50 px-6 py-5 text-2xl text-slate-900">
        <Latex latex={problem.prompt_latex} block />
      </div>

      {mode === "draw" ? (
        <div className="min-h-0 flex-1">
          <DrawingCanvas
            strokes={strokes}
            onStrokesChange={onStrokesChange}
            disabled={busy}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {typedLines.map((line, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-8 text-right text-slate-400">{i + 1}</span>
              <input
                value={line}
                onChange={(e) =>
                  setTypedLines(
                    typedLines.map((l, j) => (j === i ? e.target.value : l)),
                  )
                }
                placeholder="e.g. 2x + 4 = 10"
                disabled={busy}
                className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 font-mono text-lg"
              />
              <button
                type="button"
                aria-label={`Remove line ${i + 1}`}
                onClick={() =>
                  setTypedLines(typedLines.filter((_, j) => j !== i))
                }
                disabled={busy || typedLines.length <= 1}
                className="min-h-12 min-w-12 rounded-xl border border-slate-300 text-slate-500 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTypedLines([...typedLines, ""])}
            disabled={busy}
            className="min-h-12 rounded-xl border border-dashed border-slate-300 text-slate-600"
          >
            + Add line
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className="min-h-14 rounded-2xl bg-indigo-600 text-xl font-medium text-white disabled:opacity-40"
      >
        {busy ? "Reading your work…" : "Check my work"}
      </button>
    </div>
  );
}
