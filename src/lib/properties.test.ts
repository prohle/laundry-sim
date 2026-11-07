/**
 * Property-based tests (fast-check on top of node --test; the runner is unchanged).
 *
 * They run on the real modules: tiers.ts, contract.ts, pipeline.ts and the fold-solver binary.
 * No mocks. Each property prints its case count; a failure reports fast-check's shrunk
 * counterexample and the seed. Reproduce with FC_SEED=<seed> npm test.
 *
 * Properties that need the solver binary are skipped, with the reason printed, when it is absent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import fc from "fast-check";
import pngjs from "pngjs";
import type { SkeletonTree, TreeEdge, TreeNode } from "./skeleton.ts";
import { treeForTier, TIERS } from "./tiers.ts";
import { contractShortEdges } from "./contract.ts";
import { runPipeline, resolveSolverPath } from "./pipeline.ts";

const { PNG } = pngjs;

const SEED = process.env.FC_SEED ? Number(process.env.FC_SEED) : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
console.log(`  property seed ${SEED} (reproduce with FC_SEED=${SEED})`);

/** Run one property, print its case count, and fail with the shrunk counterexample if it breaks. */
function check<T>(name: string, prop: fc.IPropertyWithHooks<T>, numRuns: number, noShrink = false): void {
  const t0 = performance.now();
  const details = fc.check(prop, { numRuns, seed: SEED, endOnFailure: noShrink });
  const ms = Math.round(performance.now() - t0);
  console.log(`  property "${name}": ${details.numRuns} cases, ${details.numShrinks} shrinks, ${ms} ms${details.failed ? " FAILED" : ""}`);
  if (details.failed) throw new Error(fc.defaultReportMessage(details));
}

async function checkAsync<T>(name: string, prop: fc.IAsyncPropertyWithHooks<T>, numRuns: number): Promise<void> {
  const t0 = performance.now();
  const details = await fc.check(prop, { numRuns, seed: SEED });
  const ms = Math.round(performance.now() - t0);
  console.log(`  property "${name}": ${details.numRuns} cases, ${details.numShrinks} shrinks, ${ms} ms${details.failed ? " FAILED" : ""}`);
  if (details.failed) throw new Error(fc.defaultReportMessage(details));
}

// ---------- generators ----------

interface RawTree {
  n: number;
  ids: number[];
  pairs: [number, number][]; // index pairs, from a Pruefer sequence
  pos: [number, number][];
  lengths: number[];
  sig: number[];
}

/** Edges of the labelled tree on 0..n-1 that a Pruefer sequence encodes. */
function pruefer(n: number, seq: number[]): [number, number][] {
  if (n === 2) return [[0, 1]];
  const deg = new Array<number>(n).fill(1);
  for (const s of seq) deg[s]++;
  const out: [number, number][] = [];
  for (const s of seq) {
    const j = deg.findIndex((d) => d === 1);
    out.push([j, s]);
    deg[j]--;
    deg[s]--;
  }
  const rest = deg.map((d, i) => (d === 1 ? i : -1)).filter((i) => i >= 0);
  out.push([rest[0], rest[1]]);
  return out;
}

/**
 * A coordinate as extractTree emits it: in [0,1], either exactly 0 (a pixel on the frame edge) or at
 * least 1e-9. fc.double over [0,1] alone also yields subnormals (~5e-323), which no photograph
 * produces and which hang treemaker-core; the serialiser refuses them (solver/src/main.rs).
 */
const coord = fc.oneof(fc.constant(0), fc.double({ min: 1e-9, max: 1, noNaN: true }));

/** True when every pair of positions is at least `min` apart (Euclidean). */
function pairwiseApart(pos: [number, number][], min: number): boolean {
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      if (Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]) < min) return false;
    }
  }
  return true;
}

/** Random labelled tree: Pruefer sequence, distinct non-contiguous ids, positions in [0,1], pairwise >= 1e-6 apart. */
const rawTree = (minN: number, maxN: number, minLen: number, maxLen: number): fc.Arbitrary<RawTree> =>
  fc
    .integer({ min: minN, max: maxN })
    .chain((n) =>
      fc.record({
        n: fc.constant(n),
        ids: fc.uniqueArray(fc.integer({ min: 0, max: 5000 }), { minLength: n, maxLength: n }),
        pairs: fc
          .array(fc.integer({ min: 0, max: n - 1 }), { minLength: n - 2, maxLength: n - 2 })
          .map((seq) => pruefer(n, seq)),
        pos: fc.array(fc.tuple(coord, coord), {
          minLength: n,
          maxLength: n,
        }),
        lengths: fc.array(fc.double({ min: minLen, max: maxLen, noNaN: true }), { minLength: n - 1, maxLength: n - 1 }),
        // Small integer range so ties happen and the tie-break by id is exercised.
        sig: fc.array(fc.integer({ min: 1, max: 8 }), { minLength: n, maxLength: n }),
      }),
    )
    .filter((raw) => pairwiseApart(raw.pos, 1e-6));

