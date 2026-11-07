/**
 * SVG for a Hollow-mode net (R9.5). Cut lines solid, fold lines dashed, tabs numbered, a legend with
 * paper size and face count. Millimetres throughout, so it prints at size.
 * Hollow mode cuts; this file never says "origami".
 */
import { LEGEND_MM, MARGIN_MM, polygonsOverlap } from "./net.ts";
import type { Net, Vec2 } from "./net.ts";

const f = (n: number) => n.toFixed(3);
const pt = (p: Vec2) => `${f(p[0])},${f(p[1])}`;


const FONT_MM = 3;
export interface PlacedLabel {
  kind: "tab" | "edge" | "dropped";
  label: number;
  text: string;
  x: number;
  y: number;
  /** True when no position along the edge was clear; the label is placed where it collides least. */
  collides: boolean;
}

const rectOf = (x: number, y: number, text: string): Vec2[] => {
  const hw = (text.length * 0.6 * FONT_MM) / 2 + 0.3;
  const hh = FONT_MM / 2 + 0.2;
  return [[x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh]];
};

/**
 * Where every number goes. A number starts at its natural spot (the tab's centre, or just outside the cut edge)
 * and slides along its edge until its box touches no other number, no other tab and no face but its own.
 * Tab numbers are placed first, then edge numbers. A number with no clear spot is reported, not hidden.
 */
export function layoutLabels(net: Net, slide = true): PlacedLabel[] {
  const droppedLabels = new Set(net.tabsDropped.map((d) => d.label));
  const byKey = new Map(net.edges.map((e) => [`${e.a},${e.b}`, e]));
  interface Want { kind: PlacedLabel["kind"]; label: number; text: string; x: number; y: number; ux: number; uy: number; reach: number; ownFace: number; ownTab: number }
  const wants: Want[] = [];

  for (const t of net.tabs) {
    const [a, b, c, d] = t.polygon;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const outer = Math.hypot(c[0] - d[0], c[1] - d[1]);
    // Slide only while the box stays inside the narrower of the base and the outer side.
    const reach = Math.max(0, Math.min(len, outer) / 2 - (t.label > 9 ? 2.4 : 1.6));
    wants.push({ kind: "tab", label: t.label, text: String(t.label), x: t.at[0], y: t.at[1], ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len, reach, ownFace: t.face, ownTab: t.label });
  }
  for (const pf of net.faces) {
    const cx = (pf.p[0][0] + pf.p[1][0] + pf.p[2][0]) / 3;
    const cy = (pf.p[0][1] + pf.p[1][1] + pf.p[2][1]) / 3;
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const a = pf.v[i];
      const b = pf.v[j];
      const e = byKey.get(a < b ? `${a},${b}` : `${b},${a}`)!;
      if (e.kind !== "cut") continue;
      const dropped = droppedLabels.has(e.label);
      if (!dropped && e.faces[0] === pf.face) continue;
      const p = pf.p[i];
      const q = pf.p[j];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      let dx = mx - cx;
      let dy = my - cy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      wants.push({
        kind: dropped ? "dropped" : "edge", label: e.label, text: `${e.label}${dropped ? "!" : ""}`,
        x: mx + dx * 2.4, y: my + dy * 2.4, ux: (q[0] - p[0]) / len, uy: (q[1] - p[1]) / len,
        reach: Math.max(0, len / 2 - 2.5), ownFace: pf.face, ownTab: -1,
      });
    }
  }

  const placed: { rect: Vec2[] }[] = [];
  const out: PlacedLabel[] = [];
  const STEP = 0.75;
  const clashes = (rect: Vec2[], w: Want) => {
    let n = 0;
    for (const o of placed) if (polygonsOverlap(rect, o.rect, 1e-6)) n++;
    for (const t of net.tabs) if (t.label !== w.ownTab && polygonsOverlap(rect, t.polygon, 1e-6)) n++;
    for (const f of net.faces) if (f.face !== w.ownFace && polygonsOverlap(rect, f.p, 1e-6)) n++;
    return n;
  };
  for (const w of wants) {
    let best = { n: Infinity, x: w.x, y: w.y };
    const steps = slide ? Math.floor(w.reach / STEP) : 0;
    search: for (let k = 0; k <= steps; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const x = w.x + w.ux * k * STEP * sign;
        const y = w.y + w.uy * k * STEP * sign;
        const n = clashes(rectOf(x, y, w.text), w);
        if (n < best.n) best = { n, x, y };
        if (n === 0) break search;
      }
    }
    placed.push({ rect: rectOf(best.x, best.y, w.text) });
    out.push({ kind: w.kind, label: w.label, text: w.text, x: best.x, y: best.y, collides: best.n > 0 });
  }
  return out;
}

