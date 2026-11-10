// Measurements for task 9.3. Writes nothing.  node tools/hull-report.ts
import { buildHull, voxelIndex } from "../src/lib/hull.ts";
import type { Hull } from "../src/lib/hull.ts";
import { sphere, box, notchedCylinder, silhouetteOf } from "../src/lib/hull-shapes.ts";
import type { Solid } from "../src/lib/hull-shapes.ts";

const VOX = 1; // mm
const WORLD = { width: 64, height: 64, depth: 64 }; // 64^3
const HALF_U = 30, V = 30, PX = 4;

function hullOf(solid: Solid, angles: number[], world = WORLD, voxel = VOX): { hull: Hull; ms: number } {
  const sil = angles.map((a) => silhouetteOf(solid, a, HALF_U, -V, V, PX));
  const t0 = performance.now();
  const r = buildHull({ silhouettes: sil, world, voxelSize: voxel });
  const ms = performance.now() - t0;
  if (!r.ok) throw new Error(r.refusal.message);
  return { hull: r.hull, ms };
}

function missed(hull: Hull, solid: Solid): { trueVoxels: number; missed: number } {
  let trueVoxels = 0, missed = 0;
  const { nx, ny, nz } = hull.dims, b = hull.bounds, s = hull.voxelSize;
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!solid.contains(b.xMin + (ix + 0.5) * s, b.yMin + (iy + 0.5) * s, b.zMin + (iz + 0.5) * s)) continue;
    trueVoxels++;
    if (hull.grid[voxelIndex(hull, ix, iy, iz)] === 0) missed++;
  }
  return { trueVoxels, missed };
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

// Sphere
const R = 24;
const sph = sphere(R);
for (const angles of [[0, 90], [0, 45, 90, 135]]) {
  const { hull, ms } = hullOf(sph, angles);
  const m = missed(hull, sph);
  console.log(`sphere r=${R} views=${angles.length} (${angles.join(",")}): occupied ${hull.occupied}, volume ${hull.volume.toFixed(0)} vs true ${sph.volume.toFixed(0)}, ratio ${(hull.volume / sph.volume).toFixed(4)}, error ${pct(hull.volume / sph.volume - 1)}; true-shape voxels ${m.trueVoxels}, missed ${m.missed}; build ${ms.toFixed(1)} ms`);
}
// Analytic continuous limits for comparison.
console.log(`analytic: 2 views 16/3 r^3 / (4/3 pi r^3) = ${(4 / Math.PI).toFixed(4)}; 4 views, octagon/circle = ${(8 * Math.tan(Math.PI / 8) / Math.PI).toFixed(4)}`);

// Box 40 x 50 x 30 mm, edges on voxel boundaries
const bx = box(20, 25, 15);
for (const angles of [[0, 90], [0, 45, 90, 135]]) {
  const { hull, ms } = hullOf(bx, angles);
  const m = missed(hull, bx);
  console.log(`box 40x50x30 views=${angles.length}: occupied ${hull.occupied}, volume ${hull.volume} vs true ${bx.volume}, error ${pct(hull.volume / bx.volume - 1)}; missed ${m.missed}/${m.trueVoxels}; build ${ms.toFixed(1)} ms`);
}

// Mug: cylinder r=24, half height 20, notch x>8, |z|<7
const mug = notchedCylinder(24, 20, 8, 7);
{
  const gap = notchedCylinder(24, 20, 1e9, 0); // plain cylinder, for the gap = plain minus mug
  void gap;
  const plain = (x: number, y: number, z: number) => x * x + z * z <= 24 * 24 && Math.abs(y) <= 20;
  for (const angles of [[0, 90], [0, 45, 90, 135], [0, 30, 60, 90]]) {
    const { hull } = hullOf(mug, angles);
    const b = hull.bounds;
    let gapVox = 0, filled = 0, trueVox = 0, missedMug = 0;
    for (let iz = 0; iz < hull.dims.nz; iz++) for (let iy = 0; iy < hull.dims.ny; iy++) for (let ix = 0; ix < hull.dims.nx; ix++) {
      const x = b.xMin + (ix + 0.5), y = b.yMin + (iy + 0.5), z = b.zMin + (iz + 0.5);
      const occ = hull.grid[voxelIndex(hull, ix, iy, iz)] === 1;
      if (mug.contains(x, y, z)) { trueVox++; if (!occ) missedMug++; }
      else if (plain(x, y, z)) { gapVox++; if (occ) filled++; }
    }
    console.log(`mug views=${angles.length} (${angles.join(",")}): notch voxels ${gapVox}, filled by hull ${filled} (${pct(filled / gapVox)}); true-shape voxels ${trueVox}, missed ${missedMug}`);
  }
}

// Timing: 64^3, 4 views, repeated
{
  const sil = [0, 45, 90, 135].map((a) => silhouetteOf(sph, a, HALF_U, -V, V, PX));
  const times: number[] = [];
  let occ = 0;
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    const r = buildHull({ silhouettes: sil, world: WORLD, voxelSize: VOX });
    times.push(performance.now() - t0);
    if (r.ok) occ = r.hull.occupied;
  }
  times.sort((a, b) => a - b);
  console.log(`64^3 (262144 voxels), 4 views, voxel ${VOX} mm, masks ${sil[0].width}x${sil[0].height}: occupied ${occ}; 10 runs min ${times[0].toFixed(1)} ms, median ${times[5].toFixed(1)} ms, max ${times[9].toFixed(1)} ms`);
}
