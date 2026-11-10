// Task 9.4 report. Prints numbers; writes nothing.
import { buildHull } from "../src/lib/hull.ts";
import { sphere, box, notchedCylinder, silhouetteOf } from "../src/lib/hull-shapes.ts";
import type { Solid } from "../src/lib/hull-shapes.ts";
import { hullMesh } from "../src/lib/mesh.ts";
import { buildNet, A4 } from "../src/lib/net.ts";

function hull(solid: Solid, angles = [0, 45, 90, 135]) {
  const s = angles.map((a) => silhouetteOf(solid, a, 30, -30, 30, 4));
  const r = buildHull({ silhouettes: s, world: { width: 64, height: 64, depth: 64 }, voxelSize: 1 });
  if (!r.ok) throw new Error(r.refusal.message);
  return r.hull;
}
function closed(m: { faces: number[][] }) {
  const c = new Map<string, number>();
  for (const f of m.faces) for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3]; const k = a < b ? `${a}-${b}` : `${b}-${a}`; c.set(k, (c.get(k) ?? 0) + 1); }
  return [...c.values()].every((n) => n === 2);
}
for (const [name, solid] of [["sphere r24", sphere(24)], ["box 40x50x30", box(20, 25, 15)]] as const) {
  const h = hull(solid);
  for (const lvl of [0, 1, 2]) for (const sm of [0, 0.5]) {
    const r = hullMesh(h, lvl, sm);
    if (!r.ok) { console.log(name, lvl, sm, "REFUSED", r.refusal.message); continue; }
    const m = r.mesh;
    console.log(`${name} level ${lvl} smooth ${sm}: voxels ${h.occupied}, V ${m.vertices.length}, F ${m.faces.length}, vol ${m.volume.toFixed(0)} / true ${solid.volume.toFixed(0)} = ${(m.volume / solid.volume).toFixed(4)}, closed ${closed(m)}`);
  }
}
// mug: from silhouettes (what the pipeline gets) and as the true shape
const mug = notchedCylinder(24, 20, 8, 7);
const mh = hull(mug);
for (const lvl of [1, 2]) { const r = hullMesh(mh, lvl); console.log(`mug silhouette hull level ${lvl}:`, r.ok ? `meshed, vol ${r.mesh.volume.toFixed(0)}` : `REFUSED ${r.refusal.stage}: ${r.refusal.detail}`); }
const n = 64, grid = new Uint8Array(n ** 3); let occ = 0;
for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mug.contains(x + .5 - 32, y + .5 - 32, z + .5 - 32)) { grid[x + n * (y + n * z)] = 1; occ++; }
const tg = { grid, dims: { nx: n, ny: n, nz: n }, occupied: occ, voxelSize: 1, bounds: { xMin: -32, xMax: 32, yMin: -32, yMax: 32, zMin: -32, zMax: 32 }, volume: occ };
for (const lvl of [0, 1, 2]) { const r = hullMesh(tg, lvl); console.log(`mug true shape level ${lvl}:`, r.ok ? `meshed, vol ${r.mesh.volume.toFixed(0)}` : `REFUSED ${r.refusal.stage}: ${r.refusal.detail}`); }
// sphere net + timing
for (const lvl of [0, 1, 2]) {
  const t0 = performance.now();
  const h = hull(sphere(24));
  const r = hullMesh(h, lvl);
  if (!r.ok) throw new Error("x");
  const t1 = performance.now();
  const net = buildNet({ vertices: r.mesh.vertices, faces: r.mesh.faces }, A4);
  const t2 = performance.now();
  if (!net.ok) { console.log(`sphere net level ${lvl}: REFUSED ${net.refusal.stage} ${net.refusal.message}`); continue; }
  const x = net.net;
  console.log(`sphere net level ${lvl}: builds, faces ${x.faces.length}, tabs ${x.tabs.length}, dropped ${x.tabsDropped.length}, shortened ${x.tabsShortened}, overlaps ${x.overlaps}, attempts ${x.attempts.length}, bbox ${x.bbox.width.toFixed(1)} x ${x.bbox.height.toFixed(1)} mm, scale ${x.scale.toFixed(3)}; hull+mesh ${(t1 - t0).toFixed(0)} ms, net ${(t2 - t1).toFixed(0)} ms, total ${(t2 - t0).toFixed(0)} ms`);
}
