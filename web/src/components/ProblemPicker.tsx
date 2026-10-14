"use client";

import type { ProblemSummary } from "@/lib/types";
import Latex from "./Latex";

interface ProblemPickerProps {
  problems: ProblemSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ProblemPicker({
  problems,
  selectedId,
  onSelect,
}: ProblemPickerProps) {
  return (
    <ul className="flex flex-col gap-3">
      {problems.map((problem) => (
        <li key={problem.id}>
          <button
            type="button"
            onClick={() => onSelect(problem.id)}
            className={`flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border px-6 py-4 text-left transition-colors ${
              problem.id === selectedId
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-200 bg-white active:bg-slate-50"
            }`}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-lg font-medium text-slate-900">
                {problem.title}
              </span>
              <Latex
                latex={problem.prompt_latex}
                className="truncate text-slate-600"
              />
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {problem.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                >
                  {skill}
                </span>
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
