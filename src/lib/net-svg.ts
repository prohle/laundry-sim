/**
 * SVG for a Hollow-mode net (R9.5). Cut lines solid, fold lines dashed, tabs numbered, a legend with
 * paper size and face count. Millimetres throughout, so it prints at size.
 * Hollow mode cuts; this file never says "origami".
 */
import { LEGEND_MM, MARGIN_MM } from "./net.ts";
import type { Net, Vec2 } from "./net.ts";

const f = (n: number) => n.toFixed(3);
const pt = (p: Vec2) => `${f(p[0])},${f(p[1])}`;

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
    out.push(
      `<text class="tab-label" x="${f(t.at[0])}" y="${f(t.at[1])}" font-size="3" text-anchor="middle" dominant-baseline="middle">${t.label}</text>`,
    );
  }

  const droppedLabels = new Set(net.tabsDropped.map((d) => d.label));
  const byKey = new Map(net.edges.map((e) => [`${e.a},${e.b}`, e]));
  for (const pf of net.faces) {
    const cx = (pf.p[0][0] + pf.p[1][0] + pf.p[2][0]) / 3;
    const cy = (pf.p[0][1] + pf.p[1][1] + pf.p[2][1]) / 3;
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
        const dropped = droppedLabels.has(e.label);
        if (dropped || e.faces[0] !== pf.face) {
          // The edge the tab glues to: number it just outside the edge. A dropped tab's edge is numbered
          // on both sides with a "!" so the gap is visible.
          const mx = (p[0] + q[0]) / 2;
          const my = (p[1] + q[1]) / 2;
          let dx = mx - cx;
          let dy = my - cy;
          const d = Math.hypot(dx, dy) || 1;
          dx /= d; dy /= d;
          out.push(
            `<text class="${dropped ? "dropped-label" : "edge-label"}" x="${f(mx + dx * 2.4)}" y="${f(my + dy * 2.4)}" font-size="3" text-anchor="middle" dominant-baseline="middle">${e.label}${dropped ? "!" : ""}</text>`,
          );
        }
      }
    }
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
