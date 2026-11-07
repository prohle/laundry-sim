/**
 * Hollow mode (R9): a closed triangle mesh to a flat net with tabs.
 *
 * Unfold along a breadth-first spanning tree of the face adjacency graph. Tree edges are folds; every
 * other edge is cut and gets a tab on one side. Overlapping placements are detected and the unfold is
 * retried from another root, up to MAX_ATTEMPTS times, then refused with a reason.
 *
 * This module cuts by definition. It is not origami and must not be described as origami.
 * It reads nothing from the Fold pipeline.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface Mesh {
  vertices: Vec3[];
  faces: [number, number, number][];
}

/** Paper size in millimetres. */
export interface Paper {
  name: string;
  width: number;
  height: number;
}

export const A4: Paper = { name: "A4", width: 210, height: 297 };

export const MAX_ATTEMPTS = 8;
/** Free margin on every side of the paper, and the strip reserved at the bottom for the legend (mm). */
export const MARGIN_MM = 10;
export const LEGEND_MM = 24;

export interface PlacedFace {
  /** Index into mesh.faces. */
  face: number;
  /** The three vertex ids, as in mesh.faces[face]. */
  v: [number, number, number];
  /** The three 2D positions, in the same order, in millimetres. */
  p: [Vec2, Vec2, Vec2];
}

export interface NetEdge {
  /** Vertex ids, a < b. */
  a: number;
  b: number;
  /** The two faces that share it, lower index first. */
  faces: [number, number];
  kind: "fold" | "cut";
  /** For a cut edge: its number, shared by the tab and the edge it glues to. Folds have 0. */
  label: number;
}

export interface Tab {
  label: number;
  /** The face the tab is attached to (the lower-indexed of the two). */
  face: number;
  edge: [number, number];
  /** Trapezoid in millimetres: edge start, edge end, then the two outer corners. */
  polygon: [Vec2, Vec2, Vec2, Vec2];
  /** Where the number is written. */
  at: Vec2;
}

export interface Attempt {
  root: number;
  overlaps: number;
}

export interface Net {
  faces: PlacedFace[];
  edges: NetEdge[];
  tabs: Tab[];
  paper: Paper;
  root: number;
  attempts: Attempt[];
  /** Millimetres per mesh unit. */
  scale: number;
  /** Bounding box of faces and tabs, in millimetres, origin at the top-left of the usable area. */
  bbox: { width: number; height: number };
  area3d: number;
  area2d: number;
  /** |area2d - area3d * scale^2| / (area3d * scale^2). */
  areaError: number;
  overlaps: number;
}

export interface Refusal {
  stage: "mesh" | "paper" | "overlap";
  message: string;
  detail: Record<string, unknown>;
}

export type NetResult = { ok: true; net: Net } | { ok: false; refusal: Refusal };

export interface NetOptions {
  /** Override the roots tried, in order. Default: up to 8 faces spread evenly over the mesh. */
  roots?: number[];
}

// ---------------------------------------------------------------- geometry helpers

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const dist3 = (a: Vec3, b: Vec3) => len3(sub3(a, b));
function triArea3(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub3(b, a);
  const v = sub3(c, a);
  return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
}
function triArea2(p: [Vec2, Vec2, Vec2]): number {
  return 0.5 * Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]));
}

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

// ---------------------------------------------------------------- mesh validation and adjacency

interface Adjacency {
  /** edge key -> faces sharing it (sorted). */
  edgeFaces: Map<string, number[]>;
  /** face -> neighbouring faces, sorted. */
  neighbours: number[][];
}

function refuseMesh(message: string, detail: Record<string, unknown>): NetResult {
  return { ok: false, refusal: { stage: "mesh", message, detail } };
}

