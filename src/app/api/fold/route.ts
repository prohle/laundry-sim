/**
 * POST /api/fold — photograph in, geometry out.
 *
 * Every view carries `tiers`: all four tiers attempted (task 3.19), each with its reason when it does not fold; null
 * for an edited tree or an explicit `budget`/`tier`, which keep their single-run behaviour.
 *
 * Request: either
 *   - the raw image bytes as the body, Content-Type image/png or image/jpeg (extract a tree, solve it); or
 *   - multipart/form-data with an `image` file part and a `tree` text part holding the tree as JSON
 *     (task 3.4: the user's edited tree). Extraction is skipped and that tree is solved as given.
 *     The tree is validated first; an invalid one is 400 with a plain message.
 * The multipart form is capped at the same 10 MiB as the raw image.
 *
 * Responses:
 *   400  `tree` is present but is not valid JSON, or is not a connected, acyclic tree inside the sheet
 *   415  not a PNG or JPEG: wrong Content-Type, bytes that do not match it, or an image that will not decode
 *   413  body larger than 10 MiB
 *   200  { ok: true, ... }   a printable pattern, in `pattern`. `candidates` lists every object found, best
 *        first, and `segmentation` says which path found them; the top-level fields describe the best.
 *   200  { ok: false, refusal: { stage, message }, ... }
 *        `message` is plain words (a reason and a next step) for the user; `detail` is the technical cause.
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
import { sniffImage, ImageDecodeError } from "@/lib/pipeline";
import type { Analysis } from "@/lib/segment";
import { analyseViews, MAX_VIEWS, type ViewsAnalysis } from "@/lib/views";
import { validateEditedTree } from "@/lib/tree-validate";
import type { SkeletonTree } from "@/lib/skeleton";
import { TIERS } from "@/lib/tiers";

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

/** `budget` (4, 6, 8, 12) or `tier` (easy..expert) -> a budget. undefined = none given; null = invalid. */
function parseBudget(budget: string | null, tier: string | null): number | undefined | null {
  if (budget === null && tier === null) return undefined;
  const byTier = tier === null ? undefined : TIERS.find((t) => t.tier === tier.trim().toLowerCase())?.budget;
  if (tier !== null && byTier === undefined) return null;
  const byBudget = budget === null ? undefined : TIERS.find((t) => String(t.budget) === budget.trim())?.budget;
  if (budget !== null && byBudget === undefined) return null;
  if (byTier !== undefined && byBudget !== undefined && byTier !== byBudget) return null;
  return byBudget ?? byTier;
}

export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  const type = contentType.split(";")[0].trim().toLowerCase();
  const multipart = type === "multipart/form-data";
  if (!multipart && !ALLOWED_TYPES.has(type)) {
    return json({ error: "unsupported_media_type", message: "Send a PNG or JPEG photograph as the request body." }, 415);
  }

  const tooLarge = () =>
    json({ error: "payload_too_large", message: `The photograph must be under ${MAX_BYTES / 1024 / 1024} MiB.` }, 413);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return tooLarge();
  // Raw body: ?budget= or ?tier= in the query. Multipart: form fields of the same names (read below).
  let budget = parseBudget(request.nextUrl.searchParams.get("budget"), request.nextUrl.searchParams.get("tier"));
  const badBudget = () =>
    json({ error: "bad_request", message: "`budget` must be 4, 6, 8 or 12, and `tier` easy, medium, hard or expert, and they must agree." }, 400);
  if (budget === null) return badBudget();
  const raw = await readCapped(request);
  if (raw === null) return tooLarge();

  let bytes: Uint8Array = raw;
  let editedTree: SkeletonTree | null = null;
  let extra: Uint8Array[] = [];
  if (multipart) {
    let form: FormData;
    try {
      form = await new Response(new Blob([raw as BlobPart]), { headers: { "content-type": contentType } }).formData();
    } catch {
      return json({ error: "bad_request", message: "The multipart form could not be read." }, 400);
    }
    const fb = form.get("budget"), ft = form.get("tier");
    if ((fb !== null && typeof fb !== "string") || (ft !== null && typeof ft !== "string")) return badBudget();
    if (fb !== null || ft !== null) {
      budget = parseBudget(fb as string | null, ft as string | null);
      if (budget === null) return badBudget();
    }
    const images = form.getAll("image").filter((x): x is File => x instanceof Blob);
    if (images.length === 0) {
      return json({ error: "bad_request", message: "The form needs an `image` file part." }, 400);
    }
    if (images.length > MAX_VIEWS) {
      return json({ error: "bad_request", message: `Send at most ${MAX_VIEWS} photographs of one subject.` }, 400);
    }
    bytes = new Uint8Array(await images[0].arrayBuffer());
    if (images.length > 1) {
      if (form.get("tree") !== null) {
        return json({ error: "bad_request", message: "An edited tree applies to one photograph; send one image." }, 400);
      }
      extra = [];
      for (const im of images.slice(1)) extra.push(new Uint8Array(await im.arrayBuffer()));
    }
    const treeField = form.get("tree");
    if (treeField !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof treeField === "string" ? treeField : await treeField.text());
      } catch {
        return json({ error: "invalid_tree", message: "The tree is not valid JSON." }, 400);
      }
      const v = validateEditedTree(parsed);
      if (!v.ok) return json({ error: "invalid_tree", message: v.message }, 400);
      editedTree = v.tree;
    }
  }
  if (sniffImage(bytes) === null) {
    return json({ error: "unsupported_media_type", message: "The body is not a PNG or JPEG image." }, 415);
  }

  if (extra.some((b) => sniffImage(b) === null)) {
    return json({ error: "unsupported_media_type", message: "Every photograph must be a PNG or JPEG image." }, 415);
  }
  const opts = { ...(editedTree ? { tree: editedTree } : {}), ...(budget !== undefined ? { budget } : {}) };
  let result: Analysis & Partial<ViewsAnalysis>;
  try {
    result = await analyseViews([bytes, ...extra], opts);
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
      // Budget requested (null = minimum tier), budget used and leaves solved, for the shown view; per view in `views`.
      budget: result.budget,
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
      // Every object found (task 3.11), best first; the top-level fields above describe candidates[0].
      candidates: result.candidates,
      segmentation: result.segmentation,
      // Several photographs (R1.4, R1.5): every view, and the warning if they disagree. With one photograph, `views` has one entry and `disagreement` is null.
      views: result.views,
      disagreement: result.disagreement ?? null,
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
