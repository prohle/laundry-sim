// Task 9.5: photographs in, Hollow net out. Glue between the existing mask code (pipeline.ts), the visual
// hull (9.3), the hull mesh (9.4) and the net (9.1, 9.2). Writes nothing and logs nothing (N3).
//
// Alignment assumption, stated to the user on screen: each photograph shows the whole object, and the object
// is the same height in every photograph. Each mask is cropped to the object's bounding box, scaled so its
// height is HULL_HEIGHT_MM, and centred on the vertical axis. The hull has no other way to line the views up.
import { maskFromBytes } from "./pipeline.ts";
import { buildHull } from "./hull.ts";
import type { Silhouette } from "./hull.ts";
import { hullMesh, FACES_BY_LEVEL } from "./mesh.ts";
import { buildNet, A4 } from "./net.ts";
import { netToSvg } from "./net-svg.ts";

import { SLOT_ANGLES, SLOT_NAMES, MIN_HOLLOW_VIEWS, MAX_HOLLOW_VIEWS } from "./hollow-slots.ts";
export { SLOT_ANGLES, SLOT_NAMES, MIN_HOLLOW_VIEWS, MAX_HOLLOW_VIEWS };
export const HULL_HEIGHT_MM = 64;
export const HULL_VOXEL_MM = 1;
/** Same limits as Fold mode's R1.3. */
export const MIN_COVERAGE = 0.02;
export const MAX_COVERAGE = 0.9;

export type HollowStage = "views" | "mask" | "hull" | "mesh" | "net";
export interface HollowRefusal {
  stage: HollowStage;
  message: string;
  detail: string | null;
}

export interface HollowReport {
  ok: boolean;
  refusal: HollowRefusal | null;
  level: number;
  faces: number | null;
  tabs: number | null;
  /** Tabs that collided at every depth and taper: the edge is numbered but has no tab, and is taped. */
  tabsDropped: number | null;
  paper: { name: string; width: number; height: number };
  /** Millimetres of the net's bounding box. */
  bbox: { width: number; height: number } | null;
  /** Mesh volume in mm^3 at the hull's working scale (the net is scaled to the paper separately). */
  volume: number | null;
  assembly: { parts: number; tabsToGlue: number; tabsToTape: number; note: string } | null;
  svg: string | null;
  views: { slot: string; angleDeg: number; coverage: number }[];
}

function refused(level: number, views: HollowReport["views"], stage: HollowStage, message: string, detail: string | null): HollowReport {
  return {
    ok: false, refusal: { stage, message, detail }, level, faces: null, tabs: null, tabsDropped: null,
    paper: { name: A4.name, width: A4.width, height: A4.height }, bbox: null, volume: null, assembly: null, svg: null, views,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function assemblyNote(tabs: number, dropped: number, faces: number): string {
  const parts = "One net, one part";
  const glue = `${plural(tabs, "tab", "tabs")} to glue`;
  const tape = dropped === 0 ? "no edges to tape" : `${plural(dropped, "edge", "edges")} to tape, where no tab fits`;
  return `${parts}, ${faces} faces: ${glue}, ${tape}. Hollow mode is cut, folded and glued. It is not origami.`;
}

/** Decode and mask each photograph, then crop to the object. Returns a refusal report instead on a bad mask. */
function silhouettes(photos: Uint8Array[], level: number): { sil: Silhouette[]; views: HollowReport["views"] } | HollowReport {
  const sil: Silhouette[] = [];
  const views: HollowReport["views"] = [];
  for (const [n, bytes] of photos.entries()) {
    const slot = SLOT_NAMES[n];
    const m = maskFromBytes(bytes);
    views.push({ slot, angleDeg: SLOT_ANGLES[n], coverage: m.coverage });
    if (m.coverage < MIN_COVERAGE || m.coverage > MAX_COVERAGE) {
      return refused(level, views, "mask",
        `I can't find a single object in the ${slot} photograph. Try a plainer background and fit the whole object in the frame.`,
        `coverage ${m.coverage.toFixed(3)}, allowed ${MIN_COVERAGE} to ${MAX_COVERAGE}`);
    }
    let x0 = m.width, x1 = -1, y0 = m.height, y1 = -1;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (m.mask[y * m.width + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = m.mask[(y0 + y) * m.width + x0 + x] ? 1 : 0;
    const p = HULL_HEIGHT_MM / h;
    sil.push({
      angleDeg: SLOT_ANGLES[n], width: w, height: h, data,
      bounds: { uMin: (-w * p) / 2, uMax: (w * p) / 2, vMin: 0, vMax: HULL_HEIGHT_MM },
    });
  }
  return { sil, views };
}

export function runHollow(photos: Uint8Array[], level: number): HollowReport {
  if (photos.length < MIN_HOLLOW_VIEWS) {
    return refused(level, [], "views",
      "Hollow mode needs at least two photographs of the same object, from different sides. One photograph cannot show depth. Add a second, taken from the right.",
      `${photos.length} photograph(s)`);
  }
  if (photos.length > MAX_HOLLOW_VIEWS) {
    return refused(level, [], "views", `Hollow mode uses at most ${MAX_HOLLOW_VIEWS} photographs.`, `${photos.length} photographs`);
  }
  const s = silhouettes(photos, level);
  if (!("sil" in s)) return s;

  const widest = Math.max(...s.sil.map((x) => x.bounds.uMax - x.bounds.uMin));
  const side = Math.ceil(widest) + 2;
  const h = buildHull({ silhouettes: s.sil, world: { width: side, height: HULL_HEIGHT_MM, depth: side }, voxelSize: HULL_VOXEL_MM });
  if (!h.ok) {
    const empty = h.refusal.stage === "empty";
    return refused(level, s.views, "hull",
      empty
        ? "The photographs do not describe one object: seen together, their outlines share no volume. Keep the object upright, whole in the frame and the same height in every photograph, and add them in the order Front, Right, Back, Left."
        : h.refusal.message,
      h.refusal.detail);
  }
  const m = hullMesh(h.hull, level);
  if (!m.ok) {
    const star = m.refusal.stage === "star" || m.refusal.stage === "centroid";
    return refused(level, s.views, "mesh",
      star
        ? "The shape is not visible from its centre: part of it hides behind a dent or a hollow, so it cannot be wrapped in a single skin. Try a rounder object, such as a bottle or a toy with a smooth outline."
        : m.refusal.message,
      m.refusal.detail);
  }
  const n = buildNet(m.mesh, A4);
  if (!n.ok) {
    const overlap = n.refusal.stage === "overlap";
    return refused(level, s.views, "net",
      overlap
        ? `The net overlaps itself at every starting face tried, so it cannot be printed flat on this paper. ${level > 0 ? "Try 20 faces, or a simpler shape." : "Try a simpler, rounder shape."}`
        : n.refusal.message,
      JSON.stringify(n.refusal.detail));
  }
  const net = n.net;
  const dropped = net.tabsDropped.length;
  return {
    ok: true, refusal: null, level,
    faces: net.faces.length, tabs: net.tabs.length, tabsDropped: dropped,
    paper: { name: net.paper.name, width: net.paper.width, height: net.paper.height },
    bbox: net.bbox, volume: m.mesh.volume,
    assembly: { parts: 1, tabsToGlue: net.tabs.length, tabsToTape: dropped, note: assemblyNote(net.tabs.length, dropped, net.faces.length) },
    svg: netToSvg(net), views: s.views,
  };
}

export const FACES_FOR_LEVEL = FACES_BY_LEVEL;