function validate(mesh: Mesh): { refusal: NetResult } | { adj: Adjacency } {
  const nv = mesh.vertices.length;
  const nf = mesh.faces.length;
  if (nf < 4) {
    return { refusal: refuseMesh("A closed solid needs at least four faces.", { faces: nf }) };
  }
  for (let i = 0; i < nv; i++) {
    if (mesh.vertices[i].length !== 3 || !mesh.vertices[i].every(Number.isFinite)) {
      return { refusal: refuseMesh("The mesh has a vertex that is not a finite 3D point.", { vertex: i }) };
    }
  }
  const edgeFaces = new Map<string, number[]>();
  for (let f = 0; f < nf; f++) {
    const t = mesh.faces[f];
    if (t.length !== 3 || !t.every((i) => Number.isInteger(i) && i >= 0 && i < nv)) {
      return { refusal: refuseMesh("The mesh has a face that is not three valid vertices.", { face: f }) };
    }
    if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) {
      return { refusal: refuseMesh("The mesh has a face that repeats a vertex.", { face: f }) };
    }
    const area = triArea3(mesh.vertices[t[0]], mesh.vertices[t[1]], mesh.vertices[t[2]]);
    if (!(area > 1e-12)) {
      return { refusal: refuseMesh("The mesh has a face with no area.", { face: f, area }) };
    }
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = edgeKey(a, b);
      const list = edgeFaces.get(k);
      if (list) list.push(f);
      else edgeFaces.set(k, [f]);
    }
  }
  const open: string[] = [];
  const over: string[] = [];
  for (const [k, fs] of edgeFaces) {
    if (fs.length === 1) open.push(k);
    else if (fs.length > 2) over.push(k);
  }
  if (open.length > 0) {
    return {
      refusal: refuseMesh(
        `The mesh is open: ${open.length} edge${open.length === 1 ? " belongs" : "s belong"} to one face only, so it does not enclose a volume. Close the holes and try again.`,
        { stage: "mesh", openEdges: open.length, example: open[0] },
      ),
    };
  }
  if (over.length > 0) {
    return {
      refusal: refuseMesh(
        `The mesh is not a simple solid: ${over.length} edge${over.length === 1 ? " is" : "s are"} shared by more than two faces.`,
        { nonManifoldEdges: over.length, example: over[0] },
      ),
    };
  }
  const neighbours: number[][] = Array.from({ length: nf }, () => []);
  for (const fs of edgeFaces.values()) {
    neighbours[fs[0]].push(fs[1]);
    neighbours[fs[1]].push(fs[0]);
  }
  for (const n of neighbours) n.sort((a, b) => a - b);
  // One connected piece.
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const f = queue.shift()!;
    for (const g of neighbours[f]) if (!seen.has(g)) { seen.add(g); queue.push(g); }
  }
  if (seen.size !== nf) {
    return {
      refusal: refuseMesh("The mesh is more than one piece. Hollow mode takes a single solid.", {
        reachableFaces: seen.size,
        faces: nf,
      }),
    };
  }
  return { adj: { edgeFaces, neighbours } };
}

// ---------------------------------------------------------------- unfolding

interface Unfolded {
  root: number;
  placed: PlacedFace[]; // indexed by face
  treeEdges: Set<string>;
}

/** Place the triangle (a, b, c) given 2D positions of a and b; c goes to the side opposite `away`. */
function thirdPoint(pa: Vec2, pb: Vec2, dac: number, dbc: number, away: Vec2): Vec2 {
  const ex = pb[0] - pa[0];
  const ey = pb[1] - pa[1];
  const d = Math.hypot(ex, ey);
  const ux = ex / d;
  const uy = ey / d;
  const x = (dac * dac - dbc * dbc + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, dac * dac - x * x));
  let nx = -uy;
  let ny = ux;
  // Side of `away` relative to the edge; the new point goes to the other side.
  const side = (away[0] - pa[0]) * nx + (away[1] - pa[1]) * ny;
  if (side > 0) { nx = -nx; ny = -ny; }
  return [pa[0] + ux * x + nx * h, pa[1] + uy * x + ny * h];
}

function unfold(mesh: Mesh, adj: Adjacency, root: number): Unfolded {
  const V = mesh.vertices;
  const placed: (PlacedFace | null)[] = new Array(mesh.faces.length).fill(null);
  const treeEdges = new Set<string>();

  const t0 = mesh.faces[root];
  const d01 = dist3(V[t0[0]], V[t0[1]]);
  const d02 = dist3(V[t0[0]], V[t0[2]]);
  const d12 = dist3(V[t0[1]], V[t0[2]]);
  const x = (d02 * d02 - d12 * d12 + d01 * d01) / (2 * d01);
  const h = Math.sqrt(Math.max(0, d02 * d02 - x * x));
  placed[root] = { face: root, v: [t0[0], t0[1], t0[2]], p: [[0, 0], [d01, 0], [x, h]] };

  const queue = [root];
  while (queue.length) {
    const f = queue.shift()!;
    const pf = placed[f]!;
    for (const g of adj.neighbours[f]) {
      if (placed[g]) continue;
      const tg = mesh.faces[g];
      // The shared edge: the two vertices of g that are also in f.
      const shared = tg.filter((v) => pf.v.includes(v));
      const w = tg.find((v) => !shared.includes(v))!;
      const [u, v] = shared;
      const pu = pf.p[pf.v.indexOf(u)];
      const pv = pf.p[pf.v.indexOf(v)];
      const opposite = pf.v.find((q) => q !== u && q !== v)!;
      const pw = thirdPoint(pu, pv, dist3(V[u], V[w]), dist3(V[v], V[w]), pf.p[pf.v.indexOf(opposite)]);
      placed[g] = { face: g, v: [u, v, w], p: [pu, pv, pw] };
      treeEdges.add(edgeKey(u, v));
      queue.push(g);
    }
  }
  return { root, placed: placed as PlacedFace[], treeEdges };
}

