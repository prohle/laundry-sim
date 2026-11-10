/**
 * Contract sub-minimum edges (task 3.7).
 *
 * treemaker-core reports `edges_too_short` for any edge whose length is below 0.01 in tree units
 * (the same units extractTree produces: longer axis = 1) and builds no usable pattern. This runs
 * on the tree before the solver sees it and removes every edge shorter than `threshold`
 * (default 0.012, a margin over the crate's 0.01).
 *
 * Rules, applied shortest edge first (ties by lower node ids), repeated until none is left:
 *   - Internal edge: its two nodes merge. The survivor is the node of higher degree; on a tie,
 *     the node whose longest other edge is longer; then the lower id. It keeps its id and
 *     position. The other node's edges are re-attached to it with their lengths unchanged, so
 *     the contracted length is simply lost (at most `threshold` per edge). In a tree the two
 *     nodes share no neighbour, so no duplicate edge or cycle can appear.
 *   - Leaf edge: the leaf is dropped, and the drop is reported. A limb is never contracted into
 *     its parent silently, and a degenerate edge is never left behind. Dropping a leaf lowers
 *     the flap count, so the caller must say so (the minimum tier depends on it).
 *   - A tree that would be left with fewer than two nodes is refused with an Error.
 *
 * The input is not modified. Nodes keep their ids; `degree`, `leaves` and `leafSignificance`
 * are recomputed (a parent turned into a leaf by a drop gets significance 0).
 */
import type { SkeletonTree, TreeEdge, TreeNode } from "./skeleton.ts";

export const DEFAULT_CONTRACT_THRESHOLD = 0.012;

export interface ContractedEdge {
  /** Node that was merged away. */
  removed: number;
  /** Node it was merged into; the survivor keeps its position. */
  kept: number;
  length: number;
}

export interface DroppedLeaf {
  leaf: number;
  /** The node it hung from. */
  parent: number;
  length: number;
  /** The leaf's significance, when the tree carried one. */
  significance: number | null;
}

export interface ContractResult {
  tree: SkeletonTree;
  threshold: number;
  contracted: ContractedEdge[];
  dropped: DroppedLeaf[];
}

export function contractShortEdges(input: SkeletonTree, threshold = DEFAULT_CONTRACT_THRESHOLD): ContractResult {
  if (!(threshold > 0)) throw new RangeError("threshold must be positive");
  if (input.edges.length !== input.nodes.length - 1) {
    throw new Error(`not a tree: ${input.nodes.length} nodes, ${input.edges.length} edges`);
  }

  const nodes = new Map<number, TreeNode>(input.nodes.map((n) => [n.id, { ...n }]));
  // Edge set keyed by node pair; adjacency holds neighbour -> length.
  const adj = new Map<number, Map<number, number>>();
  for (const n of input.nodes) adj.set(n.id, new Map());
  for (const e of input.edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) throw new Error(`edge ${e.from}-${e.to} references an unknown node`);
    if (adj.get(e.from)!.has(e.to)) throw new Error(`duplicate edge ${e.from}-${e.to}`);
    adj.get(e.from)!.set(e.to, e.length);
    adj.get(e.to)!.set(e.from, e.length);
  }
  const significance = new Map<number, number>(
    Object.entries(input.leafSignificance ?? {}).map(([k, val]) => [Number(k), val]),
  );

  const contracted: ContractedEdge[] = [];
  const dropped: DroppedLeaf[] = [];

  for (;;) {
    let best: { a: number; b: number; length: number } | null = null;
    for (const [a, nbs] of adj) {
      for (const [b, length] of nbs) {
        if (a >= b || !(length < threshold)) continue;
        if (!best || length < best.length || (length === best.length && (a < best.a || (a === best.a && b < best.b)))) {
          best = { a, b, length };
        }
      }
    }
    if (!best) break;
    const { a, b, length } = best;
    const da = adj.get(a)!.size;
    const db = adj.get(b)!.size;

    if (da === 1 || db === 1) {
      if (da === 1 && db === 1) {
        throw new Error(`the whole tree is one edge of length ${length.toFixed(4)}, below ${threshold}: nothing left to fold`);
      }
      const leaf = da === 1 ? a : b;
      const parent = leaf === a ? b : a;
      dropped.push({ leaf, parent, length, significance: significance.get(leaf) ?? null });
      adj.get(parent)!.delete(leaf);
      adj.delete(leaf);
      nodes.delete(leaf);
      significance.delete(leaf);
      continue;
    }

    const longestOther = (n: number, other: number) =>
      Math.max(0, ...[...adj.get(n)!].filter(([m]) => m !== other).map(([, l]) => l));
    let kept: number;
    if (da !== db) kept = da > db ? a : b;
    else {
      const la = longestOther(a, b);
      const lb = longestOther(b, a);
      kept = la !== lb ? (la > lb ? a : b) : Math.min(a, b);
    }
    const removed = kept === a ? b : a;
    adj.get(kept)!.delete(removed);
    for (const [m, l] of adj.get(removed)!) {
      if (m === kept) continue;
      adj.get(m)!.delete(removed);
      adj.get(m)!.set(kept, l);
      adj.get(kept)!.set(m, l);
    }
    adj.delete(removed);
    nodes.delete(removed);
    contracted.push({ removed, kept, length });
  }

  if (nodes.size < 2) throw new Error("contraction left fewer than two nodes: nothing left to fold");

  const edges: TreeEdge[] = [];
  for (const [a, nbs] of adj) for (const [b, length] of nbs) if (a < b) edges.push({ from: a, to: b, length });
  edges.sort((p, q) => p.from - q.from || p.to - q.to);
  if (edges.length !== nodes.size - 1) throw new Error("internal error: contraction did not leave a tree");

  // Connectivity: a walk from any node must reach all of them.
  const first = nodes.keys().next().value as number;
  const seen = new Set<number>([first]);
  const stack = [first];
  while (stack.length) for (const m of adj.get(stack.pop()!)!.keys()) if (!seen.has(m)) (seen.add(m), stack.push(m));
  if (seen.size !== nodes.size) throw new Error("internal error: contraction disconnected the tree");

  const outNodes = [...nodes.values()]
    .map((n) => ({ ...n, degree: adj.get(n.id)!.size }))
    .sort((p, q) => p.id - q.id);
  const leafSignificance: Record<number, number> = {};
  // A parent left as a leaf by a drop was never measured as one; 0 ranks it last (rankLeaves
  // throws on a missing value). Only when the input carried significance at all.
  const measured = significance.size > 0 || dropped.some((d) => d.significance !== null);
  for (const n of outNodes) {
    if (n.degree === 1 && measured) leafSignificance[n.id] = significance.get(n.id) ?? 0;
  }

  return {
    tree: {
      nodes: outNodes,
      edges,
      leaves: outNodes.filter((n) => n.degree === 1).length,
      frame: { ...input.frame },
      leafSignificance,
    },
    threshold,
    contracted,
    dropped,
  };
}