function build(raw: RawTree): SkeletonTree {
  const degree = new Array<number>(raw.n).fill(0);
  for (const [a, b] of raw.pairs) {
    degree[a]++;
    degree[b]++;
  }
  const nodes: TreeNode[] = raw.ids
    .map((id, i) => ({ id, x: raw.pos[i][0], y: raw.pos[i][1], degree: degree[i] }))
    .sort((p, q) => p.id - q.id);
  const edges: TreeEdge[] = raw.pairs.map(([a, b], k) => ({ from: raw.ids[a], to: raw.ids[b], length: raw.lengths[k] }));
  const leafSignificance: Record<number, number> = {};
  raw.ids.forEach((id, i) => {
    if (degree[i] === 1) leafSignificance[id] = raw.sig[i];
  });
  return {
    nodes,
    edges,
    leaves: degree.filter((d) => d === 1).length,
    frame: { originX: 0, originY: 0, scale: 1 },
    leafSignificance,
  };
}

const anyTree = rawTree(2, 40, 0.001, 1).map(build);

// ---------- invariants ----------

/** Throws a description of the first violated tree invariant. Independent of the code under test. */
function treeViolation(t: SkeletonTree, opts: { leafKeysExact: boolean }): string | null {
  const ids = new Set(t.nodes.map((n) => n.id));
  if (ids.size !== t.nodes.length) return "duplicate node ids";
  if (t.edges.length !== t.nodes.length - 1) return `edges ${t.edges.length} != nodes ${t.nodes.length} - 1`;
  const parent = new Map<number, number>([...ids].map((i) => [i, i]));
  const find = (i: number): number => {
    while (parent.get(i) !== i) i = parent.get(i)!;
    return i;
  };
  const deg = new Map<number, number>([...ids].map((i) => [i, 0]));
  const seen = new Set<string>();
  for (const e of t.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) return `edge ${e.from}-${e.to} names an unknown node`;
    if (e.from === e.to) return `self-loop at ${e.from}`;
    const key = `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`;
    if (seen.has(key)) return `duplicate edge ${key}`;
    seen.add(key);
    if (!(e.length > 0) || !Number.isFinite(e.length)) return `edge ${key} length ${e.length} is not positive`;
    const ra = find(e.from);
    const rb = find(e.to);
    if (ra === rb) return `cycle closed by edge ${key}`; // acyclic
    parent.set(ra, rb);
    deg.set(e.from, deg.get(e.from)! + 1);
    deg.set(e.to, deg.get(e.to)! + 1);
  }
  if (new Set([...ids].map(find)).size !== 1) return "not connected"; // connected
  for (const n of t.nodes) if (n.degree !== deg.get(n.id)) return `node ${n.id} degree field ${n.degree}, actual ${deg.get(n.id)}`;
  const leaves = [...ids].filter((i) => deg.get(i) === 1);
  if (t.leaves !== leaves.length) return `leaves field ${t.leaves}, actual ${leaves.length}`;
  const keys = Object.keys(t.leafSignificance).map(Number);
  if (keys.some((k) => deg.get(k) !== 1)) return "leafSignificance names a non-leaf";
  if (opts.leafKeysExact && keys.length !== leaves.length) return "leafSignificance misses a leaf";
  return null;
}

const leafSet = (t: SkeletonTree) => new Set(t.nodes.filter((n) => n.degree === 1).map((n) => n.id));

// ---------- properties ----------

test("property: generated trees are trees (generator sanity)", () => {
  check("generator yields valid trees", fc.property(anyTree, (t) => treeViolation(t, { leafKeysExact: true }) === null), 200);
});

test("property: tree invariants hold on every output of treeForTier and contractShortEdges", () => {
  check(
    "treeForTier output: edges == nodes - 1, connected, acyclic",
    fc.property(anyTree, (t) => {
      for (const { budget } of TIERS) {
        const v = treeViolation(treeForTier(t, budget), { leafKeysExact: true });
        if (v) throw new Error(`budget ${budget}: ${v}`);
      }
    }),
    300,
  );
  check(
    "contractShortEdges output: edges == nodes - 1, connected, acyclic, nothing below threshold",
    fc.property(anyTree, fc.double({ min: 0.01, max: 0.6, noNaN: true }), (t, threshold) => {
      let r;
      try {
        r = contractShortEdges(t, threshold);
      } catch (e) {
        // The two documented refusals; anything else is a bug.
        assert.match((e as Error).message, /nothing left to fold/);
        return;
      }
      const v = treeViolation(r.tree, { leafKeysExact: false });
      if (v) throw new Error(v);
      assert.ok(r.tree.edges.every((e) => e.length >= threshold), "an edge below the threshold survived");
      assert.equal(r.tree.nodes.length, t.nodes.length - r.contracted.length - r.dropped.length, "node accounting");
    }),
    300,
  );
});

