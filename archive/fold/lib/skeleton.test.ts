import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTree } from "./skeleton.ts";
import type { SkeletonTree, BranchRecord } from "./skeleton.ts";

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

// ---- significance pruning (length / radius at the junction) ----

/** A 100 x 40 body (radius about 20), two thin legs 8 wide and 80 long, and a short bump
 *  5 wide and 6 tall on the top edge. */
function bodyLegBump(): Canvas {
  const c = canvas(160, 170);
  rect(c, 30, 40, 100, 40); // body
  rect(c, 60, 80, 8, 80); // leg: thin and long
  rect(c, 100, 80, 8, 80); // second leg, so the bump is a side branch and not the end of a path
  rect(c, 82, 34, 5, 6); // bump: short
  return c;
}

/** Leaf positions in image pixels. */
function leafPixels(t: SkeletonTree): { x: number; y: number }[] {
  return t.nodes
    .filter((n) => n.degree === 1)
    .map((n) => ({ x: t.frame.originX + n.x * t.frame.scale, y: t.frame.originY + n.y * t.frame.scale }));
}
const near = (p: { x: number; y: number }, x: number, y: number, r = 6) => Math.hypot(p.x - x, p.y - y) <= r;

test("significance: blunt-end stubs on a wide body are pruned, the long thin leg is kept", () => {
  const raw = extractTree(bodyLegBump(), { significanceThreshold: 0, forkAngle: 0 });
  const diagnostics: BranchRecord[] = [];
  const t = extractTree(bodyLegBump(), { diagnostics, significanceThreshold: 1.0, forkAngle: 0 }); // pinned: not the default; forks are tested in forks.test.ts
  const dropped = diagnostics.filter((r) => r.action === "dropped");
  const kept = diagnostics.filter((r) => r.action === "kept");
  console.log(
    `  unpruned leaves=${raw.leaves}, pruned leaves=${t.leaves}; dropped ` +
      dropped.map((r) => r.significance.toFixed(2)).join(", ") + "; kept " + kept.map((r) => r.significance.toFixed(2)).join(", "),
  );
  assert.ok(dropped.length >= 2, "the two blunt-end stubs are dropped");
  for (const r of dropped) assert.ok(r.significance < 1, `dropped branch has significance ${r.significance}`);
  assert.ok(leafPixels(raw).some((p) => near(p, 109, 59, 8)) && leafPixels(raw).some((p) => near(p, 50, 59, 10)), "stubs exist before pruning");
  assert.ok(!leafPixels(t).some((p) => near(p, 50, 59, 10)), "left stub gone");
  assert.ok(!leafPixels(t).some((p) => near(p, 109, 59, 8)), "right stub gone");
  const leg = kept.find((r) => near({ x: r.leafX, y: r.leafY }, 63, 155, 8));
  assert.ok(leg, "the leg's leaf is kept");
  assert.ok(leg.significance > 3, `leg significance ${leg.significance}`);
  assert.equal(t.leaves, 3, "two legs and the bump; the bump is not a stub");
  assertTree(t);
});

test("significance: a short bump on the body edge scores about 1 + h/R, so 1.0 keeps it and 1.5 drops it", () => {
  // Measured, not designed: the branch from the body's axis to the bump's tip is about one
  // body radius long before the bump adds anything. 1.0 therefore removes only stubs that end
  // inside the inscribed circle; an edge bump needs a threshold above 1.
  const at10: BranchRecord[] = [];
  const t10 = extractTree(bodyLegBump(), { significanceThreshold: 1.0, diagnostics: at10 });
  const bump = at10.find((r) => r.action === "kept" && near({ x: r.leafX, y: r.leafY }, 84, 36, 8));
  assert.ok(bump, "bump survives at 1.0");
  console.log(`  bump: length ${bump.length.toFixed(1)}, radius ${bump.radius.toFixed(1)}, significance ${bump.significance.toFixed(2)}`);
  assert.ok(bump.significance >= 1.0 && bump.significance < 1.5, `bump significance ${bump.significance}`);
  assert.ok(leafPixels(t10).some((p) => near(p, 84, 36, 8)));

  const t15 = extractTree(bodyLegBump(), { significanceThreshold: 1.5 });
  assert.ok(!leafPixels(t15).some((p) => near(p, 84, 36, 8)), "bump gone at 1.5");
  assert.ok(leafPixels(t15).some((p) => near(p, 63, 155, 8)), "leg still there at 1.5");
  assert.ok(leafPixels(t15).some((p) => near(p, 103, 155, 8)), "second leg still there at 1.5");
  assert.equal(t15.leaves, 2, "only the two legs remain");
  assertTree(t15);
});

test("significance runs before the pixel threshold; both can be set; the output shape is as documented", () => {
  const a = extractTree(bodyLegBump(), { significanceThreshold: 0, spurThreshold: 0 });
  const b = extractTree(bodyLegBump(), { significanceThreshold: 0, spurThreshold: 30 });
  assert.ok(b.leaves < a.leaves, "the pixel threshold still prunes on its own");
  assert.deepEqual(Object.keys(extractTree(bodyLegBump())).sort(), ["edges", "frame", "leafSignificance", "leaves", "nodes"]);
  assert.deepEqual(extractTree(bodyLegBump()), extractTree(bodyLegBump()), "deterministic");
});

// ---- flap budget ranks by significance, not pixel length ----

/** A fat body (radius 30) with a long wide lobe on the right (84 px, significance about 2.8) and
 *  a long thin leg below (significance about 3.8), and on the left a thin neck that forks into two
 *  short twigs (25 px each, but significance about 8.3 because the neck they join is thin). */
function lobeAndTwigs(): Canvas {
  const c = canvas(260, 230);
  rect(c, 100, 70, 60, 60); // body
  rect(c, 160, 85, 70, 30); // lobe: long, low significance
  rect(c, 126, 130, 8, 90); // leg
  rect(c, 50, 97, 50, 6); // neck
  rect(c, 47, 72, 6, 26); // twig up: short, high significance
  rect(c, 47, 102, 6, 26); // twig down
  return c;
}

test("maxLeaves drops the long low-significance leaf and keeps the short high-significance ones", () => {
  const diagnostics: BranchRecord[] = [];
  const full = extractTree(lobeAndTwigs(), { significanceThreshold: 0, diagnostics });
  assert.equal(full.leaves, 4);
  const lobe = diagnostics.find((r) => near({ x: r.leafX, y: r.leafY }, 214, 99, 8));
  const twigs = diagnostics.filter((r) => r.leafX < 60);
  assert.ok(lobe && twigs.length === 2, "lobe and both twigs are measured");
  for (const tw of twigs) {
    assert.ok(lobe.length > tw.length * 2, `lobe ${lobe.length} px is much longer than twig ${tw.length} px`);
    assert.ok(lobe.significance < tw.significance, `lobe ${lobe.significance} < twig ${tw.significance}`);
  }

  const t = extractTree(lobeAndTwigs(), { significanceThreshold: 0, maxLeaves: 3 });
  const leaves = leafPixels(t);
  assert.equal(t.leaves, 3);
  assert.ok(leaves.some((p) => near(p, 50, 76)), "upper twig kept");
  assert.ok(leaves.some((p) => near(p, 50, 125)), "lower twig kept");
  assert.ok(leaves.some((p) => near(p, 130, 216)), "leg kept");
  assert.ok(!leaves.some((p) => near(p, 214, 99, 12)), "lobe dropped, although it is the longest branch");
  assertTree(t);
});
