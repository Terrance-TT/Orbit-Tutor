"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, checkWork, getProblem, getProblems, recognize } from "@/lib/api";
import { segmentLines, strokesToLineImages } from "@/lib/segment";
import {
  clearStrokes,
  loadStrokes,
  saveStrokes,
} from "@/lib/storage";
import type {
  CheckResponse,
  ProblemDetail,
  ProblemSummary,
  Stroke,
} from "@/lib/types";
import ConfirmationScreen, {
  type ConfirmationLine,
} from "@/components/ConfirmationScreen";
import ProblemPicker from "@/components/ProblemPicker";
import ResultScreen from "@/components/ResultScreen";
import SolveScreen from "@/components/SolveScreen";

type Screen = "picker" | "solve" | "confirm" | "result" | "correct";

interface AsyncState {
  loading: boolean;
  error: string | null;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("picker");
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [listState, setListState] = useState<AsyncState>({
    loading: true,
    error: null,
  });
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [confirmationLines, setConfirmationLines] = useState<
    ConfirmationLine[]
  >([]);
  const [confirmedLatex, setConfirmedLatex] = useState<string[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  // Null during a normal solve; the frozen correct prefix during correction.
  const [correctionPrefix, setCorrectionPrefix] = useState<string[] | null>(
    null,
  );
  // The student's own ink for that prefix, kept read-only on the canvas.
  const [correctionPrefixStrokes, setCorrectionPrefixStrokes] = useState<
    Stroke[] | null
  >(null);
  const [submitState, setSubmitState] = useState<AsyncState>({
    loading: false,
    error: null,
  });
  const [lastProblemId, setLastProblemId] = useState<string | null>(null);

  const fetchProblems = useCallback(async () => {
    setListState({ loading: true, error: null });
    try {
      setProblems(await getProblems());
      setListState({ loading: false, error: null });
    } catch (err) {
      setListState({
        loading: false,
        error:
          err instanceof ApiError
            ? err.message
            : "Something went wrong loading problems.",
      });
    }
  }, []);

  // Initial load: setState only after the fetch resolves, never synchronously
  // in the effect body.
  useEffect(() => {
    let cancelled = false;
    getProblems()
      .then((data) => {
        if (cancelled) return;
        setProblems(data);
        setListState({ loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setListState({
          loading: false,
          error:
            err instanceof ApiError
              ? err.message
              : "Something went wrong loading problems.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectProblem = useCallback(async (id: string) => {
    setLastProblemId(id);
    setSubmitState({ loading: true, error: null });
    try {
      const detail = await getProblem(id);
      setProblem(detail);
      setStrokes(loadStrokes(id));
      setSubmitState({ loading: false, error: null });
      setScreen("solve");
    } catch (err) {
      setSubmitState({
        loading: false,
        error:
          err instanceof ApiError
            ? err.message
            : "Something went wrong loading that problem.",
      });
    }
  }, []);

  // Persist in-progress handwriting per problem, debounced so serializing a
  // large stroke history never blocks the main thread mid-writing.
  useEffect(() => {
    if (!problem || screen !== "solve") return;
    const timer = setTimeout(() => saveStrokes(problem.id, strokes), 400);
    return () => clearTimeout(timer);
  }, [problem, strokes, screen]);

  const handleSubmitHandwriting = async () => {
    if (!problem || strokes.length === 0) return;
    setSubmitState({ loading: true, error: null });
    try {
      const lineImages = strokesToLineImages(strokes);
      const { lines } = await recognize(
        lineImages.map((l) => l.dataUrl),
        problem.id,
      );
      setConfirmationLines(
        lines.map((line, i) => ({
          latex: line.latex,
          confidence: line.confidence,
          warning: line.warning,
          imageDataUrl: lineImages[i]?.dataUrl,
        })),
      );
      setSubmitState({ loading: false, error: null });
      setScreen("confirm");
    } catch (err) {
      setSubmitState({
        loading: false,
        error:
          err instanceof ApiError
            ? err.message
            : "Something went wrong reading your work. Try again.",
      });
    }
  };

  const handleSubmitTyped = (lines: string[]) => {
    // Typed input skips recognition but still goes through confirmation.
    setConfirmationLines(lines.map((latex) => ({ latex })));
    setSubmitState({ loading: false, error: null });
    setScreen("confirm");
  };

  const handleConfirm = async (lines: string[]) => {
    if (!problem) return;
    setSubmitState({ loading: true, error: null });
    try {
      // During correction, the student only supplied the reworked suffix.
      const fullLines = correctionPrefix
        ? [...correctionPrefix, ...lines]
        : lines;
      const result = await checkWork(problem.id, fullLines);
      setConfirmedLatex(fullLines);
      setCheckResult(result);
      if (result.correct) clearStrokes(problem.id);
      setCorrectionPrefix(null);
      setCorrectionPrefixStrokes(null);
      setSubmitState({ loading: false, error: null });
      setScreen("result");
    } catch (err) {
      setSubmitState({
        loading: false,
        error:
          err instanceof ApiError
            ? err.message
            : "Something went wrong checking your work. Try again.",
      });
    }
  };

  const startCorrection = () => {
    if (!checkResult) return;
    const divergent = checkResult.divergent_line_index;
    if (divergent === null) {
      setScreen("solve");
      return;
    }
    // Preserve the student's ink for the valid prefix before clearing the
    // writing surface; the student continues beneath their own handwriting.
    const prefixStrokes =
      divergent > 0
        ? segmentLines(strokes)
            .slice(0, divergent)
            .flatMap((group) => group.strokes)
        : null;
    // Freeze everything before the first wrong line; the student redoes the
    // divergent line and everything after it.
    setCorrectionPrefix(confirmedLatex.slice(0, divergent));
    setCorrectionPrefixStrokes(prefixStrokes);
    setStrokes([]);
    setSubmitState({ loading: false, error: null });
    setScreen("correct");
  };

  const goToPicker = () => {
    setScreen("picker");
    setProblem(null);
    setStrokes([]);
    setCheckResult(null);
    setCorrectionPrefix(null);
    setCorrectionPrefixStrokes(null);
  };

  return (
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col px-5 py-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-indigo-900">
          Orbit
        </h1>
        {screen !== "picker" && problem && (
          <span className="text-sm text-slate-500">{problem.title}</span>
        )}
      </header>

      {submitState.error && (
        <div
          role="alert"
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-red-800 shadow-lg"
        >
          <span>{submitState.error}</span>
          <button
            type="button"
            onClick={() => setSubmitState((s) => ({ ...s, error: null }))}
            className="min-h-11 shrink-0 px-3 text-red-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {screen === "picker" && (
          <div className="flex h-full flex-col gap-4 overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900">
              Pick a problem
            </h2>
            {listState.loading ? (
              <p className="py-16 text-center text-slate-500">
                Loading problems…
              </p>
            ) : listState.error ? (
              <div className="flex flex-col items-center gap-4 py-16">
                <p className="text-center text-slate-600">{listState.error}</p>
                <button
                  type="button"
                  onClick={fetchProblems}
                  className="min-h-12 rounded-xl bg-indigo-600 px-6 text-lg text-white"
                >
                  Try again
                </button>
              </div>
            ) : problems.length === 0 ? (
              <p className="py-16 text-center text-slate-500">
                No problems yet.
              </p>
            ) : (
              <ProblemPicker
                problems={problems}
                selectedId={lastProblemId}
                onSelect={selectProblem}
              />
            )}
            {submitState.loading && (
              <p className="py-4 text-center text-slate-500">
                Loading problem…
              </p>
            )}
          </div>
        )}

        {screen === "solve" && problem && (
          <SolveScreen
            problem={problem}
            strokes={strokes}
            onStrokesChange={setStrokes}
            busy={submitState.loading}
            onSubmitHandwriting={handleSubmitHandwriting}
            onSubmitTyped={handleSubmitTyped}
            onBack={goToPicker}
          />
        )}

        {screen === "correct" && problem && correctionPrefix && (
          <SolveScreen
            problem={problem}
            strokes={strokes}
            onStrokesChange={setStrokes}
            busy={submitState.loading}
            onSubmitHandwriting={handleSubmitHandwriting}
            onSubmitTyped={handleSubmitTyped}
            onBack={() => setScreen("result")}
            prefixLines={correctionPrefix}
            prefixStrokes={correctionPrefixStrokes ?? undefined}
            submitLabel="Check my correction"
          />
        )}

        {screen === "confirm" && (
          <ConfirmationScreen
            key={confirmationLines.map((l) => l.latex).join("")}
            lines={confirmationLines}
            busy={submitState.loading}
            onConfirm={handleConfirm}
            onBack={() =>
              setScreen(correctionPrefix ? "correct" : problem ? "solve" : "picker")
            }
          />
        )}

        {screen === "result" && checkResult && (
          <ResultScreen
            problemId={problem?.id ?? null}
            lines={confirmedLatex}
            result={checkResult}
            onNextProblem={goToPicker}
            onTryAgain={startCorrection}
          />
        )}
      </div>
    </main>
  );
}
