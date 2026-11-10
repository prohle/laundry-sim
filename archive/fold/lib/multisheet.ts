/**
 * Per-part solve and assembly note for multi-sheet models (tasks 3.22, 3.23; R8.3, R8.4).
 *
 * Each part from partitionTree is solved and checked on its own with the same rules as a single
 * sheet: minimum tier from the part's flap count, solver, crease pattern, mountain/valley, FOLD
 * validation, Kawasaki/Maekawa. The view folds only if every part folds.
 *
 * The solver call is passed in (`solve`) so this module does not import pipeline.ts at runtime.
 * The checks below mirror the tail of runPipeline; runPipeline itself is untouched so the
 * single-sheet results cannot change.
 */
import { partitionTree, MIN_PART_LEAVES, MAX_PART_LEAVES, type Part, type Partition } from "./parts.ts";
import { minimumTier, type TierName } from "./tiers.ts";
import { checkFlatFoldable, type FlatFoldReport } from "./flatfold.ts";
import { cpToSvg, foldDistribution } from "../../tools/cp-to-svg.ts";
import { cpToFold, validateFold, type FoldFile } from "../../tools/fold.ts";
import type { SkeletonTree } from "./skeleton.ts";
import type { Refusal, SolverReport } from "./pipeline.ts";

export type SolveOutcome = { report: SolverReport; json: string } | { fault: string } | { timeout: string };

export interface PartReport {
  name: string;
  /** Leaves of the original tree in this part (tabs excluded). Sums to the subject's leaf count. */
  leaves: number;
  /** Flaps the solver packs: leaves plus tabs. */
  flaps: number;
  /** Junction node ids included in this part as tabs. */
  tabs: number[];
  /** Minimum tier for `flaps`; null when above the largest budget or when no tier was reached. */
  tier: TierName | null;
  folds: boolean;
  cpStatus: string | null;
  vertices: number | null;
  creases: number | null;
  /** Fold-code counts (F, M, V, B). */
  foldCodes: Record<string, number> | null;
  refusal: Refusal | null;
  /** Fault string when the solver could not be run (not the subject's fault). */
  fault: string | null;
  tree: SkeletonTree;
  /** Only when the part folds. */
  pattern: { cp: unknown; fold: FoldFile; foldValid: boolean; flatFold: FlatFoldReport; svg: string } | null;
  solverMs: number;
}

export interface Assembly {
  parts: number;
  /** Junction node ids, with their position in the analysed image in pixels. */
  junctions: { node: number; x: number; y: number }[];
  note: string;
}

export interface MultiSheet {
  parts: PartReport[];
  assembly: Assembly;
  partition: Pick<Partition, "junctions" | "totalLeaves">;
  /** Every part folds. */
  ok: boolean;
  /** Set when a part could not be run at all. */
  fault: string | null;
  /** Refusal for the view, naming the first part that does not fold. Null when all fold. */
  refusal: Refusal | null;
}

const SEPARATE = "Try a photograph where the protrusions are longer and stand clear of the body and of each other.";

export function assemblyNote(partNames: string[], junctions: { node: number; x: number; y: number }[], image: { width: number; height: number } | null): string {
  const where = (j: { x: number; y: number }) =>
    image ? `about ${Math.round((j.x / image.width) * 100)}% across and ${Math.round((j.y / image.height) * 100)}% down the photograph` : `at pixel (${Math.round(j.x)}, ${Math.round(j.y)})`;
  const js = junctions.length === 1
    ? `the shared junction (node ${junctions[0].node}, ${where(junctions[0])})`
    : `the shared junctions (${junctions.map((j) => `node ${j.node}, ${where(j)}`).join("; ")})`;
  return (
    `This is a multi-sheet model of ${partNames.length} parts (${partNames.join(", ")}), each folded from its own square. ` +
    `The parts are joined at ${js}. A multi-sheet model is joined at a tab and needs glue or a slot.`
  );
}