test("property: tiers are monotone (leaf set at a smaller budget is a subset of a larger one)", () => {
  const budgets = TIERS.map((t) => t.budget);
  assert.deepEqual(budgets, [4, 6, 8, 12]);
  check(
    "leaf sets nested across budgets 4 < 6 < 8 < 12",
    fc.property(anyTree, (t) => {
      const sets = budgets.map((b) => leafSet(treeForTier(t, b)));
      const all = leafSet(t);
      budgets.forEach((b, i) => {
        assert.equal(sets[i].size, Math.min(b, all.size), `budget ${b} keeps min(budget, leaves) leaves`);
        for (const id of sets[i]) assert.ok(all.has(id), `leaf ${id} is not a leaf of the input`);
        if (i > 0) for (const id of sets[i - 1]) assert.ok(sets[i].has(id), `leaf ${id} kept at ${budgets[i - 1]} but not at ${b}`);
      });
    }),
    400,
  );
  check(
    "node sets nested across budgets (each tier's tree is a subgraph of the next)",
    fc.property(anyTree, (t) => {
      const trees = budgets.map((b) => treeForTier(t, b));
      for (let i = 1; i < trees.length; i++) {
        const big = new Set(trees[i].nodes.map((n) => n.id));
        for (const n of trees[i - 1].nodes) assert.ok(big.has(n.id), `node ${n.id} lost going to budget ${budgets[i]}`);
      }
    }),
    400,
  );
});

test("property: contracting one short internal edge removes exactly one node and never disconnects", () => {
  const THRESHOLD = 0.012;
  // A tree whose lengths are all >= 0.05 except one internal edge, set to [0.001, 0.0119].
  const oneShortInternal = rawTree(4, 30, 0.05, 1)
    .chain((raw) => {
      const deg = new Array<number>(raw.n).fill(0);
      for (const [a, b] of raw.pairs) (deg[a]++, deg[b]++);
      const internal = raw.pairs.map((p, k) => (deg[p[0]] > 1 && deg[p[1]] > 1 ? k : -1)).filter((k) => k >= 0);
      if (internal.length === 0) return fc.constant(null); // a star: no internal edge
      return fc.record({
        raw: fc.constant(raw),
        k: fc.constantFrom(...internal),
        len: fc.double({ min: 0.001, max: 0.0119, noNaN: true }),
      });
    })
    .filter((x) => x !== null) as fc.Arbitrary<{ raw: RawTree; k: number; len: number }>;
  check(
    "one internal edge below threshold",
    fc.property(oneShortInternal, ({ raw, k, len }) => {
      const lengths = raw.lengths.slice();
      lengths[k] = len;
      const t = build({ ...raw, lengths });
      const r = contractShortEdges(t, THRESHOLD);
      assert.equal(r.tree.nodes.length, t.nodes.length - 1, "one fewer node");
      assert.equal(r.tree.edges.length, t.edges.length - 1, "one fewer edge");
      assert.ok(r.tree.leaves <= t.leaves, `leaves ${r.tree.leaves} > ${t.leaves}`);
      assert.equal(r.contracted.length, 1);
      assert.equal(r.dropped.length, 0, "an internal contraction drops no leaf");
      const v = treeViolation(r.tree, { leafKeysExact: false });
      if (v) throw new Error(v);
      // Every original leaf is still a leaf with its edge length unchanged.
      const before = new Map(t.edges.flatMap((e) => [[`${e.from}`, e.length], [`${e.to}`, e.length]] as const));
      for (const n of r.tree.nodes) if (n.degree === 1 && leafSet(t).has(n.id)) assert.ok(before.has(`${n.id}`));
    }),
    300,
  );
});

// ---------- solver-backed properties ----------

const solverPath = resolveSolverPath();
const solverMissing = existsSync(solverPath) ? false : `solver binary not found at ${solverPath} (cargo build --release in solver/)`;
if (solverMissing) console.log(`  SKIPPED solver properties: ${solverMissing}`);

