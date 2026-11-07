// Hollow mode tab report: tabs placed / shortened / dropped per mesh, the taper used, the taper needed by each dropped
// tab, and a check that no surviving tab overlaps a face or another tab.
import * as after from "../src/lib/net.ts";
import { cube, icosahedron, icosphere, bumpy } from "../src/lib/net-meshes.ts";

const meshes: [string, after.Mesh][] = [
  ["cube", cube()], ["icosahedron", icosahedron()], ["icosphere(1) 80 faces", icosphere(1)],
  ["bumpy(1,0.05,4)", bumpy(1, 0.05, 4)], ["bumpy(1,0.1,7)", bumpy(1, 0.1, 7)],
];
for (const [name, mesh] of meshes) {
  const row = (tag: string, lib: typeof after) => {
    const r = lib.buildNet(mesh, lib.A4);
    if (!r.ok) return `  ${tag}: refused ${r.refusal.stage}`;
    const n = r.net;
    let bad = 0;
    for (const t of n.tabs) {
      for (const f of n.faces) if (f.face !== t.face && lib.polygonsOverlap(t.polygon, f.p, 1e-6)) bad++;
      for (const o of n.tabs) if (o !== t && lib.polygonsOverlap(t.polygon, o.polygon, 1e-6)) bad++;
    }
    const tapers = n.tabs.map((t) => (t as { taper?: number }).taper).filter((x) => x !== undefined) as number[];
    let s = `  ${tag}: placed=${n.tabs.length} shortened=${n.tabsShortened} dropped=${n.tabsDropped.length} surviving-overlaps=${bad}`;
    if (tapers.length) s += ` taper min/max=${Math.min(...tapers).toFixed(1)}/${Math.max(...tapers).toFixed(1)} widened=${(n as { tabsWidened?: number }).tabsWidened} bbox=${n.bbox.width.toFixed(1)}x${n.bbox.height.toFixed(1)} scale=${n.scale.toFixed(3)}`;
    for (const d of n.tabsDropped as { label: number; neededTaper?: unknown }[]) s += `\n      dropped #${d.label}: ${d.neededTaper ? JSON.stringify(d.neededTaper) : ""}`;
    return s;
  };
  console.log(name);
  console.log(row("after ", after));
}