export async function solveParts(
  tree: SkeletonTree,
  o: { solve: (t: SkeletonTree) => Promise<SolveOutcome>; paper: number; name: string; image: { width: number; height: number } | null; maxLeaves?: number },
): Promise<MultiSheet> {
  const partition = partitionTree(tree, o.maxLeaves);
  const reports: PartReport[] = [];
  let fault: string | null = null;
  for (const p of partition.parts) {
    reports.push(await solveOne(p, o));
    if (reports[reports.length - 1].fault) fault = reports[reports.length - 1].fault;
  }
  const pos = new Map(tree.nodes.map((n) => [n.id, n]));
  const junctions = partition.junctions.map((id) => {
    const n = pos.get(id)!;
    return { node: id, x: tree.frame.originX + n.x * tree.frame.scale, y: tree.frame.originY + n.y * tree.frame.scale };
  });
  const bad = reports.find((r) => !r.folds);
  const refusal: Refusal | null = bad && !fault
    ? {
        stage: "part",
        message: `${bad.name} does not fold, so the whole model is not offered. ${bad.refusal?.message ?? SEPARATE}`,
        detail: `${bad.name} (${bad.leaves} leaves, ${bad.flaps} flaps): stage ${bad.refusal?.stage ?? "?"}, cp_status ${bad.cpStatus ?? "none"}; ${bad.refusal?.detail ?? ""}`.trim(),
      }
    : null;
  return {
    parts: reports,
    assembly: { parts: reports.length, junctions, note: assemblyNote(reports.map((r) => r.name), junctions, o.image) },
    partition: { junctions: partition.junctions, totalLeaves: partition.totalLeaves },
    ok: reports.length > 0 && !bad && !fault,
    fault,
    refusal,
  };
}

async function solveOne(p: Part, o: { solve: (t: SkeletonTree) => Promise<SolveOutcome>; paper: number; name: string }): Promise<PartReport> {
  const base: PartReport = {
    name: p.name, leaves: p.leaves, flaps: p.flaps, tabs: p.tabs, tier: null, folds: false, cpStatus: null,
    vertices: null, creases: null, foldCodes: null, refusal: null, fault: null, tree: p.tree, pattern: null, solverMs: 0,
  };
  const refuse = (stage: string, message: string, detail: string): PartReport => ({ ...base, refusal: { stage, message, detail } });

  const min = minimumTier(p.tree);
  if (min.tier === null) {
    return refuse("tier", `${p.name} needs ${min.requiredLeaves} flaps, tab included, and one square allows ${MAX_PART_LEAVES}. ${SEPARATE}`, min.reason);
  }
  base.tier = min.tier;
  if (p.leaves < MIN_PART_LEAVES) {
    return refuse("tree", `${p.name} is too small to fold as a sheet of its own: ${p.leaves} limb${p.leaves === 1 ? "" : "s"}, and it could not be joined to another part without passing ${MAX_PART_LEAVES} flaps. ${SEPARATE}`, `part has ${p.leaves} original leaves and ${p.flaps} flaps; at least ${MIN_PART_LEAVES} leaves needed and no sibling could take it within ${MAX_PART_LEAVES} flaps`);
  }
  const t0 = performance.now();
  const ran = await o.solve(p.tree);
  base.solverMs = performance.now() - t0;
  if ("timeout" in ran) return refuse("solver", `${p.name}: the solver did not finish in time.`, ran.timeout);
  if ("fault" in ran) return { ...base, fault: ran.fault, refusal: { stage: "solver", message: "The solver could not be run.", detail: ran.fault } };
  const rep = ran.report;
  base.cpStatus = rep.cp_status;
  if (!rep.cp || !rep.cp_built) {
    return refuse("solver", `${p.name} could not be turned into a complete crease pattern. ${SEPARATE}`,
      rep.error ? `the solver failed: ${rep.error}` : `no crease pattern (cp_status ${rep.cp_status})`);
  }
  base.vertices = rep.cp.vertices.length;
  base.creases = rep.cp.creases.length;
  base.foldCodes = foldDistribution(rep.cp);
  const assigned = (base.foldCodes.M ?? 0) + (base.foldCodes.V ?? 0) > 0;
  const { fold } = cpToFold(rep.cp, { cpStatus: rep.cp_status });
  const check = validateFold(fold);
  const ff = checkFlatFoldable(rep.cp);
  if (!assigned) {
    return refuse("assignment", `${p.name} produced a crease pattern with no mountain or valley folds. ${SEPARATE}`, `cp_status ${rep.cp_status}, fold codes ${JSON.stringify(base.foldCodes)}`);
  }
  if (ff.failEither > 0) {
    return refuse("flatfold", `Some of the folds in ${p.name} would not lie flat. ${SEPARATE}`, `${ff.failEither} of ${ff.interiorVertices} interior vertices are not locally flat-foldable as drawn.`);
  }
  if (!(rep.ok && check.ok)) {
    return refuse("solver", `${p.name} did not produce a pattern that can be followed. ${SEPARATE}`, `solver ok=${rep.ok} foldValid=${check.ok} (cp_status ${rep.cp_status})`);
  }
  const svg = cpToSvg(rep.cp, o.paper, { cpStatus: rep.cp_status, title: `Fold crease pattern: ${o.name}, ${p.name}` });
  return { ...base, folds: true, pattern: { cp: rep.cp, fold, foldValid: check.ok, flatFold: ff, svg } };
}
