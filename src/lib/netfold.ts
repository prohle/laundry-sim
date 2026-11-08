/**
 * Hollow mode (R9.6): the animation of a net folding into its solid.
 *
 * A net is a spanning tree of faces, so it has no loops: each face is a rigid panel turned about the edge it
 * shares with its parent, and the turns compose down the tree. Nothing stretches. If the final frame closes
 * the solid, the net is right; the gap at the two ends of every cut edge is the test.
 *
 * Reads a Net and the Mesh it came from. It changes neither. Browser-safe: no node imports, and the data
 * type is plain JSON so the server can hand it to the screen.
 */
import type { Mesh, Net, Vec2, Vec3 } from "./net.ts";

export interface NetFoldFace {
  /** Index into mesh.faces. */
  face: number;
  /** Parent face in the spanning tree, or -1 for the root. */
  parent: number;
  /** Position of the parent in `NetFold.faces` (always smaller than this face's own position), or -1. */
  parentSlot: number;
  /** Mesh vertex ids and their flat 2D positions in millimetres, as in the net. */
  v: [number, number, number];
  p: [Vec2, Vec2, Vec2];
  /** The shared edge with the parent, in the flat net (millimetres). Null for the root. */
  hinge: [Vec2, Vec2] | null;
  /** Interior dihedral angle at that edge in degrees (180 is coplanar). Null for the root. */
  dihedralDeg: number | null;
  /** Turn about the hinge at t = 1, degrees, signed: 180 minus the dihedral, towards the side the solid is on. */
  angleDeg: number;
}

export interface NetFoldCut {
  label: number;
  a: number;
  b: number;
  /** The two faces whose copies of the edge must meet. */
  faces: [number, number];
}

export interface NetFold {
  root: number;
  /** Parents before children. */
  faces: NetFoldFace[];
  cuts: NetFoldCut[];
  /** +1, or -1 when every turn was reversed so the printed side of the sheet ends up outside the solid. */
  flip: 1 | -1;
}

/** A rigid motion x -> R x + o, R row-major 3x3. */
export interface Rigid {
  R: Float64Array;
  o: Float64Array;
}

export interface NetFoldFrame {
  /** 9 numbers per face (three corners), in `NetFold.faces` order. */
  positions: Float64Array;
  transforms: Rigid[];
}

const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const cross2 = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export type NetFoldBuild = { ok: true; fold: NetFold } | { ok: false; message: string };

/**
 * Parents come from the net's own spanning tree (edges that are not cut), walked breadth-first from the net's
 * root. The turn direction is read from the mesh: the child's far vertex must end on the same side of its
 * parent's plane as it is in the mesh, so the result does not depend on how the mesh was wound.
 */
