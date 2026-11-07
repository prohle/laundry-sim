import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionTree, MAX_PART_LEAVES } from "./parts.ts";
import type { SkeletonTree } from "./skeleton.ts";

/** Build a tree from an edge list; coordinates are arbitrary (the partition does not read them). */
function make(pairs: [number, number][]): SkeletonTree {
  const ids = [...new Set(pairs.flat())].sort((a, b) => a - b);
  const deg = new Map(ids.map((i) => [i, 0]));
  for (const [a, b] of pairs) { deg.set(a, deg.get(a)! + 1); deg.set(b, deg.get(b)! + 1); }
  const nodes = ids.map((id) => ({ id, x: id / 100, y: (id * 7 % 50) / 100, degree: deg.get(id)! }));
  const edges = pairs.map(([from, to]) => ({ from: Math.min(from, to), to: Math.max(from, to), length: 0.1 }));
  const leafSignificance: Record<number, number> = {};
  for (const n of nodes) if (n.degree === 1) leafSignificance[n.id] = 3;
  return { nodes, edges, leaves: nodes.filter((n) => n.degree === 1).length, frame: { minX: 0, minY: 0, scale: 1 } as never, leafSignificance };
}

/** Two hubs, a leaves on hub 0 and b leaves on hub 1, joined by an edge. */
function twoHubs(a: number, b: number) {
  const p: [number, number][] = [[0, 1]];
  let id = 2;
  for (let i = 0; i < a; i++) p.push([0, id++]);
  for (let i = 0; i < b; i++) p.push([1, id++]);
  return make(p);
}

const leafIds = (t: SkeletonTree) => t.nodes.filter((n) => n.degree === 1).map((n) => n.id);

test("a tree within the cap is one part, no junction", () => {
  const t = twoHubs(5, 5);
  const p = partitionTree(t);
  assert.equal(p.parts.length, 1);
  assert.deepEqual(p.junctions, []);
  assert.equal(p.parts[0].leaves, 10);
  assert.equal(p.parts[0].name, "Part 1");
});

test("leaf coverage: every leaf in exactly one part, sums match", () => {
  const t = twoHubs(9, 8);
  const p = partitionTree(t);
  assert.ok(p.parts.length > 1);
  assert.equal(p.parts.reduce((s, x) => s + x.leaves, 0), t.leaves);
  const seen = new Map<number, number>();
  for (const part of p.parts) {
    for (const id of leafIds(part.tree)) if (!part.tabs.includes(id)) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const id of leafIds(t)) assert.equal(seen.get(id), 1, `leaf ${id}`);
  assert.equal(seen.size, t.leaves);
});

test("the cap holds and the highest-degree node is the junction (lowest id on a tie)", () => {
  const t = twoHubs(14, 3); // hub 0 has degree 15
  const p = partitionTree(t);
  assert.equal(p.junctions[0], 0);
  for (const part of p.parts) assert.ok(part.leaves <= MAX_PART_LEAVES);
  const tie = partitionTree(twoHubs(8, 8)); // both hubs degree 9
  assert.equal(tie.junctions[0], 0);
});

test("a part still over the cap is split again", () => {
  // hub 0 has 2 big subtrees, each a hub with 13 leaves
  const pairs: [number, number][] = [[0, 1], [0, 2]];
  let id = 3;
  for (const h of [1, 2]) for (let i = 0; i < 13; i++) pairs.push([h, id++]);
  const t = make(pairs);
  const p = partitionTree(t);
  assert.equal(t.leaves, 26);
  assert.ok(p.junctions.length >= 2);
  assert.equal(p.parts.reduce((s, x) => s + x.leaves, 0), 26);
  for (const part of p.parts) assert.ok(part.leaves <= MAX_PART_LEAVES);
});

test("each part is a valid tree and ordering is largest first, named in order", () => {
  const p = partitionTree(twoHubs(11, 9));
  for (const part of p.parts) {
    assert.equal(part.tree.edges.length, part.tree.nodes.length - 1);
    assert.equal(part.flaps, part.tree.leaves);
    assert.equal(part.flaps, part.leaves + part.tabs.filter((t) => part.tree.nodes.find((n) => n.id === t)!.degree === 1).length);
  }
  for (let i = 1; i < p.parts.length; i++) assert.ok(p.parts[i - 1].leaves >= p.parts[i].leaves);
  p.parts.forEach((x, i) => assert.equal(x.name, `Part ${i + 1}`));
});

test("deterministic, and random trees keep coverage and the cap", () => {
  assert.deepEqual(partitionTree(twoHubs(9, 8)), partitionTree(twoHubs(9, 8)));
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 200; k++) {
    const n = 20 + Math.floor(rnd() * 40);
    const pairs: [number, number][] = [];
    for (let i = 1; i < n; i++) pairs.push([Math.floor(rnd() * i), i]);
    const t = make(pairs);
    if (t.leaves <= MAX_PART_LEAVES) continue;
    const p = partitionTree(t);
    assert.equal(p.parts.reduce((a, x) => a + x.leaves, 0), t.leaves);
    for (const part of p.parts) assert.ok(part.leaves <= MAX_PART_LEAVES && part.leaves >= 1);
  }
});
