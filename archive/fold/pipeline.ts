/**
 * Photograph -> silhouette mask -> tree -> solver -> crease pattern, as a script.
 *
 *   node tools/pipeline.ts <image.jpg|png> [--max-leaves 12] [--max-dim 512] [--significance 2.0] [--spur 0] [--contract 0.012] [--out tools/out] [--paper 150]
 *
 * A thin wrapper over src/lib/pipeline.ts: it reads the file, prints the log and writes the debug
 * files. All the work, and all the text it prints, comes from the library. The solver is
 * FOLD_SOLVER if set, else solver/target/release/fold-solver in this repo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline, ImageDecodeError, DEFAULT_SOLVER_RELATIVE } from "../src/lib/pipeline.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function optNumber(name: string): number | undefined {
  const v = arg(name, "");
  return v === "" ? undefined : Number(v);
}

async function main(): Promise<number> {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: node tools/pipeline.ts <image.jpg|png> [--max-leaves 12] [--max-dim 512] [--significance 2.0] [--spur 0] [--out tools/out]");
    return 2;
  }
  const outDir = resolve(arg("out", join(ROOT, "tools/out")));
  mkdirSync(outDir, { recursive: true });
  const stem = basename(file, extname(file));
  const paths = {
    svg: join(outDir, `${stem}.cp.svg`),
    fold: join(outDir, `${stem}.fold.json`),
  };

  let result;
  try {
    result = await runPipeline(readFileSync(file), {
      maxLeaves: Number(arg("max-leaves", "12")),
      maxDim: Number(arg("max-dim", "512")),
      significance: optNumber("significance"),
      spur: optNumber("spur"),
      contract: optNumber("contract"),
      paper: Number(arg("paper", "150")),
      solverPath: process.env.FOLD_SOLVER || join(ROOT, DEFAULT_SOLVER_RELATIVE),
      label: file,
      name: stem,
      debugImages: true,
    });
  } catch (e) {
    if (e instanceof ImageDecodeError) {
      console.error(e.message);
      return 1;
    }
    throw e;
  }

  if (result.images.mask) writeFileSync(join(outDir, `${stem}.mask.png`), result.images.mask);
  if (result.images.overlay) writeFileSync(join(outDir, `${stem}.overlay.png`), result.images.overlay);
  if (result.solverInput) writeFileSync(join(outDir, `${stem}.tree.json`), result.solverInput + "\n");
  if (result.solver) writeFileSync(join(outDir, `${stem}.solver.json`), JSON.stringify(result.solver) + "\n");
  if (result.svg) writeFileSync(paths.svg, result.svg);
  if (result.fold) writeFileSync(paths.fold, JSON.stringify(result.fold) + "\n");
  for (const line of result.log) console.log(typeof line === "function" ? line(paths) : line);
  return result.ok ? 0 : 1;
}

process.exit(await main());
