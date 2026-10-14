import type { Stroke } from "./types";

const STROKES_PREFIX = "orbit:strokes:";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage full or unavailable — in-progress work just won't persist
  }
}

export function loadStrokes(problemId: string): Stroke[] {
  const raw = safeGet(STROKES_PREFIX + problemId);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Stroke[]) : [];
  } catch {
    return [];
  }
}

export function saveStrokes(problemId: string, strokes: Stroke[]): void {
  safeSet(STROKES_PREFIX + problemId, JSON.stringify(strokes));
}

export function clearStrokes(problemId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STROKES_PREFIX + problemId);
  } catch {
    // ignore
  }
}
