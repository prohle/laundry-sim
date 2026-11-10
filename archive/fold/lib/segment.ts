/**
 * Find the foldable objects in an image (task 3.11).
 *
 *   const a = await analyseImage(bytes);   // a is the best candidate's PipelineResult, plus a list
 *
 * Primary path: the existing border-colour/Otsu mask (makeMask in pipeline.ts). If it has exactly one
 * significant component the pipeline runs on the full-frame mask exactly as before. If it has several,
 * each is a candidate.
 *
 * Colour fallback, used only when the primary path yields no candidate that reaches a tree (every
 * candidate refused at stage mask, tree or contract), or when its largest component is near-rectangular
 * (rectangularity > RECTANGULARITY_LIMIT):
 *   1. Take the 512 px analysis grid and fit k-means with k = 6 in RGB on a stride-4 sample of it.
 *   2. Seeding is deterministic: the sample is sorted by luminance and the initial centres are the
 *      sample colours at quantiles (i + 0.5) / k. Then 30 Lloyd iterations (stops early when no label
 *      changes). No random numbers, so the same image gives the same clusters.
 *   3. Every pixel of the grid takes the label of its nearest centre.
 *   4. Background clusters are those holding most of the border pixels: clusters in descending order of
 *      border pixels until more than half of the border is covered.
 *   5. For each other cluster, the 4-connected components of at least 2% of the frame are candidates
 *      (small enclosed holes, under 1% of the frame, are filled). Each is cropped to its bounding box
 *      plus a 4 px margin. At most MAX_CANDIDATES, largest first.
 *
 * Each candidate goes through runPipeline with its own mask. The best one (ok first, then the furthest
 * stage reached, then the larger area) is the top-level result, so the single-object response shape is
 * unchanged. Known limit: a colour cluster is not an object. One object can split across clusters and
 * one cluster can join several objects; the cluster table in `segmentation.clusters` shows what was found.
 */
import { components, assessMask, makeMask, prepareImage, runPipeline, RECTANGULARITY_LIMIT, MULTI_OBJECT_RATIO } from "./pipeline.ts";
import type { MaskResult, PipelineOptions, PipelineResult, Refusal, Rgb } from "./pipeline.ts";

export const MAX_CANDIDATES = 6;
export const KMEANS_K = 6;
export const KMEANS_ITERATIONS = 30;
/** A candidate must cover at least this fraction of the frame. */
export const MIN_CANDIDATE_SHARE = 0.02;
const MARGIN = 4;
const SAMPLE_STRIDE = 4;

export interface ClusterReport {
  index: number;
  mean: [number, number, number];
  /** Fraction of the analysed frame. */
  areaShare: number;
  /** Fraction of the border ring pixels. */
  borderShare: number;
  background: boolean;
}

export interface CandidateReport {
  index: number;
  path: "primary" | "colour";
  /** In analysed-grid pixels. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Candidate pixels / frame pixels. */
  areaShare: number;
  /** Leaves in the tree handed to the solver; null if no tree was reached. */
  leaves: number | null;
  tier: string | null;
  ok: boolean;
  patternBuilt: boolean;
  refusal: Refusal | null;
}

export interface Segmentation {
  path: "primary" | "colour";
  /** Why the colour fallback ran, or null. */
  fallbackReason: string | null;
  primaryCandidates: number;
  primaryRectangularity: number;
  /** Null when the fallback did not run. */
  clusters: ClusterReport[] | null;
  /** What the fallback found, whether or not it was used. Null when it did not run. */
  fallbackCandidates: CandidateReport[] | null;
}

export interface Analysis extends PipelineResult {
  candidates: CandidateReport[];
  segmentation: Segmentation;
}

// ---------- k-means ----------

export interface KMeans {
  centres: Float64Array; // k * 3
  labels: Uint8Array; // one per pixel of the full grid
  iterations: number;
}

