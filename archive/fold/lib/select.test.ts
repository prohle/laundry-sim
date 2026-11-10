import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTree } from "./skeleton.ts";
import type { SkeletonInput, SkeletonTree } from "./skeleton.ts";
import { reconstructionScore, penalise, selectThreshold, sweep, SWEEP_THRESHOLDS } from "./select.ts";
import type { SweepRow } from "./select.ts";

/** A body block with `legs` vertical legs, as a mask. */
function animal(legs: number): SkeletonInput {
  const width = 120;
  const height = 80;
  const mask = new Uint8Array(width * height);
  for (let y = 20; y < 45; y++) for (let x = 10; x < 110; x++) mask[y * width + x] = 1;
  for (let k = 0; k < legs; k++) {
    const x0 = 14 + Math.floor((k * 88) / Math.max(1, legs - 1 || 1));
    for (let y = 45; y < 75; y++) for (let x = x0; x < x0 + 6; x++) mask[y * width + x] = 1;
  }
  return { mask, width, height };
}

const EMPTY: SkeletonTree = { nodes: [], edges: [], leaves: 0, frame: { originX: 0, originY: 0, scale: 1 }, leafSignificance: {} };

test("a tree with no edges scores 0 and covers nothing", () => {
  const r = reconstructionScore(EMPTY, animal(2));
  assert.equal(r.iou, 0);
  assert.equal(r.coverage.reduce((a, b) => a + b, 0), 0);
});

test("a stick figure of a thick bar reproduces most of it", () => {
  const w = 100;
  const h = 40;
  const mask = new Uint8Array(w * h);
  for (let y = 10; y < 30; y++) for (let x = 5; x < 95; x++) mask[y * w + x] = 1;
  const tree = extractTree({ mask, width: w, height: h }, { significanceThreshold: 0 });
  const r = reconstructionScore(tree, { mask, width: w, height: h });
  assert.ok(r.iou > 0.6 && r.iou <= 1, `iou ${r.iou}`);
  assert.equal(r.coverage.length, w * h);
});

test("IoU is within 0..1 and coverage is binary", () => {
  const input = animal(4);
  const r = reconstructionScore(extractTree(input, { significanceThreshold: 1 }), input);
  assert.ok(r.iou >= 0 && r.iou <= 1);
  assert.ok(r.coverage.every((v) => v === 0 || v === 1));
});

test("sweep covers 1.0..4.0 in steps of 0.25 and is deterministic", () => {
  assert.equal(SWEEP_THRESHOLDS.length, 13);
  assert.equal(SWEEP_THRESHOLDS[0], 1);
  assert.equal(SWEEP_THRESHOLDS[12], 4);
  const input = animal(4);
  assert.deepEqual(sweep(input), sweep(input));
});

test("penalise picks the best penalised row, and breaks ties to fewer leaves then higher threshold", () => {
  const rows: SweepRow[] = [
    { threshold: 1, leaves: 10, iou: 0.8, value: 0 },
    { threshold: 2, leaves: 6, iou: 0.6, value: 0 },
    { threshold: 3, leaves: 6, iou: 0.6, value: 0 },
    { threshold: 4, leaves: 2, iou: 0.1, value: 0 },
  ];
  assert.equal(penalise(rows, 0), 0); // no penalty: most detail wins
  assert.equal(penalise(rows, 0.03), 0); // 0.8-0.30 = 0.50 beats 0.6-0.18 = 0.42
  assert.equal(penalise(rows, 0.1), 2); // rows 1 and 2 tie at 0.0: same leaves, higher threshold wins
});

test("selectThreshold returns a swept threshold and a marked row", () => {
  const sel = selectThreshold(animal(4));
  assert.ok(SWEEP_THRESHOLDS.includes(sel.threshold));
  assert.equal(sel.rows[sel.chosen].threshold, sel.threshold);
  assert.ok(sel.rows.every((r) => r.value <= sel.rows[sel.chosen].value));
});
