/**
 * All four tiers for one photograph (task 3.19).
 *
 * The no-budget run gives the minimum tier and is that tier's attempt. Every higher tier is
 * re-extracted and solved with `budget` set. Tiers below the minimum are not run: they are reported
 * with the tier refusal the pipeline would give. Nothing is dropped from the report; a tier that does
 * not fold carries its reason.
 *
 * Measured on the turtle by the user: budget 6 folds, 8 gives `polys_not_valid`, 12 builds a pattern
 * with interior vertices that do not lie flat. The limit is the extracted tree's shape, so the screen
 * must offer only the tiers that fold.
 */
import { analyseImage, type Analysis } from "./segment.ts";
import { TIERS, type TierName } from "./tiers.ts";
import { prepareImage, type PipelineOptions, type Refusal } from "./pipeline.ts";
import type { SkeletonTree } from "./skeleton.ts";
import { foldDistribution } from "../../tools/cp-to-svg.ts";

export interface TierAttempt {
  tier: TierName;
  budget: number;
  /** False when the tier is below the minimum: nothing was solved. */
  attempted: boolean;
  leaves: number | null;
  /** The tier folds: a printable pattern with mountain/valley that passes the flat-foldability check. */
  ok: boolean;
  cpStatus: string | null;
  refusal: Refusal | null;
  /** A few words for a disabled chip. Null when the tier folds. */
  short: string | null;
  vertices: number | null;
  creases: number | null;
  folds: Record<string, number> | null;
  /** The tree solved at this tier, whether or not it folded. Null when nothing was solved. */
  tree: SkeletonTree | null;
  contraction: { contracted: unknown[]; dropped: { leaf: number; length: number }[] } | null;
  /** The next lower tier whose tree is identical, else null. */
  sameAs: TierName | null;
  /** Pattern, only when `ok`. */
  pattern: { cp: unknown; fold: unknown; foldValid: boolean; flatFold: unknown; svg: string | null } | null;
  solverMs: number | null;
  totalMs: number;
}

export interface LadderRun {
  /** The no-budget run: the minimum tier. Decides leaves, tier and disagreement for the view. */
  base: Analysis;
  /** What the top-level fields describe: the highest tier that folds, else the minimum. */
  top: Analysis;
  tiers: TierAttempt[];
  /** Wall time for the whole ladder on this view. */
  ms: number;
}

const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A few words for a chip that is not available. */
export function shortReason(refusal: Refusal | null, cpStatus: string | null, requiredLeaves: number | null): string {
  if (!refusal) return "did not fold";
  if (cpStatus === "polys_not_valid") return "solver could not pack it";
  switch (refusal.stage) {
    case "tier": return requiredLeaves ? `needs ${requiredLeaves} flaps` : "needs more flaps";
    case "flatfold": return "would not lie flat";
    case "assignment": return "no mountain/valley found";
    case "solver": return /in time/.test(refusal.message) ? "solver took too long" : "solver could not pack it";
    case "mask": case "frame": return "no single object found";
    case "tree": case "contract": return "too few limbs";
    default: return "did not fold";
  }
}

function sameTree(a: SkeletonTree | null, b: SkeletonTree | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify([a.nodes, a.edges]) === JSON.stringify([b.nodes, b.edges]);
}

function attemptFrom(t: (typeof TIERS)[number], a: Analysis, requiredLeaves: number | null): TierAttempt {
  const cp = a.solver?.cp ?? null;
  const ok = a.ok && !!a.svg;
  const cpStatus = a.solver?.cp_status ?? null;
  return {
    tier: t.tier, budget: t.budget, attempted: true,
    leaves: a.tree?.leaves ?? null, ok, cpStatus,
    refusal: a.refusal, short: ok ? null : shortReason(a.refusal, cpStatus, requiredLeaves),
    vertices: cp ? cp.vertices.length : null, creases: cp ? cp.creases.length : null,
    folds: cp ? foldDistribution(cp) : null,
    tree: a.tree,
    contraction: a.contraction && { contracted: a.contraction.contracted, dropped: a.contraction.dropped },
    sameAs: null,
    pattern: ok ? { cp: a.solver!.cp, fold: a.fold, foldValid: a.foldCheck?.ok ?? false, flatFold: a.flatFold, svg: a.svg } : null,
    solverMs: a.timingsMs.solver ?? null, totalMs: a.totalMs,
  };
}

