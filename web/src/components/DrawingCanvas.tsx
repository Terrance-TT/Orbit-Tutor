"use client";

import { useEffect, useRef, useState } from "react";
import { INK_COLOR, INK_WIDTH } from "@/lib/ink";
import type { Stroke, StrokePoint } from "@/lib/types";

interface DrawingCanvasProps {
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  disabled?: boolean;
}

export function pathFromPoints(points: StrokePoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  if (rest.length === 0) {
    // Zero-length line with a round cap renders as a dot.
    d += ` L ${first.x + 0.01} ${first.y}`;
  }
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

const strokeProps = {
  stroke: INK_COLOR,
  strokeWidth: INK_WIDTH,
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export default function DrawingCanvas({
  strokes,
  onStrokesChange,
  disabled = false,
}: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const activePathRef = useRef<SVGPathElement>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef(strokes);
  const onStrokesChangeRef = useRef(onStrokesChange);
  const disabledRef = useRef(disabled);
  const rectRef = useRef<DOMRect | null>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const [debug] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("debug"),
  );

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);
  useEffect(() => {
    onStrokesChangeRef.current = onStrokesChange;
  }, [onStrokesChange]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  // Debug HUD (?debug=1): raw pointer events as the browser delivers them,
  // independent of the drawing handlers.
  useEffect(() => {
    const svg = svgRef.current;
    const hud = debugRef.current;
    if (!debug || !svg || !hud) return;
    const lines: string[] = ["build ink-v6 (svg)"];
    const render = () => {
      hud.textContent = lines.slice(0, 7).join("\n");
    };
    render();
    const note = (msg: string) => {
      lines.unshift(msg);
      render();
    };
    const onMove: EventListener = (e) => {
      const pe = e as PointerEvent;
      const key = `move ${pe.pointerType} id=${pe.pointerId}`;
      if (lines[0]?.startsWith(key)) {
        const n = Number(lines[0].match(/×(\d+)/)?.[1] ?? 1) + 1;
        lines[0] = `${key} ×${n}`;
      } else {
        lines.unshift(`${key} ×1`);
      }
      render();
    };
    const onEvent =
      (label: string): EventListener =>
      (e) => {
        const pe = e as PointerEvent;
        note(`${label} ${pe.pointerType} id=${pe.pointerId}`);
      };
    const handlers: Array<[string, EventListener]> = [
      ["pointerdown", onEvent("down")],
      ["pointermove", onMove],
      ["pointerup", onEvent("up")],
      ["pointercancel", onEvent("cancel")],
    ];
    for (const [type, handler] of handlers) {
      svg.addEventListener(type, handler);
    }
    return () => {
      for (const [type, handler] of handlers) {
        svg.removeEventListener(type, handler);
      }
    };
  }, [debug]);

  // Input: native DOM listeners on the SVG. The active stroke is a real
  // <path> element whose `d` is updated synchronously per event — no canvas
  // bitmap, no compositing step, no React re-render while drawing.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const toPoint = (e: PointerEvent): StrokePoint => {
      const rect = rectRef.current ?? svg.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        t: e.timeStamp,
      };
    };

    const onDown = (e: PointerEvent) => {
      // Apple Pencil (and mouse on desktop) only — finger and palm touches
      // are ignored so they never leave stray ink or trigger misclicks.
      if (e.pointerType === "touch") return;
      if (disabledRef.current || activeStrokeRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      rectRef.current = svg.getBoundingClientRect();
      activeStrokeRef.current = { points: [toPoint(e)] };
      activePathRef.current?.setAttribute(
        "d",
        pathFromPoints(activeStrokeRef.current.points),
      );
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const active = activeStrokeRef.current;
      if (!active) return;
      e.preventDefault();
      active.points.push(toPoint(e));
      activePathRef.current?.setAttribute("d", pathFromPoints(active.points));
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const active = activeStrokeRef.current;
      if (!active) return;
      activeStrokeRef.current = null;
      activePathRef.current?.setAttribute("d", "");
      if (active.points.length > 0) {
        onStrokesChangeRef.current([...strokesRef.current, active]);
      }
    };

    svg.addEventListener("pointerdown", onDown, { passive: false });
    svg.addEventListener("pointermove", onMove, { passive: false });
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    // Also catch releases outside the drawing surface (no pointer capture).
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onStrokesChange(strokes.slice(0, -1))}
          disabled={disabled || strokes.length === 0}
          className="min-h-12 rounded-xl border border-slate-300 px-6 text-lg text-slate-700 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => onStrokesChange([])}
          disabled={disabled || strokes.length === 0}
          className="min-h-12 rounded-xl border border-slate-300 px-6 text-lg text-slate-700 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {strokes.map((stroke, i) => (
            <path key={i} d={pathFromPoints(stroke.points)} {...strokeProps} />
          ))}
          <path ref={activePathRef} d="" {...strokeProps} />
        </svg>
        {debug && (
          <div
            ref={debugRef}
            className="pointer-events-none absolute bottom-2 left-2 whitespace-pre rounded bg-white/85 p-2 font-mono text-[10px] text-slate-700"
          />
        )}
      </div>
    </div>
  );
}
