import { drawStrokes, strokeBounds, unionBounds, type Bounds } from "./ink";
import type { Stroke } from "./types";

export interface LineGroup {
  strokes: Stroke[];
  bounds: Bounds;
}

interface PositionedStroke {
  stroke: Stroke;
  bounds: Bounds;
  centerY: number;
  height: number;
}

// Group strokes into horizontal writing lines by their vertical position.
// Strokes are sorted by vertical center, then greedily grouped: a stroke
// starts a new line when its center sits more than `threshold` below the
// previous stroke's center. The threshold scales with the median stroke
// height so it adapts to how large the student writes.
export function segmentLines(strokes: Stroke[]): LineGroup[] {
  const positioned: PositionedStroke[] = strokes
    .filter((s) => s.points.length > 0)
    .map((stroke) => {
      const bounds = strokeBounds(stroke.points);
      return {
        stroke,
        bounds,
        centerY: (bounds.minY + bounds.maxY) / 2,
        height: Math.max(bounds.maxY - bounds.minY, 1),
      };
    });
  if (positioned.length === 0) return [];

  positioned.sort((a, b) => a.centerY - b.centerY);

  const heights = positioned.map((p) => p.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];
  const threshold = Math.max(24, medianHeight * 0.75);

  const groups: PositionedStroke[][] = [[positioned[0]]];
  for (let i = 1; i < positioned.length; i++) {
    const prev = positioned[i - 1];
    const cur = positioned[i];
    if (cur.centerY - prev.centerY > threshold) {
      groups.push([cur]);
    } else {
      groups[groups.length - 1].push(cur);
    }
  }

  return groups.map((group) => ({
    strokes: group.map((p) => p.stroke),
    bounds: group
      .map((p) => p.bounds)
      .reduce((acc, b) => unionBounds(acc, b)),
  }));
}

export interface LineImage {
  dataUrl: string;
  bounds: Bounds;
}

// Render one line group to a cropped PNG dataURL: white background, padded,
// 2x scale so Mathpix gets a sharp image.
export function renderLineImage(
  group: LineGroup,
  padding = 20,
  scale = 2,
): LineImage {
  const { minX, minY, maxX, maxY } = group.bounds;
  const width = Math.max(maxX - minX + padding * 2, 8);
  const height = Math.max(maxY - minY + padding * 2, 8);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawStrokes(ctx, group.strokes, padding - minX, padding - minY);

  return { dataUrl: canvas.toDataURL("image/png"), bounds: group.bounds };
}

// Segment all strokes and render each line to a PNG, ordered top-to-bottom.
export function strokesToLineImages(strokes: Stroke[]): LineImage[] {
  return segmentLines(strokes).map((group) => renderLineImage(group));
}
