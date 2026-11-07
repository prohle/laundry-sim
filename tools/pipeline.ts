/**
 * Photograph -> silhouette mask -> tree -> solver -> crease pattern, as a script.
 *
 *   node tools/pipeline.ts <image.jpg|png> [--max-leaves 12] [--max-dim 512] [--significance 2.0] [--spur 0] [--contract 0.012] [--out tools/out] [--paper 150]
 *
 * Not a UI and not a product surface: it exists to run the existing pieces
 * (src/lib/skeleton.ts, ./solver) on a real image and say what happened.
 *
 * Mask method (no hand-tuned threshold):
 *   1. Box-filter downscale so the longer side is <= max-dim (default 512).
 *   2. Background colour = per-channel median of a 3 px border ring.
 *   3. Per-pixel RGB distance from that colour; threshold by Otsu on the distance.
 *   4. Fill enclosed holes smaller than 1% of the frame (specular highlights),
 *      keep the largest 4-connected component.
 *   5. Refuse if the silhouette covers > 90% or < 2% of the frame (R1.3).
 *
 * Known limits: assumes a plain, roughly uniform background; ignores EXIF
 * orientation; a thin limb the threshold breaks off the body is dropped by
 * the largest-component step.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import { extractTree, DEFAULT_SIGNIFICANCE_THRESHOLD } from "../src/lib/skeleton.ts";
import type { SkeletonTree, BranchRecord } from "../src/lib/skeleton.ts";
import { minimumTier, tierReport } from "../src/lib/tiers.ts";
import { contractShortEdges, DEFAULT_CONTRACT_THRESHOLD } from "../src/lib/contract.ts";
import type { ContractResult } from "../src/lib/contract.ts";
import { cpToSvg, foldDistribution } from "./cp-to-svg.ts";
import type { Cp } from "./cp-to-svg.ts";
import { cpToFold, validateFold } from "./fold.ts";
import { checkFlatFoldable } from "../src/lib/flatfold.ts";

const { PNG } = pngjs;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOLVER = join(ROOT, "solver/target/release/fold-solver");

interface Rgb {
  data: Float32Array; // 3 floats per pixel
  width: number;
  height: number;
}

// ---------- 1. read ----------

function decode(path: string): { rgba: Uint8Array; width: number; height: number } {
  const bytes = readFileSync(path);
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { rgba: img.data, width: img.width, height: img.height };
  }
  if (ext === ".png") {
    const img = PNG.sync.read(bytes);
    return { rgba: new Uint8Array(img.data), width: img.width, height: img.height };
  }
  throw new Error(`unsupported image type ${ext}; use .jpg or .png`);
}

/** Box-filter downscale; alpha is composited onto white. */
function downscale(src: { rgba: Uint8Array; width: number; height: number }, maxDim: number): Rgb {
  const k = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * src.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * src.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const a = src.rgba[i + 3] / 255;
          r += src.rgba[i] * a + 255 * (1 - a);
          g += src.rgba[i + 1] * a + 255 * (1 - a);
          b += src.rgba[i + 2] * a + 255 * (1 - a);
          n++;
        }
      }
      const o = (y * w + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return { data: out, width: w, height: h };
}

// ---------- 2. mask ----------

function median(a: number[]): number {
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}

function otsu(values: Float32Array, bins = 256): number {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max === 0) return 0;
  const hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = -1, bestT = 0;
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return ((bestT + 1) / bins) * max; // pixels with distance >= this are foreground
}

/** Label 4-connected components of `want` in `mask`; returns labels (0 = not in want) and sizes. */
function components(mask: Uint8Array, w: number, h: number, want: number) {
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const touchesBorder: boolean[] = [false];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (mask[s] !== want || label[s] !== 0) continue;
    const id = sizes.length;
    sizes.push(0);
    touchesBorder.push(false);
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const p = stack.pop()!;
      sizes[id]++;
      const x = p % w, y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder[id] = true;
      if (x > 0 && mask[p - 1] === want && !label[p - 1]) { label[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] === want && !label[p + 1]) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - w] === want && !label[p - w]) { label[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] === want && !label[p + w]) { label[p + w] = id; stack.push(p + w); }
    }
  }
  return { label, sizes, touchesBorder };
}

interface MaskResult {
  mask: Uint8Array;
  width: number;
  height: number;
  coverage: number;
  threshold: number;
  background: [number, number, number];
  borderSpread: number;
  holesFilled: number;
  droppedComponents: number;
}

