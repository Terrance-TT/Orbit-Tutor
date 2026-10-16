"use client";

import { useCallback, useEffect, useRef } from "react";
import { drawStrokes, INK_COLOR, INK_WIDTH } from "@/lib/ink";
import type { Stroke, StrokePoint } from "@/lib/types";

interface DrawingCanvasProps {
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  disabled?: boolean;
}

export default function DrawingCanvas({
  strokes,
  onStrokesChange,
  disabled = false,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const strokesRef = useRef(strokes);
  const rectRef = useRef<DOMRect | null>(null);
  const drawnPointsRef = useRef(0);

  // Full redraw: completed strokes plus the in-progress one. Only used when
  // the stroke list changes or the canvas resizes — never per pointer event.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    drawStrokes(ctx, strokesRef.current);
    if (activeStrokeRef.current) {
      drawStrokes(ctx, [activeStrokeRef.current]);
    }
  }, []);

  // Incremental drawing: paint just the new points of the active stroke on
  // top of the existing bitmap. Called synchronously from pointer events —
  // iPad Safari suspends requestAnimationFrame during an active Pencil
  // contact, so scheduling frames instead would delay ink until pointerup.
  const drawPending = useCallback(() => {
    const canvas = canvasRef.current;
    const active = activeStrokeRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = INK_COLOR;
    ctx.fillStyle = INK_COLOR;
    ctx.lineWidth = INK_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pts = active.points;
    if (pts.length === 1 && drawnPointsRef.current === 0) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, INK_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
      drawnPointsRef.current = 1;
      return;
    }
    const start = Math.max(drawnPointsRef.current - 1, 0);
    if (pts.length - start < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[start].x, pts[start].y);
    for (let i = start + 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    drawnPointsRef.current = pts.length;
  }, []);

  // Keep the canvas bitmap sized to its container (with DPR) and redraw on
  // resize. Stroke points are stored in CSS pixels, so resizing never
  // distorts existing ink.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(Math.round(rect.width * dpr), 1);
      canvas.height = Math.max(Math.round(rect.height * dpr), 1);
      redraw();
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  }, [strokes, redraw]);

  const toPoint = (clientX: number, clientY: number, t: number): StrokePoint => {
    const rect =
      rectRef.current ?? canvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, t };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || activeStrokeRef.current) return;
    // Apple Pencil (and mouse on desktop) only — finger and palm touches are
    // ignored entirely so they never leave stray ink or trigger misclicks.
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    rectRef.current = canvasRef.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    activeStrokeRef.current = {
      points: [toPoint(e.clientX, e.clientY, e.timeStamp)],
    };
    drawnPointsRef.current = 0;
    drawPending();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;
    const active = activeStrokeRef.current;
    if (!active) return;
    const coalesced =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    for (const ev of coalesced) {
      active.points.push(toPoint(ev.clientX, ev.clientY, ev.timeStamp));
    }
    drawPending();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerIdRef.current) return;
    const active = activeStrokeRef.current;
    if (!active) return;
    drawPending(); // flush any points not yet painted
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    drawnPointsRef.current = 0;
    if (active.points.length > 0) {
      onStrokesChange([...strokesRef.current, active]);
    }
  };

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
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
