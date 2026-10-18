"use client";

import { useState } from "react";
import Latex from "./Latex";

export interface ConfirmationLine {
  latex: string;
  confidence?: number;
  warning?: string | null;
  imageDataUrl?: string;
}

interface ConfirmationScreenProps {
  lines: ConfirmationLine[];
  busy: boolean;
  onConfirm: (confirmedLatex: string[]) => void;
  onBack: () => void;
}

export default function ConfirmationScreen({
  lines,
  busy,
  onConfirm,
  onBack,
}: ConfirmationScreenProps) {
  const [edited, setEdited] = useState<string[]>(lines.map((l) => l.latex));
  const [confirmed, setConfirmed] = useState<boolean[]>(lines.map(() => false));

  const setEditedLine = (i: number, value: string) => {
    setEdited(edited.map((l, j) => (j === i ? value : l)));
    setConfirmed(confirmed.map((c, j) => (j === i ? false : c)));
  };

  const toggleConfirmed = (i: number) =>
    setConfirmed(confirmed.map((c, j) => (j === i ? !c : c)));

  const allConfirmed = confirmed.every(Boolean);

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Here&apos;s what I read — is this right?
        </h2>
        <p className="mt-1 text-base text-slate-600">
          Fix any line that doesn&apos;t match your work, then confirm each
          line. I won&apos;t check anything until every line is confirmed.
        </p>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {lines.map((line, i) => (
          <li
            key={i}
            className={`rounded-2xl border p-4 ${
              confirmed[i]
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex flex-col gap-3">
              {line.imageDataUrl && (
                <div className="rounded-xl border border-slate-200 bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- line crops are runtime dataURLs, next/image cannot help */}
                  <img
                    src={line.imageDataUrl}
                    alt={`Your handwriting for line ${i + 1}`}
                    className="max-h-24 w-auto"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-right text-slate-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 overflow-x-auto text-xl">
                  <Latex latex={edited[i]} />
                </div>
                {typeof line.confidence === "number" && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                      line.confidence < 0.8
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {Math.round(line.confidence * 100)}% sure
                  </span>
                )}
              </div>
              {line.warning && (
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
                  {line.warning}
                </p>
              )}
              <div className="flex items-center gap-3 pl-11">
                <input
                  value={edited[i]}
                  onChange={(e) => setEditedLine(i, e.target.value)}
                  disabled={busy}
                  aria-label={`Edit line ${i + 1}`}
                  className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 font-mono text-base"
                />
                <button
                  type="button"
                  onClick={() => toggleConfirmed(i)}
                  disabled={busy || edited[i].trim() === ""}
                  className={`min-h-12 shrink-0 rounded-xl px-5 text-base font-medium disabled:opacity-40 ${
                    confirmed[i]
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300 text-slate-700"
                  }`}
                >
                  {confirmed[i] ? "Confirmed ✓" : "Confirm"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="min-h-14 rounded-2xl border border-slate-300 px-6 text-lg text-slate-700 disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setConfirmed(lines.map(() => true))}
          disabled={busy || allConfirmed}
          className="min-h-14 rounded-2xl border border-slate-300 px-6 text-lg text-slate-700 disabled:opacity-40"
        >
          Confirm all
        </button>
        <button
          type="button"
          onClick={() => onConfirm(edited)}
          disabled={busy || !allConfirmed}
          className="min-h-14 flex-1 rounded-2xl bg-indigo-600 text-xl font-medium text-white disabled:opacity-40"
        >
          {busy ? "Checking…" : "Check my work"}
        </button>
      </div>
    </div>
  );
}
