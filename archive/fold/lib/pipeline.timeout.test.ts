import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pngjs from "pngjs";
import { runPipeline } from "./pipeline.ts";

const { PNG } = pngjs;

/** A disc with five thick spokes on white: enough limbs to reach the solver. */
function starPng(): Uint8Array {
  const W = 160;
  const png = new PNG({ width: W, height: W });
  png.data.fill(255);
  const c = W / 2;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let inside = Math.hypot(x - c, y - c) <= 18;
      for (let k = 0; k < 5 && !inside; k++) {
        const a = (k * 2 * Math.PI) / 5;
        const dx = Math.cos(a), dy = Math.sin(a);
        const t = Math.max(0, Math.min(65, (x - c) * dx + (y - c) * dy));
        inside = Math.hypot(x - (c + t * dx), y - (c + t * dy)) <= 4;
      }
      if (inside) {
        const i = (y * W + x) * 4;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 20;
      }
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

test("a hung solver gives a solver refusal within the timeout, not a hang", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fold-hung-"));
  try {
    const fake = join(dir, "hung-solver");
    writeFileSync(fake, "#!/bin/sh\nexec sleep 60\n");
    chmodSync(fake, 0o755);
    const t0 = performance.now();
    const r = await runPipeline(starPng(), { solverPath: fake, solverTimeoutMs: 500 });
    const ms = performance.now() - t0;
    assert.equal(r.ok, false);
    assert.equal(r.fault, null);
    assert.ok(r.refusal, "expected a refusal");
    assert.equal(r.refusal.stage, "solver");
    assert.equal(r.refusal.message, "The solver did not finish in time. Try a simpler subject.");
    assert.match(r.refusal.detail ?? "", /did not finish within 500 ms/);
    assert.equal(r.solver, null);
    assert.ok(ms < 5000, `took ${ms} ms; the caller was blocked`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
