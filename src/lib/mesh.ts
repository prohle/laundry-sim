// Task 9.4: a closed low-poly mesh from the visual hull, by radial sampling.
//
// Rays leave the centroid of the occupied voxels along the vertices of a subdivided icosahedron;
// the distance to the surface along each ray becomes that vertex's radius. The faces are the
// icosphere's, so the result is closed and manifold by construction. It is only valid for a hull
// that is star-shaped from its centroid; anything else is refused rather than meshed with spikes.
import type { Hull } from "./hull.ts";
import { voxelIndex } from "./hull.ts";
import type { Mesh, Vec3 } from "./net.ts";

export const FACES_BY_LEVEL = [20, 80, 320] as const;
/** A ray that re-enters the hull after leaving it by more than this many voxels is not star-shaped. */
export const REENTRY_VOXELS = 2;
const STEP_FRACTION = 0.25;

export type MeshRefusalStage = "level" | "empty" | "centroid" | "star";
export interface MeshRefusal {
  stage: MeshRefusalStage;
  message: string;
  detail: string;
}

export interface HullMesh extends Mesh {
  /** Signed-tetrahedra volume, mm^3. */
  volume: number;
  centroid: Vec3;
  radii: number[];
  level: number;
  smoothing: number;
}
export type MeshResult = { ok: true; mesh: HullMesh } | { ok: false; refusal: MeshRefusal };

function refuse(stage: MeshRefusalStage, message: string, detail: string): MeshResult {
  return { ok: false, refusal: { stage, message, detail } };
}

/** Unit-sphere icosahedron subdivided `level` times; faces wound counter-clockwise seen from outside. */
export function icosphere(level: number): Mesh {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const vertices: Vec3[] = raw.map(norm);
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let l = 0; l < level; l++) {
    const cache = new Map<number, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? a * 100003 + b : b * 100003 + a;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const p = vertices[a], q = vertices[b];
      vertices.push(norm([p[0] + q[0], p[1] + q[1], p[2] + q[2]]));
      cache.set(key, vertices.length - 1);
      return vertices.length - 1;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { vertices, faces };
}

export function meshVolume(m: Mesh): number {
  let v = 0;
  for (const [a, b, c] of m.faces) {
    const p = m.vertices[a], q = m.vertices[b], r = m.vertices[c];
    v += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
  }
  return Math.abs(v) / 6;
}

export function hullMesh(hull: Hull, level: number, smoothing = 0): MeshResult {
  if (!Number.isInteger(level) || level < 0 || level > 2) {
    return refuse("level", "The subdivision level must be 0, 1 or 2 (20, 80 or 320 faces).", `level=${level}`);
  }
  if (!(smoothing >= 0 && smoothing <= 1)) {
    return refuse("level", "The smoothing factor must be between 0 and 1.", `smoothing=${smoothing}`);
  }
  if (hull.occupied === 0) return refuse("empty", "The hull is empty, so there is nothing to build a mesh from.", "occupied=0");

  const { nx, ny, nz } = hull.dims, b = hull.bounds, s = hull.voxelSize;
  let sx = 0, sy = 0, sz = 0;
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (hull.grid[voxelIndex(hull, ix, iy, iz)]) { sx += ix + 0.5; sy += iy + 0.5; sz += iz + 0.5; }
  }
  const c: Vec3 = [b.xMin + (sx / hull.occupied) * s, b.yMin + (sy / hull.occupied) * s, b.zMin + (sz / hull.occupied) * s];
  const occupied = (x: number, y: number, z: number): boolean => {
    const ix = Math.floor((x - b.xMin) / s), iy = Math.floor((y - b.yMin) / s), iz = Math.floor((z - b.zMin) / s);
    return ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && hull.grid[voxelIndex(hull, ix, iy, iz)] === 1;
  };
  if (!occupied(c[0], c[1], c[2])) {
    return refuse("centroid", "The object is not star-shaped from its centre: the centre of the hull lies outside it, so rays from there cannot reach the surface.",
      `centroid (${c.map((x) => x.toFixed(2)).join(", ")}) is in an unoccupied voxel`);
  }

  const ico = icosphere(level);
  const step = s * STEP_FRACTION;
  const maxDist = Math.hypot(nx, ny, nz) * s;
  const radii: number[] = [];
  for (let i = 0; i < ico.vertices.length; i++) {
    const d = ico.vertices[i];
    const at = (r: number) => occupied(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r);
    let r = 0;
    while (r <= maxDist && at(r + step)) r += step;
    if (r === 0) {
      return refuse("star", "The object is not star-shaped from its centre: a ray leaves the hull at once.", `ray ${i} exits immediately`);
    }
    // The surface lies between the last occupied sample and the next one.
    const exit = r + step / 2;
    for (let q = r + step; q <= maxDist; q += step) {
      if (q > exit + REENTRY_VOXELS * s && at(q)) {
        return refuse("star", "The object is not star-shaped from its centre: part of it is hidden behind a dent or hollow, so a single ring of rays cannot trace it. Try a rounder subject or more views.",
          `ray ${i} leaves the hull at ${exit.toFixed(2)} mm and re-enters at ${q.toFixed(2)} mm`);
      }
    }
    radii.push(exit);
  }

  let used = radii;
  if (smoothing > 0) {
    const nb: Set<number>[] = radii.map(() => new Set());
    for (const [a, bb, cc] of ico.faces) { nb[a].add(bb).add(cc); nb[bb].add(a).add(cc); nb[cc].add(a).add(bb); }
    used = radii.map((r, i) => {
      let m = 0;
      for (const j of nb[i]) m += radii[j];
      return (1 - smoothing) * r + smoothing * (m / nb[i].size);
    });
  }
  const vertices: Vec3[] = ico.vertices.map((d, i) => [c[0] + d[0] * used[i], c[1] + d[1] * used[i], c[2] + d[2] * used[i]]);
  const mesh: Mesh = { vertices, faces: ico.faces };
  return { ok: true, mesh: { ...mesh, volume: meshVolume(mesh), centroid: c, radii: used, level, smoothing } };
}