function makeMask(img: Rgb): MaskResult {
  const { width: w, height: h, data } = img;
  const ring = 3;
  const samples: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && y >= ring && x < w - ring && y < h - ring) continue;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) samples[c].push(data[o + c]);
    }
  }
  const bg: [number, number, number] = [median(samples[0]), median(samples[1]), median(samples[2])];
  // Spread of the border: median absolute distance from bg, a plain-background check.
  const borderDist: number[] = [];
  for (let i = 0; i < samples[0].length; i++) {
    borderDist.push(Math.hypot(samples[0][i] - bg[0], samples[1][i] - bg[1], samples[2][i] - bg[2]));
  }
  const borderSpread = median(borderDist);

  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    dist[i] = Math.hypot(data[i * 3] - bg[0], data[i * 3 + 1] - bg[1], data[i * 3 + 2] - bg[2]);
  }
  const threshold = otsu(dist);
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = dist[i] >= threshold ? 1 : 0;

  // Fill small enclosed background holes (specular highlights inside the body).
  const bgc = components(raw, w, h, 0);
  const holeLimit = 0.01 * w * h;
  let holesFilled = 0;
  for (let i = 0; i < w * h; i++) {
    const id = bgc.label[i];
    if (id && !bgc.touchesBorder[id] && bgc.sizes[id] < holeLimit) {
      raw[i] = 1;
    }
  }
  for (let id = 1; id < bgc.sizes.length; id++) {
    if (!bgc.touchesBorder[id] && bgc.sizes[id] < holeLimit) holesFilled++;
  }

  // Keep the largest foreground component.
  const fg = components(raw, w, h, 1);
  let best = 0;
  for (let id = 1; id < fg.sizes.length; id++) if (fg.sizes[id] > (fg.sizes[best] ?? 0)) best = id;
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (best && fg.label[i] === best) {
      mask[i] = 1;
      count++;
    }
  }
  return {
    mask, width: w, height: h,
    coverage: count / (w * h),
    threshold, background: bg, borderSpread, holesFilled,
    droppedComponents: Math.max(0, fg.sizes.length - 2),
  };
}

// ---------- debug images ----------

function writePng(path: string, rgba: Uint8Array, w: number, h: number) {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba);
  writeFileSync(path, PNG.sync.write(png));
}

function writeMaskPng(path: string, m: MaskResult) {
  const rgba = new Uint8Array(m.width * m.height * 4);
  for (let i = 0; i < m.mask.length; i++) {
    const v = m.mask[i] ? 0 : 255;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  writePng(path, rgba, m.width, m.height);
}

function writeOverlayPng(path: string, img: Rgb, m: MaskResult, tree: SkeletonTree) {
  const { width: w, height: h } = img;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const dim = m.mask[i] ? 0.55 : 0.9;
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(img.data[i * 3 + c] * dim + 255 * (1 - dim) * 0.4);
    rgba[i * 4 + 3] = 255;
  }
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
  };
  const px = (n: { x: number; y: number }) => ({
    x: tree.frame.originX + n.x * tree.frame.scale,
    y: tree.frame.originY + n.y * tree.frame.scale,
  });
  for (const e of tree.edges) {
    const a = px(tree.nodes[e.from]), b = px(tree.nodes[e.to]);
    const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))) * 2 || 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      put(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 230, 0, 0);
    }
  }
  for (const n of tree.nodes) {
    const p = px(n);
    const leaf = n.degree === 1;
    const r = leaf ? 4 : 2;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        put(Math.round(p.x) + dx, Math.round(p.y) + dy, leaf ? 0 : 0, leaf ? 80 : 0, leaf ? 255 : 0);
      }
    }
  }
  writePng(path, rgba, w, h);
}

// ---------- main ----------

interface SolverReport {
  ok: boolean;
  converged: boolean;
  feasible: boolean;
  scale: number;
  error: string | null;
  cp_status: string | null;
  cp_built: boolean;
  facet_colors: Record<string, number> | null;
  cp: (Cp & { faces?: number[][]; faces_note?: string | null }) | null;
}