function notRun(t: (typeof TIERS)[number], refusal: Refusal, requiredLeaves: number | null): TierAttempt {
  return {
    tier: t.tier, budget: t.budget, attempted: false, leaves: null, ok: false, cpStatus: null, refusal,
    short: shortReason(refusal, null, requiredLeaves), vertices: null, creases: null, folds: null, tree: null,
    contraction: null, sameAs: null, pattern: null, solverMs: null, totalMs: 0,
  };
}

/** Four tiers, none run, all with the same reason (a view refused before any tier was reached). */
export function refusedTiers(refusal: Refusal): TierAttempt[] {
  return TIERS.map((t) => notRun(t, refusal, null));
}

export async function runLadder(bytes: Uint8Array, opts: PipelineOptions = {}): Promise<LadderRun> {
  const t0 = performance.now();
  // Decode once: every tier runs on the same downscaled image.
  opts = { ...opts, prepared: opts.prepared ?? prepareImage(bytes, opts.maxDim ?? 512) };
  const base = await analyseImage(bytes, { ...opts, budget: undefined });
  const min = base.minimum;
  const required = min?.requiredLeaves ?? null;
  const minBudget = min?.tier ? TIERS.find((t) => t.tier === min.tier)!.budget : null;

  // Reuse the threshold the sweep already chose, so the higher tiers do not repeat the sweep. Only
  // when the image has one candidate on the primary path: with several, each has its own threshold.
  const sig = opts.significance ?? (base.candidates.length <= 1 && base.segmentation.path === "primary" ? base.selection?.threshold : undefined);

  const analyses = new Map<number, Analysis>();
  const tiers: TierAttempt[] = [];
  for (const t of TIERS) {
    if (minBudget === null || base.fault !== null) {
      // The subject did not reach a minimum (or the solver is missing): every tier carries the reason.
      const why: Refusal = base.refusal ?? { stage: "solver", message: "The solver could not be run.", detail: base.fault };
      tiers.push(notRun(t, why, required));
    } else if (t.budget < minBudget) {
      const msg = `This subject needs ${required} flaps; ${label(t.tier)} allows ${t.budget}. The cheapest version is ${label(min!.tier!)}.`;
      tiers.push(notRun(t, { stage: "tier", message: msg, detail: `budget ${t.budget} is below the ${required} leaves of the significance-pruned tree` }, required));
    } else if (t.budget === minBudget) {
      analyses.set(t.budget, base);
      tiers.push(attemptFrom(t, base, required));
    } else {
      const a = await analyseImage(bytes, { ...opts, budget: t.budget, ...(sig !== undefined ? { significance: sig } : {}), ...(sig !== undefined && base.selection ? { reuse: base.selection } : {}) });
      analyses.set(t.budget, a);
      tiers.push(a.fault !== null
        ? notRun(t, { stage: "solver", message: "The solver could not be run.", detail: a.fault }, required)
        : attemptFrom(t, a, required));
    }
  }
  // "Same as <tier>": the tree is identical to the next lower tier's.
  for (let i = 1; i < tiers.length; i++) {
    if (sameTree(tiers[i].tree, tiers[i - 1].tree)) tiers[i].sameAs = tiers[i - 1].tier;
  }
  const best = [...tiers].reverse().find((t) => t.ok);
  const top = (best && analyses.get(best.budget)) || base;
  return { base, top, tiers, ms: performance.now() - t0 };
}
