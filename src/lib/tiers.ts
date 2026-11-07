/**
 * The complexity ladder and the minimum-tier rule (task 3.3, requirements R3.1-R3.5).
 *
 * Pure and deterministic: no randomness, no Date, no I/O, no dependencies.
 *
 * Inputs are SkeletonTree values from src/lib/skeleton.ts. The significance of a leaf is the
 * measure skeleton.ts already computes (branch length / junction radius); extractTree records it
 * on the tree as `leafSignificance`, and it is read from there, not recomputed.
 *
 * IMPORTANT for callers: `minimumTier` and `tierReport` count the leaves of the tree they are
 * given as "the leaves the subject needs". Give them the tree after significance pruning and
 * WITHOUT a flap budget (extractTree with no `maxLeaves`). A tree already cut to 12 leaves can
 * never report that it needs more than 12, and the refusal in R3.4 would be unreachable.
 *
 * Ranking is taken once, from the full tree, and every tier keeps the top `budget` leaves of that
 * one ranking. That is what makes the tiers nested (R3.5): the top 4 are inside the top 6, and so on.
 * It also means a tier's tree can differ slightly from extractTree's own `maxLeaves` reduction,
 * which re-measures significance after every deletion.
 */
import type { SkeletonTree, TreeEdge, TreeNode } from "./skeleton.ts";

export type TierName = "easy" | "medium" | "hard" | "expert";

export interface Tier {
  tier: TierName;
  /** Maximum number of flaps (leaves). */
  budget: number;
}

/** Smallest first. Flap budgets from the design's complexity ladder. */
export const TIERS: readonly Tier[] = [
  { tier: "easy", budget: 4 },
  { tier: "medium", budget: 6 },
  { tier: "hard", budget: 8 },
  { tier: "expert", budget: 12 },
];

export const MAX_BUDGET = TIERS[TIERS.length - 1].budget;

export interface MinimumTier {
  tier: TierName | null;
  requiredLeaves: number;
  reason: string;
}

export interface TierRow {
  tier: TierName;
  budget: number;
  /** Leaves kept at this tier: min(budget, requiredLeaves). */
  leaves: number;
  /** Leaves of the full tree that this tier has to leave out. */
  dropped: number;
  /** True when the budget is at least the number of leaves the subject needs. */
  representable: boolean;
}

