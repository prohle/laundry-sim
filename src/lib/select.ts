/**
 * Automatic choice of the significance threshold (task 3.10).
 *
 * A tree is scored by how well a stick figure drawn from it reproduces the silhouette:
 *   - every edge is a capsule (a thick stroke with round ends) whose width is twice the
 *     distance-transform value at the edge's midpoint, so its radius is that value;
 *   - score = IoU between the union of those capsules and the mask.
 * More leaves can only add strokes, so IoU rises with leaves; the penalty `lambda * leaves`
 * is what stops it. For each threshold in the sweep:  value = IoU - lambda * leaves.
 *
 * Pure and deterministic. Leaves are counted on the tree as extracted (no flap budget, no
 * edge contraction), so the penalty sees the leaves the silhouette actually has.
 */
import { distanceTransform, extractTree } from "./skeleton.ts";
import type { SkeletonInput, SkeletonTree } from "./skeleton.ts";

/** Sweep from 1.0 to 4.0 in steps of 0.25 (13 values). */
export const SWEEP_THRESHOLDS: readonly number[] = Array.from({ length: 13 }, (_, i) => 1 + i * 0.25);

/** Penalty per leaf, in IoU units. Chosen from the four-fixture sweep; see tasks.md 3.10. */
export const DEFAULT_LAMBDA = 0.03;

export interface Reconstruction {
  /** Intersection over union with the mask, 0..1. 0 for a tree with no edges. */
  iou: number;
  /** The rasterised stick figure: 1 where a stroke covers the pixel; row-major, width * height. */
  coverage: Uint8Array;
}

/**
 * Rasterise `tree` onto the image grid and compare it with the mask. `dt` is the padded
 * distance transform from skeleton.ts (`distanceTransform(input)`); it is computed if omitted.
 * Tree coordinates map to pixels as `pixel = origin + coord * scale`, and pixel (x, y) has its
 * centre at (x + 0.5, y + 0.5).
 */
export function reconstructionScore(tree: SkeletonTree, input: SkeletonInput, dt?: Float32Array): Reconstruction {
  const { mask, width, height } = input;
  const DT = dt ?? distanceTransform(input);
  const PW = width + 2;
  const coverage = new Uint8Array(width * height);
  const { originX, originY, scale } = tree.frame;

  for (const e of tree.edges) {
    const a = tree.nodes[e.from];
    const b = tree.nodes[e.to];
    const ax = originX + a.x * scale;
    const ay = originY + a.y * scale;
    const bx = originX + b.x * scale;
    const by = originY + b.y * scale;
    const mx = Math.min(width - 1, Math.max(0, Math.floor((ax + bx) / 2)));
    const my = Math.min(height - 1, Math.max(0, Math.floor((ay + by) / 2)));
    const r = DT[(my + 1) * PW + mx + 1]; // stroke width 2r
    if (!(r > 0)) continue;

    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const ex = px - (ax + t * dx);
        const ey = py - (ay + t * dy);
        if (ex * ex + ey * ey <= r2) coverage[y * width + x] = 1;
      }
    }
  }

  let inter = 0;
  let union = 0;
  for (let i = 0; i < coverage.length; i++) {
    const m = mask[i] > 0;
    const c = coverage[i] > 0;
    if (m && c) inter++;
    if (m || c) union++;
  }
  return { iou: union === 0 ? 0 : inter / union, coverage };
}

export interface SweepRow {
  threshold: number;
  leaves: number;
  iou: number;
  /** iou - lambda * leaves */
  value: number;
}

/** Extract and score a tree at every threshold. `value` is filled in later by `penalise`. */
export function sweep(input: SkeletonInput, thresholds: readonly number[] = SWEEP_THRESHOLDS): SweepRow[] {
  const dt = distanceTransform(input);
  return thresholds.map((threshold) => {
    const tree = extractTree(input, { significanceThreshold: threshold });
    return { threshold, leaves: tree.leaves, iou: reconstructionScore(tree, input, dt).iou, value: 0 };
  });
}

/** Fill in `value` for a lambda and return the index of the best row. Ties go to fewer leaves,
 *  then to the higher threshold, so the choice never depends on float noise in the sweep order. */
export function penalise(rows: SweepRow[], lambda: number): number {
  let best = 0;
  rows.forEach((r, i) => {
    r.value = r.iou - lambda * r.leaves;
    const b = rows[best];
    if (
      i > 0 &&
      (r.value > b.value ||
        (r.value === b.value && (r.leaves < b.leaves || (r.leaves === b.leaves && r.threshold > b.threshold))))
    ) {
      best = i;
    }
  });
  if (rows.length) rows[0].value = rows[0].iou - lambda * rows[0].leaves;
  return best;
}

export interface Selection {
  threshold: number;
  lambda: number;
  rows: SweepRow[];
  chosen: number;
}

/** Sweep, penalise and pick. No human decision per image. */
export function selectThreshold(input: SkeletonInput, lambda: number = DEFAULT_LAMBDA): Selection {
  const rows = sweep(input);
  const chosen = penalise(rows, lambda);
  return { threshold: rows[chosen].threshold, lambda, rows, chosen };
}
