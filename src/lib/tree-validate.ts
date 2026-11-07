/**
 * Validation of a tree sent by the client (task 3.4). The server never trusts the numbers it is
 * given: it checks them, recomputes degree and leaf count, and returns a clean SkeletonTree.
 *
 * Rules: at least two nodes; unique integer ids; every coordinate finite and inside [0,1]; every
 * edge joins two distinct known nodes with a finite positive length; edges == nodes - 1; the graph
 * is connected (with n-1 edges that also makes it acyclic); the frame is finite with scale > 0.
 *
 * Messages are plain words for the person editing the tree.
 */
import type { SkeletonTree } from "./skeleton.ts";

export const MAX_EDITED_NODES = 200;

export type TreeValidation = { ok: true; tree: SkeletonTree } | { ok: false; message: string };

const bad = (message: string): TreeValidation => ({ ok: false, message });
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateEditedTree(input: unknown): TreeValidation {
  if (!isObj(input)) return bad("The tree is missing or is not an object.");
  const { nodes, edges, frame } = input;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return bad("The tree needs a list of nodes and a list of edges.");
  if (nodes.length < 2) return bad("A tree needs at least two points.");
  if (nodes.length > MAX_EDITED_NODES) return bad(`A tree can have at most ${MAX_EDITED_NODES} points.`);

  const ids = new Set<number>();
  const outNodes: { id: number; x: number; y: number }[] = [];
  for (const n of nodes) {
    if (!isObj(n) || !Number.isInteger(n.id) || !isNum(n.x) || !isNum(n.y)) {
      return bad("Every point needs a whole-number id and finite x and y.");
    }
    const id = n.id as number;
    if (ids.has(id)) return bad(`Two points share the id ${id}.`);
    ids.add(id);
    if ((n.x as number) < 0 || (n.x as number) > 1 || (n.y as number) < 0 || (n.y as number) > 1) {
      return bad("A point lies outside the sheet. Keep every point inside the photograph.");
    }
    outNodes.push({ id, x: n.x as number, y: n.y as number });
  }

  if (edges.length !== nodes.length - 1) {
    return bad(
      `A tree with ${nodes.length} points has ${nodes.length - 1} links; this one has ${edges.length}. ` +
        "It has a loop or a gap.",
    );
  }
  const adj = new Map<number, number[]>(outNodes.map((n) => [n.id, []]));
  const seenPair = new Set<string>();
  const outEdges: { from: number; to: number; length: number }[] = [];
  for (const e of edges) {
    if (!isObj(e) || !Number.isInteger(e.from) || !Number.isInteger(e.to) || !isNum(e.length)) {
      return bad("Every link needs two point ids and a finite length.");
    }
    const from = e.from as number, to = e.to as number, length = e.length as number;
    if (!ids.has(from) || !ids.has(to)) return bad("A link joins a point that does not exist.");
    if (from === to) return bad("A link joins a point to itself.");
    if (!(length > 0)) return bad("Every link needs a length greater than zero.");
    const key = from < to ? `${from}-${to}` : `${to}-${from}`;
    if (seenPair.has(key)) return bad("Two links join the same pair of points.");
    seenPair.add(key);
    adj.get(from)!.push(to);
    adj.get(to)!.push(from);
    outEdges.push({ from, to, length });
  }

  const start = outNodes[0].id;
  const reached = new Set<number>([start]);
  const stack = [start];
  while (stack.length) for (const m of adj.get(stack.pop()!)!) if (!reached.has(m)) (reached.add(m), stack.push(m));
  if (reached.size !== outNodes.length) return bad("The tree is in separate pieces. Every point must be linked to the rest.");

  if (!isObj(frame) || !isNum(frame.originX) || !isNum(frame.originY) || !isNum(frame.scale) || !(frame.scale > 0)) {
    return bad("The tree needs the frame that maps it back onto the photograph.");
  }

  const tree: SkeletonTree = {
    nodes: outNodes.map((n) => ({ ...n, degree: adj.get(n.id)!.length })),
    edges: outEdges,
    leaves: outNodes.filter((n) => adj.get(n.id)!.length === 1).length,
    frame: { originX: frame.originX as number, originY: frame.originY as number, scale: frame.scale as number },
    // An edited tree carries no measured significance: the user decided what is a limb.
    leafSignificance: {},
  };
  return { ok: true, tree };
}
