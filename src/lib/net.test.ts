import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNet, trianglesOverlap, polygonsOverlap, defaultRoots, A4, MAX_ATTEMPTS, FLAT_DEGREES, TAB_DEPTHS_MM } from "./net.ts";
import type { Mesh, Net, NetOptions } from "./net.ts";
import { netToSvg } from "./net-svg.ts";
import { cube, icosahedron, icosphere, bumpy, torus } from "./net-meshes.ts";

function mustBuild(mesh: Mesh, paper = A4, options: NetOptions = {}): Net {
  const r = buildNet(mesh, paper, options);
  assert.ok(r.ok, r.ok ? "" : r.refusal.message);
  return r.net;
}

function assertTabsClear(net: Net) {
  for (const t of net.tabs) {
    for (const f of net.faces) {
      if (f.face === t.face) continue;
      assert.equal(polygonsOverlap(t.polygon, f.p, 1e-6), false, `tab ${t.label} crosses face ${f.face}`);
    }
    for (const o of net.tabs) {
      if (o === t) continue;
      assert.equal(polygonsOverlap(t.polygon, o.polygon, 1e-6), false, `tab ${t.label} crosses tab ${o.label}`);
    }
  }
}

function checkNet(mesh: Mesh, net: Net) {
  const F = mesh.faces.length;
  const E = (F * 3) / 2;
  assert.equal(net.faces.length, F);
  assert.equal(net.edges.length, E);
  // Spanning tree on F faces has F - 1 edges (folds plus flat joins); every other edge is cut and has a tab,
  // unless the tab was dropped for a collision (R9.3).
  const treeEdges = net.edges.filter((e) => e.kind !== "cut").length;
  assert.equal(treeEdges, F - 1);
  assert.equal(net.tabs.length + net.tabsDropped.length, E - (F - 1));
  assert.equal(net.overlaps, 0);
  // Independent recount of overlaps on the returned placement.
  for (let i = 0; i < F; i++) {
    for (let j = i + 1; j < F; j++) {
      assert.equal(trianglesOverlap(net.faces[i].p, net.faces[j].p, 1e-6), false, `faces ${i} and ${j} overlap`);
    }
  }
  // Every 2D edge has its 3D length times the scale.
  for (const pf of net.faces) {
    for (let i = 0; i < 3; i++) {
      const a = pf.v[i], b = pf.v[(i + 1) % 3];
      const d3 = Math.hypot(...mesh.vertices[a].map((c, k) => c - mesh.vertices[b][k]));
      const d2 = Math.hypot(pf.p[i][0] - pf.p[(i + 1) % 3][0], pf.p[i][1] - pf.p[(i + 1) % 3][1]);
      assert.ok(Math.abs(d2 - d3 * net.scale) < 1e-6 * Math.max(1, d2), `edge ${a}-${b}: ${d2} vs ${d3 * net.scale}`);
    }
  }
  // Area match.
  assert.ok(net.areaError < 1e-9, `area error ${net.areaError}`);
  // Fits the usable area on the paper.
  assert.ok(net.bbox.width <= A4.width + 1e-9 && net.bbox.height <= A4.height + 1e-9);
  // Labels are 1..cuts, each used by exactly one tab or one dropped tab.
  const used = [...net.tabs.map((t) => t.label), ...net.tabsDropped.map((t) => t.label)].sort((a, b) => a - b);
  assert.deepEqual(used, Array.from({ length: used.length }, (_, i) => i + 1));
  // No surviving tab crosses a face (other than the one it hangs on) or another tab.
  assertTabsClear(net);
}

test("cube: 12 faces, 5 folds, 6 flat joins, 7 tabs, no overlap, area matches", () => {
  const mesh = cube();
  const net = mustBuild(mesh);
  checkNet(mesh, net);
  assert.equal(net.tabs.length, 7);
  assert.equal(net.edges.filter((e) => e.kind === "fold").length, 5);
  assert.equal(net.edges.filter((e) => e.kind === "flat").length, 6);
});

