import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTree } from "./skeleton.ts";
import type { SkeletonTree, TreeEdge, TreeNode } from "./skeleton.ts";
import { rankLeaves, treeForTier, minimumTier, tierReport } from "./tiers.ts";

/**
 * A spine of n - 2 junctions with n leaves hanging off it (n >= 4): the two end junctions carry
 * two leaves each, the middle ones one. Every internal node has degree >= 3. Leaf significance
 * is distinct and not in id order, so ranking is exercised.
 */
function hubTree(n: number): SkeletonTree {
  const m = n - 2;
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  const leafSignificance: Record<number, number> = {};
  const add = (x: number, y: number) => {
    nodes.push({ id: nodes.length, x, y, degree: 0 });
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    const [from, to] = a < b ? [a, b] : [b, a];
    edges.push({ from, to, length: Math.hypot(nodes[to].x - nodes[from].x, nodes[to].y - nodes[from].y) });
    nodes[a].degree++;
    nodes[b].degree++;
  };
  const spine: number[] = [];
  for (let k = 0; k < m; k++) spine.push(add(0.1 + (0.8 * k) / Math.max(1, m - 1), 0.5));
  for (let k = 1; k < m; k++) link(spine[k - 1], spine[k]);
  let leafNo = 0;
  const leaf = (j: number, y: number, dx: number) => {
    const id = add(nodes[j].x + dx, y);
    link(j, id);
    // Distinct values, shuffled relative to id order.
    leafSignificance[id] = 2 + ((leafNo * 7) % n) + leafNo / 100;
    leafNo++;
  };
  for (let k = 0; k < m; k++) {
    const ends = k === 0 || k === m - 1;
    leaf(spine[k], k % 2 ? 0.95 : 0.05, ends ? -0.05 : 0);
    if (ends) leaf(spine[k], 0.95, 0.05);
  }
  edges.sort((p, q) => p.from - q.from || p.to - q.to);
  const leaves = nodes.filter((x) => x.degree === 1).length;
  return { nodes, edges, leaves, frame: { originX: 0, originY: 0, scale: 1 }, leafSignificance };
}

function assertConnectedAcyclic(t: SkeletonTree): void {
  assert.equal(t.edges.length, t.nodes.length - 1, "a tree has n - 1 edges");
  const parent = new Map<number, number>(t.nodes.map((n) => [n.id, n.id]));
  const find = (i: number): number => (parent.get(i) === i ? i : find(parent.get(i)!));
  for (const e of t.edges) {
    assert.ok(parent.has(e.from) && parent.has(e.to), "edge endpoints are nodes");
    const a = find(e.from);
    const b = find(e.to);
    assert.notEqual(a, b, `edge ${e.from}-${e.to} closes a cycle`);
    parent.set(a, b);
  }
  const roots = new Set(t.nodes.map((n) => find(n.id)));
  assert.equal(roots.size, 1, "connected");
}

const leafSet = (t: SkeletonTree) => new Set(t.nodes.filter((n) => n.degree === 1).map((n) => n.id));

test("6-leaf animal: medium, six leaves, easy is not representable", () => {
  const t = hubTree(6);
  const m = minimumTier(t);
  assert.equal(m.tier, "medium");
  assert.equal(m.requiredLeaves, 6);
  assert.match(m.reason, /Medium/);
  const rows = tierReport(t);
  assert.deepEqual(rows.map((r) => r.representable), [false, true, true, true]);
  assert.deepEqual(rows[0], { tier: "easy", budget: 4, leaves: 4, dropped: 2, representable: false });
  assert.deepEqual(rows[1], { tier: "medium", budget: 6, leaves: 6, dropped: 0, representable: true });
});

test("4-leaf tree: easy", () => {
  const m = minimumTier(hubTree(4));
  assert.equal(m.tier, "easy");
  assert.equal(m.requiredLeaves, 4);
});

test("14-leaf tree: no tier, and the reason is one plain sentence", () => {
  const t = hubTree(14);
  const m = minimumTier(t);
  assert.equal(m.tier, null);
  assert.equal(m.requiredLeaves, 14);
  assert.match(m.reason, /14 flaps/);
  assert.match(m.reason, /12/);
  assert.equal(m.reason.split(/(?<=\.)\s/).length, 1, "one sentence");
  assert.ok(tierReport(t).every((r) => !r.representable));
});

test("12 leaves is expert, 13 is refused", () => {
  assert.equal(minimumTier(hubTree(12)).tier, "expert");
  assert.equal(minimumTier(hubTree(13)).tier, null);
});

test("monotonicity: leaves at 4 are inside 6, inside 8, inside 12 (10-leaf tree)", () => {
  const t = hubTree(10);
  const sets = [4, 6, 8, 12].map((b) => leafSet(treeForTier(t, b)));
  assert.deepEqual(sets.map((s) => s.size), [4, 6, 8, 10]);
  for (let i = 0; i + 1 < sets.length; i++) {
    for (const id of sets[i]) assert.ok(sets[i + 1].has(id), `leaf ${id} at tier ${i} missing at tier ${i + 1}`);
  }
});

test("treeForTier keeps the highest-significance leaves", () => {
  const t = hubTree(10);
  const ranked = rankLeaves(t, t.leafSignificance);
  assert.deepEqual([...leafSet(treeForTier(t, 4))].sort((a, b) => a - b), ranked.slice(0, 4).sort((a, b) => a - b));
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(t.leafSignificance[ranked[i - 1]] >= t.leafSignificance[ranked[i]]);
  }
});

