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
  /** Known-correct lines the student must not edit (correction mode). */
  prefixLines?: string[];
  submitLabel?: string;
}

type InputMode = "draw" | "type";

function CorrectPrefix({ lines }: { lines: string[] }) {
  return (
    <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2">
      <p className="text-xs font-medium text-emerald-800">
        {lines.length > 0
          ? `Correct through line ${lines.length}. Continue from line ${lines.length + 1}.`
          : "Start again from line 1."}
      </p>
      {lines.length > 0 && (
        <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2 text-base">
              <span className="w-5 text-right text-xs text-emerald-600">
                {i + 1}
              </span>
              <Latex latex={line} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SolveScreen({
  problem,
  strokes,
  onStrokesChange,
  busy,
  onSubmitHandwriting,
  onSubmitTyped,
  onBack,
  prefixLines,
  submitLabel = "Check my work",
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

  if (mode === "draw") {
    // Full-viewport writing surface: nothing but a slim problem bar, the
    // canvas, and the submit button — no page chrome to misclick.
    return (
      <div className="fixed inset-0 z-20 flex flex-col bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-10 shrink-0 px-2 text-base text-indigo-700"
          >
            ← Problems
          </button>
          <div className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xl text-slate-900">
            <Latex latex={problem.prompt_latex} />
          </div>
          <button
            type="button"
            onClick={() => setMode("type")}
            className="min-h-10 shrink-0 rounded-lg border border-slate-300 px-4 text-base text-slate-600"
          >
            Type instead
          </button>
        </div>

        {prefixLines && <CorrectPrefix lines={prefixLines} />}

        <div className="min-h-0 flex-1 px-3 pt-2">
          <DrawingCanvas
            strokes={strokes}
            onStrokesChange={onStrokesChange}
            disabled={busy}
          />
        </div>

        <div className="flex items-center gap-4 px-4 pb-4 pt-2">
          <p className="flex-1 text-sm text-slate-400">
            Apple Pencil only — fingers and palms won&apos;t draw.
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="min-h-14 flex-1 rounded-2xl bg-indigo-600 text-xl font-medium text-white disabled:opacity-40"
          >
            {busy ? "Reading your work…" : submitLabel}
          </button>
        </div>
      </div>
    );
  }

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

      {prefixLines && <CorrectPrefix lines={prefixLines} />}

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

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className="min-h-14 rounded-2xl bg-indigo-600 text-xl font-medium text-white disabled:opacity-40"
      >
        {busy ? "Reading your work…" : submitLabel}
      </button>
    </div>
  );
}
