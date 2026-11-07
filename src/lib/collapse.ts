/**
 * Collapse of a crease pattern as rigid panels. Pure geometry, no rendering library.
 *
 * Every frame is a function of the pattern and a time value (`collapseFrame`). Nothing is authored.
 *
 *   - Each cp face is a rigid panel. Its corners are never moved independently: a panel's position is one
 *     rotation and one translation, composed down a spanning tree of the faces.
 *   - The spanning tree is over faces, joined by shared creases (an edge that appears in two faces).
 *     It is rooted at the face that contains the centroid of the pattern's vertices.
 *   - A hinge turns by -(target angle) x progress about its crease, where the target is M = +180,
 *     V = -180, F = 0, B = 0 (degrees). The axis is oriented so the child panel is on its left; with the
 *     sheet in the xy plane and the viewer on +z, a positive turn about that axis lifts the child toward
 *     the viewer (a valley), so M (+180) turns it the other way, away from the viewer (a mountain).
 *   - Corners are stored per face, not per cp vertex: once panels turn, two faces that share a cp vertex
 *     are only at the same place if the pattern closes. `cornerVertex` keeps the cp index so that can be measured.
 *
 * Two modes share one time value t in [0,1]:
 *   "together"  every hinge has progress t.
 *   "sequence"  hinges with a non-zero target are ordered parents-before-children (breadth first from the
 *               root); hinge r of n has progress clamp(t * n - r, 0, 1). Step k is t = k / n.
 */

export interface CollapseCp {
  vertices: [number, number][];
  creases: { from: number; to: number; fold: string }[];
  faces?: number[][];
}

export type CollapseMode = "together" | "sequence";

export interface Hinge {
  /** Index into cp.creases, or -1 when two faces share an edge that has no crease record. */
  crease: number;
  parent: number;
  child: number;
  /** Axis end points (cp vertex indices), oriented so the child face is on the left of a -> b. */
  a: number;
  b: number;
  fold: string;
  /** Target in degrees: M +180, V -180, otherwise 0. */
  target: number;
}

export interface CollapseStats {
  faces: number;
  triangles: number;
  creases: number;
  /** Faces reached from the root by the spanning tree. */
  facesInTree: number;
  components: number;
  hinges: number;
  /** Shared edges that are not hinges: they close a loop in the face graph. */
  loopEdges: number;
  /** Creases whose endpoints are an edge of exactly the expected number of faces (2, or 1 for B). */
  creasesOnSharedEdge: number;
  creasesNotOnSharedEdge: { crease: number; fold: string; faceCount: number }[];
  sharedEdgesWithoutCrease: number;
  nonPositiveTriangles: number;
  steps: number;
  rootFace: number;
  rootContainsCentroid: boolean;
}

export interface CollapseModel {
  paperMm: number;
  /** Corner positions on the flat sheet in mm, 3 floats per corner, faces concatenated. */
  flat: Float32Array;
  /** Corner -> cp vertex index. */
  cornerVertex: Int32Array;
  /** First corner of each face, and one past the last (length faces + 1). */
  faceStart: Int32Array;
  /** Triangle corner indices (fan from each face's first corner). */
  triangles: Uint32Array;
  /** Face order for transforms: parents before children. Faces outside the tree are not listed. */
  order: number[];
  parentHinge: (Hinge | null)[];
  hinges: Hinge[];
  /** The hinges with a non-zero target, in dependency order. */
  active: Hinge[];
  stats: CollapseStats;
  /** Things that did not hold. Shown on screen; none of them is silent. */
  warnings: string[];
}

export type CollapseBuild =
  | { ok: true; model: CollapseModel }
  | { ok: false; problems: string[] };