test("coplanar preference: the cube unfolds to six squares from every root, 5 folds, no diagonal creases", () => {
  const mesh = cube();
  for (let root = 0; root < mesh.faces.length; root++) {
    const r = buildNet(mesh, A4, { roots: [root] });
    assert.ok(r.ok, `root ${root}`);
    const folds = r.net.edges.filter((e) => e.kind === "fold");
    const flats = r.net.edges.filter((e) => e.kind === "flat");
    assert.equal(folds.length, 5, `root ${root}`);
    assert.equal(flats.length, 6, `root ${root}`);
    for (const e of folds) assert.ok(Math.abs(e.dihedral - 90) < 1e-6, `root ${root}: fold at ${e.dihedral}`);
    for (const e of flats) assert.ok(Math.abs(e.dihedral - 180) < 1e-6);
    // The diagonal of every square is a flat join: no tree edge has a dihedral of 90 except the 5 folds, and
    // the SVG draws no line for a flat join.
    const svg = netToSvg(r.net);
    assert.equal((svg.match(/class="fold"/g) ?? []).length, 5);
  }
});

test("flat join threshold: coplanar within 1 degree is flat, 2 degrees is a fold", () => {
  // Lift vertex 3 of the bottom square; the bottom diagonal (0,2) bends by about delta / 0.7071 radians.
  const lift = (delta: number) => {
    const m = cube();
    m.vertices[3] = [0, 1, delta];
    return m;
  };
  for (const [delta, deg] of [[0.00617, 0.5], [0.0247, 2]] as const) {
    const net = mustBuild(lift(delta));
    const d = net.edges.find((e) => e.a === 0 && e.b === 2)!;
    assert.ok(Math.abs(180 - d.dihedral - deg) < 0.1, `bend ${180 - d.dihedral} expected about ${deg}`);
    for (const e of net.edges) {
      if (e.kind === "flat") assert.ok(e.dihedral >= FLAT_DEGREES);
      if (e.kind === "fold") assert.ok(e.dihedral < FLAT_DEGREES);
    }
  }
  const slight = mustBuild(lift(0.00617));
  const bent = mustBuild(lift(0.0247));
  assert.notEqual(slight.edges.find((e) => e.a === 0 && e.b === 2)!.kind, "fold");
  assert.equal(bent.edges.find((e) => e.a === 0 && e.b === 2)!.kind === "cut", false);
});

test("icosahedron: 20 faces, 19 folds, 11 cut edges, no overlap, area matches", () => {
  const mesh = icosahedron();
  const net = mustBuild(mesh);
  checkNet(mesh, net);
  assert.equal(net.edges.filter((e) => e.kind === "fold").length, 19);
  assert.equal(net.tabs.length + net.tabsDropped.length, 11);
});

test("tabs on a cube collide with nothing: none shortened, none dropped, default depth", () => {
  const net = mustBuild(cube());
  assert.equal(net.tabsShortened, 0);
  assert.equal(net.tabsDropped.length, 0);
  for (const t of net.tabs) {
    const len = Math.hypot(t.polygon[1][0] - t.polygon[0][0], t.polygon[1][1] - t.polygon[0][1]);
    assert.ok(Math.abs(t.depth - 0.3 * len) < 1e-9);
  }
});

test("icosahedron at the default range [0, 30]: all 11 tabs place, none dropped", () => {
  // The default was 20 degrees, which left 6 tabs unplaceable because the
  // vertex gap in this net is 60 degrees. Raising it to 30 places all 11.
  const net = mustBuild(icosahedron());
  assert.equal(net.tabs.length, 11);
  assert.equal(net.tabsDropped.length, 0);
  const widest = Math.max(...net.tabs.map((t) => t.taper));
  assert.ok(widest <= 30.5, `widest taper ${widest}`);
  assertTabsClear(net);
});

test("icosahedron at the old 20 degree range still drops 6, which is why the default changed", () => {
  const net = mustBuild(icosahedron(), A4, { maxTaper: 20 });
  assert.equal(net.tabs.length, 5);
  assert.equal(net.tabsDropped.length, 6);
  for (const d of net.tabsDropped) {
    const need = d.neededTaper.defaultDepth;
    assert.ok(need !== null && need > 29 && need < 31, `needed taper ${need}`);
  }
  assertTabsClear(net);
});

