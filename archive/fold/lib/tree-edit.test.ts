import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEditedTree } from "./tree-validate.ts";
import { addLeaf, deleteLeaf, moveLeaf } from "./tree-edit.ts";
import type { SkeletonTree } from "./skeleton.ts";

// A star: centre 0 with leaves 1,2,3; leaf 3 hangs off a pass-through node 4.
function star(): SkeletonTree {
  const v = validateEditedTree({
    nodes: [
      { id: 0, x: 0.5, y: 0.5 },
      { id: 1, x: 0.1, y: 0.5 },
      { id: 2, x: 0.9, y: 0.5 },
      { id: 3, x: 0.5, y: 0.95 },
      { id: 4, x: 0.5, y: 0.7 },
    ],
    edges: [
      { from: 0, to: 1, length: 0.4 },
      { from: 0, to: 2, length: 0.4 },
      { from: 0, to: 4, length: 0.2 },
      { from: 4, to: 3, length: 0.25 },
    ],
    frame: { originX: 0, originY: 0, scale: 100 },
  });
  assert.ok(v.ok);
  return v.tree;
}

test("moveLeaf sets the edge length from the distance to its parent", () => {
  const r = moveLeaf(star(), 1, 0.1, 0.1);
  assert.ok(r.ok);
  const e = r.tree.edges.find((x) => x.to === 1)!;
  assert.ok(Math.abs(e.length - Math.hypot(0.4, 0.4)) < 1e-12);
  assert.equal(r.tree.leaves, 3);
});

test("moveLeaf outside the sheet is refused and the input is untouched", () => {
  const t = star();
  const before = JSON.stringify(t);
  const r = moveLeaf(t, 1, -0.2, 0.5);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(t), before);
});

test("deleteLeaf removes the whole limb back to the junction and merges the junction", () => {
  const r = deleteLeaf(star(), 3);
  assert.ok(r.ok);
  assert.equal(r.tree.leaves, 2);
  // Node 0 was a junction with 3 links; now 2, so it is merged: a single edge 1-2 of length 0.8.
  assert.equal(r.tree.nodes.length, 2);
  assert.ok(Math.abs(r.tree.edges[0].length - 0.8) < 1e-12);
});

test("deleting the last-but-one limb leaves nothing and is refused", () => {
  const r1 = deleteLeaf(star(), 3);
  assert.ok(r1.ok);
  const r2 = deleteLeaf(r1.tree, 1);
  assert.equal(r2.ok, false);
});

test("addLeaf beside a link splits it at the nearest point and hangs the leaf there", () => {
  const r = addLeaf(star(), 0.3, 0.3);
  assert.ok(r.ok);
  assert.equal(r.tree.leaves, 4);
  // Nearest point is on the 0-1 link (y=0.5) at x=0.3: joint 6, link split 0.4 * 0.5 each.
  const joint = r.tree.nodes.find((n) => n.id === 6)!;
  assert.equal(joint.degree, 3);
  assert.ok(Math.abs(joint.x - 0.3) < 1e-12 && Math.abs(joint.y - 0.5) < 1e-12);
  const lens = r.tree.edges.filter((e) => e.from === 6 || e.to === 6).map((e) => e.length).sort();
  assert.equal(lens.length, 3);
  const leafLink = r.tree.edges.find((e) => e.to === 5)!;
  assert.ok(Math.abs(leafLink.length - 0.2) < 1e-12);
  // Total length of the original link is preserved by the split.
  const split = r.tree.edges.filter((e) => (e.from === 6 && e.to === 1) || (e.from === 0 && e.to === 6) || (e.from === 6 && e.to === 0) || (e.from === 1 && e.to === 6));
  assert.ok(Math.abs(split.reduce((a, e) => a + e.length, 0) - 0.4) < 1e-12);
});

test("addLeaf past a tip hangs from the tip", () => {
  const r = addLeaf(star(), 0.0, 0.5);
  assert.ok(r.ok);
  assert.equal(r.tree.nodes.find((n) => n.id === 1)!.degree, 2);
  assert.equal(r.tree.leaves, 3);
});

test("addLeaf outside the sheet is refused", () => {
  assert.equal(addLeaf(star(), 1.2, 0.5).ok, false);
});