/** Run ./solver on a tree. Null (with a printed reason) if it cannot run or its output is not JSON. */
function runSolver(tree: SkeletonTree): { report: SolverReport; json: string } | null {
  const json = JSON.stringify({
    nodes: tree.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    edges: tree.edges.map((e) => ({ from: e.from, to: e.to, length: e.length })),
  });
  const run = spawnSync(SOLVER, [], { input: json, encoding: "utf8", timeout: 60_000 });
  if (run.error) {
    console.log(`solver     could not run ${SOLVER}: ${run.error.message}`);
    return null;
  }
  try {
    return { report: JSON.parse(run.stdout) as SolverReport, json };
  } catch {
    console.log(`solver     unparseable output (exit ${run.status}): ${run.stdout.slice(0, 200)} ${run.stderr.slice(0, 200)}`);
    return null;
  }
}

const CP_STATUS_REASON: Record<string, string> = {
  edges_too_short: "an edge is shorter than the solver's 0.01 minimum",
  polys_not_valid: "the polygons from the packing are not valid",
  polys_not_filled: "the packing leaves a polygon with no node",
  polys_multiple_ibps: "a polygon has more than one inactive border path",
  vertices_lack_depth: "some vertices have no fold depth",
  facets_not_valid: "the facets are not valid",
  not_local_root_connectable: "the fold order cannot be connected to a local root",
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): number {
  const t0 = performance.now();
  const lap: Record<string, number> = {};
  let last = t0;
  const mark = (k: string) => {
    const now = performance.now();
    lap[k] = now - last;
    last = now;
  };

  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: node tools/pipeline.ts <image.jpg|png> [--max-leaves 12] [--max-dim 512] [--significance 2.0] [--spur 0] [--out tools/out]");
    return 2;
  }
  const maxLeaves = Number(arg("max-leaves", "12"));
  const maxDim = Number(arg("max-dim", "512"));
  const outDir = resolve(arg("out", join(ROOT, "tools/out")));
  mkdirSync(outDir, { recursive: true });
  const stem = basename(file, extname(file));

  // 1. read
  const src = decode(file);
  mark("decode");
  const img = downscale(src, maxDim);
  mark("downscale");
  console.log(`image      ${file}  ${src.width}x${src.height} -> ${img.width}x${img.height}`);

  // 2. mask
  const m = makeMask(img);
  mark("mask");
  writeMaskPng(join(outDir, `${stem}.mask.png`), m);
  console.log(
    `mask       Otsu on RGB distance from border colour rgb(${m.background.map(Math.round).join(",")}); ` +
      `threshold ${m.threshold.toFixed(1)}, border spread ${m.borderSpread.toFixed(1)}, ` +
      `coverage ${(m.coverage * 100).toFixed(1)}%, ${m.holesFilled} holes filled, ${m.droppedComponents} components dropped`,
  );
  if (m.coverage > 0.9 || m.coverage < 0.02) {
    console.log("REFUSED    I can't find a single object. Try a plainer background. (R1.3: coverage outside 2%..90%)");
    return 1;
  }

  // 3. tree
  const spurArg = arg("spur", "");
  const spurThreshold = spurArg === "" ? undefined : Number(spurArg);
  const sigArg = arg("significance", "");
  const significanceThreshold = sigArg === "" ? undefined : Number(sigArg);
  const frame = { mask: m.mask, width: m.width, height: m.height };
  // "Before pruning": both prunings off. "After significance": no flap budget.
  const unpruned = extractTree(frame, { significanceThreshold: 0, spurThreshold: 0 });
  const diagnostics: BranchRecord[] = [];
  const sigOnly = extractTree(frame, { significanceThreshold, spurThreshold, diagnostics });
  const tree = extractTree(frame, { significanceThreshold, spurThreshold, maxLeaves });
  mark("skeleton");
  writeOverlayPng(join(outDir, `${stem}.overlay.png`), img, m, tree);
  console.log(
    `tree       significance threshold ${significanceThreshold ?? `default (${DEFAULT_SIGNIFICANCE_THRESHOLD})`}, pixel spur threshold ${spurThreshold ?? "default (off)"}; ` +
      `leaves: before pruning ${unpruned.leaves}, after significance ${sigOnly.leaves}, after maxLeaves=${maxLeaves} ${tree.leaves}; ` +
      `${tree.nodes.length} nodes, ${tree.edges.length} edges`,
  );
  const fmt = (r: BranchRecord) =>
    `(${r.leafX.toFixed(0)},${r.leafY.toFixed(0)}) len ${r.length.toFixed(1)} / radius ${r.radius.toFixed(1)} = ${r.significance.toFixed(2)}`;
  const byS = (a: BranchRecord, b: BranchRecord) => a.significance - b.significance;
  const dropped = diagnostics.filter((r) => r.action === "dropped").sort(byS);
  const kept = diagnostics.filter((r) => r.action === "kept").sort(byS);
  console.log(`dropped    ${dropped.length} branches, significance ${dropped.length ? dropped[0].significance.toFixed(2) + " .. " + dropped[dropped.length - 1].significance.toFixed(2) : "-"}`);
  for (const r of dropped) console.log(`             ${fmt(r)}`);
  console.log(`kept       ${kept.length} branches, significance ${kept.length ? kept[0].significance.toFixed(2) + " .. " + kept[kept.length - 1].significance.toFixed(2) : "-"}`);
  for (const r of kept) console.log(`             ${fmt(r)}`);
  if (tree.nodes.length < 2 || tree.edges.length === 0) {
    console.log("REFUSED    This shape has no limbs to fold. (tree has fewer than two nodes)");
    return 1;
  }

  // 3a. Contract sub-minimum edges (task 3.7). The minimum tier is computed on the contracted,
  // budget-free tree too: a leaf dropped here is a flap the subject no longer has.
  const contractThreshold = Number(arg("contract", String(DEFAULT_CONTRACT_THRESHOLD)));
  let sigC = sigOnly;
  let solverTree = tree;
  let treeContraction: ContractResult | null = null;
  if (contractThreshold > 0) {
    try {
      sigC = contractShortEdges(sigOnly, contractThreshold).tree;
      treeContraction = contractShortEdges(tree, contractThreshold);
      solverTree = treeContraction.tree;
    } catch (e) {
      console.log(`REFUSED    ${(e as Error).message} (edge contraction, threshold ${contractThreshold})`);
      return 1;
    }
    const c = treeContraction;
    console.log(
      `contract   threshold ${contractThreshold}: ${c.contracted.length} edges contracted, ${c.dropped.length} leaves dropped; ` +
        `${tree.nodes.length} -> ${solverTree.nodes.length} nodes, ${tree.leaves} -> ${solverTree.leaves} leaves`,
    );
    for (const x of c.contracted) console.log(`             edge of ${x.length.toFixed(4)}: node ${x.removed} merged into node ${x.kept}`);
    for (const x of c.dropped) {
      console.log(
        `             DROPPED LEAF ${x.leaf} (edge ${x.length.toFixed(4)} to node ${x.parent}` +
          `${x.significance === null ? "" : `, significance ${x.significance.toFixed(2)}`}): too short to fold, one flap fewer`,
      );
    }
  }

  // 3b. Minimum tier (R3.3, R3.4). Uses the significance-pruned tree WITHOUT the flap budget:
  // a tree already cut to maxLeaves can never say it needs more than maxLeaves.
  const min = minimumTier(sigC);
  console.log(`minimum    ${min.requiredLeaves} significant leaves -> ${min.tier ?? "none"}. ${min.reason}`);
  console.log("tiers      tier     budget  leaves  dropped  representable");
  for (const r of tierReport(sigC)) {
    console.log(
      `           ${r.tier.padEnd(8)} ${String(r.budget).padStart(6)}  ${String(r.leaves).padStart(6)}  ${String(r.dropped).padStart(7)}  ${r.representable}`,
    );
  }
  if (min.tier === null) {
    console.log(`REFUSED    ${min.reason}`);
    return 1;
  }

  // 4 + 5. Solver. When contraction changed the tree, the original is run first for comparison.
  const changed = !!treeContraction && (treeContraction.contracted.length > 0 || treeContraction.dropped.length > 0);
  if (changed) {
    const before = runSolver(tree);
    if (before) {
      console.log(
        `before     uncontracted tree: ok=${before.report.ok} cp_built=${before.report.cp_built} cp_status=${before.report.cp_status}` +
          (before.report.error ? `  error: ${before.report.error}` : ""),
      );
    }
  }
  const ran = runSolver(solverTree);
  mark("solver");
  if (!ran) return 1;
  const report = ran.report;
  writeFileSync(join(outDir, `${stem}.tree.json`), ran.json + "\n");
  mark("json");

  // 6. report
  console.log(
    `solver     ok=${report.ok} converged=${report.converged} feasible=${report.feasible} ` +
      `scale=${report.scale.toFixed(6)} cp_built=${report.cp_built} cp_status=${report.cp_status}` +
      (report.error ? `  error: ${report.error}` : ""),
  );
  writeFileSync(join(outDir, `${stem}.solver.json`), JSON.stringify(report) + "\n");
  let foldValid = false;
  let printable = true;
  let flatFoldable = true;
  if (report.cp && report.cp_built) {
    const dist = foldDistribution(report.cp);
    const paper = Number(arg("paper", "150"));
    const svgPath = join(outDir, `${stem}.cp.svg`);
    writeFileSync(svgPath, cpToSvg(report.cp, paper, { cpStatus: report.cp_status, title: `Fold crease pattern: ${stem}` }));
    const assigned = (dist.M ?? 0) + (dist.V ?? 0) > 0;
    console.log(
      `crease     ${report.cp.vertices.length} vertices, ${report.cp.creases.length} creases; folds ${JSON.stringify(dist)}; ` +
        `facet colours ${JSON.stringify(report.facet_colors)}; ` +
        (assigned ? "mountain/valley assigned" : "MOUNTAIN/VALLEY NOT COMPUTED: not printable as a fold sheet") +
        `; wrote ${svgPath} (${paper} mm)`,
    );
    const { fold, facesOmitted } = cpToFold(report.cp, { cpStatus: report.cp_status });
    const check = validateFold(fold);
    const foldPath = join(outDir, `${stem}.fold.json`);
    writeFileSync(foldPath, JSON.stringify(fold) + "\n");
    console.log(
      `fold       wrote ${foldPath}; valid=${check.ok}; ` +
        (facesOmitted ? `faces_vertices OMITTED (${facesOmitted})` : `faces_vertices ${fold.faces_vertices!.length} faces, area ${check.faceArea!.toFixed(4)}`),
    );
    for (const m of check.errors) console.log(`             error: ${m}`);
    for (const m of check.warnings) console.log(`             warning: ${m}`);
    foldValid = check.ok;

    // Task 2.4: local flat-foldability. Reported, never repaired.
    const ff = checkFlatFoldable(report.cp);
    console.log(
      `flatfold   ${ff.interiorVertices} interior vertices checked (${ff.skippedBoundary} boundary skipped, ${ff.skippedLowDegree} of degree < 3 skipped); ` +
        `both pass ${ff.passBoth}; Kawasaki fail ${ff.failKawasaki} (${ff.oddDegree} odd degree), largest residual ${ff.maxResidual.toExponential(2)} rad at tolerance ${ff.tolerance}; ` +
        `Maekawa fail ${ff.failMaekawa} (${ff.noAssignment} with no M/V assigned)`,
    );
    for (const f of ff.failures) {
      console.log(
        `             vertex ${f.vertex} at (${f.position[0].toFixed(4)}, ${f.position[1].toFixed(4)}) degree ${f.degree}: ` +
          `M ${f.mountains} V ${f.valleys} other ${f.unassigned}, Kawasaki residual ${f.kawasakiResidual.toExponential(2)} rad; ${f.reason}`,
      );
    }
    if (ff.failEither > 0) {
      console.log(`             ${ff.failEither} of ${ff.interiorVertices} interior vertices are not locally flat-foldable as drawn.`);
      flatFoldable = false;
    }
    if (!assigned) {
      console.log(
        `REFUSED    Not printable: the solver built geometry (cp_status ${report.cp_status}) but computed no mountain/valley assignment. ` +
          `The SVG and the FOLD are marked "not computed"; do not fold from them.`,
      );
      printable = false;
    }
  } else {
    const why = report.error
      ? `the solver failed: ${report.error}`
      : (CP_STATUS_REASON[report.cp_status ?? ""] ?? `the solver returned no crease pattern (cp_status ${report.cp_status})`);
    console.log(`REFUSED    No crease pattern for this tree: ${why}. Nothing to print.`);
  }
  const total = performance.now() - t0;
  const steps = Object.entries(lap).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(", ");
  console.log(`time       ${(total / 1000).toFixed(2)} s total of the 20 s budget (N1)  [${steps}]`);
  return report.ok && report.cp_built && foldValid && printable && flatFoldable ? 0 : 1;
}

process.exit(main());