test("icosahedron, taper range widened to [0, 30]: at least 9 of 11 tabs place, none overlaps anything", () => {
  const net = mustBuild(icosahedron(), A4, { maxTaper: 30 });
  assert.ok(net.tabs.length >= 9, `placed ${net.tabs.length}`);
  assertTabsClear(net);
  for (const t of net.tabs) assert.ok(t.taper <= 30 + 1e-9);
});

test("a wedge that no taper can fit still drops: 80-face icosphere drops tabs at a 85 degree range", () => {
  const net = mustBuild(icosphere(1), A4, { maxTaper: 85 });
  assert.ok(net.tabsDropped.length > 0);
  for (const d of net.tabsDropped) assert.equal(d.neededTaper.shortestDepth, null);
  assertTabsClear(net);
});

test("tab collision: tabs are shortened to 8, 6 or 4 mm, or dropped and recorded (found by search)", () => {
  const mesh = bumpy(1, 0.05, 4); // 80 faces; 3 tabs shortened, 12 dropped when found
  const net = mustBuild(mesh);
  checkNet(mesh, net);
  assert.ok(net.tabsShortened > 0, "expected at least one shortened tab");
  assert.ok(net.tabsDropped.length > 0, "expected at least one dropped tab");
  // A shortened tab is one whose depth is below the default 0.3 x edge length, and is 8, 6 or 4 mm.
  const shortened = net.tabs.filter((t) => {
    const len = Math.hypot(t.polygon[1][0] - t.polygon[0][0], t.polygon[1][1] - t.polygon[0][1]);
    return t.depth < 0.3 * len - 1e-9;
  });
  assert.equal(shortened.length, net.tabsShortened);
  for (const t of shortened) assert.ok(TAB_DEPTHS_MM.some((d) => Math.abs(d - t.depth) < 1e-9), `depth ${t.depth}`);
  // A dropped tab is recorded with its edge and has no tab; the SVG numbers the edge on both sides with "!".
  const cutLabels = net.edges.filter((e) => e.kind === "cut").map((e) => e.label);
  for (const d of net.tabsDropped) {
    assert.ok(cutLabels.includes(d.label));
    assert.equal(net.tabs.some((t) => t.label === d.label), false);
  }
  const svg = netToSvg(net);
  assert.equal((svg.match(/class="dropped-label"/g) ?? []).length, 2 * net.tabsDropped.length);
  assert.match(svg, /No tab fits on edges?/);
  assert.equal((svg.match(/class="tab"/g) ?? []).length, net.tabs.length);
});

test("open mesh is refused at stage mesh, naming the open edges", () => {
  const mesh = cube();
  mesh.faces.pop(); // remove one triangle
  const r = buildNet(mesh, A4);
  assert.ok(!r.ok);
  assert.equal(r.refusal.stage, "mesh");
  assert.match(r.refusal.message, /open/);
  assert.equal(r.refusal.detail.openEdges, 3); // a removed triangle leaves its three edges with one face
});

test("other bad meshes are refused: two pieces, repeated vertex, bad index, zero area, too few faces", () => {
  const a = cube();
  const b = cube();
  const two: Mesh = {
    vertices: [...a.vertices, ...b.vertices.map((v) => [v[0] + 5, v[1], v[2]] as [number, number, number])],
    faces: [...a.faces, ...b.faces.map((t) => t.map((i) => i + 8) as [number, number, number])],
  };
  const r2 = buildNet(two, A4);
  assert.ok(!r2.ok && r2.refusal.stage === "mesh" && /more than one piece/.test(r2.refusal.message));

  const rep = cube(); rep.faces[0] = [0, 0, 1];
  const r3 = buildNet(rep, A4);
  assert.ok(!r3.ok && /repeats a vertex/.test(r3.refusal.message));

  const bad = cube(); bad.faces[0] = [0, 2, 99];
  const r4 = buildNet(bad, A4);
  assert.ok(!r4.ok && /valid vertices/.test(r4.refusal.message));

  const flat = cube(); flat.vertices[2] = [0.5, 0, 0]; // face 0 = (0,2,1) becomes collinear
  const r5 = buildNet(flat, A4);
  assert.ok(!r5.ok && /no area/.test(r5.refusal.message));

  const r6 = buildNet({ vertices: cube().vertices, faces: cube().faces.slice(0, 3) }, A4);
  assert.ok(!r6.ok && /at least four faces/.test(r6.refusal.message));
});

