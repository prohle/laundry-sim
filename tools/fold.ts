/**
 * Solver crease pattern -> FOLD 1.1 (https://github.com/edemaine/fold), plus a structural validator.
 *
 *   node tools/fold.ts <solver.json> [--out file.fold.json]
 *
 * Fields written: file_spec, file_creator, file_classes, frame_classes, vertices_coords,
 * edges_vertices, edges_assignment, and faces_vertices when the solver supplied well-formed
 * facets. Assignment letters are the solver's own: M, V, F, B (and U for an unknown code).
 *
 * `faces_vertices` is omitted, never guessed, when `cp.faces` is empty; `faces_note` says why.
 *
 * Two custom keys (FOLD reserves the `author:` prefix for them) carry what the format has no
 * place for: `fold:cp_status` and `fold:mountain_valley_computed`. When the second is false,
 * every crease is F and the file must not be read as a foldable assignment.
 *
 * The validator is structural only. It does not check Kawasaki or Maekawa (task 2.4).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Cp } from "./cp-to-svg.ts";

export interface FoldFile {
  file_spec: number;
  file_creator: string;
  file_classes: string[];
  frame_classes: string[];
  vertices_coords: [number, number][];
  edges_vertices: [number, number][];
  edges_assignment: string[];
  faces_vertices?: number[][];
  "fold:cp_status"?: string;
  "fold:mountain_valley_computed": boolean;
}

export interface FoldValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Total area of faces_vertices polygons (the sheet is 1), or null when there are no faces. */
  faceArea: number | null;
}

export interface FoldResult {
  fold: FoldFile;
  /** Present when faces_vertices was omitted: the reason. */
  facesOmitted: string | null;
}

const EPS = 1e-9;
const LETTERS = new Set(["M", "V", "F", "B", "U"]);

export function cpToFold(
  cp: Cp & { faces?: number[][]; faces_note?: string | null },
  meta: { cpStatus?: string | null; creator?: string } = {},
): FoldResult {
  const fold: FoldFile = {
    file_spec: 1.1,
    file_creator: meta.creator ?? "Fold (fold-solver, treemaker-core)",
    file_classes: ["singleModel"],
    frame_classes: ["creasePattern"],
    vertices_coords: cp.vertices.map(([x, y]) => [x, y]),
    edges_vertices: cp.creases.map((c) => [c.from, c.to]),
    edges_assignment: cp.creases.map((c) => c.fold),
    "fold:mountain_valley_computed": cp.creases.some((c) => c.fold === "M" || c.fold === "V"),
  };
  if (meta.cpStatus) fold["fold:cp_status"] = meta.cpStatus;

  let facesOmitted: string | null = null;
  if (cp.faces && cp.faces.length > 0) {
    // Same pre-check as the validator: do not write a face list that is already known to be bad.
    const bad = cp.faces.findIndex(
      (f) => f.length < 3 || f.some((v) => !Number.isInteger(v) || v < 0 || v >= cp.vertices.length),
    );
    if (bad >= 0) facesOmitted = `face ${bad} is malformed`;
    else fold.faces_vertices = cp.faces.map((f) => [...f]);
  } else {
    facesOmitted = cp.faces_note ?? "the solver supplied no faces";
  }
  return { fold, facesOmitted };
}

export function validateFold(fold: FoldFile): FoldValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const v = fold.vertices_coords;
  const e = fold.edges_vertices;
  const a = fold.edges_assignment;

  if (fold.file_spec !== 1.1) errors.push(`file_spec is ${fold.file_spec}, expected 1.1`);
  if (!Array.isArray(v) || v.length === 0) errors.push("vertices_coords is empty");
  if (!Array.isArray(e) || e.length === 0) errors.push("edges_vertices is empty");
  if (errors.length) return { ok: false, errors, warnings, faceArea: null };

  v.forEach(([x, y], i) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push(`vertex ${i} is not finite`);
    else if (x < -EPS || x > 1 + EPS || y < -EPS || y > 1 + EPS) errors.push(`vertex ${i} (${x}, ${y}) is outside [0,1]`);
  });

  const edgeKeys = new Set<string>();
  e.forEach(([p, q], i) => {
    if (!Number.isInteger(p) || !Number.isInteger(q) || p < 0 || q < 0 || p >= v.length || q >= v.length) {
      errors.push(`edge ${i} [${p}, ${q}] has an index outside 0..${v.length - 1}`);
    } else if (p === q) {
      errors.push(`edge ${i} is a self-loop on vertex ${p}`);
    } else {
      edgeKeys.add(p < q ? `${p},${q}` : `${q},${p}`);
    }
  });

  if (!Array.isArray(a) || a.length !== e.length) {
    errors.push(`edges_assignment has ${a?.length ?? "no"} entries for ${e.length} edges`);
  } else {
    a.forEach((l, i) => {
      if (!LETTERS.has(l)) errors.push(`edge ${i} has assignment "${l}", expected one of M V F B U`);
    });
  }

  let faceArea: number | null = null;
  if (fold.faces_vertices) {
    faceArea = 0;
    fold.faces_vertices.forEach((f, i) => {
      if (f.length < 3) return void errors.push(`face ${i} has ${f.length} vertices`);
      if (f.some((x) => !Number.isInteger(x) || x < 0 || x >= v.length)) {
        return void errors.push(`face ${i} has a vertex index outside 0..${v.length - 1}`);
      }
      if (new Set(f).size !== f.length) errors.push(`face ${i} repeats a vertex`);
      let area = 0;
      f.forEach((p, k) => {
        const q = f[(k + 1) % f.length];
        area += v[p][0] * v[q][1] - v[q][0] * v[p][1];
        if (!edgeKeys.has(p < q ? `${p},${q}` : `${q},${p}`)) errors.push(`face ${i} uses [${p}, ${q}], which is not an edge`);
      });
      area /= 2;
      if (!(area > 0)) errors.push(`face ${i} is not counter-clockwise (signed area ${area})`);
      faceArea! += area;
    });
    if (Math.abs(faceArea - 1) > 1e-6) {
      warnings.push(`faces cover ${faceArea.toFixed(4)} of the unit sheet, not 1: part of the paper has no face`);
    }
  }
  if (!fold["fold:mountain_valley_computed"]) {
    warnings.push("mountain/valley not computed: every crease is F or U; not a fold assignment");
  }
  return { ok: errors.length === 0, errors, warnings, faceArea };
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): number {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) {
    console.error("usage: node tools/fold.ts <solver.json> [--out file.fold.json]");
    return 2;
  }
  const report = JSON.parse(readFileSync(input, "utf8"));
  if (!report.cp || !report.cp_built) {
    console.error(`no crease pattern in ${input} (cp_built=${report.cp_built}, status=${report.cp_status})`);
    return 1;
  }
  const { fold, facesOmitted } = cpToFold(report.cp, { cpStatus: report.cp_status });
  const check = validateFold(fold);
  const out = arg("out", input.replace(/\.json$/, "") + ".fold.json");
  writeFileSync(out, JSON.stringify(fold) + "\n");
  console.log(`wrote ${out}  valid=${check.ok}${facesOmitted ? `  faces_vertices omitted: ${facesOmitted}` : ""}`);
  for (const m of check.errors) console.log(`  error: ${m}`);
  for (const m of check.warnings) console.log(`  warning: ${m}`);
  return check.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
