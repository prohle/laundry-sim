/**
 * Solver JSON -> SVG crease pattern at a stated paper size in millimetres.
 *
 *   node tools/cp-to-svg.ts <solver.json> [--size 150] [--out file.svg]
 *
 * Input is the report printed by ./solver (it must contain `cp`).
 * Line vocabulary:
 *   valley    solid, black
 *   mountain  dashed, black
 *   border    hairline, grey (also drawn for the paper outline)
 *   flat      very light dotted grey: a crease the solver says is not folded
 *   unassigned (only when the report has no M and no V at all) thin black solid
 *
 * If no crease is M or V, mountain/valley was not computed. The sheet then says
 * so in a banner and in the legend; it must not be read as a foldable pattern
 * (product rule: no print without a valid assignment or an explicit collapse).
 * Not a UI, no dependencies.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type FoldLetter = "M" | "V" | "F" | "B" | "U";
export interface CpCrease { from: number; to: number; fold: FoldLetter; raw?: number }
export interface Cp { vertices: [number, number][]; creases: CpCrease[]; fold_counts?: Record<string, number> }
export interface SolverReport { cp?: Cp | null; cp_built?: boolean; cp_status?: string | null; scale?: number }

const MARGIN = 10; // mm
const LEGEND_H = 34; // mm

const f = (n: number) => n.toFixed(3);

export function foldDistribution(cp: Cp): Record<string, number> {
  const d: Record<string, number> = {};
  for (const c of cp.creases) d[c.fold] = (d[c.fold] ?? 0) + 1;
  return d;
}

export function cpToSvg(cp: Cp, sizeMm = 150, meta: { cpStatus?: string | null; title?: string } = {}): string {
  if (!(sizeMm > 0)) throw new Error("paper size must be positive");
  const dist = foldDistribution(cp);
  const assigned = (dist.M ?? 0) + (dist.V ?? 0) > 0;
  const W = sizeMm + 2 * MARGIN;
  const H = sizeMm + 2 * MARGIN + LEGEND_H;
  // TreeMaker y points up; SVG y points down.
  const X = (x: number) => MARGIN + x * sizeMm;
  const Y = (y: number) => MARGIN + (1 - y) * sizeMm;

  const lines: Record<string, string[]> = { V: [], M: [], B: [], F: [], U: [] };
  for (const c of cp.creases) {
    const a = cp.vertices[c.from], b = cp.vertices[c.to];
    if (!a || !b) throw new Error(`crease references missing vertex ${c.from}/${c.to}`);
    const key = c.fold === "F" && !assigned ? "U" : c.fold; // all-flat means "not computed"
    (lines[key] ?? lines.U).push(`<line x1="${f(X(a[0]))}" y1="${f(Y(a[1]))}" x2="${f(X(b[0]))}" y2="${f(Y(b[1]))}"/>`);
  }

  const style = {
    V: 'stroke="#000" stroke-width="0.35"',
    M: 'stroke="#000" stroke-width="0.35" stroke-dasharray="2.4 1.2"',
    B: 'stroke="#888" stroke-width="0.1"',
    F: 'stroke="#bbb" stroke-width="0.1" stroke-dasharray="0.3 0.8"',
    U: 'stroke="#000" stroke-width="0.2"',
  } as const;

  const ly = MARGIN + sizeMm + 8; // legend baseline
  const key = (y: number, st: string, label: string) =>
    `<line x1="${MARGIN}" y1="${f(y)}" x2="${MARGIN + 14}" y2="${f(y)}" fill="none" ${st}/>` +
    `<text x="${MARGIN + 17}" y="${f(y + 1.1)}">${label}</text>`;
  const counts = (["V", "M", "B", "F", "U"] as const).filter((k) => dist[k]).map((k) => `${k} ${dist[k]}`).join(", ");

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="3">`);
  parts.push(`<title>${meta.title ?? "Fold crease pattern"}</title>`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  // Paper outline: hairline grey, always.
  parts.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${sizeMm}" height="${sizeMm}" fill="none" ${style.B}/>`);
  for (const k of ["F", "B", "U", "M", "V"] as const) {
    if (lines[k].length) parts.push(`<g fill="none" stroke-linecap="round" ${style[k]}>${lines[k].join("")}</g>`);
  }
  if (!assigned) {
    parts.push(
      `<text x="${f(W / 2)}" y="${f(MARGIN - 3.5)}" text-anchor="middle" font-size="3.6" font-weight="bold" fill="#b00">` +
        `Mountain/valley not computed. Do not fold from this sheet.</text>`,
    );
  }
  // Legend.
  parts.push(`<g>`);
  if (assigned) {
    parts.push(key(ly, style.V, "Valley (solid)"), key(ly + 5, style.M, "Mountain (dashed)"));
  } else {
    parts.push(key(ly, style.U, "Crease, mountain/valley unassigned"));
  }
  parts.push(key(assigned ? ly + 10 : ly + 5, style.B, "Paper edge (hairline grey)"));
  if (assigned && dist.F) parts.push(key(ly + 15, style.F, "Flat, not folded (dotted)"));
  const tx = MARGIN + 75;
  parts.push(
    `<text x="${tx}" y="${f(ly + 1.1)}">Paper: ${sizeMm} × ${sizeMm} mm square</text>`,
    `<text x="${tx}" y="${f(ly + 6.1)}">Creases: ${cp.creases.length}  Vertices: ${cp.vertices.length}</text>`,
    `<text x="${tx}" y="${f(ly + 11.1)}">By fold: ${counts || "none"}</text>`,
  );
  if (meta.cpStatus) parts.push(`<text x="${tx}" y="${f(ly + 16.1)}">Solver status: ${meta.cpStatus}</text>`);
  parts.push(`</g></svg>`);
  return parts.join("\n") + "\n";
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function main(): number {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) {
    console.error("usage: node tools/cp-to-svg.ts <solver.json> [--size 150] [--out file.svg]");
    return 2;
  }
  const size = Number(arg("size", "150"));
  const report = JSON.parse(readFileSync(input, "utf8")) as SolverReport;
  if (!report.cp || report.cp.creases.length === 0) {
    console.error(`no crease pattern in ${input} (cp_built=${report.cp_built}, status=${report.cp_status})`);
    return 1;
  }
  const out = arg("out", input.replace(/\.json$/, "") + ".svg");
  writeFileSync(out, cpToSvg(report.cp, size, { cpStatus: report.cp_status }));
  console.log(`wrote ${out}  ${size} mm, ${report.cp.creases.length} creases`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