function leafIds(tree: SkeletonTree): number[] {
  const deg = new Map<number, number>();
  for (const n of tree.nodes) deg.set(n.id, 0);
  for (const e of tree.edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  return tree.nodes.filter((n) => deg.get(n.id) === 1).map((n) => n.id);
}

/**
 * Leaf node ids, most significant first. Equal significance is broken by lower node id, so the
 * order is total and the same on every run. Throws if a leaf has no significance value.
 */
export function rankLeaves(tree: SkeletonTree, significance: Record<number, number>): number[] {
  const leaves = leafIds(tree);
  for (const id of leaves) {
    if (!Number.isFinite(significance[id])) {
      throw new RangeError(`leaf ${id} has no significance value`);
    }
  }
  return leaves.sort((a, b) => significance[b] - significance[a] || a - b);
}

/**
 * The tree reduced to at most `budget` leaves, keeping the most significant ones.
 *
 * Each dropped leaf's branch is removed back to the nearest junction that still leads to a kept
 * leaf. A junction left with two edges is removed and its edges joined into one whose length is
 * the SUM of the two removed edge lengths (decision 2026-11-06): path length, not the chord.
 *
 * DESIGN NOTE, path versus chord: a flap consumes the length along the limb, so a splice adds
 * the lengths of the edges it removes. The straight-line distance between the surviving
 * endpoints would cut the corner (chord <= path, equal only when collinear): a limb bent through
 * an arc of angle a has chord/path = sin(a/2)/(a/2), 0.64 at a semicircle, 0 when it closes. On
 * fixtures/tuatara.jpg the curled tail is 162 px by chord against 221 px by path, 27% short.
 * Summing also keeps two tiny edges from collapsing to zero length.
 * Limit: the edge lengths that extractTree produces are themselves chords between skeleton
 * nodes (skeleton.ts step 6), so a bend INSIDE one extracted edge is still cut. Splicing no
 * longer adds to that error; it does not remove it.
 * Surviving nodes keep their ids and coordinates, so tiers can be compared by id. A tree with
 * `budget` or fewer leaves is returned unchanged (as a copy).
 */
export function treeForTier(tree: SkeletonTree, budget: number): SkeletonTree {
  if (!Number.isInteger(budget) || budget < 1) {
    throw new RangeError("budget must be a positive integer");
  }
  const ranked = rankLeaves(tree, tree.leafSignificance);
  const keep = new Set(ranked.slice(0, budget));

  const pos = new Map<number, TreeNode>(tree.nodes.map((n) => [n.id, n]));
  // neighbour -> edge length, so a splice can sum lengths.
  const adj = new Map<number, Map<number, number>>();
  for (const n of tree.nodes) adj.set(n.id, new Map());
  for (const e of tree.edges) {
    adj.get(e.from)!.set(e.to, e.length);
    adj.get(e.to)!.set(e.from, e.length);
  }

  // Strip branches that lead only to dropped leaves.
  if (ranked.length > budget) {
    const queue = ranked.filter((id) => !keep.has(id)).sort((a, b) => a - b);
    while (queue.length) {
      const id = queue.shift()!;
      for (const nb of adj.get(id)!.keys()) {
        adj.get(nb)!.delete(id);
        if (adj.get(nb)!.size === 1 && !keep.has(nb)) queue.push(nb);
      }
      adj.delete(id);
    }
  }

  // Splice out junctions left with exactly two edges (never a kept leaf: those have degree 1).
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of [...adj.keys()].sort((a, b) => a - b)) {
      const nbs = adj.get(id)!;
      if (nbs.size !== 2) continue;
      const [[a, la], [b, lb]] = [...nbs];
      adj.get(a)!.delete(id);
      adj.get(b)!.delete(id);
      // Path length: the spliced edge is the sum of the two removed edges.
      adj.get(a)!.set(b, la + lb);
      adj.get(b)!.set(a, la + lb);
      adj.delete(id);
      changed = true;
      break;
    }
  }

  const ids = [...adj.keys()].sort((a, b) => a - b);
  const edges: TreeEdge[] = [];
  for (const a of ids) {
    for (const [b, length] of adj.get(a)!) {
      if (a < b) edges.push({ from: a, to: b, length });
    }
  }
  edges.sort((p, q) => p.from - q.from || p.to - q.to);

  const nodes: TreeNode[] = ids.map((id) => ({
    id,
    x: pos.get(id)!.x,
    y: pos.get(id)!.y,
    degree: adj.get(id)!.size,
  }));
  const leafSignificance: Record<number, number> = {};
  for (const id of ids) if (adj.get(id)!.size === 1) leafSignificance[id] = tree.leafSignificance[id];

  return {
    nodes,
    edges,
    leaves: nodes.filter((n) => n.degree === 1).length,
    frame: { ...tree.frame },
    leafSignificance,
  };
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => NUMBER_WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The cheapest tier whose flap budget covers every leaf of the tree, and why.
 * `tier` is null when the subject needs more than the largest budget (12).
 */
export function minimumTier(tree: SkeletonTree): MinimumTier {
  const requiredLeaves = leafIds(tree).length;
  const fit = TIERS.find((t) => t.budget >= requiredLeaves);
  if (!fit) {
    return {
      tier: null,
      requiredLeaves,
      reason:
        `This subject needs ${requiredLeaves} flaps and the largest tier allows ${MAX_BUDGET}, ` +
        `so it cannot be folded from one square here.`,
    };
  }
  const label = cap(fit.tier);
  const smaller = TIERS[TIERS.indexOf(fit) - 1];
  const reason = smaller
    ? `${cap(word(requiredLeaves))} flaps are needed. ${cap(smaller.tier)} allows ${word(smaller.budget)}, ` +
      `so the cheapest version of this subject is ${label}, which allows ${word(fit.budget)}.`
    : `${cap(word(requiredLeaves))} flaps are needed, and ${label} allows ${word(fit.budget)}.`;
  return { tier: fit.tier, requiredLeaves, reason };
}

/** One row per tier: what it keeps, what it drops, and whether it can represent the subject. */
export function tierReport(tree: SkeletonTree): TierRow[] {
  const { requiredLeaves } = minimumTier(tree);
  return TIERS.map(({ tier, budget }) => {
    const leaves = Math.min(budget, requiredLeaves);
    return {
      tier,
      budget,
      leaves,
      dropped: requiredLeaves - leaves,
      representable: budget >= requiredLeaves,
    };
  });
}
