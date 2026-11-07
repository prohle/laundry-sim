import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHull, voxelIndex } from "./hull.ts";
import type { Hull, Silhouette } from "./hull.ts";
import { sphere, box, silhouetteOf } from "./hull-shapes.ts";
import type { Solid } from "./hull-shapes.ts";

const WORLD = { width: 64, height: 64, depth: 64 };
const HALF_U = 30, V = 30, PX = 4;

function sils(solid: Solid, angles: number[], px = PX): Silhouette[] {
  return angles.map((a) => silhouetteOf(solid, a, HALF_U, -V, V, px));
}
function mustHull(s: Silhouette[], world = WORLD, voxelSize = 1): Hull {
  const r = buildHull({ silhouettes: s, world, voxelSize });
  assert.ok(r.ok, r.ok ? "" : r.refusal.message);
  return r.hull;
}
function missedVoxels(h: Hull, solid: Solid): number {
  let missed = 0;
  const b = h.bounds, s = h.voxelSize;
  for (let iz = 0; iz < h.dims.nz; iz++) for (let iy = 0; iy < h.dims.ny; iy++) for (let ix = 0; ix < h.dims.nx; ix++) {
    if (solid.contains(b.xMin + (ix + 0.5) * s, b.yMin + (iy + 0.5) * s, b.zMin + (iz + 0.5) * s) && !h.grid[voxelIndex(h, ix, iy, iz)]) missed++;
  }
  return missed;
}
function refusalOf(r: ReturnType<typeof buildHull>) {
  assert.equal(r.ok, false);
  return r.ok ? (undefined as never) : r.refusal;
}

const SPHERE_R = 24;
const sph = sphere(SPHERE_R);

test("sphere from 4 views: superset, within 25%, near the analytic octagon limit", () => {
  const h = mustHull(sils(sph, [0, 45, 90, 135]));
  const ratio = h.volume / sph.volume;
  assert.equal(missedVoxels(h, sph), 0, "hull must contain every true voxel");
  assert.ok(ratio >= 1 && ratio <= 1.25, `ratio ${ratio}`);
  // The requested 1.05 ceiling is below the continuous limit for four views at 45 degrees:
  // regular octagon area / circle area = 8 tan(22.5 deg) / pi = 1.0548. Allow 3% for voxels and pixels.
  const limit = (8 * Math.tan(Math.PI / 8)) / Math.PI;
  assert.ok(limit > 1.05);
  assert.ok(ratio <= limit * 1.03, `ratio ${ratio} vs limit ${limit}`);
});

test("sphere from 2 views: still a superset, but far from the sphere", () => {
  const h = mustHull(sils(sph, [0, 90]));
  const ratio = h.volume / sph.volume;
  assert.equal(missedVoxels(h, sph), 0);
  assert.ok(ratio > 1.2 && ratio < 1.35, `ratio ${ratio}`); // analytic 4/pi = 1.2732
  assert.ok(ratio > mustHull(sils(sph, [0, 45, 90, 135])).volume / sph.volume);
});

test("box on voxel boundaries: volume within 2%", () => {
  const b = box(20, 25, 15);
  for (const angles of [[0, 90], [0, 45, 90, 135]]) {
    const h = mustHull(sils(b, angles));
    assert.ok(Math.abs(h.volume / b.volume - 1) <= 0.02, `${angles.length} views: ${h.volume} vs ${b.volume}`);
    assert.equal(missedVoxels(h, b), 0);
  }
});

test("masks of different resolution still align", () => {
  const a = silhouetteOf(sph, 0, HALF_U, -V, V, 4);
  const b = silhouetteOf(sph, 90, HALF_U, -V, V, 2);
  const h = mustHull([a, b]);
  assert.equal(missedVoxels(h, sph), 0);
  assert.ok(h.volume / sph.volume < 1.4);
});

