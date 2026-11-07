/**
 * Several photographs of one subject (R1.4, R1.5, task 3.12).
 *
 * Each view is analysed on its own by `analyseImage`. Among views that fold (`ok`), the one with the
 * most leaves is used; ties go to the higher penalised score of the threshold sweep (IoU - lambda * leaves,
 * which is computed against each view's own mask and so is only a tiebreak, not a cross-view comparison).
 * Every view is reported, so a user who wants a simpler model can see the choice.
 */
import { analyseImage, type Analysis } from "./segment.ts";
import { borderContact, maskFromBytes } from "./pipeline.ts";
import type { PipelineOptions, Refusal } from "./pipeline.ts";

export const MAX_VIEWS = 4;

export interface ViewReport {
  view: number; // 1-based, in upload order
  leaves: number | null;
  tier: string | null;
  folds: boolean;
  chosen: boolean;
  /** Penalised score at the chosen threshold; null when no sweep ran. Tiebreak only. */
  score: number | null;
  refusalStage: string | null;
  /** Why this view was refused, with the numbers in `detail`. Null when it was not. */
  refusal: Refusal | null;
}

export interface ViewsAnalysis extends Analysis {
  views: ViewReport[];
  /** Null with one view, or when all views agree. Plain words, names the counts. */
  disagreement: string | null;
}

function score(a: Analysis): number | null {
  const s = a.selection;
  if (!s) return null;
  const row = s.rows[s.chosen];
  return row.iou - s.lambda * row.leaves;
}

export const OUT_OF_FRAME_MESSAGE = "The object runs out of frame in this view. Fit the whole object in the photograph.";

/**
 * A view whose largest silhouette component touches the frame border is a crop: the cut edge invents
 * leaves (a turtle cropped further and further gave 7, 6, 5, 4, 3). Any contact counts; the four real
 * fixtures touch with 0 pixels. Returns null when the object fits.
 */
export function outOfFrame(bytes: Uint8Array): Refusal | null {
  const m = maskFromBytes(bytes);
  const c = borderContact(m.mask, m.width, m.height);
  if (c.pixels === 0) return null;
  return {
    stage: "frame",
    message: OUT_OF_FRAME_MESSAGE,
    detail: `${c.pixels} silhouette pixels on the frame border (${(c.share * 100).toFixed(1)}% of the border) at ${c.sides.join(", ")}, in a ${m.width}x${m.height} analysed frame.`,
  };
}

function refusedView(refusal: Refusal): Analysis {
  return {
    ok: false, refusal, fault: null, log: [], image: null, coverage: null, tree: null, contraction: null,
    selection: null, minimum: null, tiers: null, solver: null, solverInput: null, assigned: false, fold: null,
    foldCheck: null, foldFacesOmitted: null, flatFold: null, svg: null, images: { mask: null, overlay: null },
    timingsMs: {}, totalMs: 0, candidates: [],
    segmentation: { path: "primary", fallbackReason: null, primaryCandidates: 0, primaryRectangularity: 0, clusters: null, fallbackCandidates: null },
  };
}

export function disagreementMessage(views: (Pick<ViewReport, "view" | "leaves" | "folds" | "chosen"> & { refusalStage?: string | null })[]): string | null {
  if (views.length < 2) return null;
  const chosen = views.find((v) => v.chosen);
  const counts = views.map((v) => v.leaves);
  const found = counts.filter((n): n is number => n !== null);
  if (found.length === counts.length && new Set(found).size === 1) return null;
  const list = views.map((v) => v.refusalStage === "frame"
    ? `view ${v.view} was set aside because the object runs out of frame`
    : `view ${v.view} found ${v.leaves === null ? "no flaps" : `${v.leaves} flaps`}${v.folds ? "" : " and does not fold"}`).join("; ");
  const use = chosen ? `The pattern uses view ${chosen.view} (${chosen.leaves} flaps).` : "No view folds, so no pattern is offered.";
  return `The views disagree about the subject: ${list}. A view that hides a limb finds fewer flaps. ${use}`;
}

export async function analyseViews(views: Uint8Array[], opts: PipelineOptions = {}): Promise<ViewsAnalysis> {
  if (views.length < 1 || views.length > MAX_VIEWS) throw new RangeError(`Send one to ${MAX_VIEWS} photographs.`);
  const results: Analysis[] = [];
  for (const v of views) {
    // An explicit tree is solved as given; there is no silhouette to test.
    const cut = opts.tree ? null : outOfFrame(v);
    results.push(cut ? refusedView(cut) : await analyseImage(v, opts));
  }
  const leaves = results.map((r) => r.tree?.leaves ?? null);
  const scores = results.map((r) => score(r));
  const idx = results.map((_, i) => i);
  const foldable = idx.filter((i) => results[i].ok);
  const pool = foldable.length ? foldable : idx;
  // Most leaves, then higher score, then earlier view. If nothing folds, the same order picks what to show.
  pool.sort((a, b) => (leaves[b] ?? -1) - (leaves[a] ?? -1) || (scores[b] ?? -Infinity) - (scores[a] ?? -Infinity) || a - b);
  const pick = pool[0];
  const reports: ViewReport[] = results.map((r, i) => ({
    view: i + 1, leaves: leaves[i], tier: r.minimum?.tier ?? null, folds: r.ok,
    chosen: i === pick && foldable.length > 0, score: scores[i], refusalStage: r.refusal?.stage ?? null, refusal: r.refusal,
  }));
  return { ...results[pick], views: reports, disagreement: disagreementMessage(reports) };
}
