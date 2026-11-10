/**
 * Multi-sheet partition (task 3.21; requirements R8.1, R8.2).
 *
 * A tree with more than MAX_PART_LEAVES leaves is split at its highest-degree node (the junction)
 * into the subtrees hanging off that node. Each subtree plus the junction, as its root, is a part:
 * a valid tree on its own. A part still over the cap is split again by the same rule inside the part.
 *
 * The junction is a tab, not a limb of the subject. In a part it is a degree-1 node, so the solver
 * sees it as a flap (the tab the parts are joined at), but it is not counted in `leaves`, which
 * counts leaves of the original tree only. That is what makes R8.2 hold: the `leaves` of all parts
 * add up to the original leaf count. `flaps` is `leaves` plus the tabs, i.e. what the solver packs.
 *
 * Cap (task 3.22a, spec change 2026-11-06): the cap is on FLAPS, tab included, not on original leaves.
 * A part is split further while its `flaps` exceed MAX_PART_LEAVES, so a part with one tab holds at most
 * 11 original leaves, and every part gets a tier. A tree that is not split has no tab and keeps 12.
 *
 * Small parts (task 3.22b): a part with fewer than MIN_PART_LEAVES original leaves cannot be solved.
 * After each split, such a part is merged into the nearest sibling that shares the junction (nearest =
 * the closest root neighbour of the junction in the tree's own coordinates) provided the merged part
 * stays within the cap, repeating until every part has at least MIN_PART_LEAVES. A merged part has the
 * junction as an interior node, not a degree-1 tab, so it costs no extra flap. If no sibling can take it
 * without breaking the cap it is left alone and the solve step refuses it.
 *
 * Pure and deterministic. Ties for highest degree go to the lowest node id. Parts are ordered by
 * `leaves` descending, then by the lowest original-leaf node id.
 */
import type { SkeletonTree, TreeEdge, TreeNode } from "./skeleton.ts";

export const MAX_PART_LEAVES = 12;
/** A part with fewer original leaves than this cannot be solved on its own. */
export const MIN_PART_LEAVES = 3;

export interface Part {
  /** "Part 1", "Part 2", ... in order. */
  name: string;
  /** A valid tree: the subtree with the junction(s) as degree-1 root(s). Node ids are the original ids. */
  tree: SkeletonTree;
  /** Leaves of the original tree in this part (tabs excluded). */
  leaves: number;
  /** Leaves the solver sees: `leaves` plus tabs. */
  flaps: number;
  /** Junction node ids that are in this part as tabs. */
  tabs: number[];
}

export interface Partition {
  parts: Part[];
  /** Every junction used to split, in the order the splits happened. */
  junctions: number[];
  /** Leaves of the tree that was partitioned. */
  totalLeaves: number;
}

type Adj = Map<number, Map<number, number>>;

function adjacency(tree: SkeletonTree): Adj {
  const adj: Adj = new Map();
  for (const n of tree.nodes) adj.set(n.id, new Map());
  for (const e of tree.edges) {
    adj.get(e.from)!.set(e.to, e.length);
    adj.get(e.to)!.set(e.from, e.length);
  }
  return adj;
}

/** Component of `start` in `adj` with `without` removed. */
function reach(adj: Adj, start: number, without: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const v = stack.pop()!;
    for (const w of adj.get(v)!.keys()) {
      if (w === without || seen.has(w)) continue;
      seen.add(w);
      stack.push(w);
    }
  }
  return seen;
}

function subTree(src: SkeletonTree, adj: Adj, ids: Set<number>): SkeletonTree {
  const sorted = [...ids].sort((a, b) => a - b);
  const pos = new Map<number, TreeNode>(src.nodes.map((n) => [n.id, n]));
  const edges: TreeEdge[] = [];
  for (const a of sorted) for (const [b, length] of adj.get(a)!) if (a < b && ids.has(b)) edges.push({ from: a, to: b, length });
  edges.sort((p, q) => p.from - q.from || p.to - q.to);
  const deg = new Map<number, number>(sorted.map((id) => [id, 0]));
  for (const e of edges) {
    deg.set(e.from, deg.get(e.from)! + 1);
    deg.set(e.to, deg.get(e.to)! + 1);
  }
  const nodes: TreeNode[] = sorted.map((id) => ({ id, x: pos.get(id)!.x, y: pos.get(id)!.y, degree: deg.get(id)! }));
  const leafSignificance: Record<number, number> = {};
  for (const id of sorted) if (deg.get(id) === 1 && Number.isFinite(src.leafSignificance[id])) leafSignificance[id] = src.leafSignificance[id];
  return { nodes, edges, leaves: nodes.filter((n) => n.degree === 1).length, frame: { ...src.frame }, leafSignificance };
}

function leafNodes(t: SkeletonTree): number[] {
  return t.nodes.filter((n) => n.degree === 1).map((n) => n.id);
}

interface Group { roots: number[]; ids: Set<number>; real: number }