export function buildNetFold(net: Net, mesh: Mesh): NetFoldBuild {
  const byFace = new Map(net.faces.map((f) => [f.face, f]));
  const treeNeighbours = new Map<number, { other: number; a: number; b: number; dihedral: number }[]>();
  for (const f of net.faces) treeNeighbours.set(f.face, []);
  for (const e of net.edges) {
    if (e.kind === "cut") continue;
    treeNeighbours.get(e.faces[0])!.push({ other: e.faces[1], a: e.a, b: e.b, dihedral: e.dihedral });
    treeNeighbours.get(e.faces[1])!.push({ other: e.faces[0], a: e.a, b: e.b, dihedral: e.dihedral });
  }

  const slot = new Map<number, number>();
  const out: NetFoldFace[] = [];
  const root = byFace.get(net.root);
  if (!root) return { ok: false, message: "The net's root face is not among its faces." };
  slot.set(root.face, 0);
  out.push({ face: root.face, parent: -1, parentSlot: -1, v: root.v, p: root.p, hinge: null, dihedralDeg: null, angleDeg: 0 });

  for (let head = 0; head < out.length; head++) {
    const par = out[head];
    for (const nb of treeNeighbours.get(par.face)!) {
      if (slot.has(nb.other)) continue;
      const ch = byFace.get(nb.other)!;
      const pos = (f: { v: [number, number, number]; p: [Vec2, Vec2, Vec2] }, id: number) => f.p[f.v.indexOf(id)];
      const A = pos(par, nb.a);
      const B = pos(par, nb.b);
      const parOpp = par.v.find((q) => q !== nb.a && q !== nb.b)!;
      const chOpp = ch.v.find((q) => q !== nb.a && q !== nb.b)!;

      // Which way the child must turn. In the mesh, which side of the parent's plane is the child's far vertex?
      const V = mesh.vertices;
      const N = cross3(sub3(V[par.v[1]], V[par.v[0]]), sub3(V[par.v[2]], V[par.v[0]]));
      const h = dot3(sub3(V[chOpp], V[nb.a]), N);
      // The parent's 2D orientation says whether the net frame's +z is along N or against it.
      const s = cross2(sub2(par.p[1], par.p[0]), sub2(par.p[2], par.p[0])) >= 0 ? 1 : -1;
      const wantUp = h * s >= 0 ? 1 : -1;
      // The child's flat direction away from the hinge, perpendicular to it (away from the parent's far vertex).
      const e = sub2(B, A);
      const el = Math.hypot(e[0], e[1]);
      let c: Vec2 = [-e[1] / el, e[0] / el];
      const pw = sub2(pos(par, parOpp), A);
      if (c[0] * pw[0] + c[1] * pw[1] > 0) c = [-c[0], -c[1]];
      // Rotating by +alpha about e takes c towards sign(cross2(e, c)) * z.
      const sign = wantUp * (cross2(e, c) >= 0 ? 1 : -1);

      slot.set(ch.face, out.length);
      out.push({
        face: ch.face, parent: par.face, parentSlot: slot.get(par.face)!, v: ch.v, p: ch.p, hinge: [A, B],
        dihedralDeg: nb.dihedral, angleDeg: sign * (180 - nb.dihedral),
      });
    }
  }
  if (out.length !== net.faces.length) {
    return { ok: false, message: `The spanning tree reaches ${out.length} of ${net.faces.length} faces.` };
  }

  const cuts: NetFoldCut[] = net.edges.filter((e) => e.kind === "cut").map((e) => ({ label: e.label, a: e.a, b: e.b, faces: e.faces }));
  let fold: NetFold = { root: net.root, faces: out, cuts, flip: 1 };

  // The printed side of the sheet faces the viewer at t = 0. Fold away from the viewer, so it ends up outside:
  // if the solid came out on the viewer's side, reverse every turn (the same solid, mirrored in the sheet plane).
  const f1 = netFoldFrame(fold, 1);
  let zs = 0;
  for (let i = 2; i < f1.positions.length; i += 3) zs += f1.positions[i];
  if (zs > 0) {
    fold = { ...fold, flip: -1, faces: out.map((f) => ({ ...f, angleDeg: -f.angleDeg })) };
  }
  return { ok: true, fold };
}

/** Rodrigues rotation about the unit axis (ax, ay, 0) by `theta`, row-major. */
function rotation(ax: number, ay: number, theta: number): Float64Array {
  const c = Math.cos(theta), s = Math.sin(theta), k = 1 - c;
  return Float64Array.of(
    c + ax * ax * k, ax * ay * k, ay * s,
    ay * ax * k, c + ay * ay * k, -ax * s,
    -ay * s, ax * s, c,
  );
}

