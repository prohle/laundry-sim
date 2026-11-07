import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeForks, FORK_ANGLE_DEG } from "./forks.ts";
import type { SkeletonTree } from "./skeleton.ts";

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * A leg: body (0) - ankle (1) - n toes at the given angles (degrees, seen from the ankle), each of the given length.
 * The ankle is the parent of the toes; node 0 is a second branch so the ankle has degree n + 1.
 */
function foot(angles: number[], lengths?: number[], bodyDeg = 180): SkeletonTree {
  const nodes = [{ id: 0, x: 0.3 + 0.3 * Math.cos(rad(bodyDeg)), y: 0.3 * Math.sin(rad(bodyDeg)), degree: 1 }, { id: 1, x: 0.3, y: 0, degree: angles.length + 1 }];
  const edges = [{ from: 0, to: 1, length: 0.3 }];
  angles.forEach((a, i) => {
    const len = lengths?.[i] ?? 0.1;
    nodes.push({ id: 2 + i, x: 0.3 + len * Math.cos(rad(a)), y: len * Math.sin(rad(a)), degree: 1 });
    edges.push({ from: 1, to: 2 + i, length: len });
  });
  const leafSignificance: Record<number, number> = {};
  for (const n of nodes) if (n.degree === 1) leafSignificance[n.id] = 3;
  return { nodes, edges, leaves: nodes.filter((n) => n.degree === 1).length, frame: { originX: 0, originY: 0, scale: 1 }, leafSignificance };
}

test("three toes within 20 degrees become one leaf (the longest, at its own tip)", () => {
  const t = foot([0, 10, 20], [0.08, 0.12, 0.1]);
  assert.equal(t.leaves, 4);
  const { tree, merges } = mergeForks(t);
  assert.equal(merges.length, 1);
  assert.equal(merges[0].kept, 3); // 0.12 is the longest
  assert.deepEqual(merges[0].dropped, [2, 4]);
  assert.ok(merges[0].spreadDeg <= 20 + 1e-9);
  // ankle is left with the body edge and one toe: degree 2, spliced; the result is a single segment
  assert.equal(tree.leaves, 2);
  assert.equal(tree.edges.length, 1);
  assert.ok(Math.abs(tree.edges[0].length - Math.hypot(0.3 + 0.12 * Math.cos(rad(10)), 0.12 * Math.sin(rad(10)))) < 1e-12); // chord
  const tip = tree.nodes.find((n) => n.degree === 1 && n.x > 0.3)!;
  assert.ok(Math.abs(tip.x - (0.3 + 0.12 * Math.cos(rad(10)))) < 1e-12);
});

test("three toes spread over 60 degrees stay three", () => {
  const t = foot([0, 30, 60]);
  const { tree, merges } = mergeForks(t);
  assert.equal(merges.length, 0);
  assert.equal(tree.leaves, 4);
  assert.equal(tree, t);
});

test("complete linkage: a chain of 20-degree steps is not one fork", () => {
  const { tree } = mergeForks(foot([0, 20, 40, 60]));
  assert.ok(tree.leaves > 2, "0..60 must not collapse to one leaf");
  assert.equal(tree.leaves, 3); // {0,20} and {40,60}, plus the body leaf
});

test("a fork of two among a spread keeps the others; the parent stays a junction", () => {
  const { tree, merges } = mergeForks(foot([0, 5, 90]));
  assert.equal(merges.length, 1);
  assert.equal(tree.leaves, 3);
  assert.ok(tree.nodes.some((n) => n.degree === 3));
  assert.equal(tree.edges.length, tree.nodes.length - 1);
  assert.deepEqual(tree.nodes.map((n) => n.id), tree.nodes.map((_, i) => i));
});

test("wraps around +-180 degrees", () => {
  assert.equal(mergeForks(foot([175, -175], undefined, 0)).merges.length, 1);
  assert.equal(mergeForks(foot([160, -160], undefined, 0)).merges.length, 0);
});

test("leaves on different parents are never merged, however close", () => {
  // body 0 - a(1) - leaf 2 ; a - b(3) - leaf 4 ; a - leaf 5 ; b - leaf 6.  leaves 2 and 5 hang off a; 4 and 6 off b.
  const pts: [number, number][] = [[0, 0], [0.3, 0], [0.4, 0.001], [0.4, 0], [0.5, 0.001], [0.4, -0.001], [0.5, -0.001]];
  const pairs: [number, number][] = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [3, 6]];
  const deg = new Array(7).fill(0);
  for (const [a, b] of pairs) { deg[a]++; deg[b]++; }
  const nodes = pts.map(([x, y], id) => ({ id, x, y, degree: deg[id] }));
  const edges = pairs.map(([from, to]) => ({ from, to, length: Math.hypot(pts[to][0] - pts[from][0], pts[to][1] - pts[from][1]) }));
  const t: SkeletonTree = { nodes, edges, leaves: 5, frame: { originX: 0, originY: 0, scale: 1 }, leafSignificance: {} };
  const { merges } = mergeForks(t);
  for (const m of merges) for (const d of m.dropped) assert.equal(edges.find((e) => e.to === d || e.from === d)!.from === m.parent || edges.find((e) => e.to === d || e.from === d)!.to === m.parent, true);
});

test("default angle is 25 and 0 disables", () => {
  assert.equal(FORK_ANGLE_DEG, 25);
  assert.equal(mergeForks(foot([0, 10]), 0).merges.length, 0);
  assert.equal(mergeForks(foot([0, 24])).merges.length, 1);
  assert.equal(mergeForks(foot([0, 26])).merges.length, 0);
});
