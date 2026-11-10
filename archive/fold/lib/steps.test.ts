import test from "node:test";
import assert from "node:assert/strict";
import { buildCollapse, collapseFrame, hingeSegment } from "./collapse.ts";
import { currentStep, describeSteps } from "./steps.ts";
import type { CollapseCp } from "./collapse.ts";

const cp: CollapseCp = {
  vertices: [[0, 0], [0.5, 0], [1, 0], [1, 1], [0.5, 1], [0, 1]],
  creases: [
    { from: 1, to: 4, fold: "V" },
    { from: 0, to: 1, fold: "B" }, { from: 1, to: 2, fold: "B" }, { from: 2, to: 3, fold: "B" },
    { from: 3, to: 4, fold: "B" }, { from: 4, to: 5, fold: "B" }, { from: 5, to: 0, fold: "B" },
  ],
  faces: [[0, 1, 4, 5], [1, 2, 3, 4]],
};

test("one row per folding hinge, with direction, angle and a position hint", () => {
  const b = buildCollapse(cp, 100);
  if (!b.ok) throw new Error("build");
  const rows = describeSteps(b.model);
  assert.equal(rows.length, b.model.active.length);
  assert.equal(rows[0].direction, "valley");
  assert.equal(rows[0].angle, 180);
  assert.equal(rows[0].panels, 1);
  assert.match(rows[0].hint, /^centre panel/);
});

test("clicking row k and reading back gives row k", () => {
  for (const n of [1, 5, 53]) {
    for (let k = 1; k <= n; k++) assert.equal(currentStep(n, k / n), k - 1);
    assert.equal(currentStep(n, 0), 0);
    assert.equal(currentStep(n, 1), n - 1);
  }
});

test("the hinge segment lies on the fold line at both ends of the collapse", () => {
  const b = buildCollapse(cp, 100);
  if (!b.ok) throw new Error("build");
  const h = b.model.active[0];
  for (const t of [0, 0.5, 1]) {
    const [p, q] = hingeSegment(b.model, collapseFrame(b.model, "sequence", t), h);
    assert.ok(Math.abs(p[0] - 50) < 1e-4 && Math.abs(q[0] - 50) < 1e-4 && Math.abs(p[2]) < 1e-4);
  }
});
