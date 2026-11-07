/**
 * Silhouette -> skeleton -> tree (task 3.1).
 *
 * Pure and deterministic: no randomness, no Date, no I/O.
 *
 * Pipeline
 *   1. Thin the mask to a 1-pixel skeleton with Zhang-Suen (iterative).
 *      Termination: at most `maxIterations` full passes (default max(width, height)),
 *      and it stops early on the first pass that deletes nothing. A pass peels at most
 *      one pixel from each side of a stroke, so max(width, height) passes is more than
 *      half the thickness of any shape that fits in the image.
 *   2. Classify skeleton pixels. Endpoints (1 neighbour), isolated pixels (0) and
 *      junctions (crossing number >= 3) are node pixels; 8-connected node pixels are
 *      merged into one node at their centroid. Branches between nodes are walked
 *      pixel by pixel and become edges carrying their pixel path length.
 *   3. Keep the largest connected component, break cycles (drop the shortest edge of
 *      each cycle, via a longest-first spanning tree), merge degree-2 nodes.
 *   4. Prune spurs: repeatedly delete the shortest leaf branch shorter than the
 *      threshold, re-merging degree-2 nodes after each deletion.
 *   5. Flap budget: repeatedly delete the shortest leaf branch until leaves <= maxLeaves.
 *   6. Normalise coordinates into [0, 1] on the longer axis of the tree's extent,
 *      keeping the aspect ratio. Edge length = Euclidean distance between endpoints.
 *
 * Known limits of Zhang-Suen: a perfectly 2-pixel-wide diagonal line can vanish, and
 * thick shapes leave short corner spurs. The spur threshold is what removes those.
 */

export interface SkeletonInput {
  /** mask[i] > 0 means foreground; row-major, length width * height. */
  mask: Uint8Array;
  width: number;
  height: number;
}

export interface SkeletonOptions {
  /** Spurs shorter than this many pixels are pruned.
   *  Default: 5% of the silhouette's larger bounding-box dimension. */
  spurThreshold?: number;
  /** Flap budget: remove shortest leaf branches until leaves <= maxLeaves. Default: no limit. */
  maxLeaves?: number;
  /** Cap on thinning passes. Default: max(width, height). */
  maxIterations?: number;
}

export interface TreeNode {
  id: number;
  x: number;
  y: number;
  degree: number;
}

export interface TreeEdge {
  from: number;
  to: number;
  length: number;
}

/** Maps tree coordinates back to image pixels: pixel = origin + coord * scale. */
export interface TreeFrame {
  originX: number;
  originY: number;
  scale: number;
}

export interface SkeletonTree {
  nodes: TreeNode[];
  edges: TreeEdge[];
  leaves: number;
  /** Added so the tree can be drawn over the photograph (requirement R2.2). */
  frame: TreeFrame;
}

// Neighbour offsets in Zhang-Suen circular order: P2..P9 = N, NE, E, SE, S, SW, W, NW.
const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
// Walk preference: 4-neighbours first, then diagonals. Fixed, so results are deterministic.
const WALK_ORDER = [0, 2, 4, 6, 1, 3, 5, 7];

/** Zhang-Suen thinning on a zero-padded (width+2) x (height+2) buffer. */
function thin(input: SkeletonInput, maxIterations: number): { buf: Uint8Array; W: number; H: number } {
  const W = input.width + 2;
  const H = input.height + 2;
  const buf = new Uint8Array(W * H);
  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      if (input.mask[y * input.width + x] > 0) buf[(y + 1) * W + x + 1] = 1;
    }
  }
  const off = DX.map((dx, i) => DY[i] * W + dx);

  const toDelete: number[] = [];
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let sub = 0; sub < 2; sub++) {
      toDelete.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!buf[i]) continue;
          const p = off.map((o) => buf[i + o]);
          const b = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) & 7]) a++;
          if (a !== 1) continue;
          // p[0]=P2 N, p[2]=P4 E, p[4]=P6 S, p[6]=P8 W
          if (sub === 0) {
            if (p[0] * p[2] * p[4] !== 0 || p[2] * p[4] * p[6] !== 0) continue;
          } else {
            if (p[0] * p[2] * p[6] !== 0 || p[0] * p[4] * p[6] !== 0) continue;
          }
          toDelete.push(i);
        }
      }
      for (const i of toDelete) buf[i] = 0;
      if (toDelete.length) changed = true;
    }
    if (!changed) break;
  }
  return { buf, W, H };
}

interface GNode {
  x: number;
  y: number;
  alive: boolean;
}
interface GEdge {
  a: number;
  b: number;
  len: number; // pixel path length (used for pruning decisions)
  alive: boolean;
}
interface Graph {
  nodes: GNode[];
  edges: GEdge[];
}

const KIND_NONE = 0;
const KIND_PATH = 1;
const KIND_NODE = 2;

