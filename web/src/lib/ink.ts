import type { Stroke, StrokePoint } from "./types";

export const INK_COLOR = "#1e293b";
export const INK_WIDTH = 3.5;

// Draw one stroke as a smooth path through point midpoints (quadratic
// smoothing). dx/dy shift the stroke, used when rendering cropped line images.
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  dx = 0,
  dy = 0,
): void {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.strokeStyle = INK_COLOR;
  ctx.fillStyle = INK_COLOR;
  ctx.lineWidth = INK_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x + dx, pts[0].y + dy, INK_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x + dx, pts[0].y + dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x + dx, pts[i].y + dy, midX + dx, midY + dy);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x + dx, last.y + dy);
  ctx.stroke();
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  dx = 0,
  dy = 0,
): void {
  for (const stroke of strokes) drawStroke(ctx, stroke, dx, dy);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function strokeBounds(points: StrokePoint[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
