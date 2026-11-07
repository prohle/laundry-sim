import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTree } from "./skeleton.ts";
import type { SkeletonTree } from "./skeleton.ts";

interface Canvas {
  mask: Uint8Array;
  width: number;
  height: number;
}

function canvas(width: number, height: number): Canvas {
  return { mask: new Uint8Array(width * height), width, height };
}

function rect(c: Canvas, x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 0 && y >= 0 && x < c.width && y < c.height) c.mask[y * c.width + x] = 1;
    }
  }
}

function disc(c: Canvas, cx: number, cy: number, r: number): void {
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) c.mask[y * c.width + x] = 1;
    }
  }
}

function plus(): Canvas {
  const c = canvas(101, 101);
  rect(c, 5, 45, 91, 11); // horizontal bar
  rect(c, 45, 5, 11, 91); // vertical bar
  return c;
}

/** Horizontal body, four legs, a head up-right, a tail up-left. */
function animal(): Canvas {
  const c = canvas(160, 110);
  rect(c, 35, 40, 90, 24); // body
  rect(c, 35, 64, 9, 36); // legs, front and back pairs
  rect(c, 52, 64, 9, 36);
  rect(c, 99, 64, 9, 36);
  rect(c, 116, 64, 9, 36);
  rect(c, 118, 20, 9, 24); // neck
  rect(c, 118, 8, 32, 14); // head
  rect(c, 8, 38, 28, 8); // overlaps the body's left edge at x = 35 // tail
  return c;
}

/** Connected and acyclic: a tree has n-1 edges and a single component. */
function assertTree(t: SkeletonTree): void {
  if (t.nodes.length === 0) return;
  assert.equal(t.edges.length, t.nodes.length - 1, "edges = nodes - 1");
  const parent = t.nodes.map((n) => n.id);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const e of t.edges) {
    const a = find(e.from);
    const b = find(e.to);
    assert.notEqual(a, b, "cycle");
    parent[a] = b;
  }
  assert.equal(new Set(t.nodes.map((n) => find(n.id))).size, 1, "connected");
}

function assertNormalised(t: SkeletonTree): void {
  let maxSpan = 0;
  for (const n of t.nodes) {
    assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1, `node ${n.id} outside [0,1]`);
  }
  if (t.nodes.length > 1) {
    const xs = t.nodes.map((n) => n.x);
    const ys = t.nodes.map((n) => n.y);
    maxSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    assert.ok(Math.abs(maxSpan - 1) < 1e-9, "longer axis spans exactly [0,1]");
  }
  for (const e of t.edges) {
    const a = t.nodes[e.from];
    const b = t.nodes[e.to];
    assert.ok(Math.abs(e.length - Math.hypot(a.x - b.x, a.y - b.y)) < 1e-12, "edge length is Euclidean");
  }
}

test("plus sign yields 4 or 5 leaves", () => {
  const t = extractTree(plus());
  console.log(`  plus: leaves=${t.leaves} nodes=${t.nodes.length} edges=${t.edges.length}`);
  assert.ok(t.leaves === 4 || t.leaves === 5, `leaves = ${t.leaves}`);
  assertTree(t);
  assertNormalised(t);
});

test("animal-like mask yields 6 or 7 leaves", () => {
  const t = extractTree(animal());
  console.log(`  animal: leaves=${t.leaves} nodes=${t.nodes.length} edges=${t.edges.length}`);
  assert.ok(t.leaves === 6 || t.leaves === 7, `leaves = ${t.leaves}`);
  assertTree(t);
  assertNormalised(t);
});

test("solid disc yields 0 or 1 leaves and does not throw", () => {
  const c = canvas(81, 81);
  disc(c, 40, 40, 30);
  const t = extractTree(c);
  console.log(`  disc: leaves=${t.leaves} nodes=${t.nodes.length} edges=${t.edges.length}`);
  assert.ok(t.leaves <= 1, `leaves = ${t.leaves}`);
  assertTree(t);
});

test("one-pixel noise spurs do not increase the leaf count", () => {
  const clean = extractTree(plus());
  const c = plus();
  // Single-pixel bumps along the edges of both bars.
  for (const [x, y] of [
    [20, 44],
    [30, 56],
    [70, 44],
    [80, 56],
    [44, 20],
    [56, 30],
    [44, 70],
    [56, 80],
    [4, 50],
    [96, 50],
  ]) {
    c.mask[y * c.width + x] = 1;
  }
  const noisy = extractTree(c);
  console.log(`  noise: clean leaves=${clean.leaves}, noisy leaves=${noisy.leaves}`);
  assert.ok(noisy.leaves <= clean.leaves, `noisy ${noisy.leaves} > clean ${clean.leaves}`);
  assertTree(noisy);

  // One-pixel bumps are absorbed by the thinning itself; the threshold is not what removes them.
  const raw = extractTree(c, { spurThreshold: 0 });
  console.log(`  1px bumps with spurThreshold=0: leaves=${raw.leaves}`);
});

test("2px spikes: a spur is spike + half the limb width, so the threshold must exceed that", () => {
  const clean = extractTree(plus());
  const c = plus();
  for (const x of [20, 30, 70, 80]) {
    for (let k = 1; k <= 2; k++) {
      c.mask[(45 - k) * c.width + x] = 1;
      c.mask[(55 + k) * c.width + x] = 1;
    }
  }
  for (const y of [20, 30, 70, 80]) {
    for (let k = 1; k <= 2; k++) {
      c.mask[y * c.width + 45 - k] = 1;
      c.mask[y * c.width + 55 + k] = 1;
    }
  }
  const byDefault = extractTree(c); // threshold 4.55 px on a 91 px silhouette
  const wide = extractTree(c, { spurThreshold: 10 });
  console.log(`  2px spikes: default threshold leaves=${byDefault.leaves}, threshold 10 leaves=${wide.leaves}`);
  assert.ok(wide.leaves <= clean.leaves, `threshold 10 left ${wide.leaves} leaves`);
  assertTree(wide);
});

test("maxLeaves reduces the animal and keeps a tree", () => {
  const full = extractTree(animal());
  for (const max of [6, 5, 4, 3, 2]) {
    const t = extractTree(animal(), { maxLeaves: max });
    console.log(`  maxLeaves=${max}: leaves=${t.leaves}`);
    assert.ok(t.leaves <= max);
    assert.ok(t.leaves <= full.leaves);
    assertTree(t);
    assertNormalised(t);
  }
});

test("deterministic, and edge cases do not throw", () => {
  assert.deepEqual(extractTree(animal()), extractTree(animal()));
  assert.deepEqual(extractTree(canvas(10, 10)).nodes, []);
  assert.deepEqual(extractTree(canvas(0, 0)).nodes, []);
  const one = canvas(5, 5);
  one.mask[12] = 1;
  const t = extractTree(one);
  assert.equal(t.leaves, 0);
  assert.throws(() => extractTree({ mask: new Uint8Array(3), width: 2, height: 2 }), RangeError);
});