function nearest(c: Float64Array, k: number, r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  for (let j = 0; j < k; j++) {
    const dr = r - c[j * 3], dg = g - c[j * 3 + 1], db = b - c[j * 3 + 2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

export function kmeansRgb(img: Rgb, k = KMEANS_K): KMeans {
  const { width: w, height: h, data } = img;
  const idx: number[] = [];
  for (let y = 0; y < h; y += SAMPLE_STRIDE) for (let x = 0; x < w; x += SAMPLE_STRIDE) idx.push(y * w + x);
  const lum = (i: number) => 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  const sorted = [...idx].sort((a, b) => lum(a) - lum(b) || a - b);
  const centres = new Float64Array(k * 3);
  for (let j = 0; j < k; j++) {
    const p = sorted[Math.min(sorted.length - 1, Math.floor(((j + 0.5) / k) * sorted.length))];
    for (let c = 0; c < 3; c++) centres[j * 3 + c] = data[p * 3 + c];
  }
  const lab = new Uint8Array(idx.length).fill(255);
  let iterations = 0;
  for (; iterations < KMEANS_ITERATIONS; iterations++) {
    let changed = false;
    for (let s = 0; s < idx.length; s++) {
      const p = idx[s];
      const j = nearest(centres, k, data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);
      if (j !== lab[s]) { lab[s] = j; changed = true; }
    }
    if (!changed) break;
    const sum = new Float64Array(k * 3), n = new Float64Array(k);
    for (let s = 0; s < idx.length; s++) {
      const p = idx[s], j = lab[s];
      for (let c = 0; c < 3; c++) sum[j * 3 + c] += data[p * 3 + c];
      n[j]++;
    }
    for (let j = 0; j < k; j++) if (n[j] > 0) for (let c = 0; c < 3; c++) centres[j * 3 + c] = sum[j * 3 + c] / n[j];
  }
  const labels = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) labels[i] = nearest(centres, k, data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  return { centres, labels, iterations };
}

// ---------- candidates ----------

interface Cand {
  mask: MaskResult;
  bbox: { x: number; y: number; width: number; height: number };
  areaShare: number;
}

/** Crop `full` (w x h, 1 = member) to the bounding box of `ids` plus a margin; null if empty. */
function cropCandidate(
  member: Uint8Array, w: number, h: number, mean: [number, number, number],
): Cand | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
  for (let i = 0; i < w * h; i++) {
    if (!member[i]) continue;
    area++;
    const x = i % w, y = (i - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (area === 0) return null;
  x0 = Math.max(0, x0 - MARGIN); y0 = Math.max(0, y0 - MARGIN);
  x1 = Math.min(w - 1, x1 + MARGIN); y1 = Math.min(h - 1, y1 + MARGIN);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const mask = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) mask[y * cw + x] = member[(y + y0) * w + x + x0];
  return {
    mask: {
      mask, width: cw, height: ch, coverage: area / (w * h), threshold: 0, background: mean,
      borderSpread: 0, holesFilled: 0, droppedComponents: 0, assessment: assessMask(mask, cw, ch), foreground: mask,
    },
    bbox: { x: x0, y: y0, width: cw, height: ch },
    areaShare: area / (w * h),
  };
}

/** Components of `fg` that are at least `minPixels`, as full-frame 0/1 masks, largest first. */
function componentMasks(fg: Uint8Array, w: number, h: number, minPixels: number): { member: Uint8Array; size: number }[] {
  const c = components(fg, w, h, 1);
  const out: { member: Uint8Array; size: number }[] = [];
  for (let id = 1; id < c.sizes.length; id++) {
    if (c.sizes[id] < minPixels) continue;
    const member = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (c.label[i] === id) member[i] = 1;
    out.push({ member, size: c.sizes[id] });
  }
  return out.sort((a, b) => b.size - a.size);
}

function fillSmallHoles(m: Uint8Array, w: number, h: number): void {
  const bg = components(m, w, h, 0);
  const limit = 0.01 * w * h;
  for (let i = 0; i < w * h; i++) {
    const id = bg.label[i];
    if (id && !bg.touchesBorder[id] && bg.sizes[id] < limit) m[i] = 1;
  }
}

export function colourCandidates(img: Rgb): { candidates: Cand[]; clusters: ClusterReport[] } {
  const { width: w, height: h, data } = img;
  const km = kmeansRgb(img);
  const k = KMEANS_K;
  const size = new Float64Array(k), border = new Float64Array(k);
  let borderN = 0;
  for (let i = 0; i < w * h; i++) {
    const j = km.labels[i];
    size[j]++;
    const x = i % w, y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { border[j]++; borderN++; }
  }
  const order = Array.from({ length: k }, (_, j) => j).sort((a, b) => border[b] - border[a] || a - b);
  const isBg = new Array<boolean>(k).fill(false);
  let covered = 0;
  for (const j of order) {
    if (covered > 0.5 * borderN) break;
    isBg[j] = true;
    covered += border[j];
  }
  void data;
  const clusters: ClusterReport[] = Array.from({ length: k }, (_, j) => ({
    index: j,
    mean: [km.centres[j * 3], km.centres[j * 3 + 1], km.centres[j * 3 + 2]],
    areaShare: size[j] / (w * h),
    borderShare: borderN ? border[j] / borderN : 0,
    background: isBg[j],
  }));
  const found: Cand[] = [];
  for (let j = 0; j < k; j++) {
    if (isBg[j]) continue;
    const fg = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) fg[i] = km.labels[i] === j ? 1 : 0;
    fillSmallHoles(fg, w, h);
    for (const c of componentMasks(fg, w, h, Math.ceil(MIN_CANDIDATE_SHARE * w * h))) {
      const cand = cropCandidate(c.member, w, h, clusters[j].mean.map(Math.round) as [number, number, number]);
      if (cand) found.push(cand);
    }
  }
  found.sort((a, b) => b.areaShare - a.areaShare);
  return { candidates: found.slice(0, MAX_CANDIDATES), clusters };
}

// ---------- analysis ----------

const STAGE_RANK: Record<string, number> = { mask: 0, tree: 0, contract: 0, tier: 1, solver: 2, assignment: 3, flatfold: 3 };

function rank(r: PipelineResult): number {
  if (r.ok) return 10;
  if (r.fault) return -1;
  return STAGE_RANK[r.refusal?.stage ?? ""] ?? 0;
}

const reachedTree = (r: PipelineResult) => r.fault !== null || !["mask", "tree", "contract"].includes(r.refusal?.stage ?? "");

function report(index: number, path: "primary" | "colour", c: Cand | null, r: PipelineResult, fallbackShare: number): CandidateReport {
  return {
    index, path,
    bbox: c?.bbox ?? { x: 0, y: 0, width: r.image?.analysedWidth ?? 0, height: r.image?.analysedHeight ?? 0 },
    areaShare: c?.areaShare ?? fallbackShare,
    leaves: r.tree?.leaves ?? null,
    tier: r.minimum?.tier ?? null,
    ok: r.ok,
    patternBuilt: r.solver?.cp_built ?? false,
    refusal: r.refusal,
  };
}

/** Run the pipeline on each candidate; shift the tree's frame so it maps onto the whole analysed image. */
async function runAll(
  cands: Cand[], path: "primary" | "colour", prepared: ReturnType<typeof prepareImage>, opts: PipelineOptions,
): Promise<{ results: PipelineResult[]; reports: CandidateReport[] }> {
  const results: PipelineResult[] = [], reports: CandidateReport[] = [];
  for (let i = 0; i < cands.length; i++) {
    const r = await runPipeline(new Uint8Array(0), { ...opts, prepared, mask: cands[i].mask, debugImages: false, label: `${opts.label ?? "upload"} candidate ${i + 1}` });
    if (r.tree) r.tree = { ...r.tree, frame: { ...r.tree.frame, originX: r.tree.frame.originX + cands[i].bbox.x, originY: r.tree.frame.originY + cands[i].bbox.y } };
    r.coverage = cands[i].areaShare;
    results.push(r);
    reports.push(report(i, path, cands[i], r, cands[i].areaShare));
  }
  return { results, reports };
}

export async function analyseImage(bytes: Uint8Array, opts: PipelineOptions = {}): Promise<Analysis> {
  if (opts.tree) {
    // An edited tree is solved as given; there is nothing to segment.
    const r = await runPipeline(bytes, opts);
    return { ...r, candidates: [], segmentation: { path: "primary", fallbackReason: null, primaryCandidates: 0, primaryRectangularity: 0, clusters: null, fallbackCandidates: null } };
  }
  const prepared = opts.prepared ?? prepareImage(bytes, opts.maxDim ?? 512);
  const { img } = prepared;
  const m = makeMask(img);
  const fgComps = componentMasks(m.foreground, img.width, img.height, 1);
  const significant = fgComps.filter(
    (c) => c.size >= MULTI_OBJECT_RATIO * fgComps[0].size && c.size >= MIN_CANDIDATE_SHARE * img.width * img.height,
  );

  let primary: { results: PipelineResult[]; reports: CandidateReport[] };
  if (significant.length <= 1) {
    // Exactly the single-object path as before: full-frame mask, nothing cropped.
    const r = await runPipeline(bytes, { ...opts, prepared, mask: m });
    primary = { results: [r], reports: [report(0, "primary", null, r, m.coverage)] };
    primary.reports[0].bbox = { x: 0, y: 0, width: img.width, height: img.height };
  } else {
    const cands = significant.slice(0, MAX_CANDIDATES)
      .map((c) => cropCandidate(c.member, img.width, img.height, m.background))
      .filter((c): c is Cand => c !== null);
    primary = await runAll(cands, "primary", prepared, opts);
  }

  const rect = m.assessment.rectangularity;
  const noTree = !primary.results.some(reachedTree);
  const rectangular = rect > RECTANGULARITY_LIMIT;
  const reason = noTree
    ? `no primary candidate reached a tree (${primary.results.map((r) => r.refusal?.stage ?? "ok").join(", ")})`
    : rectangular ? `largest primary component is near-rectangular (${rect.toFixed(3)} > ${RECTANGULARITY_LIMIT})` : null;

  const seg: Segmentation = { path: "primary", fallbackReason: reason, primaryCandidates: primary.results.length, primaryRectangularity: rect, clusters: null, fallbackCandidates: null };
  let results = primary.results, reports = primary.reports;

  if (reason) {
    const col = colourCandidates(img);
    seg.clusters = col.clusters;
    if (col.candidates.length > 0) {
      const fb = await runAll(col.candidates, "colour", prepared, opts);
      seg.fallbackCandidates = fb.reports;
      const best = (rs: PipelineResult[]) => Math.max(...rs.map(rank));
      // The fallback replaces the primary result unless it is strictly worse.
      if (best(fb.results) >= best(primary.results)) {
        results = fb.results; reports = fb.reports; seg.path = "colour";
      }
    }
  }

  // Best first: ok, then the furthest stage, then the larger area. Stable on ties.
  const order = results.map((_, i) => i).sort((a, b) => rank(results[b]) - rank(results[a]) || reports[b].areaShare - reports[a].areaShare || a - b);
  const sortedReports = order.map((i, n) => ({ ...reports[i], index: n }));
  const top = results[order[0]];
  return { ...top, candidates: sortedReports, segmentation: seg };
}