const mul3 = (a: Float64Array, b: Float64Array): Float64Array => {
  const r = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const apply = (T: Rigid, x: number, y: number, z: number): [number, number, number] => [
  T.R[0] * x + T.R[1] * y + T.R[2] * z + T.o[0],
  T.R[3] * x + T.R[4] * y + T.R[5] * z + T.o[1],
  T.R[6] * x + T.R[7] * y + T.R[8] * z + T.o[2],
];

/** The folded net at time t in [0, 1]: 0 is the flat net, 1 is every face at its dihedral angle. */
export function netFoldFrame(fold: NetFold, t: number): NetFoldFrame {
  const tt = Math.min(1, Math.max(0, t));
  const transforms: Rigid[] = [];
  const positions = new Float64Array(fold.faces.length * 9);
  fold.faces.forEach((f, i) => {
    let T: Rigid;
    if (f.hinge === null) {
      T = { R: Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1), o: new Float64Array(3) };
    } else {
      const [A, B] = f.hinge;
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const l = Math.hypot(dx, dy);
      const Rh = rotation(dx / l, dy / l, (f.angleDeg * Math.PI) / 180 * tt);
      // H(x) = Rh (x - A) + A, then the parent's motion.
      const oh = Float64Array.of(A[0] - (Rh[0] * A[0] + Rh[1] * A[1]), A[1] - (Rh[3] * A[0] + Rh[4] * A[1]), -(Rh[6] * A[0] + Rh[7] * A[1]));
      const P = transforms[f.parentSlot];
      const po = apply(P, oh[0], oh[1], oh[2]);
      T = { R: mul3(P.R, Rh), o: Float64Array.of(po[0], po[1], po[2]) };
    }
    transforms.push(T);
    for (let k = 0; k < 3; k++) {
      const q = apply(T, f.p[k][0], f.p[k][1], 0);
      positions[i * 9 + k * 3] = q[0];
      positions[i * 9 + k * 3 + 1] = q[1];
      positions[i * 9 + k * 3 + 2] = q[2];
    }
  });
  return { positions, transforms };
}

export interface NetFoldMeasure {
  /** Largest distance between the two copies of a cut edge's end vertices (mm). The closure test. */
  closureGapMm: number;
  /** Largest distance between any two copies of one mesh vertex over all faces (mm). */
  maxVertexSplitMm: number;
  /** Largest |R^T R - I| entry over all panels. */
  maxOrthonormalityError: number;
  /** Largest |det R - 1| over all panels. */
  maxDeterminantError: number;
  /** Largest change of a distance between two corners of one face against the flat net (mm). */
  maxEdgeStretchMm: number;
  /** Bounding box of all corners, mm. */
  bbox: [number, number, number];
}

export function measureNetFold(fold: NetFold, frame: NetFoldFrame): NetFoldMeasure {
  const { positions, transforms } = frame;
  const corner = (slot: number, vertex: number): [number, number, number] => {
    const k = fold.faces[slot].v.indexOf(vertex);
    const o = slot * 9 + k * 3;
    return [positions[o], positions[o + 1], positions[o + 2]];
  };
  const gap = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const slotOf = new Map(fold.faces.map((f, i) => [f.face, i]));

  let closure = 0;
  for (const c of fold.cuts) {
    const s0 = slotOf.get(c.faces[0])!, s1 = slotOf.get(c.faces[1])!;
    closure = Math.max(closure, gap(corner(s0, c.a), corner(s1, c.a)), gap(corner(s0, c.b), corner(s1, c.b)));
  }

  const copies = new Map<number, [number, number, number][]>();
  fold.faces.forEach((f, i) => f.v.forEach((id) => {
    const l = copies.get(id);
    const q = corner(i, id);
    if (l) l.push(q); else copies.set(id, [q]);
  }));
  let split = 0;
  for (const l of copies.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) split = Math.max(split, gap(l[i], l[j]));

  let ortho = 0, det = 0, stretch = 0;
  fold.faces.forEach((f, i) => {
    const R = transforms[i].R;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const d = R[a] * R[b] + R[3 + a] * R[3 + b] + R[6 + a] * R[6 + b];
      ortho = Math.max(ortho, Math.abs(d - (a === b ? 1 : 0)));
    }
    const d = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
    det = Math.max(det, Math.abs(d - 1));
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const dw = gap(corner(i, f.v[a]), corner(i, f.v[b]));
      const df = Math.hypot(f.p[a][0] - f.p[b][0], f.p[a][1] - f.p[b][1]);
      stretch = Math.max(stretch, Math.abs(dw - df));
    }
  });

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], positions[i]);
    hi[i % 3] = Math.max(hi[i % 3], positions[i]);
  }
  return {
    closureGapMm: closure, maxVertexSplitMm: split, maxOrthonormalityError: ortho, maxDeterminantError: det,
    maxEdgeStretchMm: stretch, bbox: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
  };
}
