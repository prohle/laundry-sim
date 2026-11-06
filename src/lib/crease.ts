/**
 * Grid-relief crease pattern.
 *
 * The sheet is divided into an N×N grid. Each cell gets a height derived from
 * the image. Creases are the hinges between cells whose heights differ — a
 * valley where the surface rises toward the viewer, a mountain where it falls
 * away. Foldability is guaranteed by construction: every crease is a grid line
 * and every fold is a hinge between two cells.
 */

export type Direction = "mountain" | "valley";

export interface Crease {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  direction: Direction;
  angle: number;
}

export interface CreasePattern {
  n: number;
  levels: number;
  heights: number[][];
  solid: boolean[][];
  creases: Crease[];
}

/** Build a pattern from an RGBA image already scaled to N×N. */
export function buildPattern(
  pixels: Uint8ClampedArray,
  n: number,
  levels = 4,
): CreasePattern {
  const heights: number[][] = [];
  const solid: boolean[][] = [];

  for (let y = 0; y < n; y++) {
    const row: number[] = [];
    const srow: boolean[] = [];
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3] / 255;

      // Perceptual luminance, inverted: dark areas rise.
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const height = (1 - lum) * a;

      // Distance from the silhouette edge keeps flat backgrounds from
      // collapsing the relief to a rectangle.
      const edge = Math.min(x, y, n - 1 - x, n - 1 - y) / (n / 2);
      row.push(0.75 * height + 0.25 * Math.min(1, edge));
      srow.push(a > 0.5);
    }
    heights.push(row);
    solid.push(srow);
  }

  // Normalise to [0,1] across the grid.
  let min = Infinity;
  let max = -Infinity;
  for (const row of heights)
    for (const h of row) {
      if (h < min) min = h;
      if (h > max) max = h;
    }
  const span = max - min || 1;
  for (const row of heights)
    for (let x = 0; x < row.length; x++) row[x] = (row[x] - min) / span;

  // Quantise so the pattern stays buildable and legible.
  const q = (h: number) => Math.round(h * (levels - 1)) / (levels - 1);

  const creases: Crease[] = [];
  const maxAngle = 90;

  const add = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    ha: number,
    hb: number,
  ) => {
    const delta = Math.abs(ha - hb);
    if (delta < 1 / (levels - 1) / 2) return;
    creases.push({
      x1: ax,
      y1: ay,
      x2: bx,
      y2: by,
      direction: ha > hb ? "valley" : "mountain",
      angle: Math.round((delta * maxAngle) / 1),
    });
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const h = q(heights[y][x]);
      if (x < n - 1) add(x + 1, y, x + 1, y + 1, h, q(heights[y][x + 1]));
      if (y < n - 1) add(x, y + 1, x + 1, y + 1, h, q(heights[y + 1][x]));
    }
  }

  return { n, levels, heights, solid, creases };
}

/** Draw the pattern onto a square canvas. */
export function drawPattern(
  canvas: HTMLCanvasElement,
  pattern: CreasePattern,
  size: number,
  accent = "#E8A33D",
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);

  const { n, levels, heights, creases } = pattern;
  const cell = size / n;

  // Height shading — very low contrast, just enough to read the relief.
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const h = heights[y][x];
      const v = Math.round(12 + h * 28);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // Grid hairlines.
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }

  // Creases: valley solid, mountain dashed.
  ctx.lineWidth = Math.max(1, size / 400);
  for (const c of creases) {
    ctx.strokeStyle =
      c.direction === "valley" ? "rgba(255,255,255,0.85)" : accent;
    ctx.setLineDash(c.direction === "mountain" ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(c.x1 * cell, c.y1 * cell);
    ctx.lineTo(c.x2 * cell, c.y2 * cell);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Outer border.
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

  void levels;
}
