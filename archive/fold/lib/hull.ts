// Visual hull on a voxel grid (task 9.3). Voxels only: no mesh (9.4), no UI.
//
// World frame, millimetres: x right, y up, z towards the camera at angle 0. The grid is centred on the
// origin in all three axes. A view at angle t (degrees, about the vertical axis) is orthographic:
//   u = x cos t + z sin t,   v = y
// A voxel is occupied when its centre projects inside every silhouette. A centre that projects outside a
// mask's bounds is outside that silhouette.
//
// Alignment rule (refused, not corrected): v is world y in every view, so
//   1. all masks must have the same v bounds (vMin, vMax), and
//   2. each mask must have square pixels: mm per pixel in u and in v within 2% of each other.
// Masks may differ in pixel dimensions and in u bounds. A mask stretched to fill a different frame would
// put the same height on different rows, so it is refused rather than guessed at.
//
// A hull is a superset of the true shape if every mask contains the shape's projection. It is not the
// shape: concavities that no silhouette shows are filled (see tools/hull-report.ts for a measurement).

export interface Silhouette {
  /** Angle about the vertical axis, degrees. */
  angleDeg: number;
  /** Mask size in pixels. Row 0 is the top (v = vMax). */
  width: number;
  height: number;
  /** width * height bytes; nonzero is inside the silhouette. */
  data: Uint8Array;
  /** What the mask covers, mm: u from uMin (column 0 edge) to uMax, v from vMin (bottom) to vMax (top). */
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number };
}

export interface HullInput {
  silhouettes: Silhouette[];
  /** World size in mm: x, y, z extents. Rounded up to whole voxels. */
  world: { width: number; height: number; depth: number };
  voxelSize: number;
}

export interface Hull {
  /** Occupancy, index = ix + nx * (iy + ny * iz); 1 = occupied. */
  grid: Uint8Array;
  dims: { nx: number; ny: number; nz: number };
  occupied: number;
  voxelSize: number;
  /** Bounds actually used (whole voxels, centred on the origin), mm. */
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
  /** occupied * voxelSize^3, mm^3. */
  volume: number;
}

export type HullRefusalStage = "views" | "alignment" | "grid" | "empty";
export interface HullRefusal {
  stage: HullRefusalStage;
  message: string;
  detail: string;
}
export type HullResult = { ok: true; hull: Hull } | { ok: false; refusal: HullRefusal };

export const MAX_VOXELS = 256 ** 3;
export const MAX_PIXEL_ASPECT_ERROR = 0.02;
const V_BOUNDS_TOL_MM = 1e-3;

function refuse(stage: HullRefusalStage, message: string, detail: string): HullResult {
  return { ok: false, refusal: { stage, message, detail } };
}

export function voxelIndex(h: Pick<Hull, "dims">, ix: number, iy: number, iz: number): number {
  return ix + h.dims.nx * (iy + h.dims.ny * iz);
}