test("bounds used are whole voxels, centred, and reported", () => {
  const h = mustHull(sils(sph, [0, 90]), { width: 63.5, height: 64, depth: 40.2 }, 2);
  assert.deepEqual(h.dims, { nx: 32, ny: 32, nz: 21 });
  assert.equal(h.bounds.xMax, 32);
  assert.equal(h.bounds.zMax, 21);
  assert.equal(h.volume, h.occupied * 8);
});

test("refuses fewer than 2 silhouettes", () => {
  const r = refusalOf(buildHull({ silhouettes: sils(sph, [0]), world: WORLD, voxelSize: 1 }));
  assert.equal(r.stage, "views");
  assert.match(r.message, /at least two/);
  assert.equal(refusalOf(buildHull({ silhouettes: [], world: WORLD, voxelSize: 1 })).stage, "views");
});

test("refuses more than 4, and views along the same line", () => {
  assert.equal(refusalOf(buildHull({ silhouettes: sils(sph, [0, 36, 72, 108, 144]), world: WORLD, voxelSize: 1 })).stage, "views");
  const r = refusalOf(buildHull({ silhouettes: sils(sph, [0, 180]), world: WORLD, voxelSize: 1 }));
  assert.equal(r.stage, "views");
  assert.match(r.message, /same line/);
});

test("refuses masks with different vertical bounds", () => {
  const a = silhouetteOf(sph, 0, HALF_U, -V, V, PX);
  const b = silhouetteOf(sph, 90, HALF_U, -V + 5, V + 5, PX);
  const r = refusalOf(buildHull({ silhouettes: [a, b], world: WORLD, voxelSize: 1 }));
  assert.equal(r.stage, "alignment");
  assert.match(r.message, /View 2 covers a different height range/);
});

test("refuses a stretched mask (non-square pixels)", () => {
  const a = silhouetteOf(sph, 0, HALF_U, -V, V, PX);
  const b = silhouetteOf(sph, 90, HALF_U, -V, V, PX);
  b.bounds = { ...b.bounds, uMax: b.bounds.uMax * 1.2, uMin: b.bounds.uMin * 1.2 };
  const r = refusalOf(buildHull({ silhouettes: [a, b], world: WORLD, voxelSize: 1 }));
  assert.equal(r.stage, "alignment");
  assert.match(r.message, /non-square/);
});

test("refuses a mask whose data does not match its size", () => {
  const a = silhouetteOf(sph, 0, HALF_U, -V, V, PX);
  const b = silhouetteOf(sph, 90, HALF_U, -V, V, PX);
  b.data = b.data.slice(1);
  assert.equal(refusalOf(buildHull({ silhouettes: [a, b], world: WORLD, voxelSize: 1 })).stage, "views");
});

test("refuses a grid over the voxel limit", () => {
  const r = refusalOf(buildHull({ silhouettes: sils(sph, [0, 90]), world: { width: 400, height: 400, depth: 400 }, voxelSize: 1 }));
  assert.equal(r.stage, "grid");
});

test("an empty hull is refused with a reason", () => {
  // Same object at two heights: the two cylinders of sight never meet.
  const high = silhouetteOf(box(10, 5, 10), 0, HALF_U, -V, V, PX);
  const low = silhouetteOf(box(10, 5, 10), 90, HALF_U, -V, V, PX);
  const shift = (s: Silhouette, rows: number): Silhouette => {
    const data = new Uint8Array(s.data.length);
    for (let y = 0; y < s.height; y++) {
      const to = y + rows;
      if (to >= 0 && to < s.height) data.set(s.data.subarray(y * s.width, (y + 1) * s.width), to * s.width);
    }
    return { ...s, data };
  };
  const r = refusalOf(buildHull({ silhouettes: [shift(high, -60), shift(low, 60)], world: WORLD, voxelSize: 1 }));
  assert.equal(r.stage, "empty");
  assert.match(r.message, /do not overlap/);
  assert.match(r.detail, /0 occupied/);
});