const target = (fold: string) => (fold === "M" ? 180 : fold === "V" ? -180 : 0);
const key = (p: number, q: number) => (p < q ? `${p},${q}` : `${q},${p}`);

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function buildCollapse(cp: CollapseCp | null | undefined, paperMm: number): CollapseBuild {
  const problems: string[] = [];
  if (!cp) return { ok: false, problems: ["The pattern has no crease data."] };
  if (!Number.isFinite(paperMm) || paperMm <= 0) problems.push("The paper size is missing.");
  if (!Array.isArray(cp.vertices) || cp.vertices.length === 0) problems.push("The pattern has no vertices.");
  if (!Array.isArray(cp.creases) || cp.creases.length === 0) problems.push("The pattern has no creases.");
  if (!Array.isArray(cp.faces) || cp.faces.length === 0) {
    problems.push("The pattern has no faces, so the panels that would fold are not known.");
  }
  if (problems.length) return { ok: false, problems };

  const V = cp.vertices;
  const faces = cp.faces!;
  const bad = faces.findIndex((f) => !Array.isArray(f) || f.length < 3 || f.some((v) => !Number.isInteger(v) || v < 0 || v >= V.length));
  if (bad >= 0) problems.push(`Face ${bad} is malformed, so the pattern is not drawn.`);
  const badCrease = cp.creases.findIndex(
    (c) => !Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from < 0 || c.to < 0 || c.from >= V.length || c.to >= V.length || c.from === c.to,
  );
  if (badCrease >= 0) problems.push(`Crease ${badCrease} has an end point that is not a vertex, so the pattern is not drawn.`);
  if (problems.length) return { ok: false, problems };

  const warnings: string[] = [];

  // Edge -> faces, and edge -> crease.
  const edgeFaces = new Map<string, number[]>();
  faces.forEach((f, fi) => {
    f.forEach((p, k) => {
      const kk = key(p, f[(k + 1) % f.length]);
      const list = edgeFaces.get(kk);
      if (list) list.push(fi); else edgeFaces.set(kk, [fi]);
    });
  });
  const edgeCrease = new Map<string, number>();
  cp.creases.forEach((c, i) => { if (!edgeCrease.has(key(c.from, c.to))) edgeCrease.set(key(c.from, c.to), i); });

  // Crease -> shared edge audit.
  const creasesNotOnSharedEdge: CollapseStats["creasesNotOnSharedEdge"] = [];
  cp.creases.forEach((c, i) => {
    const n = edgeFaces.get(key(c.from, c.to))?.length ?? 0;
    const want = c.fold === "B" ? 1 : 2;
    if (n !== want) creasesNotOnSharedEdge.push({ crease: i, fold: c.fold, faceCount: n });
  });
  let sharedEdgesWithoutCrease = 0;
  for (const [k, fs] of edgeFaces) if (fs.length === 2 && !edgeCrease.has(k)) sharedEdgesWithoutCrease++;

  // Root: the face containing the centroid of the vertices.
  const cx = V.reduce((s, v) => s + v[0], 0) / V.length;
  const cy = V.reduce((s, v) => s + v[1], 0) / V.length;
  let root = faces.findIndex((f) => pointInPolygon(cx, cy, f.map((i) => V[i])));
  const rootContainsCentroid = root >= 0;
  if (root < 0) {
    let best = Infinity;
    faces.forEach((f, fi) => {
      const fx = f.reduce((s, i) => s + V[i][0], 0) / f.length, fy = f.reduce((s, i) => s + V[i][1], 0) / f.length;
      const d = (fx - cx) ** 2 + (fy - cy) ** 2;
      if (d < best) { best = d; root = fi; }
    });
    warnings.push("No face contains the centroid of the pattern; the nearest face is the root.");
  }

  // Spanning tree over faces by shared edges, breadth first from the root.
  const adj: [number, string][][] = faces.map(() => []);
  for (const [k, fs] of edgeFaces) {
    if (fs.length === 2 && fs[0] !== fs[1]) { adj[fs[0]].push([fs[1], k]); adj[fs[1]].push([fs[0], k]); }
    else if (fs.length > 2) warnings.push(`An edge (${k}) belongs to ${fs.length} faces; only the first two are joined.`);
  }
  const parentHinge: (Hinge | null)[] = faces.map(() => null);
  const seen = new Uint8Array(faces.length);
  const order: number[] = [root];
  const hinges: Hinge[] = [];
  const treeEdges = new Set<string>();
  seen[root] = 1;
  for (let qi = 0; qi < order.length; qi++) {
    const f = order[qi];
    for (const [g, k] of adj[f]) {
      if (seen[g]) continue;
      seen[g] = 1;
      const [p, q] = k.split(",").map(Number);
      const ci = edgeCrease.get(k) ?? -1;
      const fold = ci >= 0 ? cp.creases[ci].fold : "F";
      // Orient the axis so the child face g is on its left.
      const gc = faces[g].reduce<[number, number]>((s, i) => [s[0] + V[i][0] / faces[g].length, s[1] + V[i][1] / faces[g].length], [0, 0]);
      const side = (V[q][0] - V[p][0]) * (gc[1] - V[p][1]) - (V[q][1] - V[p][1]) * (gc[0] - V[p][0]);
      const [a, b] = side >= 0 ? [p, q] : [q, p];
      const h: Hinge = { crease: ci, parent: f, child: g, a, b, fold, target: target(fold) };
      hinges.push(h);
      parentHinge[g] = h;
      treeEdges.add(k);
      order.push(g);
    }
  }
  const components = (() => {
    let c = 0; const s = new Uint8Array(faces.length);
    for (let i = 0; i < faces.length; i++) {
      if (s[i]) continue;
      c++; const st = [i]; s[i] = 1;
      while (st.length) { const f = st.pop()!; for (const [g] of adj[f]) if (!s[g]) { s[g] = 1; st.push(g); } }
    }
    return c;
  })();
  if (order.length < faces.length) {
    warnings.push(`${faces.length - order.length} of ${faces.length} faces are not joined to the root by a shared crease. They stay flat and are not drawn.`);
  }
  if (creasesNotOnSharedEdge.length) {
    warnings.push(`${creasesNotOnSharedEdge.length} of ${cp.creases.length} creases do not lie on an edge shared by the expected number of faces.`);
  }
  if (sharedEdgesWithoutCrease) warnings.push(`${sharedEdgesWithoutCrease} shared face edges have no crease; they are treated as flat hinges.`);
  const unknown = cp.creases.filter((c) => !["M", "V", "F", "B"].includes(c.fold)).length;
  if (unknown) warnings.push(`${unknown} creases have an assignment other than M, V, F or B; they are treated as flat.`);

  // Corners and triangles.
  const faceStart = new Int32Array(faces.length + 1);
  faces.forEach((f, i) => { faceStart[i + 1] = faceStart[i] + f.length; });
  const nCorners = faceStart[faces.length];
  const flat = new Float32Array(nCorners * 3);
  const cornerVertex = new Int32Array(nCorners);
  const tri: number[] = [];
  let nonPositiveTriangles = 0;
  faces.forEach((f, fi) => {
    f.forEach((v, k) => {
      const c = faceStart[fi] + k;
      flat[c * 3] = V[v][0] * paperMm;
      flat[c * 3 + 1] = V[v][1] * paperMm;
      cornerVertex[c] = v;
    });
    for (let k = 1; k < f.length - 1; k++) {
      tri.push(faceStart[fi], faceStart[fi] + k, faceStart[fi] + k + 1);
      const [a, b, c] = [V[f[0]], V[f[k]], V[f[k + 1]]];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0) nonPositiveTriangles++;
    }
  });
  if (nonPositiveTriangles) warnings.push(`${nonPositiveTriangles} triangles from fanning faces have no area or the wrong winding (a face is not convex).`);

  const active = hinges.filter((h) => h.target !== 0);
  const stats: CollapseStats = {
    faces: faces.length,
    triangles: tri.length / 3,
    creases: cp.creases.length,
    facesInTree: order.length,
    components,
    hinges: hinges.length,
    loopEdges: [...edgeFaces].filter(([k, fs]) => fs.length === 2 && !treeEdges.has(k)).length,
    creasesOnSharedEdge: cp.creases.length - creasesNotOnSharedEdge.length,
    creasesNotOnSharedEdge,
    sharedEdgesWithoutCrease,
    nonPositiveTriangles,
    steps: active.length,
    rootFace: root,
    rootContainsCentroid,
  };
  return {
    ok: true,
    model: {
      paperMm, flat, cornerVertex, faceStart, triangles: Uint32Array.from(tri),
      order, parentHinge, hinges, active, stats, warnings,
    },
  };
}

