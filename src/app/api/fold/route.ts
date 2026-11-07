/**
 * POST /api/fold — photograph in, geometry out.
 *
 * Request: the raw image bytes as the body, Content-Type image/png or image/jpeg.
 *
 * Responses:
 *   415  not a PNG or JPEG: wrong Content-Type, bytes that do not match it, or an image that will not decode
 *   413  body larger than 10 MiB
 *   200  { ok: true, ... }   a printable pattern, in `pattern`
 *   200  { ok: false, refusal: { stage, message }, ... }
 *        the pipeline ran and declined (no object, no limbs, below the minimum tier, no mountain/valley, ...).
 *        `tree`, `minimum` and `tiers` are still returned where they exist. `pattern` is null:
 *        a pattern is only returned when it is printable.
 *   500  the pipeline could not run (solver missing, crashed, or unparseable output)
 *
 * N3: no photograph is stored. The bytes live in this request's memory and are dropped with it. This
 * file writes nothing to disk and logs nothing. The response is geometry only, never image data.
 *
 * FOLD_SOLVER names the solver binary; see resolveSolverPath() in src/lib/pipeline.ts.
 */
import type { NextRequest } from "next/server";
import { runPipeline, sniffImage, ImageDecodeError } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);
const HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

/** Read the body up to MAX_BYTES; null if it is larger. Stops reading as soon as the cap is passed. */
async function readCapped(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function POST(request: NextRequest): Promise<Response> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return json({ error: "unsupported_media_type", message: "Send a PNG or JPEG photograph as the request body." }, 415);
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return json({ error: "payload_too_large", message: `The photograph must be under ${MAX_BYTES / 1024 / 1024} MiB.` }, 413);
  }
  const bytes = await readCapped(request);
  if (bytes === null) {
    return json({ error: "payload_too_large", message: `The photograph must be under ${MAX_BYTES / 1024 / 1024} MiB.` }, 413);
  }
  if (sniffImage(bytes) === null) {
    return json({ error: "unsupported_media_type", message: "The body is not a PNG or JPEG image." }, 415);
  }

  let result;
  try {
    result = await runPipeline(bytes);
  } catch (e) {
    if (e instanceof ImageDecodeError) {
      return json({ error: "unsupported_media_type", message: "The image could not be decoded." }, 415);
    }
    return json({ error: "internal_error", message: "The pipeline failed.", ...detail(e) }, 500);
  }
  if (result.fault !== null) {
    return json({ error: "solver_unavailable", message: "The solver could not be run.", ...detail(result.fault) }, 500);
  }

  const solver = result.solver;
  return json(
    {
      ok: result.ok,
      refusal: result.refusal,
      image: result.image,
      coverage: result.coverage,
      tree: result.tree,
      contraction: result.contraction && {
        contracted: result.contraction.contracted,
        dropped: result.contraction.dropped,
      },
      minimumTier: result.minimum,
      tiers: result.tiers,
      solver: solver && {
        ok: solver.ok,
        converged: solver.converged,
        feasible: solver.feasible,
        scale: solver.scale,
        error: solver.error,
        cpStatus: solver.cp_status,
        cpBuilt: solver.cp_built,
      },
      // Only a printable pattern leaves the server. A pattern with no mountain/valley is withheld.
      pattern: result.ok
        ? {
            cp: solver!.cp,
            fold: result.fold,
            foldValid: result.foldCheck?.ok ?? false,
            flatFold: result.flatFold,
            // Printable sheet at the stated paper size, for inline display and download.
            svg: result.svg,
          }
        : null,
      timingsMs: result.timingsMs,
      totalMs: result.totalMs,
    },
    200,
  );
}

/** Diagnostic text only outside production: it can name server paths. */
function detail(e: unknown): { detail?: string } {
  if (process.env.NODE_ENV === "production") return {};
  return { detail: e instanceof Error ? e.message : String(e) };
}