test("property: serialising to tmd5 and parsing keeps node count and edge lengths", { skip: solverMissing }, () => {
  // Lengths >= 0.01 so the 6-decimal text cannot round them to zero. Tolerance 1e-6 (half a unit of the sixth decimal is 5e-7).
  const arb = rawTree(2, 20, 0.01, 1).map(build);
  check(
    "tmd5 round trip via fold-solver --roundtrip",
    fc.property(arb, (t) => {
      const input = JSON.stringify({
        nodes: t.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
        edges: t.edges.map((e) => ({ from: e.from, to: e.to, length: e.length })),
      });
      const p = spawnSync(solverPath, ["--roundtrip"], { input, encoding: "utf8", timeout: 5000, killSignal: "SIGKILL" });
      if (p.error && (p.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
        assert.fail(`solver --roundtrip timed out after 5000 ms on input: ${input}`);
      }
      assert.equal(p.status, 0, `solver exit ${p.status}: ${p.stdout} ${p.stderr}`);
      const out = JSON.parse(p.stdout) as { ok: boolean; nodes: number; leaf_nodes: number; edge_lengths: number[] };
      assert.equal(out.ok, true);
      assert.equal(out.nodes, t.nodes.length, "node count");
      assert.equal(out.leaf_nodes, t.leaves, "leaf count");
      assert.equal(out.edge_lengths.length, t.edges.length, "edge count");
      t.edges.forEach((e, k) => {
        assert.ok(Math.abs(out.edge_lengths[k] - e.length) <= 1e-6, `edge ${k}: ${e.length} became ${out.edge_lengths[k]}`);
      });
    }),
    100,
    true, // no shrinking: each shrink step of a hang costs the full 5 s timeout
  );
});

/** A silhouette: a disc body with `limbs` thick spokes, on white. Pure function of its arguments. */
function syntheticPng(body: number, limbs: { angle: number; length: number }[]): Uint8Array {
  const W = 160;
  const png = new PNG({ width: W, height: W });
  png.data.fill(255);
  const c = W / 2;
  const inside = (x: number, y: number) => {
    if (Math.hypot(x - c, y - c) <= body) return true;
    return limbs.some(({ angle, length }) => {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const t = Math.max(0, Math.min(length, (x - c) * dx + (y - c) * dy));
      return Math.hypot(x - (c + t * dx), y - (c + t * dy)) <= 4;
    });
  };
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (inside(x, y)) {
        const i = (y * W + x) * 4;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 20;
      }
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

/** Everything about a pipeline run that must be reproducible. */
async function fingerprint(bytes: Uint8Array) {
  const r = await runPipeline(bytes, { solverPath });
  return {
    tree: JSON.stringify(r.tree),
    creases: r.solver?.cp?.creases.length ?? null,
    ok: r.ok,
    stage: r.refusal?.stage ?? null,
  };
}

test("property: the pipeline is deterministic on the fixtures", { skip: solverMissing }, async () => {
  const files = ["bush-dog.png", "aphodius-foetens.jpg"];
  const bytes = files.map((f) => new Uint8Array(readFileSync(new URL(`../../fixtures/${f}`, import.meta.url))));
  await checkAsync(
    "same bytes twice -> byte-identical tree JSON and same crease count (fixtures)",
    fc.asyncProperty(fc.integer({ min: 0, max: files.length - 1 }), async (i) => {
      const a = await fingerprint(bytes[i]);
      const b = await fingerprint(bytes[i]);
      assert.equal(a.tree, b.tree, `${files[i]}: tree JSON differs`);
      assert.equal(a.creases, b.creases, `${files[i]}: crease count differs`);
      assert.equal(a.ok, b.ok);
      assert.equal(a.stage, b.stage);
      assert.notEqual(a.tree, "null", `${files[i]}: no tree was produced, so the comparison proves nothing`);
    }),
    6,
  );
});

test("property: the pipeline is deterministic on generated silhouettes", { skip: solverMissing }, async () => {
  const limb = fc.record({ angle: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), length: fc.integer({ min: 25, max: 70 }) });
  await checkAsync(
    "same bytes twice -> byte-identical tree JSON and same crease count (synthetic)",
    fc.asyncProperty(fc.integer({ min: 12, max: 30 }), fc.array(limb, { minLength: 3, maxLength: 8 }), async (body, limbs) => {
      const bytes = syntheticPng(body, limbs);
      const a = await fingerprint(bytes);
      const b = await fingerprint(bytes);
      assert.equal(a.tree, b.tree, "tree JSON differs");
      assert.equal(a.creases, b.creases, "crease count differs");
      assert.equal(a.ok, b.ok);
      assert.equal(a.stage, b.stage);
    }),
    15,
  );
});
