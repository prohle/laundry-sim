/**
 * Photograph -> silhouette mask -> tree -> solver -> crease pattern, as one function.
 *
 *   const result = await runPipeline(bytes, { maxLeaves: 12 });
 *
 * Bytes in, geometry out. This module never writes a file and never prints: the image is held in
 * memory for the call and dropped with it (N3). Callers decide what to do with `result.log`
 * (tools/pipeline.ts prints it; the API route does not).
 *
 * The solver is a child process fed on stdin. Its path is `options.solverPath`, else the
 * FOLD_SOLVER environment variable, else solver/target/release/fold-solver under the cwd.
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
import { spawn } from "node:child_process";
import { join } from "node:path";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import { extractTree, DEFAULT_SIGNIFICANCE_THRESHOLD } from "./skeleton.ts";
import type { SkeletonTree, BranchRecord } from "./skeleton.ts";
import { selectThreshold } from "./select.ts";
import type { Selection } from "./select.ts";
import { minimumTier, tierReport } from "./tiers.ts";
import type { MinimumTier, TierRow } from "./tiers.ts";
import { contractShortEdges, DEFAULT_CONTRACT_THRESHOLD } from "./contract.ts";
import type { ContractResult } from "./contract.ts";
import { checkFlatFoldable } from "./flatfold.ts";
import type { FlatFoldReport } from "./flatfold.ts";
import { cpToSvg, foldDistribution } from "../../tools/cp-to-svg.ts";
import type { Cp } from "../../tools/cp-to-svg.ts";
import { cpToFold, validateFold } from "../../tools/fold.ts";
import type { FoldFile, FoldValidation } from "../../tools/fold.ts";

const { PNG } = pngjs;

interface Rgb {
  data: Float32Array; // 3 floats per pixel
  width: number;
  height: number;
}

// ---------- 1. read ----------

export class ImageDecodeError extends Error {}

/** Image type by magic number, not by file name or Content-Type. */
export function sniffImage(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

function decode(bytes: Uint8Array): { rgba: Uint8Array; width: number; height: number } {
  const kind = sniffImage(bytes);
  try {
    if (kind === "jpeg") {
      const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
      return { rgba: img.data, width: img.width, height: img.height };
    }
    if (kind === "png") {
      const img = PNG.sync.read(Buffer.from(bytes));
      return { rgba: new Uint8Array(img.data), width: img.width, height: img.height };
    }
  } catch (e) {
    throw new ImageDecodeError(`the ${kind} could not be decoded: ${(e as Error).message}`);
  }
  throw new ImageDecodeError("unsupported image type; use .jpg or .png");
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

/** A component at least this fraction of the largest counts as a second object. */
export const MULTI_OBJECT_RATIO = 0.15;
/** Largest component area / bounding-box area above this is "nearly a rectangle". */
export const RECTANGULARITY_LIMIT = 0.92;
/** A tree with fewer leaves than this has no limbs to fold. */
export const MIN_LEAVES = 3;

export interface MaskAssessment {
  /** All foreground pixels as a fraction of the frame. */
  coverage: number;
  foregroundPixels: number;
  /** 4-connected component pixel counts, largest first. */
  components: number[];
  /** Largest component / total foreground. 0 when there is no foreground. */
  largestShare: number;
  /** Components with at least MULTI_OBJECT_RATIO of the largest, the largest included. */
  significantComponents: number;
  /** Largest component area / its axis-aligned bounding-box area. 0 when there is no foreground. */
  rectangularity: number;
}

/**
 * Describe a binary mask (1 = foreground) before any tree is built from it. Pure; reads only
 * the mask. Rectangularity uses the axis-aligned box, so a rectangle rotated off-axis scores lower.
 */
export function assessMask(mask: Uint8Array, w: number, h: number): MaskAssessment {
  const c = components(mask, w, h, 1);
  const n = c.sizes.length - 1;
  const x0 = new Int32Array(n + 1).fill(w), y0 = new Int32Array(n + 1).fill(h);
  const x1 = new Int32Array(n + 1).fill(-1), y1 = new Int32Array(n + 1).fill(-1);
  for (let i = 0; i < w * h; i++) {
    const id = c.label[i];
    if (!id) continue;
    const x = i % w, y = (i - x) / w;
    if (x < x0[id]) x0[id] = x;
    if (x > x1[id]) x1[id] = x;
    if (y < y0[id]) y0[id] = y;
    if (y > y1[id]) y1[id] = y;
  }
  const ids = Array.from({ length: n }, (_, i) => i + 1).sort((a, b) => c.sizes[b] - c.sizes[a]);
  const components_ = ids.map((id) => c.sizes[id]);
  const total = components_.reduce((s, v) => s + v, 0);
  if (n === 0) {
    return { coverage: 0, foregroundPixels: 0, components: [], largestShare: 0, significantComponents: 0, rectangularity: 0 };
  }
  const big = ids[0];
  const boxArea = (x1[big] - x0[big] + 1) * (y1[big] - y0[big] + 1);
  return {
    coverage: total / (w * h),
    foregroundPixels: total,
    components: components_,
    largestShare: components_[0] / total,
    significantComponents: components_.filter((s) => s >= MULTI_OBJECT_RATIO * components_[0]).length,
    rectangularity: components_[0] / boxArea,
  };
}

export interface MaskResult {
  mask: Uint8Array;
  width: number;
  height: number;
  coverage: number;
  threshold: number;
  background: [number, number, number];
  borderSpread: number;
  holesFilled: number;
  droppedComponents: number;
  /** Assessment of the foreground before the largest component was kept (all components). */
  assessment: MaskAssessment;
}

export function makeMask(img: Rgb): MaskResult {
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

  // Assess everything that was found, before the largest is kept: the multi-object and
  // rectangle refusals need the components that the next step throws away.
  const assessment = assessMask(raw, w, h);

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
    assessment,
  };
}

/** Decode, downscale and mask an image exactly as runPipeline does, without running the rest. */
export function maskFromBytes(bytes: Uint8Array, maxDim = 512): MaskResult {
  return makeMask(downscale(decode(bytes), maxDim));
}

// ---------- debug images ----------

function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png);
}