function buildGraph(skel: Uint8Array, W: number, H: number): Graph {
  const off = DX.map((dx, i) => DY[i] * W + dx);
  const kind = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!skel[i]) continue;
      const p = off.map((o) => skel[i + o]);
      const count = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
      let a = 0;
      for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) & 7]) a++;
      kind[i] = count <= 1 || a >= 3 ? KIND_NODE : KIND_PATH;
    }
  }

  // Cluster 8-connected node pixels.
  const label = new Int32Array(W * H).fill(-1);
  const clusters: number[][] = [];
  for (let i = 0; i < W * H; i++) {
    if (kind[i] !== KIND_NODE || label[i] >= 0) continue;
    const id = clusters.length;
    const pixels: number[] = [];
    const stack = [i];
    label[i] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      pixels.push(cur);
      for (let k = 0; k < 8; k++) {
        const r = cur + off[k];
        if (kind[r] === KIND_NODE && label[r] < 0) {
          label[r] = id;
          stack.push(r);
        }
      }
    }
    pixels.sort((p, q) => p - q);
    clusters.push(pixels);
  }

  const g: Graph = { nodes: [], edges: [] };
  for (const pixels of clusters) {
    let sx = 0;
    let sy = 0;
    for (const p of pixels) {
      sx += p % W;
      sy += Math.floor(p / W);
    }
    g.nodes.push({ x: sx / pixels.length, y: sy / pixels.length, alive: true });
  }

  const step = (p: number, q: number) => (p % W !== q % W && Math.floor(p / W) !== Math.floor(q / W) ? Math.SQRT2 : 1);
  const visited = new Uint8Array(W * H);

  for (let c = 0; c < clusters.length; c++) {
    for (const p of clusters[c]) {
      for (const k of WALK_ORDER) {
        const q = p + off[k];
        if (kind[q] !== KIND_PATH || visited[q]) continue;
        visited[q] = 1;
        let cur = q;
        let len = step(p, q);
        let steps = 1;
        for (;;) {
          let end = -1;
          for (const m of WALK_ORDER) {
            const r = cur + off[m];
            if (kind[r] === KIND_NODE && (label[r] !== c || steps >= 3)) {
              end = label[r];
              len += step(cur, r);
              break;
            }
          }
          if (end >= 0) {
            g.edges.push({ a: c, b: end, len, alive: true });
            break;
          }
          let next = -1;
          for (const m of WALK_ORDER) {
            const r = cur + off[m];
            if (kind[r] === KIND_PATH && !visited[r]) {
              next = r;
              break;
            }
          }
          if (next < 0) {
            // Dead end without an endpoint pixel (thinning artefact): close it with a node.
            g.nodes.push({ x: cur % W, y: Math.floor(cur / W), alive: true });
            g.edges.push({ a: c, b: g.nodes.length - 1, len, alive: true });
            break;
          }
          len += step(cur, next);
          visited[next] = 1;
          cur = next;
          steps++;
        }
      }
    }
  }
  return g;
}

