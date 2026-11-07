import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNet, trianglesOverlap, defaultRoots, A4, MAX_ATTEMPTS } from "./net.ts";
import type { Mesh, Net } from "./net.ts";
import { netToSvg } from "./net-svg.ts";
import { cube, icosahedron, icosphere, bumpy, torus } from "./net-meshes.ts";

function mustBuild(mesh: Mesh): Net {
  const r = buildNet(mesh, A4);
  assert.ok(r.ok, r.ok ? "" : r.refusal.message);
  return r.net;
}

function checkNet(mesh: Mesh, net: Net) {
  const F = mesh.faces.length;
  const E = (F * 3) / 2;
  assert.equal(net.faces.length, F);
  assert.equal(net.edges.length, E);
  // Spanning tree on F faces has F - 1 edges; every other edge is cut and has a tab (R9.3).
  assert.equal(net.edges.filter((e) => e.kind === "fold").length, F - 1);
  assert.equal(net.tabs.length, E - (F - 1));
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
  // Labels are 1..tabs, each used by exactly one tab.
  assert.deepEqual(net.tabs.map((t) => t.label).sort((a, b) => a - b), Array.from({ length: net.tabs.length }, (_, i) => i + 1));
}

test("cube: 12 faces, 11 folds, 7 tabs, no overlap, area matches", () => {
  const mesh = cube();
  const net = mustBuild(mesh);
  checkNet(mesh, net);
  assert.equal(net.tabs.length, 7);
});

test("icosahedron: 20 faces, 19 folds, 11 tabs, no overlap, area matches", () => {
  const mesh = icosahedron();
  const net = mustBuild(mesh);
  checkNet(mesh, net);
  assert.equal(net.tabs.length, 11);
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
  assert.equal((svg.match(/class="fold"/g) ?? []).length, 11);
  assert.equal((svg.match(/class="cut"/g) ?? []).length, 14); // 7 cut edges, two copies each
  assert.equal((svg.match(/class="tab"/g) ?? []).length, 7);
  assert.equal((svg.match(/class="tab-label"/g) ?? []).length, 7);
  assert.equal((svg.match(/class="edge-label"/g) ?? []).length, 7);
  assert.equal((svg.match(/stroke-dasharray/g) ?? []).length, 11 + 1); // folds plus the legend sample
  assert.match(svg, /A4 210 × 297 mm · 12 faces · 7 tabs/);
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /Hollow mode: cut, fold, glue, into a closed volume\./);
  assert.doesNotMatch(svg, /origami/i);
});