/** Progress of one hinge at time t. */
export function hingeProgress(model: CollapseModel, hinge: Hinge, mode: CollapseMode, t: number): number {
  const tt = Math.min(1, Math.max(0, t));
  if (mode === "together") return tt;
  const r = model.active.indexOf(hinge);
  if (r < 0) return 0;
  return Math.min(1, Math.max(0, tt * model.active.length - r));
}

/** Rigid transform: world = R p + t, R row-major 3x3. */
interface Rigid { R: number[]; t: [number, number, number] }
const IDENTITY: Rigid = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

function mul(A: number[], B: number[]): number[] {
  const C = new Array<number>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
function apply(R: number[], p: [number, number, number]): [number, number, number] {
  return [
    R[0] * p[0] + R[1] * p[1] + R[2] * p[2],
    R[3] * p[0] + R[4] * p[1] + R[5] * p[2],
    R[6] * p[0] + R[7] * p[1] + R[8] * p[2],
  ];
}

/** Rotation by `angle` radians about the line through `a` with unit direction `d` (Rodrigues). */
function axisRotation(a: [number, number, number], d: [number, number, number], angle: number): Rigid {
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
  const [x, y, z] = d;
  const R = [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
  const Ra = apply(R, a);
  return { R, t: [a[0] - Ra[0], a[1] - Ra[1], a[2] - Ra[2]] };
}

export interface CollapseFrame {
  /** Corner positions in mm, 3 per corner, same layout as `model.flat`. Faces outside the tree stay flat. */
  positions: Float32Array;
  /** One transform per face (null for faces outside the tree). */
  transforms: (Rigid | null)[];
}

/** The state of the pattern at time t. A pure function of the model, the mode and t. */
export function collapseFrame(model: CollapseModel, mode: CollapseMode, t: number): CollapseFrame {
  const { flat, faceStart, order, parentHinge } = model;
  const transforms: (Rigid | null)[] = new Array(faceStart.length - 1).fill(null);
  const positions = new Float32Array(flat.length);
  // Vertex positions in mm for the axis, taken from any corner that carries the vertex.
  const vertexPos = new Map<number, [number, number, number]>();
  for (let c = 0; c < model.cornerVertex.length; c++) {
    const v = model.cornerVertex[c];
    if (!vertexPos.has(v)) vertexPos.set(v, [flat[c * 3], flat[c * 3 + 1], 0]);
  }
  for (const f of order) {
    const h = parentHinge[f];
    let M: Rigid;
    if (!h) M = IDENTITY;
    else {
      const pa = vertexPos.get(h.a)!, pb = vertexPos.get(h.b)!;
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy);
      const p = hingeProgress(model, h, mode, t);
      const angle = (-h.target * p * Math.PI) / 180;
      const rot = axisRotation(pa, [dx / len, dy / len, 0], angle);
      const P = transforms[h.parent]!;
      const Rt = apply(P.R, rot.t);
      M = { R: mul(P.R, rot.R), t: [Rt[0] + P.t[0], Rt[1] + P.t[1], Rt[2] + P.t[2]] };
    }
    transforms[f] = M;
    for (let c = faceStart[f]; c < faceStart[f + 1]; c++) {
      const w = apply(M.R, [flat[c * 3], flat[c * 3 + 1], flat[c * 3 + 2]]);
      positions[c * 3] = w[0] + M.t[0];
      positions[c * 3 + 1] = w[1] + M.t[1];
      positions[c * 3 + 2] = w[2] + M.t[2];
    }
  }
  // Faces outside the tree keep their flat corners (and are hidden by the view).
  for (let f = 0; f < transforms.length; f++) {
    if (transforms[f]) continue;
    for (let c = faceStart[f] * 3; c < faceStart[f + 1] * 3; c++) positions[c] = flat[c];
  }
  return { positions, transforms };
}

export interface FrameMeasure {
  /** Largest change, in mm, of any distance between two corners of one face, against the flat sheet. */
  maxEdgeStretchMm: number;
  /** Largest |R^T R - I| entry over all panels: 0 means no scale or shear. */
  maxOrthonormalityError: number;
  /** Largest |det R - 1| over all panels. */
  maxDeterminantError: number;
  /** Largest gap, in mm, between the two copies of a cp vertex on a hinge (should be 0). */
  maxHingeGapMm: number;
  /** Largest gap, in mm, between copies of a cp vertex across shared edges that are not hinges (loop closure). */
  maxLoopGapMm: number;
  /** Largest gap between any two copies of one cp vertex on faces in the tree. */
  maxVertexSplitMm: number;
}

export function measureFrame(model: CollapseModel, frame: CollapseFrame): FrameMeasure {
  const { flat, faceStart, order, cornerVertex } = model;
  const positions = frame.positions;
  let stretch = 0, ortho = 0, det = 0;
  for (const f of order) {
    const R = frame.transforms[f]!.R;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dot = R[i] * R[j] + R[3 + i] * R[3 + j] + R[6 + i] * R[6 + j];
      ortho = Math.max(ortho, Math.abs(dot - (i === j ? 1 : 0)));
    }
    const d = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
    det = Math.max(det, Math.abs(d - 1));
    for (let a = faceStart[f]; a < faceStart[f + 1]; a++) {
      for (let b = a + 1; b < faceStart[f + 1]; b++) {
        const dw = Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]);
        const df = Math.hypot(flat[a * 3] - flat[b * 3], flat[a * 3 + 1] - flat[b * 3 + 1], flat[a * 3 + 2] - flat[b * 3 + 2]);
        stretch = Math.max(stretch, Math.abs(dw - df));
      }
    }
  }
  // Copies of each cp vertex.
  const copies = new Map<number, number[]>();
  const inTree = new Set(order);
  for (let f = 0; f < faceStart.length - 1; f++) {
    if (!inTree.has(f)) continue;
    for (let c = faceStart[f]; c < faceStart[f + 1]; c++) {
      const v = cornerVertex[c];
      const l = copies.get(v);
      if (l) l.push(c); else copies.set(v, [c]);
    }
  }
  const gap = (a: number, b: number) =>
    Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]);
  let split = 0;
  for (const l of copies.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) split = Math.max(split, gap(l[i], l[j]));

  // Hinge and loop gaps: corners of two faces that share an edge.
  const faceCorner = (f: number, v: number) => {
    for (let c = faceStart[f]; c < faceStart[f + 1]; c++) if (cornerVertex[c] === v) return c;
    return -1;
  };
  const hingeKey = new Set(model.hinges.map((h) => `${Math.min(h.parent, h.child)},${Math.max(h.parent, h.child)}`));
  let hingeGap = 0, loopGap = 0;
  const done = new Set<string>();
  for (const f of order) {
    for (let k = faceStart[f]; k < faceStart[f + 1]; k++) {
      const v = cornerVertex[k], w = cornerVertex[k + 1 < faceStart[f + 1] ? k + 1 : faceStart[f]];
      for (const g of order) {
        if (g === f) continue;
        const kk = `${Math.min(f, g)},${Math.max(f, g)}|${Math.min(v, w)},${Math.max(v, w)}`;
        if (done.has(kk)) continue;
        const gv = faceCorner(g, v), gw = faceCorner(g, w);
        if (gv < 0 || gw < 0) continue;
        // Is (v, w) an edge of g, i.e. consecutive corners?
        const n = faceStart[g + 1] - faceStart[g];
        const iv = gv - faceStart[g], iw = gw - faceStart[g];
        if (!(Math.abs(iv - iw) === 1 || Math.abs(iv - iw) === n - 1)) continue;
        done.add(kk);
        const dd = Math.max(gap(k, gv), gap(k + 1 < faceStart[f + 1] ? k + 1 : faceStart[f], gw));
        if (hingeKey.has(`${Math.min(f, g)},${Math.max(f, g)}`)) hingeGap = Math.max(hingeGap, dd);
        else loopGap = Math.max(loopGap, dd);
      }
    }
  }
  return {
    maxEdgeStretchMm: stretch,
    maxOrthonormalityError: ortho,
    maxDeterminantError: det,
    maxHingeGapMm: hingeGap,
    maxLoopGapMm: loopGap,
    maxVertexSplitMm: split,
  };
}

const flatCache = new WeakMap<CollapseModel, Map<number, [number, number, number]>>();

/** A cp vertex on the flat sheet, in mm. */
export function flatVertex(model: CollapseModel, v: number): [number, number, number] {
  let m = flatCache.get(model);
  if (!m) {
    m = new Map();
    for (let c = 0; c < model.cornerVertex.length; c++) {
      const u = model.cornerVertex[c];
      if (!m.has(u)) m.set(u, [model.flat[c * 3], model.flat[c * 3 + 1], 0]);
    }
    flatCache.set(model, m);
  }
  return m.get(v)!;
}

/**
 * The two end points of a hinge in a frame, in mm. The hinge axis does not move relative to its parent
 * panel, so the parent's transform places it.
 */
export function hingeSegment(
  model: CollapseModel, frame: CollapseFrame, hinge: Hinge,
): [[number, number, number], [number, number, number]] {
  const T = frame.transforms[hinge.parent]!;
  const place = (v: number): [number, number, number] => {
    const w = apply(T.R, flatVertex(model, v));
    return [w[0] + T.t[0], w[1] + T.t[1], w[2] + T.t[2]];
  };
  return [place(hinge.a), place(hinge.b)];
}