function find(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

/** Keep the largest component (by total path length) and a longest-first spanning tree of it. */
function makeTree(g: Graph): void {
  const n = g.nodes.length;
  if (n === 0) return;
  const parent = Array.from({ length: n }, (_, i) => i);
  for (const e of g.edges) parent[find(parent, e.a)] = find(parent, e.b);

  const weight = new Map<number, number>();
  for (const e of g.edges) weight.set(find(parent, e.a), (weight.get(find(parent, e.a)) ?? 0) + e.len);
  let best = find(parent, 0);
  let bestW = weight.get(best) ?? 0;
  for (let i = 0; i < n; i++) {
    const r = find(parent, i);
    const w = weight.get(r) ?? 0;
    if (w > bestW) {
      best = r;
      bestW = w;
    }
  }
  for (let i = 0; i < n; i++) if (find(parent, i) !== best) g.nodes[i].alive = false;
  for (const e of g.edges) if (!g.nodes[e.a].alive || !g.nodes[e.b].alive) e.alive = false;

  const order = g.edges.map((_, i) => i).filter((i) => g.edges[i].alive);
  order.sort((i, j) => g.edges[j].len - g.edges[i].len || i - j);
  const uf = Array.from({ length: n }, (_, i) => i);
  for (const i of order) {
    const e = g.edges[i];
    const ra = find(uf, e.a);
    const rb = find(uf, e.b);
    if (ra === rb) e.alive = false; // closes a cycle (or self-loop)
    else uf[ra] = rb;
  }
}

function degrees(g: Graph): number[] {
  const deg = new Array<number>(g.nodes.length).fill(0);
  for (const e of g.edges) {
    if (!e.alive) continue;
    deg[e.a]++;
    deg[e.b]++;
  }
  return deg;
}

/** Replace every degree-2 node by a single edge joining its neighbours. */
function smooth(g: Graph): void {
  for (let changed = true; changed; ) {
    changed = false;
    const deg = degrees(g);
    for (let n = 0; n < g.nodes.length; n++) {
      if (!g.nodes[n].alive || deg[n] !== 2) continue;
      const inc = g.edges.filter((e) => e.alive && (e.a === n || e.b === n));
      const [e1, e2] = inc;
      const a = e1.a === n ? e1.b : e1.a;
      const b = e2.a === n ? e2.b : e2.a;
      if (a === b) continue; // cannot happen on a tree
      e1.alive = false;
      e2.alive = false;
      g.nodes[n].alive = false;
      g.edges.push({ a, b, len: e1.len + e2.len, alive: true });
      changed = true;
      break;
    }
  }
}

function countLeaves(g: Graph): number {
  return degrees(g).filter((d, i) => d === 1 && g.nodes[i].alive).length;
}

/**
 * Delete the shortest leaf branch whose length is < limit. Returns false if none qualifies.
 * A lone segment (two leaves, nothing else) collapses to one node at its midpoint, since
 * deleting either end would leave an arbitrary choice.
 */
function removeShortestLeaf(g: Graph, limit: number): boolean {
  const live = g.edges.map((e, i) => i).filter((i) => g.edges[i].alive);
  if (live.length === 0) return false;
  if (live.length === 1) {
    const e = g.edges[live[0]];
    if (!(e.len < limit)) return false;
    const na = g.nodes[e.a];
    const nb = g.nodes[e.b];
    e.alive = false;
    nb.alive = false;
    na.x = (na.x + nb.x) / 2;
    na.y = (na.y + nb.y) / 2;
    return true;
  }
  const deg = degrees(g);
  let best = -1;
  for (const i of live) {
    const e = g.edges[i];
    if (deg[e.a] !== 1 && deg[e.b] !== 1) continue;
    if (!(e.len < limit)) continue;
    if (best < 0 || e.len < g.edges[best].len) best = i;
  }
  if (best < 0) return false;
  const e = g.edges[best];
  e.alive = false;
  g.nodes[deg[e.a] === 1 ? e.a : e.b].alive = false;
  return true;
}

export function extractTree(input: SkeletonInput, options: SkeletonOptions = {}): SkeletonTree {
  const { mask, width, height } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
    throw new RangeError("width and height must be non-negative integers");
  }
  if (mask.length !== width * height) {
    throw new RangeError(`mask length ${mask.length} does not match ${width} x ${height}`);
  }

  // Bounding box of the silhouette, for the default spur threshold.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const empty: SkeletonTree = { nodes: [], edges: [], leaves: 0, frame: { originX: 0, originY: 0, scale: 1 } };
  if (maxX < minX) return empty;

  const larger = Math.max(maxX - minX + 1, maxY - minY + 1);
  const spurThreshold = options.spurThreshold ?? 0.05 * larger;
  const maxLeaves = options.maxLeaves ?? Infinity;
  const maxIterations = options.maxIterations ?? Math.max(width, height);

  const { buf, W, H } = thin(input, maxIterations);
  const g = buildGraph(buf, W, H);
  makeTree(g);
  smooth(g);
  while (removeShortestLeaf(g, spurThreshold)) smooth(g);
  while (countLeaves(g) > maxLeaves && removeShortestLeaf(g, Infinity)) smooth(g);

  // Compact ids, convert padded buffer coordinates to image pixel-centre coordinates.
  const newId = new Map<number, number>();
  const pts: { x: number; y: number }[] = [];
  g.nodes.forEach((n, i) => {
    if (!n.alive) return;
    newId.set(i, pts.length);
    pts.push({ x: n.x - 1 + 0.5, y: n.y - 1 + 0.5 });
  });
  if (pts.length === 0) return empty;

  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const scale = Math.max(x1 - x0, y1 - y0) || 1;

  const edges: TreeEdge[] = [];
  for (const e of g.edges) {
    if (!e.alive) continue;
    const a = newId.get(e.a)!;
    const b = newId.get(e.b)!;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const length = Math.hypot((pts[to].x - pts[from].x) / scale, (pts[to].y - pts[from].y) / scale);
    edges.push({ from, to, length });
  }
  edges.sort((p, q) => p.from - q.from || p.to - q.to);

  const deg = new Array<number>(pts.length).fill(0);
  for (const e of edges) {
    deg[e.from]++;
    deg[e.to]++;
  }
  const nodes: TreeNode[] = pts.map((p, id) => ({
    id,
    x: (p.x - x0) / scale,
    y: (p.y - y0) / scale,
    degree: deg[id],
  }));
  return {
    nodes,
    edges,
    leaves: deg.filter((d) => d === 1).length,
    frame: { originX: x0, originY: y0, scale },
  };
}
