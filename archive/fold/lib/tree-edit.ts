/**
 * Pure edits on a tree (task 3.4): move a leaf, delete a limb, add a leaf. No DOM, no I/O, so the
 * same code runs in the browser and under `node --test`.
 *
 * Every edit returns a new tree or a plain-words reason it was refused. A refused edit never
 * changes anything: the caller keeps the tree it had. The result of every edit is run through
 * validateEditedTree, the same check the server applies, so the screen cannot send what the
 * server would reject.
 *
 * Coordinates are tree coordinates ([0,1] on the sheet); lengths are in the same units.
 */
import type { SkeletonTree } from "./skeleton.ts";
import { validateEditedTree } from "./tree-validate.ts";

export type EditResult = { ok: true; tree: SkeletonTree } | { ok: false; message: string };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function finish(
  nodes: { id: number; x: number; y: number }[],
  edges: { from: number; to: number; length: number }[],
  base: SkeletonTree,
): EditResult {
  const v = validateEditedTree({ nodes, edges, frame: base.frame });
  return v.ok ? { ok: true, tree: v.tree } : { ok: false, message: v.message };
}

function neighbours(tree: SkeletonTree, id: number) {
  return tree.edges.filter((e) => e.from === id || e.to === id);
}

/** Move a leaf to (x, y). Its edge length becomes the distance to the node it hangs from. */
export function moveLeaf(tree: SkeletonTree, id: number, x: number, y: number): EditResult {
  const leaf = tree.nodes.find((n) => n.id === id);
  if (!leaf || leaf.degree !== 1) return { ok: false, message: "Only the end of a limb can be moved." };
  const edge = neighbours(tree, id)[0];
  const parent = tree.nodes.find((n) => n.id === (edge.from === id ? edge.to : edge.from))!;
  if (![x, y].every(Number.isFinite)) return { ok: false, message: "That position is not on the photograph." };
  const length = dist({ x, y }, parent);
  if (!(length > 0)) return { ok: false, message: "A limb cannot have no length. Move the end away from the joint it hangs from." };
  return finish(
    tree.nodes.map((n) => (n.id === id ? { id, x, y } : { id: n.id, x: n.x, y: n.y })),
    tree.edges.map((e) => (e === edge ? { ...e, length } : e)),
    tree,
  );
}

/**
 * Delete the limb ending at a leaf: the leaf and any pass-through points (degree 2) back to the
 * nearest junction. A junction left with two links is merged away, its two lengths summed, so the
 * limb that remains keeps its full path length.
 */
export function deleteLeaf(tree: SkeletonTree, id: number): EditResult {
  const leaf = tree.nodes.find((n) => n.id === id);
  if (!leaf || leaf.degree !== 1) return { ok: false, message: "Only the end of a limb can be deleted." };
  const gone = new Set<number>([id]);
  let cur = id;
  for (;;) {
    const e = neighbours(tree, cur).find((x) => !gone.has(x.from === cur ? x.to : x.from));
    if (!e) break;
    const next = e.from === cur ? e.to : e.from;
    const nextNode = tree.nodes.find((n) => n.id === next)!;
    if (nextNode.degree !== 2) break;
    gone.add(next);
    cur = next;
  }
  let nodes = tree.nodes.filter((n) => !gone.has(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
  let edges = tree.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  // The junction the limb hung from may now be a pass-through: merge it.
  for (const n of nodes) {
    const inc = edges.filter((e) => e.from === n.id || e.to === n.id);
    const wasJunction = (tree.nodes.find((t) => t.id === n.id)?.degree ?? 0) >= 3;
    if (wasJunction && inc.length === 2) {
      const [a, b] = inc;
      const oa = a.from === n.id ? a.to : a.from;
      const ob = b.from === n.id ? b.to : b.from;
      edges = [...edges.filter((e) => e !== a && e !== b), { from: oa, to: ob, length: a.length + b.length }];
      nodes = nodes.filter((m) => m.id !== n.id);
      break;
    }
  }
  if (nodes.length < 2) return { ok: false, message: "That would leave nothing to fold. Keep at least one limb." };
  return finish(nodes, edges, tree);
}

/**
 * Add a leaf at (x, y), attached to the nearest point of the drawn skeleton. If that point is
 * partway along a link, the link is split there with a new joint, its length shared in proportion
 * to where the joint falls; if it is at a node, the leaf hangs from that node. The new link's
 * length is the distance from the joint to (x, y).
 *
 * Nearest *node* alone would be wrong: on a sparse tree every click on the body would extend
 * the nearest tip instead of adding a limb.
 */
export function addLeaf(tree: SkeletonTree, x: number, y: number): EditResult {
  if (![x, y].every(Number.isFinite)) return { ok: false, message: "That position is not on the photograph." };
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const EPS = 1e-9;
  let best: { edge: number; t: number; px: number; py: number; d: number } | null = null;
  tree.edges.forEach((e, i) => {
    const a = byId.get(e.from)!, b = byId.get(e.to)!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { edge: i, t, px, py, d };
  });
  const hit = best!;
  if (!(hit.d > 0)) return { ok: false, message: "That spot is already on the skeleton. Click a little further out." };
  const nodes = tree.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
  let edges = [...tree.edges];
  const id = Math.max(...tree.nodes.map((n) => n.id)) + 1;
  const e = tree.edges[hit.edge];
  let anchor: number;
  if (hit.t <= EPS) anchor = e.from;
  else if (hit.t >= 1 - EPS) anchor = e.to;
  else {
    anchor = id + 1;
    nodes.push({ id: anchor, x: hit.px, y: hit.py });
    edges = edges.filter((_, i) => i !== hit.edge);
    edges.push({ from: e.from, to: anchor, length: e.length * hit.t }, { from: anchor, to: e.to, length: e.length * (1 - hit.t) });
  }
  nodes.push({ id, x, y });
  edges.push({ from: anchor, to: id, length: hit.d });
  return finish(nodes, edges, tree);
}
