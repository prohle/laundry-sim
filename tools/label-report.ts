// Hollow net numbers: how many boxes collide with another number, a tab or a face, with and without sliding.
import { buildNet, A4 } from "../src/lib/net.ts";
import { layoutLabels } from "../src/lib/net-svg.ts";
import { cube, icosahedron, icosphere, bumpy } from "../src/lib/net-meshes.ts";

for (const [name, mesh] of [["cube", cube()], ["icosahedron", icosahedron()], ["icosphere(1)", icosphere(1)], ["bumpy(1,0.05,4)", bumpy(1, 0.05, 4)], ["bumpy(1,0.1,7)", bumpy(1, 0.1, 7)]] as const) {
  const r = buildNet(mesh, A4);
  if (!r.ok) { console.log(`${name}: refused ${r.refusal.stage}`); continue; }
  const fixed = layoutLabels(r.net, false);
  const slid = layoutLabels(r.net, true);
  const moved = slid.filter((l, i) => Math.hypot(l.x - fixed[i].x, l.y - fixed[i].y) > 1e-9).length;
  console.log(`${name}: labels=${slid.length} colliding unslid=${fixed.filter((l) => l.collides).length} slid=${slid.filter((l) => l.collides).length} moved=${moved}`);
}