/** Leaves of the part made of `ids` plus the junction, as the solver sees them. */
function flapsOf(ids: Set<number>, adj: Adj, j: number): number {
  const all = new Set(ids);
  all.add(j);
  let n = 0;
  for (const id of all) {
    let d = 0;
    for (const w of adj.get(id)!.keys()) if (all.has(w)) d++;
    if (d === 1) n++;
  }
  return n;
}

/** Merge every group with fewer than MIN_PART_LEAVES into its nearest sibling that still fits the cap. */
function mergeSmall(groups: Group[], pos: Map<number, TreeNode>, cap: number): Group[] {
  const gs = groups.map((g) => ({ roots: [...g.roots], ids: new Set(g.ids), real: g.real }));
  const dist = (a: Group, b: Group) => {
    let d = Infinity;
    for (const p of a.roots) for (const q of b.roots) d = Math.min(d, Math.hypot(pos.get(p)!.x - pos.get(q)!.x, pos.get(p)!.y - pos.get(q)!.y));
    return d;
  };
  for (;;) {
    const small = gs.filter((g) => g.real < MIN_PART_LEAVES).sort((a, b) => a.real - b.real || a.roots[0] - b.roots[0]);
    let did = false;
    for (const s of small) {
      // Merged flaps: its leaves plus the other's, with the junction interior (no tab) when 2+ children join.
      const fits = gs.filter((g) => g !== s && g.real + s.real <= cap);
      if (fits.length === 0) continue;
      fits.sort((a, b) => dist(s, a) - dist(s, b) || a.roots[0] - b.roots[0]);
      const into = fits[0];
      into.roots.push(...s.roots);
      for (const id of s.ids) into.ids.add(id);
      into.real += s.real;
      gs.splice(gs.indexOf(s), 1);
      did = true;
      break;
    }
    if (!did) break;
  }
  return gs;
}

/**
 * Partition `tree`. A tree already within the cap comes back as one part with no junction.
 * `maxLeaves` is a parameter for tests only.
 */
export function partitionTree(tree: SkeletonTree, maxLeaves = MAX_PART_LEAVES): Partition {
  const totalLeaves = leafNodes(tree).length;
  const junctions: number[] = [];
  const done: { tree: SkeletonTree; tabs: Set<number> }[] = [];

  const work: { tree: SkeletonTree; tabs: Set<number> }[] = [{ tree, tabs: new Set() }];
  while (work.length) {
    const cur = work.shift()!;
    const real = leafNodes(cur.tree).filter((id) => !cur.tabs.has(id));
    // The cap counts flaps as the solver sees them (tabs included). An unsplit tree has no tabs.
    if (cur.tree.leaves <= maxLeaves) {
      if (real.length > 0) done.push(cur);
      continue;
    }
    const adj = adjacency(cur.tree);
    let j = -1, best = 0;
    for (const n of [...cur.tree.nodes].sort((a, b) => a.id - b.id)) {
      const d = adj.get(n.id)!.size;
      if (d > best) { best = d; j = n.id; }
    }
    if (best < 3) throw new RangeError("cannot split a tree with no node of degree 3 or more");
    junctions.push(j);
    const pos = new Map(cur.tree.nodes.map((n) => [n.id, n]));
    const isReal = (id: number) => adj.get(id)!.size === 1 && !cur.tabs.has(id);
    let groups: Group[] = [...adj.get(j)!.keys()].sort((a, b) => a - b).map((nb) => {
      const ids = reach(adj, nb, j);
      return { roots: [nb], ids, real: [...ids].filter(isReal).length };
    }).filter((g) => g.real > 0);
    // A subtree with no original leaf (a bare tab from an earlier split) is dropped, as before.
    const merged = mergeSmall(groups, pos, maxLeaves);
    // Merging must make progress: a part as large as the tree being split would loop.
    const progress = merged.every((g) => flapsOf(g.ids, adj, j) < cur.tree.leaves);
    groups = progress ? merged : groups;
    for (const g of groups) {
      const ids = new Set(g.ids);
      ids.add(j);
      const sub = subTree(cur.tree, adj, ids);
      const tabs = new Set([...cur.tabs].filter((t) => ids.has(t)));
      tabs.add(j);
      work.push({ tree: sub, tabs });
    }
  }

  const rows = done.map((d) => {
    const leaves = leafNodes(d.tree).filter((id) => !d.tabs.has(id));
    return { ...d, leaves: leaves.length, firstLeaf: Math.min(...leaves) };
  });
  rows.sort((a, b) => b.leaves - a.leaves || a.firstLeaf - b.firstLeaf);
  const parts: Part[] = rows.map((r, i) => ({
    name: `Part ${i + 1}`,
    tree: r.tree,
    leaves: r.leaves,
    flaps: r.tree.leaves,
    tabs: [...r.tabs].sort((a, b) => a - b),
  }));
  return { parts, junctions, totalLeaves };
}
