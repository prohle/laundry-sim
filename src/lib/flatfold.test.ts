import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFlatFoldable } from "./flatfold.ts";
import type { FlatCp } from "./flatfold.ts";

/** Centre vertex 0 at (0.5, 0.5) with spokes at the given angles (radians) and folds. */
function star(angles: number[], folds: string[], border = false): FlatCp {
  const vertices: [number, number][] = [[0.5, 0.5]];
  const creases: FlatCp["creases"] = [];
  angles.forEach((a, k) => {
    vertices.push([0.5 + 0.2 * Math.cos(a), 0.5 + 0.2 * Math.sin(a)]);
    creases.push({ from: 0, to: k + 1, fold: folds[k] });
  });
  if (border) creases.push({ from: 0, to: 1, fold: "B" });
  return { vertices, creases };
}

const D = Math.PI / 180;

test("four creases, sectors 60/90/120/90 (alternating sums 180/180), M M M V, pass both", () => {
  const r = checkFlatFoldable(star([0, 60 * D, 150 * D, 270 * D], ["M", "M", "M", "V"]));
  assert.equal(r.interiorVertices, 1);
  assert.equal(r.failKawasaki, 0);
  assert.equal(r.failMaekawa, 0);
  assert.equal(r.passBoth, 1);
});

test("three creases fail Maekawa (and Kawasaki: odd degree)", () => {
  const r = checkFlatFoldable(star([0, 120 * D, 240 * D], ["M", "M", "V"]));
  assert.equal(r.interiorVertices, 1);
  assert.equal(r.failMaekawa, 1);
  assert.equal(r.passBoth, 0);
  assert.equal(r.failures[0].degree, 3);
  assert.equal(r.failures[0].mountains, 2);
  assert.equal(r.failures[0].valleys, 1);
});

test("unequal opposite angles fail Kawasaki but pass Maekawa", () => {
  // sectors 50, 130, 70, 110: alternating sums 120 and 240.
  const r = checkFlatFoldable(star([0, 50 * D, 180 * D, 250 * D], ["M", "M", "M", "V"]));
  assert.equal(r.failKawasaki, 1);
  assert.equal(r.failMaekawa, 0);
  assert.ok(Math.abs(r.failures[0].kawasakiResidual) > 0.1);
});

test("a border vertex is skipped, not counted as a failure", () => {
  const r = checkFlatFoldable(star([0, 50 * D, 180 * D, 250 * D], ["M", "M", "M", "V"], true));
  assert.equal(r.interiorVertices, 0);
  assert.equal(r.skippedBoundary, 1);
  assert.equal(r.failEither, 0);
  assert.equal(r.failures.length, 0);
});

test("a vertex on the paper edge is skipped", () => {
  const cp: FlatCp = {
    vertices: [[0.5, 0], [0.5, 0.3], [0.3, 0.2], [0.7, 0.2]],
    creases: [
      { from: 0, to: 1, fold: "M" },
      { from: 0, to: 2, fold: "M" },
      { from: 0, to: 3, fold: "M" },
    ],
  };
  const r = checkFlatFoldable(cp);
  assert.equal(r.interiorVertices, 0);
  assert.equal(r.skippedBoundary, 1);
});

test("tolerance is a parameter", () => {
  const cp = star([0, 90 * D, 180 * D, 270.01 * D], ["M", "V", "M", "M"]);
  assert.equal(checkFlatFoldable(cp, { tolerance: 1e-6 }).failKawasaki, 1);
  assert.equal(checkFlatFoldable(cp, { tolerance: 0.01 }).failKawasaki, 0);
});

test("an all-F vertex fails Maekawa and is counted as unassigned", () => {
  const r = checkFlatFoldable(star([0, 90 * D, 180 * D, 270 * D], ["F", "F", "F", "F"]));
  assert.equal(r.failKawasaki, 0);
  assert.equal(r.failMaekawa, 1);
  assert.equal(r.noAssignment, 1);
});

test("deterministic: same input, same report", () => {
  const cp = star([0, 50 * D, 180 * D, 250 * D], ["M", "M", "M", "V"]);
  assert.deepEqual(checkFlatFoldable(cp), checkFlatFoldable(cp));
});
