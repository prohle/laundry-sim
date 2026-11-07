import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cpToSvg } from "./cp-to-svg.ts";
import type { Cp, SolverReport } from "./cp-to-svg.ts";

const SOLVER = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "solver/target/release/fold-solver");

function solve(nodes: [number, number][], edges: [number, number, number][]): SolverReport & Record<string, unknown> {
  assert.ok(existsSync(SOLVER), "build the solver first: cargo build --release --manifest-path solver/Cargo.toml");
  const input = JSON.stringify({
    nodes: nodes.map(([x, y], id) => ({ id, x, y })),
    edges: edges.map(([from, to, length]) => ({ from, to, length })),
  });
  const run = spawnSync(SOLVER, [], { input, encoding: "utf8" });
  return JSON.parse(run.stdout);
}

function assertValidCp(r: SolverReport & Record<string, unknown>) {
  assert.equal(r.cp_built, true, `cp_built false, status ${r.cp_status}`);
  const cp = r.cp as Cp;
  assert.ok(cp.vertices.length > 0, "vertices");
  assert.ok(cp.creases.length > 0, "creases");
  for (const [x, y] of cp.vertices) {
    assert.ok(x >= -1e-9 && x <= 1 + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9, `vertex (${x}, ${y}) outside [0,1]`);
  }
  for (const c of cp.creases) {
    assert.ok(Number.isInteger(c.from) && c.from >= 0 && c.from < cp.vertices.length, `bad from ${c.from}`);
    assert.ok(Number.isInteger(c.to) && c.to >= 0 && c.to < cp.vertices.length, `bad to ${c.to}`);
    assert.ok(["M", "V", "F", "B", "U"].includes(c.fold));
  }
}

test("a solved star yields a valid crease pattern", () => {
  assertValidCp(solve([[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.5, 0.9]], [[0, 1, 1], [0, 2, 1], [0, 3, 1]]));
});

test("a solved four-legged tree yields a valid crease pattern", () => {
  const nodes: [number, number][] = [[0, 3], [0, 1], [0, -1], [0, -3], [-1, 0], [1, 0], [-1, -2], [1, -2]];
  const edges: [number, number, number][] = [[0, 1, 2], [1, 2, 2], [2, 3, 2], [1, 4, 1.4], [1, 5, 1.4], [2, 6, 1.4], [2, 7, 1.4]];
  assertValidCp(solve(nodes, edges));
});

const cp: Cp = {
  vertices: [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]],
  creases: [
    { from: 0, to: 4, fold: "V" },
    { from: 2, to: 4, fold: "M" },
    { from: 0, to: 1, fold: "B" },
    { from: 1, to: 4, fold: "F" },
  ],
};

test("svg states paper size, crease count, legend, and line styles", () => {
  const svg = cpToSvg(cp, 200);
  assert.match(svg, /width="220mm"/);
  assert.match(svg, /Paper: 200 × 200 mm square/);
  assert.match(svg, /Creases: 4 {2}Vertices: 5/);
  assert.match(svg, /Valley \(solid\)/);
  assert.match(svg, /Mountain \(dashed\)/);
  assert.match(svg, /stroke-dasharray="2.4 1.2"/); // mountain only
  assert.doesNotMatch(svg, /not computed/);
});

test("svg refuses to look foldable when no crease is mountain or valley", () => {
  const flat: Cp = { ...cp, creases: cp.creases.map((c) => ({ ...c, fold: "F" as const })) };
  const svg = cpToSvg(flat, 150);
  assert.match(svg, /Mountain\/valley not computed\. Do not fold from this sheet\./);
  assert.doesNotMatch(svg, /Valley \(solid\)/);
});

test("svg rejects a crease with a missing vertex", () => {
  assert.throws(() => cpToSvg({ vertices: [[0, 0]], creases: [{ from: 0, to: 3, fold: "V" }] }));
});
