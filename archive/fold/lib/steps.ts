/**
 * The step list: one row per folding hinge, in the order the collapse folds them (parents before children).
 * Everything here is read off the collapse model. The hint names a position on the sheet and how many panels
 * turn with the hinge; it does not name a body part, because the pattern does not know one.
 */
import { flatVertex } from "./collapse.ts";
import type { CollapseModel } from "./collapse.ts";

export const LONG_MODEL_STEPS = 60;

export interface StepRow {
  /** 1-based. */
  number: number;
  direction: "mountain" | "valley";
  angle: number;
  /** Panels that turn with this hinge: the child panel and everything below it in the spanning tree. */
  panels: number;
  hint: string;
}

const SECTORS = ["right", "upper right", "upper", "upper left", "left", "lower left", "lower", "lower right"];

export function describeSteps(model: CollapseModel): StepRow[] {
  const size = new Map<number, number>();
  for (let i = model.order.length - 1; i >= 0; i--) {
    const f = model.order[i];
    size.set(f, (size.get(f) ?? 0) + 1);
    const h = model.parentHinge[f];
    if (h) size.set(h.parent, (size.get(h.parent) ?? 0) + size.get(f)!);
  }
  return model.active.map((h, i) => {
    const a = flatVertex(model, h.a), b = flatVertex(model, h.b);
    const dx = (a[0] + b[0]) / 2 / model.paperMm - 0.5;
    const dy = (a[1] + b[1]) / 2 / model.paperMm - 0.5;
    const where = Math.hypot(dx, dy) < 0.1
      ? "centre"
      : SECTORS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    const panels = size.get(h.child) ?? 1;
    return {
      number: i + 1,
      direction: h.target > 0 ? "mountain" : "valley",
      angle: Math.abs(h.target),
      panels,
      hint: `${where} ${panels === 1 ? "panel" : "group"}, ${panels} ${panels === 1 ? "panel moves" : "panels move"}`,
    };
  });
}

/**
 * The step being shown at time t in sequence mode: the one that ends at t, or step 1 at t = 0.
 * Step k ends at t = k / n, so clicking row k and reading this back gives row k.
 */
export function currentStep(n: number, t: number): number {
  if (n <= 0) return -1;
  return Math.min(n - 1, Math.max(0, Math.ceil(t * n - 1e-9) - 1));
}