export function buildHull(input: HullInput): HullResult {
  const { silhouettes, world, voxelSize } = input;

  if (silhouettes.length < 2) {
    return refuse("views", "A hull needs at least two silhouettes. One photograph cannot give depth.", `${silhouettes.length} silhouette(s)`);
  }
  if (silhouettes.length > 4) {
    return refuse("views", "A hull takes at most four silhouettes.", `${silhouettes.length} silhouettes`);
  }
  for (const [i, s] of silhouettes.entries()) {
    if (!Number.isFinite(s.angleDeg)) return refuse("views", `View ${i + 1} has no valid angle.`, `angleDeg = ${s.angleDeg}`);
    if (!(s.width > 0 && s.height > 0) || s.data.length !== s.width * s.height) {
      return refuse("views", `View ${i + 1} has a mask whose size does not match its data.`, `${s.width}x${s.height}, ${s.data.length} bytes`);
    }
    const b = s.bounds;
    if (![b.uMin, b.uMax, b.vMin, b.vMax].every(Number.isFinite) || !(b.uMax > b.uMin) || !(b.vMax > b.vMin)) {
      return refuse("alignment", `View ${i + 1} has no valid bounds.`, JSON.stringify(b));
    }
  }
  // Two views looking along the same line (angles equal modulo 180) are one view.
  const dirs = silhouettes.map((s) => ((s.angleDeg % 180) + 180) % 180);
  const distinct = dirs.filter((a, i) => dirs.findIndex((b) => Math.min(Math.abs(a - b), 180 - Math.abs(a - b)) < 1) === i).length;
  if (distinct < 2) {
    return refuse("views", "The views look along the same line, so they give no depth. Take the second photograph from another side.", `angles ${silhouettes.map((s) => s.angleDeg).join(", ")}`);
  }

  // Alignment.
  const ref = silhouettes[0].bounds;
  for (const [i, s] of silhouettes.entries()) {
    const b = s.bounds;
    if (Math.abs(b.vMin - ref.vMin) > V_BOUNDS_TOL_MM || Math.abs(b.vMax - ref.vMax) > V_BOUNDS_TOL_MM) {
      return refuse(
        "alignment",
        `View ${i + 1} covers a different height range from view 1, so the same height would land on different rows. Frame every view over the same vertical extent.`,
        `v ${b.vMin}..${b.vMax} vs ${ref.vMin}..${ref.vMax}`,
      );
    }
    const pu = (b.uMax - b.uMin) / s.width;
    const pv = (b.vMax - b.vMin) / s.height;
    if (Math.abs(pu - pv) / Math.max(pu, pv) > MAX_PIXEL_ASPECT_ERROR) {
      return refuse(
        "alignment",
        `View ${i + 1} has non-square pixels, so it is stretched. Give its bounds the same aspect as its pixels.`,
        `${pu.toFixed(4)} mm/px across, ${pv.toFixed(4)} mm/px down`,
      );
    }
  }

  // Grid.
  if (!(voxelSize > 0) || !(world.width > 0 && world.height > 0 && world.depth > 0)) {
    return refuse("grid", "The voxel size and world size must be positive.", `voxel ${voxelSize}, world ${world.width}x${world.height}x${world.depth}`);
  }
  const nx = Math.ceil(world.width / voxelSize - 1e-9);
  const ny = Math.ceil(world.height / voxelSize - 1e-9);
  const nz = Math.ceil(world.depth / voxelSize - 1e-9);
  if (nx * ny * nz > MAX_VOXELS) {
    return refuse("grid", "That grid is too fine. Use a larger voxel size.", `${nx}x${ny}x${nz} = ${nx * ny * nz} voxels, limit ${MAX_VOXELS}`);
  }
  const x0 = (-nx * voxelSize) / 2;
  const y0 = (-ny * voxelSize) / 2;
  const z0 = (-nz * voxelSize) / 2;

  const views = silhouettes.map((s) => {
    const t = (s.angleDeg * Math.PI) / 180;
    return {
      s,
      c: Math.cos(t),
      sn: Math.sin(t),
      ku: s.width / (s.bounds.uMax - s.bounds.uMin),
      kv: s.height / (s.bounds.vMax - s.bounds.vMin),
    };
  });

  const grid = new Uint8Array(nx * ny * nz);
  let occupied = 0;
  for (let iz = 0; iz < nz; iz++) {
    const z = z0 + (iz + 0.5) * voxelSize;
    for (let iy = 0; iy < ny; iy++) {
      const y = y0 + (iy + 0.5) * voxelSize;
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + (ix + 0.5) * voxelSize;
        let inside = true;
        for (const w of views) {
          const b = w.s.bounds;
          const u = x * w.c + z * w.sn;
          if (u < b.uMin || u >= b.uMax || y < b.vMin || y >= b.vMax) { inside = false; break; }
          const px = Math.min(w.s.width - 1, Math.floor((u - b.uMin) * w.ku));
          const py = Math.min(w.s.height - 1, Math.floor((b.vMax - y) * w.kv));
          if (w.s.data[py * w.s.width + px] === 0) { inside = false; break; }
        }
        if (inside) { grid[ix + nx * (iy + ny * iz)] = 1; occupied++; }
      }
    }
  }

  if (occupied === 0) {
    return refuse(
      "empty",
      "The silhouettes do not overlap in space, so there is no solid. Check that the views show the same object at the same scale, and that the angles are right.",
      `${silhouettes.length} views, ${nx}x${ny}x${nz} grid, 0 occupied`,
    );
  }
  return {
    ok: true,
    hull: {
      grid,
      dims: { nx, ny, nz },
      occupied,
      voxelSize,
      bounds: { xMin: x0, xMax: -x0, yMin: y0, yMax: -y0, zMin: z0, zMax: -z0 },
      volume: occupied * voxelSize ** 3,
    },
  };
}
