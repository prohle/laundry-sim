import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNet, A4 } from "./net.ts";
import type { Mesh } from "./net.ts";
import { buildNetFold, netFoldFrame, measureNetFold } from "./netfold.ts";
import { cube, icosahedron, icosphere, bumpy } from "./net-meshes.ts";

function fold(mesh: Mesh) {
  const r = buildNet(mesh, A4);
  assert.ok(r.ok, r.ok ? "" : r.refusal.message);
  const b = buildNetFold(r.net, mesh);
  assert.ok(b.ok, b.ok ? "" : b.message);
  return { net: r.net, fold: b.fold };
}

const meshes: [string, Mesh][] = [
  ["cube", cube()],
  ["icosahedron", icosahedron()],
  ["icosphere(1)", icosphere(1)],
  ["bumpy(1, 0.05, 4)", bumpy(1, 0.05, 4)],
];

for (const [name, mesh] of meshes) {
  test(`${name}: the net folds into a closed solid with rigid panels`, () => {
    const { net, fold: f } = fold(mesh);
    // Parents before children.
    f.faces.forEach((x, i) => assert.ok(x.parentSlot < i));
    assert.equal(f.faces.length, net.faces.length);
    // t = 0 is the flat net.
    const m0 = measureNetFold(f, netFoldFrame(f, 0));
    assert.ok(m0.bbox[2] < 1e-9, `flat z extent ${m0.bbox[2]}`);
    // t = 1 closes.
    const m1 = measureNetFold(f, netFoldFrame(f, 1));
    assert.ok(m1.closureGapMm < 1e-6, `closure gap ${m1.closureGapMm} mm`);
    assert.ok(m1.maxVertexSplitMm < 1e-6, `vertex split ${m1.maxVertexSplitMm} mm`);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const m = measureNetFold(f, netFoldFrame(f, t));
      assert.ok(m.maxOrthonormalityError < 1e-12, `t=${t} ortho ${m.maxOrthonormalityError}`);
      assert.ok(m.maxDeterminantError < 1e-12, `t=${t} det ${m.maxDeterminantError}`);
      assert.ok(m.maxEdgeStretchMm < 1e-9, `t=${t} stretch ${m.maxEdgeStretchMm}`);
    }
  });
}

test("the solid ends on the far side of the printed sheet", () => {
  const { fold: f } = fold(cube());
  const fr = netFoldFrame(f, 1);
  let z = 0;
  for (let i = 2; i < fr.positions.length; i += 3) z += fr.positions[i];
  assert.ok(z <= 0);
});

test("a wrong turn direction is detected by the closure test", () => {
  const { fold: f } = fold(cube());
  const bad = { ...f, faces: f.faces.map((x, i) => (i === 3 ? { ...x, angleDeg: -x.angleDeg } : x)) };
  assert.ok(measureNetFold(bad, netFoldFrame(bad, 1)).closureGapMm > 1);
});
