/**
 * Merge sibling leaves that form a fork (task 3.25; the toe problem).
 *
 * A foot that splits into toes, or a tarsus fork, leaves two or more leaf children on one parent
 * pointing almost the same way. Each is a branch of the skeleton but they are one flap of paper, so
 * they inflate the leaf count (and so the minimum tier).
 *
 * Rule: for each node, take its leaf children. Seen from the parent, a leaf's direction is the angle
 * of parent -> leaf. Leaves are grouped so that every pair in a group is less than `maxAngleDeg`
 * apart (complete linkage, not chaining: a fan spread over 60 degrees is never one group). A group of
 * two or more becomes one leaf: the one with the longest edge is kept, at its own tip, and the others
 * are dropped. Only leaf children of the same parent are compared; leaves on different parents, and
 * non-leaf children, are never touched.
 *
 * If the parent is left with degree 2 it is spliced out (its two edges become one, the chord between
 * the remaining endpoints, the same as extractTree's own smoothing). Node ids are compacted afterwards. Pure; input not mutated.
 */
import type { SkeletonTree, TreeEdge, TreeNode } from "./skeleton.ts";

export const FORK_ANGLE_DEG = 25;

export interface ForkMerge {
  parent: number;
  kept: number;
  dropped: number[];
  /** Largest pairwise angle in the group, degrees. */
  spreadDeg: number;
}

export interface ForkResult {
  tree: SkeletonTree;
  merges: ForkMerge[];
}

const TAU = Math.PI * 2;

/** Groups of indices into `angles` (radians), every pair in a group closer than `limit`, circular. */
function groupAngles(angles: number[], limit: number): number[][] {
  const n = angles.length;
  const order = angles.map((_, i) => i).sort((a, b) => angles[a] - angles[b]);
  // Start the sweep after the largest gap so a group straddling +-pi is not split.
  let start = 0, bestGap = -1;
  for (let k = 0; k < n; k++) {
    const gap = (angles[order[(k + 1) % n]] - angles[order[k]] + TAU) % TAU;
    if (gap > bestGap) { bestGap = gap; start = (k + 1) % n; }
  }
  const seq = Array.from({ length: n }, (_, k) => order[(start + k) % n]);
  const groups: number[][] = [];
  let cur: number[] = [];
  let a0 = 0;
  for (const i of seq) {
    const rel = cur.length ? (angles[i] - a0 + TAU) % TAU : 0;
    if (cur.length && rel < limit) cur.push(i);
    else {
      if (cur.length) groups.push(cur);
      cur = [i];
      a0 = angles[i];
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function mergeForks(tree: SkeletonTree, maxAngleDeg = FORK_ANGLE_DEG): ForkResult {
  if (!(maxAngleDeg > 0) || tree.nodes.length < 3) return { tree, merges: [] };
  const pos = new Map<number, TreeNode>(tree.nodes.map((n) => [n.id, n]));
  const adj = new Map<number, Map<number, number>>(tree.nodes.map((n) => [n.id, new Map()]));
  for (const e of tree.edges) {
    adj.get(e.from)!.set(e.to, e.length);
    adj.get(e.to)!.set(e.from, e.length);
  }
  const limit = (maxAngleDeg * Math.PI) / 180;
  const merges: ForkMerge[] = [];
  const removed = new Set<number>();

  for (const p of [...tree.nodes].sort((a, b) => a.id - b.id)) {
    if (removed.has(p.id)) continue;
    const nbrs = adj.get(p.id)!;
    if (nbrs.size < 3) continue; // a parent with two leaves and nothing else is a bare segment, not a fork on a limb
    const leaves = [...nbrs.keys()].filter((q) => adj.get(q)!.size === 1).sort((a, b) => a - b);
    if (leaves.length < 2) continue;
    const ang = leaves.map((q) => Math.atan2(pos.get(q)!.y - p.y, pos.get(q)!.x - p.x));
    for (const g of groupAngles(ang, limit)) {
      if (g.length < 2) continue;
      const ids = g.map((i) => leaves[i]);
      // Longest edge wins; ties to the lowest id.
      const kept = [...ids].sort((a, b) => nbrs.get(b)! - nbrs.get(a)! || a - b)[0];
      let spread = 0;
      for (const i of g) for (const j of g) {
        const d = Math.abs(ang[i] - ang[j]);
        spread = Math.max(spread, Math.min(d, TAU - d));
      }
      const dropped = ids.filter((q) => q !== kept);
      for (const q of dropped) { nbrs.delete(q); adj.delete(q); removed.add(q); }
      merges.push({ parent: p.id, kept, dropped, spreadDeg: (spread * 180) / Math.PI });
    }
  }
  if (merges.length === 0) return { tree, merges };

  // Splice out parents left with degree 2.
  for (const m of merges) {
    const nb = adj.get(m.parent);
    if (!nb || nb.size !== 2) continue;
    const [a, b] = [...nb.keys()];
    // Chord, not path: extractTree's edges are Euclidean (its tests assert it), and so is the spliced edge.
    const len = Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y);
    adj.get(a)!.delete(m.parent);
    adj.get(b)!.delete(m.parent);
    adj.get(a)!.set(b, len);
    adj.get(b)!.set(a, len);
    adj.delete(m.parent);
    removed.add(m.parent);
  }

  // Rebuild with compact ids in the original order.
  const keep = tree.nodes.filter((n) => !removed.has(n.id)).sort((a, b) => a.id - b.id);
  const newId = new Map<number, number>(keep.map((n, i) => [n.id, i]));
  const edges: TreeEdge[] = [];
  for (const [a, nb] of adj) for (const [b, length] of nb) {
    if (a < b) {
      const f = newId.get(a)!, t = newId.get(b)!;
      edges.push({ from: Math.min(f, t), to: Math.max(f, t), length });
    }
  }
  edges.sort((p, q) => p.from - q.from || p.to - q.to);
  const nodes: TreeNode[] = keep.map((n) => ({ id: newId.get(n.id)!, x: n.x, y: n.y, degree: adj.get(n.id)!.size }));
  const leafSignificance: Record<number, number> = {};
  for (const n of keep) if (adj.get(n.id)!.size === 1 && Number.isFinite(tree.leafSignificance[n.id])) leafSignificance[newId.get(n.id)!] = tree.leafSignificance[n.id];
  // `merges` carries the ids of the tree that was passed in, not the compacted ones.
  return {
    tree: { nodes, edges, leaves: nodes.filter((n) => n.degree === 1).length, frame: { ...tree.frame }, leafSignificance },
    merges,
  };
}
