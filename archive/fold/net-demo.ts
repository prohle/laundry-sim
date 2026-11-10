// Hollow mode (R9): build the cube and icosahedron nets, write the SVGs, print what was measured.
import { writeFileSync, mkdirSync } from "node:fs";
import { buildNet, A4 } from "../src/lib/net.ts";
import { netToSvg } from "../src/lib/net-svg.ts";
import { cube, icosahedron } from "../src/lib/net-meshes.ts";

mkdirSync("tools/out", { recursive: true });
for (const [name, mesh, file] of [["cube", cube(), "net-cube.svg"], ["icosahedron", icosahedron(), "net-icosa.svg"]] as const) {
  const r = buildNet(mesh, A4);
  if (!r.ok) { console.log(name, "REFUSED", r.refusal.stage, r.refusal.message); continue; }
  const n = r.net;
  writeFileSync(`tools/out/${file}`, netToSvg(n));
  console.log(
    `${name}: faces=${n.faces.length} edges=${n.edges.length} folds=${n.edges.filter((e) => e.kind === "fold").length} flats=${n.edges.filter((e) => e.kind === "flat").length}` +
      ` tabs=${n.tabs.length} shortened=${n.tabsShortened} dropped=${n.tabsDropped.length} bbox=${n.bbox.width.toFixed(1)}x${n.bbox.height.toFixed(1)}mm scale=${n.scale.toFixed(2)}mm/unit` +
      ` attempts=${n.attempts.length} root=${n.root} overlaps=${n.overlaps}` +
      ` area3d=${n.area3d.toFixed(6)} area2d=${n.area2d.toFixed(3)}mm2 areaError=${n.areaError.toExponential(2)} -> tools/out/${file}`,
  );
}