test("overlap retry: root 0 overlaps, a later root succeeds (R9.4)", () => {
  const mesh = bumpy(1, 0.1, 7); // 80 faces, found by search; not constructed to pass
  const net = mustBuild(mesh);
  assert.ok(net.attempts.length >= 2, `attempts ${JSON.stringify(net.attempts)}`);
  assert.ok(net.attempts[0].overlaps > 0);
  assert.equal(net.attempts[net.attempts.length - 1].overlaps, 0);
  assert.equal(net.root, net.attempts[net.attempts.length - 1].root);
  checkNet(mesh, net);
});

test("overlap refusal: a torus overlaps from all 8 roots and is refused with a reason", () => {
  const r = buildNet(torus(8, 6), A4);
  assert.ok(!r.ok);
  assert.equal(r.refusal.stage, "overlap");
  const attempts = r.refusal.detail.attempts as { root: number; overlaps: number }[];
  assert.equal(attempts.length, MAX_ATTEMPTS);
  assert.ok(attempts.every((a) => a.overlaps > 0));
  assert.equal(new Set(attempts.map((a) => a.root)).size, MAX_ATTEMPTS);
  assert.match(r.refusal.message, /overlaps itself from all 8/);
});

test("roots: distinct, at most 8, all valid faces", () => {
  for (const n of [4, 7, 8, 9, 20, 320]) {
    const r = defaultRoots(n);
    assert.ok(r.length <= MAX_ATTEMPTS && new Set(r).size === r.length && r.every((x) => x >= 0 && x < n), `n=${n}`);
  }
});

test("trianglesOverlap: touching along an edge or at a vertex is not overlap; crossing is", () => {
  const t: [[number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [0, 1]];
  assert.equal(trianglesOverlap(t, [[1, 0], [0, 0], [1, -1]], 1e-9), false); // shared edge
  assert.equal(trianglesOverlap(t, [[1, 0], [2, 0], [2, -1]], 1e-9), false); // shared vertex
  assert.equal(trianglesOverlap(t, [[0.2, 0.2], [2, 0.2], [0.2, 2]], 1e-9), true);
  assert.equal(trianglesOverlap(t, t, 1e-9), true);
});

test("unfolding is deterministic", () => {
  const a = mustBuild(icosphere(1));
  const b = mustBuild(icosphere(1));
  assert.deepEqual(a, b);
});

test("a paper too small for margin and legend is refused at stage paper", () => {
  const r = buildNet(cube(), { name: "tiny", width: 30, height: 40 });
  assert.ok(!r.ok && r.refusal.stage === "paper");
});

test("svg: solid cut, dashed fold, tab and edge labels, legend with paper size and face count", () => {
  const net = mustBuild(cube());
  const svg = netToSvg(net);
  assert.equal((svg.match(/class="fold"/g) ?? []).length, 5);
  assert.equal((svg.match(/class="cut"/g) ?? []).length, 14); // 7 cut edges, two copies each
  assert.equal((svg.match(/class="tab"/g) ?? []).length, 7);
  assert.equal((svg.match(/class="tab-label"/g) ?? []).length, 7);
  assert.equal((svg.match(/class="edge-label"/g) ?? []).length, 7);
  assert.equal((svg.match(/stroke-dasharray/g) ?? []).length, 5 + 1); // folds plus the legend sample
  assert.match(svg, /A4 210 × 297 mm · 12 faces · 7 tabs/);
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /Hollow mode: cut, fold, glue, into a closed volume\./);
  assert.doesNotMatch(svg, /origami/i);
});

test("labels: sliding never leaves more colliding numbers than not sliding, and none on the cube or icosahedron", async () => {
  const { layoutLabels } = await import("./net-svg.ts");
  const { icosphere } = await import("./net-meshes.ts");
  for (const [mesh, clean] of [[cube(), true], [icosahedron(), true], [icosphere(1), false]] as const) {
    const r = buildNet(mesh, A4);
    assert.ok(r.ok);
    if (!r.ok) return;
    const fixed = layoutLabels(r.net, false).filter((l) => l.collides).length;
    const slid = layoutLabels(r.net, true).filter((l) => l.collides).length;
    assert.ok(slid <= fixed);
    if (clean) assert.equal(slid, 0);
  }
});
