import test from "node:test";
import assert from "node:assert/strict";
import { buildCollapse, collapseFrame, hingeProgress, measureFrame } from "./collapse.ts";
import type { CollapseCp } from "./collapse.ts";

// A square folded once along its vertical middle: two panels, one valley.
const square = (fold: string): CollapseCp => ({
  vertices: [[0, 0], [0.5, 0], [1, 0], [1, 1], [0.5, 1], [0, 1]],
  creases: [
    { from: 1, to: 4, fold },
    { from: 0, to: 1, fold: "B" }, { from: 1, to: 2, fold: "B" }, { from: 2, to: 3, fold: "B" },
    { from: 3, to: 4, fold: "B" }, { from: 4, to: 5, fold: "B" }, { from: 5, to: 0, fold: "B" },
  ],
  faces: [[0, 1, 4, 5], [1, 2, 3, 4]],
});

test("two panels, one hinge: counts and mapping", () => {
  const b = buildCollapse(square("M"), 100);
  assert.ok(b.ok);
  if (!b.ok) return;
  assert.equal(b.model.stats.faces, 2);
  assert.equal(b.model.stats.triangles, 4);
  assert.equal(b.model.stats.hinges, 1);
  assert.equal(b.model.stats.creasesNotOnSharedEdge.length, 0);
  assert.equal(b.model.stats.components, 1);
});

test("a mountain fold ends flat, panels rigid, hinge closed", () => {
  const b = buildCollapse(square("M"), 100);
  if (!b.ok) throw new Error("build");
  const f1 = collapseFrame(b.model, "together", 1);
  const m = measureFrame(b.model, f1);
  assert.ok(m.maxEdgeStretchMm < 1e-4 && m.maxHingeGapMm < 1e-9 && m.maxOrthonormalityError < 1e-12);
  // Every corner is on the z = 0 plane and the sheet has become one half wide.
  const xs = Array.from({ length: f1.positions.length / 3 }, (_, i) => f1.positions[i * 3]);
  for (let c = 0; c < f1.positions.length; c += 3) assert.ok(Math.abs(f1.positions[c + 2]) < 1e-4);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 50 + 1e-4);
});

test("mountain goes away from the viewer, valley toward", () => {
  for (const [fold, sign] of [["M", -1], ["V", 1]] as const) {
    const b = buildCollapse(square(fold), 100);
    if (!b.ok) throw new Error("build");
    const f = collapseFrame(b.model, "together", 0.5);
    const zs = Array.from({ length: f.positions.length / 3 }, (_, i) => f.positions[i * 3 + 2] * sign);
    assert.ok(Math.max(...zs) > 1, `${fold} moves corners in the ${sign} direction`);
    assert.ok(zs.every((z) => z >= -1e-4), `${fold} never moves the other way`);
  }
});

test("flat creases do not move anything; the frame at t=0 is the sheet", () => {
  const b = buildCollapse(square("F"), 100);
  if (!b.ok) throw new Error("build");
  assert.equal(b.model.stats.steps, 0);
  assert.deepEqual(Array.from(collapseFrame(b.model, "together", 1).positions), Array.from(b.model.flat));
});

test("a frame is a function of (model, mode, t) only", () => {
  const b = buildCollapse(square("V"), 100);
  if (!b.ok) throw new Error("build");
  const a = collapseFrame(b.model, "sequence", 0.37).positions;
  collapseFrame(b.model, "together", 0.9);
  assert.deepEqual(Array.from(collapseFrame(b.model, "sequence", 0.37).positions), Array.from(a));
});

test("missing faces or creases are reported, not drawn", () => {
  const cp = square("M");
  const noFaces = buildCollapse({ ...cp, faces: undefined }, 100);
  assert.ok(!noFaces.ok);
  const noCreases = buildCollapse({ ...cp, creases: [] }, 100);
  assert.ok(!noCreases.ok);
  const badFace = buildCollapse({ ...cp, faces: [[0, 1, 99]] }, 100);
  assert.ok(!badFace.ok);
});

test("sequence mode folds hinges one after another", () => {
  const cp: CollapseCp = {
    vertices: [[0, 0], [0.3, 0], [0.6, 0], [1, 0], [1, 1], [0.6, 1], [0.3, 1], [0, 1]],
    creases: [
      { from: 1, to: 6, fold: "M" }, { from: 2, to: 5, fold: "V" },
      ...[[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]].map(([from, to]) => ({ from, to, fold: "B" })),
    ],
    faces: [[0, 1, 6, 7], [1, 2, 5, 6], [2, 3, 4, 5]],
  };
  const b = buildCollapse(cp, 100);
  if (!b.ok) throw new Error("build");
  assert.equal(b.model.stats.steps, 2);
  // At t = 0.5 the first hinge is complete and the second has not begun.
  assert.equal(hingeProgress(b.model, b.model.active[0], "sequence", 0.5), 1);
  assert.equal(hingeProgress(b.model, b.model.active[1], "sequence", 0.5), 0);
  assert.equal(hingeProgress(b.model, b.model.active[1], "together", 0.5), 0.5);
});