// ---------------------------------------------------------------- overlap

/**
 * Two triangles overlap when their interiors intersect. Triangles that only touch along an edge or at
 * a vertex do not. Separating-axis test over the six edge normals; `eps` is a length tolerance.
 */
export function trianglesOverlap(p: [Vec2, Vec2, Vec2], q: [Vec2, Vec2, Vec2], eps: number): boolean {
  for (const tri of [p, q]) {
    for (let i = 0; i < 3; i++) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const nx = a[1] - b[1];
      const ny = b[0] - a[0];
      const nl = Math.hypot(nx, ny);
      if (nl === 0) continue;
      const ax = nx / nl;
      const ay = ny / nl;
      let pmin = Infinity, pmax = -Infinity, qmin = Infinity, qmax = -Infinity;
      for (const c of p) { const s = c[0] * ax + c[1] * ay; if (s < pmin) pmin = s; if (s > pmax) pmax = s; }
      for (const c of q) { const s = c[0] * ax + c[1] * ay; if (s < qmin) qmin = s; if (s > qmax) qmax = s; }
      if (pmax <= qmin + eps || qmax <= pmin + eps) return false;
    }
  }
  return true;
}

export function countOverlaps(placed: PlacedFace[], eps: number): number {
  const box = placed.map((f) => ({
    x0: Math.min(f.p[0][0], f.p[1][0], f.p[2][0]),
    x1: Math.max(f.p[0][0], f.p[1][0], f.p[2][0]),
    y0: Math.min(f.p[0][1], f.p[1][1], f.p[2][1]),
    y1: Math.max(f.p[0][1], f.p[1][1], f.p[2][1]),
  }));
  let n = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (box[i].x1 < box[j].x0 || box[j].x1 < box[i].x0 || box[i].y1 < box[j].y0 || box[j].y1 < box[i].y0) continue;
      if (trianglesOverlap(placed[i].p, placed[j].p, eps)) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- tabs

function makeTab(pf: PlacedFace, a: number, b: number, label: number): Tab {
  const ia = pf.v.indexOf(a);
  const ib = pf.v.indexOf(b);
  const ic = 3 - ia - ib;
  const pa = pf.p[ia];
  const pb = pf.p[ib];
  const pc = pf.p[ic];
  const ex = pb[0] - pa[0];
  const ey = pb[1] - pa[1];
  const len = Math.hypot(ex, ey);
  const ux = ex / len;
  const uy = ey / len;
  let nx = -uy;
  let ny = ux;
  if ((pc[0] - pa[0]) * nx + (pc[1] - pa[1]) * ny > 0) { nx = -nx; ny = -ny; } // away from the face
  const depth = 0.3 * len;
  const inset = 0.3 * depth;
  const pb2: Vec2 = [pb[0] + nx * depth - ux * inset, pb[1] + ny * depth - uy * inset];
  const pa2: Vec2 = [pa[0] + nx * depth + ux * inset, pa[1] + ny * depth + uy * inset];
  return {
    label,
    face: pf.face,
    edge: [a, b],
    polygon: [pa, pb, pb2, pa2],
    at: [(pa[0] + pb[0]) / 2 + nx * depth * 0.55, (pa[1] + pb[1]) / 2 + ny * depth * 0.55],
  };
}

// ---------------------------------------------------------------- entry point

/** Spread up to MAX_ATTEMPTS distinct roots evenly over the faces. */
export function defaultRoots(faceCount: number): number[] {
  const n = Math.min(MAX_ATTEMPTS, faceCount);
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(n === 1 ? 0 : Math.round((k * (faceCount - 1)) / (n - 1)));
  return [...new Set(out)];
}

export function buildNet(mesh: Mesh, paper: Paper = A4, options: NetOptions = {}): NetResult {
  if (!(Number.isFinite(paper.width) && Number.isFinite(paper.height) && paper.width > 0 && paper.height > 0)) {
    return { ok: false, refusal: { stage: "paper", message: "The paper size must be positive.", detail: { paper } } };
  }
  const usableW = paper.width - 2 * MARGIN_MM;
  const usableH = paper.height - 2 * MARGIN_MM - LEGEND_MM;
  if (usableW <= 0 || usableH <= 0) {
    return {
      ok: false,
      refusal: {
        stage: "paper",
        message: `${paper.name} is too small for a net, a margin and a legend.`,
        detail: { usableW, usableH },
      },
    };
  }

  const checked = validate(mesh);
  if ("refusal" in checked) return checked.refusal;
  const adj = checked.adj;
  const nf = mesh.faces.length;

  const roots = (options.roots ?? defaultRoots(nf)).slice(0, MAX_ATTEMPTS);
  // Overlap tolerance: a millionth of the mesh's longest edge in mesh units, before scaling.
  let longest = 0;
  for (const k of adj.edgeFaces.keys()) {
    const [a, b] = k.split(",").map(Number);
    longest = Math.max(longest, dist3(mesh.vertices[a], mesh.vertices[b]));
  }
  const eps = longest * 1e-6;

  const attempts: Attempt[] = [];
  let chosen: Unfolded | null = null;
  let fewest = Infinity;
  for (const root of roots) {
    const u = unfold(mesh, adj, root);
    const overlaps = countOverlaps(u.placed, eps);
    attempts.push({ root, overlaps });
    fewest = Math.min(fewest, overlaps);
    if (overlaps === 0) { chosen = u; break; }
  }
  if (!chosen) {
    return {
      ok: false,
      refusal: {
        stage: "overlap",
        message: `The net overlaps itself from all ${attempts.length} starting faces tried (fewest overlapping pairs: ${fewest}). Use a simpler or rounder mesh with fewer faces.`,
        detail: { attempts },
      },
    };
  }

  // Edges: fold if in the spanning tree, otherwise cut with a number.
  const keys = [...adj.edgeFaces.keys()].sort((x, y) => {
    const [a1, b1] = x.split(",").map(Number);
    const [a2, b2] = y.split(",").map(Number);
    return a1 - a2 || b1 - b2;
  });
  const edges: NetEdge[] = [];
  let label = 0;
  for (const k of keys) {
    const [a, b] = k.split(",").map(Number);
    const fs = adj.edgeFaces.get(k)! as [number, number];
    const fold = chosen.treeEdges.has(k);
    edges.push({ a, b, faces: fs, kind: fold ? "fold" : "cut", label: fold ? 0 : ++label });
  }

  // Tabs (mesh units for now), one per cut edge, on the lower-indexed face.
  const tabsUnit = edges
    .filter((e) => e.kind === "cut")
    .map((e) => makeTab(chosen!.placed[e.faces[0]], e.a, e.b, e.label));

  // Bounding box of faces and tabs, then the largest scale that fits the usable area.
  const pts: Vec2[] = [];
  for (const f of chosen.placed) pts.push(...f.p);
  for (const t of tabsUnit) pts.push(...t.polygon);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = Math.min(usableW / w, usableH / h);

  const tx = (p: Vec2): Vec2 => [(p[0] - minX) * scale, (p[1] - minY) * scale];
  const faces: PlacedFace[] = chosen.placed.map((f) => ({
    face: f.face,
    v: f.v,
    p: [tx(f.p[0]), tx(f.p[1]), tx(f.p[2])],
  }));
  const tabs: Tab[] = tabsUnit.map((t) => ({
    ...t,
    polygon: [tx(t.polygon[0]), tx(t.polygon[1]), tx(t.polygon[2]), tx(t.polygon[3])],
    at: tx(t.at),
  }));

  let area3d = 0;
  for (const f of mesh.faces) area3d += triArea3(mesh.vertices[f[0]], mesh.vertices[f[1]], mesh.vertices[f[2]]);
  let area2d = 0;
  for (const f of faces) area2d += triArea2(f.p);
  const expected = area3d * scale * scale;

  return {
    ok: true,
    net: {
      faces,
      edges,
      tabs,
      paper,
      root: chosen.root,
      attempts,
      scale,
      bbox: { width: w * scale, height: h * scale },
      area3d,
      area2d,
      areaError: Math.abs(area2d - expected) / expected,
      overlaps: attempts[attempts.length - 1].overlaps,
    },
  };
}
