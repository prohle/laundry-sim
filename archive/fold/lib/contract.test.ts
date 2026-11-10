import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contractShortEdges, DEFAULT_CONTRACT_THRESHOLD } from "./contract.ts";
import type { SkeletonTree, TreeEdge } from "./skeleton.ts";

const SOLVER = join(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), "solver/target/release/fold-solver");

function mk(points: [number, number][], links: [number, number, number][], sig: Record<number, number> = {}): SkeletonTree {
  const deg = points.map(() => 0);
  for (const [a, b] of links) (deg[a]++, deg[b]++);
  return {
    nodes: points.map(([x, y], id) => ({ id, x, y, degree: deg[id] })),
    edges: links.map(([from, to, length]): TreeEdge => ({ from, to, length })),
    leaves: deg.filter((d) => d === 1).length,
    frame: { originX: 0, originY: 0, scale: 1 },
    leafSignificance: sig,
  };
}

/** Two junctions 0 and 1 joined by a 0.009 edge, two long leaves on each. */
function dumbbell(bridge = 0.009): SkeletonTree {
  return mk(
    [[0.4, 0.5], [0.45, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]],
    [[0, 1, bridge], [0, 2, 0.4], [0, 3, 0.4], [1, 4, 0.45], [1, 5, 0.45]],
    { 2: 5, 3: 4, 4: 3, 5: 2 },
  );
}

function solve(tree: SkeletonTree): Record<string, unknown> {
  assert.ok(existsSync(SOLVER), "build the solver first: cargo build --release --manifest-path solver/Cargo.toml");
  const input = JSON.stringify({
    nodes: tree.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    edges: tree.edges.map((e) => ({ from: e.from, to: e.to, length: e.length })),
  });
  return JSON.parse(spawnSync(SOLVER, [], { input, encoding: "utf8" }).stdout);
}

function assertIsTree(t: SkeletonTree) {
  assert.equal(t.edges.length, t.nodes.length - 1);
  const ids = new Set(t.nodes.map((n) => n.id));
  const seen = new Set([t.nodes[0].id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of t.edges) {
      if (seen.has(e.from) !== seen.has(e.to)) (seen.add(e.from), seen.add(e.to), (grew = true));
    }
  }
  assert.equal(seen.size, ids.size, "connected");
  for (const e of t.edges) assert.ok(ids.has(e.from) && ids.has(e.to));
  const deg = new Map<number, number>();
  for (const e of t.edges) (deg.set(e.from, (deg.get(e.from) ?? 0) + 1), deg.set(e.to, (deg.get(e.to) ?? 0) + 1));
  for (const n of t.nodes) assert.equal(n.degree, deg.get(n.id));
  assert.equal(t.leaves, t.nodes.filter((n) => n.degree === 1).length);
}

test("a 0.009 internal edge fails in the solver, contracts to a valid tree, then solves", () => {
  const before = dumbbell();
  const r0 = solve(before);
  assert.equal(r0.cp_status, "edges_too_short", "the fixture must reproduce the failure");

  const { tree, contracted, dropped } = contractShortEdges(before);
  assertIsTree(tree);
  assert.equal(tree.nodes.length, 5);
  assert.deepEqual(dropped, []);
  assert.equal(contracted.length, 1);
  assert.equal(contracted[0].length, 0.009);
  assert.equal(tree.leaves, 4, "no limb lost");
  assert.ok(tree.edges.every((e) => e.length >= DEFAULT_CONTRACT_THRESHOLD));

  const r1 = solve(tree);
  assert.equal(r1.ok, true, String(r1.error));
  assert.equal(r1.cp_built, true, `cp_status ${r1.cp_status}`);
  assert.notEqual(r1.cp_status, "edges_too_short");
});

test("the survivor is the higher-degree node and keeps its position; the input is untouched", () => {
  // Node 1 has degree 4, node 0 degree 3.
  const t = mk(
    [[0.4, 0.5], [0.45, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9], [0.9, 0.5]],
    [[0, 1, 0.009], [0, 2, 0.4], [0, 3, 0.4], [1, 4, 0.45], [1, 5, 0.45], [1, 6, 0.45]],
  );
  const snapshot = JSON.stringify(t);
  const r = contractShortEdges(t);
  assert.deepEqual(r.contracted, [{ removed: 0, kept: 1, length: 0.009 }]);
  assert.equal(r.tree.nodes.find((n) => n.id === 1)!.x, 0.45);
  assert.equal(r.tree.nodes.find((n) => n.id === 1)!.degree, 5);
  assert.equal(JSON.stringify(t), snapshot);
  assertIsTree(r.tree);
});

test("on a degree tie the node with the longer remaining branch survives", () => {
  const r = contractShortEdges(dumbbell());
  assert.equal(r.contracted[0].kept, 1); // its legs are 0.45 against 0.4
  assert.equal(r.contracted[0].removed, 0);
});

test("a short leaf is dropped and reported, not contracted into its parent", () => {
  const t = mk(
    [[0.5, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.5], [0.52, 0.5]],
    [[0, 1, 0.5], [0, 2, 0.5], [0, 3, 0.4], [0, 4, 0.005]],
    { 1: 5, 2: 4, 3: 3, 4: 1.5 },
  );
  const r = contractShortEdges(t);
  assert.deepEqual(r.dropped, [{ leaf: 4, parent: 0, length: 0.005, significance: 1.5 }]);
  assert.deepEqual(r.contracted, []);
  assert.equal(r.tree.leaves, 3);
  assert.equal(r.tree.leafSignificance[4], undefined);
  assertIsTree(r.tree);
});

test("a leaf drop that turns its parent into a leaf keeps significance defined", () => {
  const t = mk(
    [[0.1, 0.5], [0.3, 0.5], [0.9, 0.5], [0.32, 0.5]],
    [[0, 1, 0.2], [1, 2, 0.6], [1, 3, 0.005]],
    { 0: 2, 2: 3, 3: 1 },
  );
  const r = contractShortEdges(t);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.tree.nodes.length, 3);
  assert.ok(Object.values(r.tree.leafSignificance).every(Number.isFinite));
});

test("a tree with no short edge comes back equal", () => {
  const t = dumbbell(0.1);
  const r = contractShortEdges(t);
  assert.deepEqual(r.tree, t);
  assert.deepEqual([r.contracted, r.dropped], [[], []]);
});

test("chained short edges all contract; the result is a tree", () => {
  const t = mk(
    [[0.3, 0.5], [0.31, 0.5], [0.32, 0.5], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1], [0.9, 0.9]],
    [[0, 1, 0.01], [1, 2, 0.011], [0, 3, 0.4], [0, 4, 0.4], [2, 5, 0.5], [2, 6, 0.5]],
  );
  const r = contractShortEdges(t);
  assert.equal(r.contracted.length, 2);
  assert.equal(r.tree.leaves, 4);
  assertIsTree(r.tree);
});

test("a tree that would collapse is refused with a reason", () => {
  const t = mk([[0.4, 0.5], [0.41, 0.5]], [[0, 1, 0.005]]);
  assert.throws(() => contractShortEdges(t), /nothing left to fold/);
  assert.throws(() => contractShortEdges({ ...dumbbell(), edges: [] }), /not a tree/);
});
