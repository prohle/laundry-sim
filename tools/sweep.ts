/**
 * Print the significance sweep (leaves, IoU, penalised score) for the four fixtures.
 *
 *   node tools/sweep.ts [--lambda 0.01] [--lambdas 0,0.005,0.01,...]
 *
 * With --lambdas, also prints which threshold and how many leaves each lambda would choose.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskFromBytes } from "../src/lib/pipeline.ts";
import { sweep, penalise, DEFAULT_LAMBDA } from "../src/lib/select.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES: [string, string][] = [
  ["dog", "bush-dog.png"],
  ["turtle", "snapping-turtle.jpg"],
  ["tuatara", "tuatara.jpg"],
  ["beetle", "aphodius-foetens.jpg"],
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const lambda = Number(arg("lambda") ?? DEFAULT_LAMBDA);
const lambdas = (arg("lambdas") ?? "").split(",").filter(Boolean).map(Number);

for (const [name, file] of FIXTURES) {
  const m = maskFromBytes(readFileSync(join(ROOT, "fixtures", file)));
  const t0 = performance.now();
  const rows = sweep({ mask: m.mask, width: m.width, height: m.height });
  const ms = performance.now() - t0;
  const chosen = penalise(rows, lambda);
  console.log(`\n${name}  (${file}, mask ${m.width}x${m.height}, coverage ${(m.coverage * 100).toFixed(1)}%, sweep ${ms.toFixed(0)} ms, lambda ${lambda})`);
  console.log("  thr    leaves   IoU     IoU-lambda*leaves");
  rows.forEach((r, i) => {
    console.log(
      `  ${r.threshold.toFixed(2)}   ${String(r.leaves).padStart(4)}   ${r.iou.toFixed(4)}   ${r.value.toFixed(4)}${i === chosen ? "   <- chosen" : ""}`,
    );
  });
  for (const l of lambdas) {
    const c = rows[penalise(rows.map((r) => ({ ...r })), l)];
    // penalise on a copy so the table above is not disturbed
    console.log(`  lambda ${l}: threshold ${c.threshold.toFixed(2)}, ${c.leaves} leaves`);
  }
  penalise(rows, lambda);
}
