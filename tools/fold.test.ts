import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cpToFold, validateFold } from "./fold.ts";
import type { Cp } from "./cp-to-svg.ts";

const SOLVER = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "solver/target/release/fold-solver");

function square(): Cp & { faces: number[][] } {
  return {
    vertices: [[0, 0], [1, 0], [1, 1], [0, 1]],
    creases: [
      { from: 0, to: 1, fold: "B" }, { from: 1, to: 2, fold: "B" }, { from: 2, to: 3, fold: "B" },
      { from: 3, to: 0, fold: "B" }, { from: 0, to: 2, fold: "V" },
    ],
    faces: [[0, 1, 2], [0, 2, 3]],
  };
}

test("writes the FOLD 1.1 fields and validates a good pattern", () => {
  const { fold, facesOmitted } = cpToFold(square(), { cpStatus: "has_full_cp" });
  assert.equal(fold.file_spec, 1.1);
  assert.ok(fold.file_creator);
  assert.equal(fold.vertices_coords.length, 4);
  assert.deepEqual(fold.edges_assignment, ["B", "B", "B", "B", "V"]);
  assert.equal(facesOmitted, null);
  assert.deepEqual(fold.faces_vertices, [[0, 1, 2], [0, 2, 3]]);
  const v = validateFold(fold);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
  assert.ok(Math.abs(v.faceArea! - 1) < 1e-12);
});

test("faces_vertices is omitted, with the reason, when the solver gave none", () => {
  const cp = { ...square(), faces: [], faces_note: "facet 3 is not well formed" };
  const { fold, facesOmitted } = cpToFold(cp);
  assert.equal("faces_vertices" in fold, false);
  assert.equal(facesOmitted, "facet 3 is not well formed");
  assert.equal(validateFold(fold).ok, true);
});

test("a malformed face is omitted rather than written", () => {
  const { fold, facesOmitted } = cpToFold({ ...square(), faces: [[0, 1, 9]] });
  assert.equal("faces_vertices" in fold, false);
  assert.match(facesOmitted!, /malformed/);
});

test("the validator rejects each structural fault", () => {
  const mutate = (f: (x: ReturnType<typeof cpToFold>["fold"]) => void) => {
    const { fold } = cpToFold(square());
    f(fold);
    return validateFold(fold);
  };
  assert.match(mutate((x) => (x.edges_vertices[0] = [0, 9])).errors.join(), /outside 0\.\.3/);
  assert.match(mutate((x) => (x.edges_vertices[0] = [2, 2])).errors.join(), /self-loop/);
  assert.match(mutate((x) => x.edges_assignment.pop()).errors.join(), /4 entries for 5 edges/);
  assert.match(mutate((x) => (x.edges_assignment[0] = "Q")).errors.join(), /"Q"/);
  assert.match(mutate((x) => (x.vertices_coords[1] = [1.5, 0])).errors.join(), /outside \[0,1\]/);
  assert.match(mutate((x) => (x.vertices_coords[1] = [Number.NaN, 0])).errors.join(), /not finite/);
  assert.match(mutate((x) => (x.faces_vertices = [[0, 2, 1], [0, 2, 3]])).errors.join(), /not counter-clockwise/);
  assert.match(mutate((x) => (x.faces_vertices = [[1, 3, 2], [0, 2, 3]])).errors.join(), /not an edge/);
  assert.equal(mutate((x) => (x.edges_vertices = [])).ok, false);
});

test("all-flat patterns are marked as not assigned", () => {
  const cp = square();
  cp.creases.forEach((c) => (c.fold = "F"));
  const { fold } = cpToFold(cp);
  assert.equal(fold["fold:mountain_valley_computed"], false);
  assert.match(validateFold(fold).warnings.join(), /mountain\/valley not computed/);
});

test("a real solver pattern exports to a valid FOLD with faces", () => {
  assert.ok(existsSync(SOLVER), "build the solver first");
  const star = {
    nodes: [{ id: 0, x: 0.5, y: 0.5 }, { id: 1, x: 0.1, y: 0.1 }, { id: 2, x: 0.9, y: 0.1 }, { id: 3, x: 0.5, y: 0.9 }],
    edges: [{ from: 0, to: 1, length: 1 }, { from: 0, to: 2, length: 1 }, { from: 0, to: 3, length: 1 }],
  };
  const r = JSON.parse(spawnSync(SOLVER, [], { input: JSON.stringify(star), encoding: "utf8" }).stdout);
  assert.equal(r.cp_built, true);
  const { fold, facesOmitted } = cpToFold(r.cp, { cpStatus: r.cp_status });
  const v = validateFold(fold);
  assert.deepEqual(v.errors, []);
  assert.equal(fold.edges_assignment.length, r.cp.creases.length);
  assert.equal(facesOmitted === null, "faces_vertices" in fold);
});