function encodeMaskPng(m: MaskResult): Buffer {
  const rgba = new Uint8Array(m.width * m.height * 4);
  for (let i = 0; i < m.mask.length; i++) {
    const v = m.mask[i] ? 0 : 255;
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(rgba, m.width, m.height);
}

function encodeOverlayPng(img: Rgb, m: MaskResult, tree: SkeletonTree): Buffer {
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
  return encodePng(rgba, w, h);
}


export interface SolverReport {
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

/**
 * Run the solver on a tree. The tree goes to the child's stdin and the report comes back on stdout;
 * nothing touches disk. Resolves to a fault string (never throws) if it cannot run or its output
 * is not JSON.
 */
function runSolver(
  solverPath: string,
  tree: SkeletonTree,
  timeoutMs: number,
): Promise<{ report: SolverReport; json: string } | { fault: string } | { timeout: string }> {
  const json = JSON.stringify({
    nodes: tree.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    edges: tree.edges.map((e) => ({ from: e.from, to: e.to, length: e.length })),
  });
  return new Promise((done) => {
    const child = spawn(solverPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (v: { report: SolverReport; json: string } | { fault: string } | { timeout: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(v);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ timeout: `${solverPath} did not finish within ${timeoutMs} ms and was killed (SIGKILL)` });
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (c: string) => (out += c));
    child.stderr.setEncoding("utf8").on("data", (c: string) => (err += c));
    child.on("error", (e) => finish({ fault: `could not run ${solverPath}: ${e.message}` }));
    child.stdin.on("error", () => {}); // a child that fails to start closes stdin; "error" above reports it
    child.on("close", (code) => {
      try {
        finish({ report: JSON.parse(out) as SolverReport, json });
      } catch {
        finish({ fault: `unparseable output (exit ${code}): ${out.slice(0, 200)} ${err.slice(0, 200)}` });
      }
    });
    child.stdin.end(json);
  });
}

/** Technical meaning of each solver status. Goes in `refusal.detail`, never in the message. */
const CP_STATUS_REASON: Record<string, string> = {
  edges_too_short: "an edge is shorter than the solver's 0.01 minimum",
  polys_not_valid: "the polygons from the packing are not valid",
  polys_not_filled: "the packing leaves a polygon with no node",
  polys_multiple_ibps: "a polygon has more than one inactive border path",
  vertices_lack_depth: "some vertices have no fold depth",
  facets_not_valid: "the facets are not valid",
  not_local_root_connectable: "the fold order cannot be connected to a local root",
};

const SEPARATE_LIMBS = "Try a photograph where the limbs are longer and stand clear of the body and of each other.";

/** Reason and next step for a solver status that produced no crease pattern, in plain words. */
function plainNoPattern(status: string | null, failed: boolean): string {
  if (!failed && status === "edges_too_short") {
    return (
      "One limb in this shape is too short, next to the others, to fold as a flap of its own. " +
      "Try a photograph where the small limbs are larger, or one that hides them."
    );
  }
  if (failed) {
    return `The folding calculation could not fit this shape onto one square of paper. ${SEPARATE_LIMBS}`;
  }
  return `This shape could not be turned into a complete crease pattern. ${SEPARATE_LIMBS}`;
}


/** Default wall-clock limit for one solver run. */
export const DEFAULT_SOLVER_TIMEOUT_MS = 10_000;

export const DEFAULT_SOLVER_RELATIVE = "solver/target/release/fold-solver";

/** FOLD_SOLVER if set, else the release build under the current working directory. */
export function resolveSolverPath(): string {
  return process.env.FOLD_SOLVER || join(process.cwd(), DEFAULT_SOLVER_RELATIVE);
}

/** A log line, or a function of the debug-file paths for the two lines that name them. */
export type LogLine = string | ((paths: { svg: string; fold: string }) => string);

export interface PipelineOptions {
  maxLeaves?: number;
  maxDim?: number;
  /** Significance threshold. If omitted it is chosen automatically per image (src/lib/select.ts). */
  significance?: number;
  /** Penalty per leaf for the automatic choice. Default DEFAULT_LAMBDA. Ignored if `significance` is set. */
  lambda?: number;
  spur?: number;
  contract?: number;
  /** Paper side in mm, for the SVG only. */
  paper?: number;
  solverPath?: string;
  solverTimeoutMs?: number;
  /** Name used in the first log line. Defaults to "upload". */
  label?: string;
  /** Name used in the SVG title. Defaults to "upload". */
  name?: string;
  /** Encode the mask and overlay PNGs into `images`. Off by default: the API does not need them. */
  debugImages?: boolean;
  /**
   * A tree edited by the user (task 3.4), already validated by validateEditedTree. When present the
   * silhouette and skeleton steps are skipped and this tree is solved as given, with no flap budget
   * applied: the user decided what the limbs are. The image is still decoded, for its size only.
   */
  tree?: SkeletonTree;
}

/**
 * Why the pipeline declined. `message` is what a teacher reads: a one-sentence reason and a
 * one-sentence next step, no solver terms. `detail` is the technical cause, for debugging; the
 * interface must not show it as the message.
 */
export interface Refusal {
  stage: string;
  message: string;
  detail: string | null;
}

export interface PipelineResult {
  /** Same meaning as the script's exit code 0: solved, built, valid FOLD, M/V assigned, flat-foldable. */
  ok: boolean;
  /** Why `ok` is false, when the pipeline declined. Null on success and on a fault. */
  refusal: Refusal | null;
  /** The pipeline could not run at all (solver missing, crashed or unparseable). Not the subject's fault. */
  fault: string | null;
  log: LogLine[];
  image: { width: number; height: number; analysedWidth: number; analysedHeight: number } | null;
  coverage: number | null;
  /** The tree handed to the solver (after contraction). */
  tree: SkeletonTree | null;
  contraction: ContractResult | null;
  /** The automatic threshold sweep, or null when the threshold was given or the tree was edited. */
  selection: Selection | null;
  minimum: MinimumTier | null;
  tiers: TierRow[] | null;
  solver: SolverReport | null;
  /** The JSON given to the solver on stdin. */
  solverInput: string | null;
  assigned: boolean;
  fold: FoldFile | null;
  foldCheck: FoldValidation | null;
  foldFacesOmitted: string | null;
  flatFold: FlatFoldReport | null;
  svg: string | null;
  images: { mask: Buffer | null; overlay: Buffer | null };
  timingsMs: Record<string, number>;
  totalMs: number;
}

export async function runPipeline(bytes: Uint8Array, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const t0 = performance.now();
  const lap: Record<string, number> = {};
  let last = t0;
  const mark = (k: string) => {
    const now = performance.now();
    lap[k] = now - last;
    last = now;
  };
  const maxLeaves = opts.maxLeaves ?? 12;
  const maxDim = opts.maxDim ?? 512;
  const solverPath = opts.solverPath ?? resolveSolverPath();
  const r: PipelineResult = {
    ok: false, refusal: null, fault: null, log: [], image: null, coverage: null, tree: null,
    contraction: null, selection: null, minimum: null, tiers: null, solver: null, solverInput: null, assigned: false,
    fold: null, foldCheck: null, foldFacesOmitted: null, flatFold: null, svg: null,
    images: { mask: null, overlay: null }, timingsMs: lap, totalMs: 0,
  };
  const say = (l: LogLine) => r.log.push(l);
  const finish = (): PipelineResult => {
    r.totalMs = performance.now() - t0;
    return r;
  };
  const refuse = (stage: string, message: string, line: string, detail: string | null = null) => {
    r.refusal = { stage, message, detail };
    say(line);
    return finish();
  };

  // 1. read
  const src = decode(bytes);
  mark("decode");
  const img = downscale(src, maxDim);
  mark("downscale");
  r.image = { width: src.width, height: src.height, analysedWidth: img.width, analysedHeight: img.height };
  say(`image      ${opts.label ?? "upload"}  ${src.width}x${src.height} -> ${img.width}x${img.height}`);

  // 2. mask, 3. tree. An edited tree replaces both: it is the user's tree, solved as given.
  let tree: SkeletonTree;
  let sigOnly: SkeletonTree;
  if (opts.tree) {
    tree = sigOnly = opts.tree;
    say(`tree       edited by the user: ${tree.leaves} leaves, ${tree.nodes.length} nodes, ${tree.edges.length} edges; extraction skipped`);
  } else {
    // 2. mask
    const m = makeMask(img);
    mark("mask");
    r.coverage = m.coverage;
    if (opts.debugImages) r.images.mask = encodeMaskPng(m);
    say(
      `mask       Otsu on RGB distance from border colour rgb(${m.background.map(Math.round).join(",")}); ` +
        `threshold ${m.threshold.toFixed(1)}, border spread ${m.borderSpread.toFixed(1)}, ` +
        `coverage ${(m.coverage * 100).toFixed(1)}%, ${m.holesFilled} holes filled, ${m.droppedComponents} components dropped`,
    );
    const a = m.assessment;
    say(
      `assess     foreground ${(a.coverage * 100).toFixed(1)}% of frame in ${a.components.length} components ` +
        `(${a.components.slice(0, 5).join(", ")}${a.components.length > 5 ? ", ..." : ""} px); ` +
        `${a.significantComponents} at least ${MULTI_OBJECT_RATIO * 100}% of the largest; largest share ${(a.largestShare * 100).toFixed(1)}%; ` +
        `rectangularity ${a.rectangularity.toFixed(3)}`,
    );
    if (m.coverage > 0.9 || m.coverage < 0.02) {
      return refuse(
        "mask",
        "I can't find a single object. Try a plainer background.",
        "REFUSED    I can't find a single object. Try a plainer background. (R1.3: coverage outside 2%..90%)",
        `silhouette covers ${(m.coverage * 100).toFixed(1)}% of the frame; allowed 2% to 90%`,
      );
    }
    if (a.significantComponents >= 2) {
      return refuse(
        "mask",
        "This looks like more than one object. Photograph one object on its own.",
        "REFUSED    This looks like more than one object. Photograph one object on its own.",
        `${a.significantComponents} components are each at least ${MULTI_OBJECT_RATIO * 100}% of the largest; ` +
          `sizes ${a.components.slice(0, 5).join(", ")} px; largest share of foreground ${(a.largestShare * 100).toFixed(1)}%`,
      );
    }
    if (a.rectangularity > RECTANGULARITY_LIMIT) {
      return refuse(
        "mask",
        "This shape is nearly a rectangle, so there is nothing to fold. Try an object with a distinctive outline.",
        "REFUSED    This shape is nearly a rectangle, so there is nothing to fold. Try an object with a distinctive outline.",
        `rectangularity ${a.rectangularity.toFixed(3)} of the largest component exceeds ${RECTANGULARITY_LIMIT}`,
      );
    }

    // 3. tree
    const spurThreshold = opts.spur;
    const frame = { mask: m.mask, width: m.width, height: m.height };
    let significanceThreshold = opts.significance;
    if (significanceThreshold === undefined) {
      const sel = selectThreshold(frame, opts.lambda);
      r.selection = sel;
      significanceThreshold = sel.threshold;
      mark("select");
      const c = sel.rows[sel.chosen];
      say(
        `select     automatic significance threshold ${c.threshold.toFixed(2)} (lambda ${sel.lambda}): ` +
          `${c.leaves} leaves, IoU ${c.iou.toFixed(4)}, value ${c.value.toFixed(4)}; swept ${sel.rows.length} thresholds`,
      );
    }
    // "Before pruning": both prunings off. "After significance": no flap budget.
    const unpruned = extractTree(frame, { significanceThreshold: 0, spurThreshold: 0 });
    const diagnostics: BranchRecord[] = [];
    sigOnly = extractTree(frame, { significanceThreshold, spurThreshold, diagnostics });
    tree = extractTree(frame, { significanceThreshold, spurThreshold, maxLeaves });
    mark("skeleton");
    if (opts.debugImages) r.images.overlay = encodeOverlayPng(img, m, tree);
    say(
      `tree       significance threshold ${significanceThreshold ?? `default (${DEFAULT_SIGNIFICANCE_THRESHOLD})`}, pixel spur threshold ${spurThreshold ?? "default (off)"}; ` +
        `leaves: before pruning ${unpruned.leaves}, after significance ${sigOnly.leaves}, after maxLeaves=${maxLeaves} ${tree.leaves}; ` +
        `${tree.nodes.length} nodes, ${tree.edges.length} edges`,
    );
    const fmt = (b: BranchRecord) =>
      `(${b.leafX.toFixed(0)},${b.leafY.toFixed(0)}) len ${b.length.toFixed(1)} / radius ${b.radius.toFixed(1)} = ${b.significance.toFixed(2)}`;
    const byS = (a: BranchRecord, b: BranchRecord) => a.significance - b.significance;
    const dropped = diagnostics.filter((b) => b.action === "dropped").sort(byS);
    const kept = diagnostics.filter((b) => b.action === "kept").sort(byS);
    say(`dropped    ${dropped.length} branches, significance ${dropped.length ? dropped[0].significance.toFixed(2) + " .. " + dropped[dropped.length - 1].significance.toFixed(2) : "-"}`);
    for (const b of dropped) say(`             ${fmt(b)}`);
    say(`kept       ${kept.length} branches, significance ${kept.length ? kept[0].significance.toFixed(2) + " .. " + kept[kept.length - 1].significance.toFixed(2) : "-"}`);
    for (const b of kept) say(`             ${fmt(b)}`);
  }
  if (tree.nodes.length < 2 || tree.edges.length === 0) {
    return refuse(
      "tree",
      "This shape has no limbs to fold. Try an animal or an object with a clear outline.",
      "REFUSED    This shape has no limbs to fold. (tree has fewer than two nodes)",
      `tree has ${tree.nodes.length} nodes and ${tree.edges.length} edges`,
    );
  }

  // 3a. Contract sub-minimum edges (task 3.7). The minimum tier is computed on the contracted,
  // budget-free tree too: a leaf dropped here is a flap the subject no longer has.
  const contractThreshold = opts.contract ?? DEFAULT_CONTRACT_THRESHOLD;
  let sigC = sigOnly;
  let solverTree = tree;
  let treeContraction: ContractResult | null = null;
  if (contractThreshold > 0) {
    try {
      sigC = contractShortEdges(sigOnly, contractThreshold).tree;
      treeContraction = contractShortEdges(tree, contractThreshold);
      solverTree = treeContraction.tree;
    } catch (e) {
      const msg = (e as Error).message;
      return refuse(
        "contract",
        `Once the limbs too small to fold are left out, nothing is left to fold. ${SEPARATE_LIMBS}`,
        `REFUSED    ${msg} (edge contraction, threshold ${contractThreshold})`,
        msg,
      );
    }
    const c = treeContraction;
    r.contraction = c;
    say(
      `contract   threshold ${contractThreshold}: ${c.contracted.length} edges contracted, ${c.dropped.length} leaves dropped; ` +
        `${tree.nodes.length} -> ${solverTree.nodes.length} nodes, ${tree.leaves} -> ${solverTree.leaves} leaves`,
    );
    for (const x of c.contracted) say(`             edge of ${x.length.toFixed(4)}: node ${x.removed} merged into node ${x.kept}`);
    for (const x of c.dropped) {
      say(
        `             DROPPED LEAF ${x.leaf} (edge ${x.length.toFixed(4)} to node ${x.parent}` +
          `${x.significance === null ? "" : `, significance ${x.significance.toFixed(2)}`}): too short to fold, one flap fewer`,
      );
    }
  }
  r.tree = solverTree;
  if (solverTree.leaves < MIN_LEAVES) {
    return refuse(
      "tree",
      "This shape has too few limbs to fold. Try an animal or an object with clear protrusions.",
      `REFUSED    This shape has too few limbs to fold. (${solverTree.leaves} leaves, at least ${MIN_LEAVES} needed)`,
      `tree handed to the solver has ${solverTree.leaves} leaves; at least ${MIN_LEAVES} needed`,
    );
  }

  // 3b. Minimum tier (R3.3, R3.4). Uses the significance-pruned tree WITHOUT the flap budget:
  // a tree already cut to maxLeaves can never say it needs more than maxLeaves.
  const min = minimumTier(sigC);
  r.minimum = min;
  r.tiers = tierReport(sigC);
  say(`minimum    ${min.requiredLeaves} significant leaves -> ${min.tier ?? "none"}. ${min.reason}`);
  say("tiers      tier     budget  leaves  dropped  representable");
  for (const t of r.tiers) {
    say(`           ${t.tier.padEnd(8)} ${String(t.budget).padStart(6)}  ${String(t.leaves).padStart(6)}  ${String(t.dropped).padStart(7)}  ${t.representable}`);
  }
  if (min.tier === null) {
    return refuse(
      "tier",
      `This subject has ${min.requiredLeaves} limbs, and this tool folds at most twelve from one square. ` +
        "Try a simpler subject, or a photograph from an angle that hides some of the limbs.",
      `REFUSED    ${min.reason}`,
      min.reason,
    );
  }

  // 4 + 5. Solver. When contraction changed the tree, the original is run first for comparison.
  const timeoutMs = opts.solverTimeoutMs ?? DEFAULT_SOLVER_TIMEOUT_MS;
  const changed = !!treeContraction && (treeContraction.contracted.length > 0 || treeContraction.dropped.length > 0);
  if (changed) {
    const before = await runSolver(solverPath, tree, timeoutMs);
    if ("report" in before) {
      say(
        `before     uncontracted tree: ok=${before.report.ok} cp_built=${before.report.cp_built} cp_status=${before.report.cp_status}` +
          (before.report.error ? `  error: ${before.report.error}` : ""),
      );
    }
  }
  const ran = await runSolver(solverPath, solverTree, timeoutMs);
  mark("solver");
  if ("timeout" in ran) {
    return refuse(
      "solver",
      "The solver did not finish in time. Try a simpler subject.",
      `REFUSED    The solver did not finish in time: ${ran.timeout}`,
      ran.timeout,
    );
  }
  if ("fault" in ran) {
    r.fault = ran.fault;
    say(`solver     ${ran.fault}`);
    return finish();
  }
  const report = ran.report;
  r.solver = report;
  r.solverInput = ran.json;
  mark("json");

  // 6. report
  say(
    `solver     ok=${report.ok} converged=${report.converged} feasible=${report.feasible} ` +
      `scale=${report.scale.toFixed(6)} cp_built=${report.cp_built} cp_status=${report.cp_status}` +
      (report.error ? `  error: ${report.error}` : ""),
  );
  let foldValid = false;
  let printable = true;
  let flatFoldable = true;
  if (report.cp && report.cp_built) {
    const dist = foldDistribution(report.cp);
    const paper = opts.paper ?? 150;
    r.svg = cpToSvg(report.cp, paper, { cpStatus: report.cp_status, title: `Fold crease pattern: ${opts.name ?? "upload"}` });
    const assigned = (dist.M ?? 0) + (dist.V ?? 0) > 0;
    r.assigned = assigned;
    say(
      (p) =>
        `crease     ${report.cp!.vertices.length} vertices, ${report.cp!.creases.length} creases; folds ${JSON.stringify(dist)}; ` +
        `facet colours ${JSON.stringify(report.facet_colors)}; ` +
        (assigned ? "mountain/valley assigned" : "MOUNTAIN/VALLEY NOT COMPUTED: not printable as a fold sheet") +
        `; wrote ${p.svg} (${paper} mm)`,
    );
    const { fold, facesOmitted } = cpToFold(report.cp, { cpStatus: report.cp_status });
    const check = validateFold(fold);
    r.fold = fold;
    r.foldCheck = check;
    r.foldFacesOmitted = facesOmitted ?? null;
    say(
      (p) =>
        `fold       wrote ${p.fold}; valid=${check.ok}; ` +
        (facesOmitted ? `faces_vertices OMITTED (${facesOmitted})` : `faces_vertices ${fold.faces_vertices!.length} faces, area ${check.faceArea!.toFixed(4)}`),
    );
    for (const e of check.errors) say(`             error: ${e}`);
    for (const w of check.warnings) say(`             warning: ${w}`);
    foldValid = check.ok;

    // Task 2.4: local flat-foldability. Reported, never repaired.
    const ff = checkFlatFoldable(report.cp);
    r.flatFold = ff;
    say(
      `flatfold   ${ff.interiorVertices} interior vertices checked (${ff.skippedBoundary} boundary skipped, ${ff.skippedLowDegree} of degree < 3 skipped); ` +
        `both pass ${ff.passBoth}; Kawasaki fail ${ff.failKawasaki} (${ff.oddDegree} odd degree), largest residual ${ff.maxResidual.toExponential(2)} rad at tolerance ${ff.tolerance}; ` +
        `Maekawa fail ${ff.failMaekawa} (${ff.noAssignment} with no M/V assigned)`,
    );
    for (const f of ff.failures) {
      say(
        `             vertex ${f.vertex} at (${f.position[0].toFixed(4)}, ${f.position[1].toFixed(4)}) degree ${f.degree}: ` +
          `M ${f.mountains} V ${f.valleys} other ${f.unassigned}, Kawasaki residual ${f.kawasakiResidual.toExponential(2)} rad; ${f.reason}`,
      );
    }
    if (ff.failEither > 0) {
      say(`             ${ff.failEither} of ${ff.interiorVertices} interior vertices are not locally flat-foldable as drawn.`);
      flatFoldable = false;
      r.refusal = {
        stage: "flatfold",
        message: `Some of the folds in this pattern would not lie flat, so it would not fold. ${SEPARATE_LIMBS}`,
        detail: `${ff.failEither} of ${ff.interiorVertices} interior vertices are not locally flat-foldable as drawn.`,
      };
    }
    if (!assigned) {
      const msg =
        `Not printable: the solver built geometry (cp_status ${report.cp_status}) but computed no mountain/valley assignment. ` +
        `The SVG and the FOLD are marked "not computed"; do not fold from them.`;
      say(`REFUSED    ${msg}`);
      printable = false;
      r.refusal = {
        stage: "assignment",
        message:
          "This shape produced a crease pattern with no mountain or valley folds, so it cannot be followed. " +
          "Try an animal with longer, more separated legs.",
        detail: msg,
      };
    }
  } else {
    const why = report.error
      ? `the solver failed: ${report.error}`
      : (CP_STATUS_REASON[report.cp_status ?? ""] ?? `the solver returned no crease pattern (cp_status ${report.cp_status})`);
    r.refusal = {
      stage: "solver",
      message: plainNoPattern(report.cp_status, !!report.error),
      detail: `No crease pattern for this tree: ${why}.`,
    };
    say(`REFUSED    No crease pattern for this tree: ${why}. Nothing to print.`);
  }
  r.ok = report.ok && report.cp_built && foldValid && printable && flatFoldable;
  if (!r.ok && !r.refusal) {
    r.refusal = {
      stage: "solver",
      message: `The folding calculation did not produce a pattern that can be followed. ${SEPARATE_LIMBS}`,
      detail: `solver ok=${report.ok} cp_built=${report.cp_built} foldValid=${foldValid} (cp_status ${report.cp_status})`,
    };
  }
  const total = performance.now() - t0;
  const steps = Object.entries(lap).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(", ");
  say(`time       ${(total / 1000).toFixed(2)} s total of the 20 s budget (N1)  [${steps}]`);
  return finish();
}