export function netToSvg(net: Net): string {
  const W = net.paper.width;
  const H = net.paper.height;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="sans-serif">`,
  );
  out.push(`<title>Hollow net, ${net.faces.length} faces, ${net.tabs.length} tabs</title>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<g transform="translate(${MARGIN_MM} ${MARGIN_MM})">`);

  // Tabs first, so face edges draw over them.
  for (const t of net.tabs) {
    out.push(
      `<polygon class="tab" points="${t.polygon.map(pt).join(" ")}" fill="#e8e8e8" stroke="#000" stroke-width="0.4" stroke-linejoin="round"/>`,
    );
  }

  const byKey = new Map(net.edges.map((e) => [`${e.a},${e.b}`, e]));
  for (const pf of net.faces) {
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const a = pf.v[i];
      const b = pf.v[j];
      const e = byKey.get(a < b ? `${a},${b}` : `${b},${a}`)!;
      const p = pf.p[i];
      const q = pf.p[j];
      if (e.kind === "flat") continue; // coplanar join inside a panel: no line
      if (e.kind === "fold") {
        if (e.faces[0] !== pf.face) continue; // drawn once
        out.push(
          `<line class="fold" x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="#000" stroke-width="0.3" stroke-dasharray="2 1.2"/>`,
        );
      } else {
        out.push(
          `<line class="cut" x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="#000" stroke-width="0.5" stroke-linecap="round"/>`,
        );
      }
    }
  }
  // Numbers last, on top of every line.
  for (const l of layoutLabels(net)) {
    const cls = l.kind === "tab" ? "tab-label" : l.kind === "dropped" ? "dropped-label" : "edge-label";
    out.push(
      `<text class="${cls}"${l.collides ? ' data-collides="true"' : ""} x="${f(l.x)}" y="${f(l.y)}" font-size="${FONT_MM}" text-anchor="middle" dominant-baseline="middle">${l.text}</text>`,
    );
  }
  out.push(`</g>`);

  // Legend strip at the bottom.
  const y0 = H - MARGIN_MM - LEGEND_MM + 4;
  out.push(`<g class="legend" font-size="3.2">`);
  out.push(`<line x1="${MARGIN_MM}" y1="${y0}" x2="${MARGIN_MM + 14}" y2="${y0}" stroke="#000" stroke-width="0.5"/>`);
  out.push(`<text x="${MARGIN_MM + 17}" y="${y0}" dominant-baseline="middle">Cut</text>`);
  out.push(
    `<line x1="${MARGIN_MM + 40}" y1="${y0}" x2="${MARGIN_MM + 54}" y2="${y0}" stroke="#000" stroke-width="0.3" stroke-dasharray="2 1.2"/>`,
  );
  out.push(`<text x="${MARGIN_MM + 57}" y="${y0}" dominant-baseline="middle">Fold</text>`);
  out.push(`<rect x="${MARGIN_MM + 80}" y="${y0 - 2}" width="8" height="4" fill="#e8e8e8" stroke="#000" stroke-width="0.4"/>`);
  out.push(`<text x="${MARGIN_MM + 91}" y="${y0}" dominant-baseline="middle">Tab: glue to the edge with the same number</text>`);
  out.push(
    `<text x="${MARGIN_MM}" y="${y0 + 7}">${net.paper.name} ${net.paper.width} × ${net.paper.height} mm · ${net.faces.length} faces · ${net.tabs.length} tabs · 1 mesh unit = ${net.scale.toFixed(1)} mm</text>`,
  );
  if (net.tabsDropped.length > 0) {
    out.push(
      `<text class="dropped-note" x="${MARGIN_MM}" y="${y0 + 17}">No tab fits on edge${net.tabsDropped.length === 1 ? "" : "s"} ${net.tabsDropped.map((d) => d.label).join(", ")} (marked !). Join ${net.tabsDropped.length === 1 ? "it" : "them"} with tape.</text>`,
    );
  }
  out.push(`<text x="${MARGIN_MM}" y="${y0 + 12}">Hollow mode: cut, fold, glue, into a closed volume.</text>`);
  out.push(`</g>`);
  out.push(`</svg>`);
  return out.join("\n") + "\n";
}