test("rankLeaves breaks ties by node id", () => {
  const t = hubTree(6);
  const flat: Record<number, number> = {};
  for (const id of Object.keys(t.leafSignificance)) flat[Number(id)] = 3;
  const r = rankLeaves(t, flat);
  assert.deepEqual(r, [...r].sort((a, b) => a - b));
});

test("treeForTier is connected and acyclic for every budget, with no degree-2 nodes and coordinates kept", () => {
  for (const n of [4, 6, 9, 10, 14]) {
    const t = hubTree(n);
    for (let budget = 2; budget <= n + 1; budget++) {
      const r = treeForTier(t, budget);
      assertConnectedAcyclic(r);
      assert.ok(r.leaves <= budget, `n=${n} budget=${budget}: ${r.leaves} leaves`);
      assert.equal(r.leaves, Math.min(budget, n));
      assert.ok(r.nodes.every((x) => x.degree !== 2 || false), "no degree-2 node left");
      for (const x of r.nodes) {
        const orig = t.nodes[x.id];
        assert.equal(x.x, orig.x);
        assert.equal(x.y, orig.y);
      }
      for (const e of r.edges) {
        const a = r.nodes.find((x) => x.id === e.from)!;
        const b = r.nodes.find((x) => x.id === e.to)!;
        // Path length (sum across splices) is never shorter than the chord between the endpoints.
        assert.ok(e.length >= Math.hypot(a.x - b.x, a.y - b.y) - 1e-12, `edge ${e.from}-${e.to} shorter than its chord`);
      }
    }
  }
});

test("a budget of 1 leaves a single node with no edges", () => {
  const r = treeForTier(hubTree(6), 1);
  assert.equal(r.nodes.length, 1);
  assert.equal(r.edges.length, 0);
});

test("treeForTier does not change its input and is deterministic", () => {
  const t = hubTree(10);
  const before = JSON.stringify(t);
  const a = JSON.stringify(treeForTier(t, 6));
  assert.equal(JSON.stringify(t), before);
  assert.equal(JSON.stringify(treeForTier(t, 6)), a);
});

test("tierReport agrees with treeForTier", () => {
  const t = hubTree(10);
  for (const r of tierReport(t)) {
    assert.equal(r.leaves, treeForTier(t, r.budget).leaves);
    assert.equal(r.dropped, 10 - r.leaves);
  }
});

test("extractTree records a significance for every leaf", () => {
  const w = 101;
  const mask = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if ((y >= 45 && y <= 55 && x >= 5 && x <= 95) || (x >= 45 && x <= 55 && y >= 5 && y <= 95)) mask[y * w + x] = 1;
    }
  }
  const t = extractTree({ mask, width: w, height: w });
  assert.equal(t.leaves, 4);
  const leaves = t.nodes.filter((n) => n.degree === 1);
  assert.equal(Object.keys(t.leafSignificance).length, 4);
  for (const n of leaves) assert.ok(t.leafSignificance[n.id] > 2);
  assert.equal(minimumTier(t).tier, "easy");
});

test("splicing a degree-2 node sums the two edge lengths (path), not the chord", () => {
  // Node 1 joins leaf 0 and hub 2 by two edges of 0.1, at a right angle: chord = 0.1414, path = 0.2.
  // Node 1 also carries leaf 6, the least significant leaf; budget 4 drops it, leaving node 1 at degree 2.
  const pts: [number, number][] = [
    [0.1, 0.1], // 0 leaf
    [0.1, 0.2], // 1 junction to be spliced
    [0.2, 0.2], // 2 hub
    [0.5, 0.2], // 3 leaf
    [0.5, 0.5], // 4 leaf
    [0.2, 0.6], // 5 leaf
    [0.0, 0.3], // 6 leaf, dropped
  ];
  const nodes: TreeNode[] = pts.map(([x, y], id) => ({ id, x, y, degree: 0 }));
  const edges: TreeEdge[] = [
    { from: 0, to: 1, length: 0.1 },
    { from: 1, to: 2, length: 0.1 },
    { from: 1, to: 6, length: 0.1 },
    { from: 2, to: 3, length: 0.3 },
    { from: 2, to: 4, length: 0.4 },
    { from: 2, to: 5, length: 0.4 },
  ];
  for (const e of edges) (nodes[e.from].degree++, nodes[e.to].degree++);
  const tree: SkeletonTree = {
    nodes,
    edges,
    leaves: 5,
    frame: { originX: 0, originY: 0, scale: 1 },
    leafSignificance: { 0: 5, 3: 6, 4: 7, 5: 8, 6: 1 },
  };
  const r = treeForTier(tree, 4);
  assert.ok(!r.nodes.some((n) => n.id === 1), "node 1 was spliced out");
  const e = r.edges.find((x) => x.from === 0 && x.to === 2);
  assert.ok(e, "edge 0-2 exists");
  assert.ok(Math.abs(e.length - 0.2) < 1e-12, `length ${e.length}, expected 0.2`);
  assert.ok(Math.abs(e.length - Math.hypot(0.1, 0.1)) > 0.05, "not the chord");
  // Unspliced edges keep their length.
  assert.equal(r.edges.find((x) => x.from === 2 && x.to === 3)!.length, 0.3);
});
