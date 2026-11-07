/**
 * POST /api/hollow — two to four photographs in, a Hollow net out (task 9.5).
 *
 * multipart/form-data: one `image` part per photograph, in slot order (Front 0, Right 90, Back 180, Left 270),
 * and an optional `level` field, "0" (20 faces, default) or "1" (80 faces).
 *
 *   400  bad form, more than four images, bad level
 *   413  an image over 10 MiB
 *   415  not a PNG or JPEG
 *   200  { ok: true, svg, faces, tabs, tabsDropped, paper, assembly, volume, ... }
 *   200  { ok: false, refusal: { stage, message, detail } }  fewer than two photographs, no shared volume,
 *        not visible from its centre, net overlaps. `message` is plain words.
 *
 * N3: nothing is stored, written or logged. Hollow mode cuts and glues; this route never calls it origami.
 */
import type { NextRequest } from "next/server";
import { sniffImage, ImageDecodeError } from "@/lib/pipeline";
import { runHollow, MAX_HOLLOW_VIEWS } from "@/lib/hollow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const HEADERS = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers: HEADERS });

export async function POST(request: NextRequest): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "multipart/form-data") {
    return json({ error: "unsupported_media_type", message: "Send multipart/form-data with one `image` part per photograph." }, 415);
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES * MAX_HOLLOW_VIEWS + 4096) {
    return json({ error: "payload_too_large", message: `Each photograph must be under ${MAX_BYTES / 1024 / 1024} MiB.` }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "bad_request", message: "The multipart form could not be read." }, 400);
  }
  const levelField = form.get("level");
  const level = levelField === null ? 0 : Number(levelField);
  if (typeof levelField !== "string" && levelField !== null || (level !== 0 && level !== 1)) {
    return json({ error: "bad_request", message: "`level` must be 0 (20 faces) or 1 (80 faces)." }, 400);
  }
  const files = form.getAll("image").filter((x): x is File => x instanceof Blob);
  if (files.length > MAX_HOLLOW_VIEWS) {
    return json({ error: "bad_request", message: `Send at most ${MAX_HOLLOW_VIEWS} photographs.` }, 400);
  }
  const photos: Uint8Array[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) return json({ error: "payload_too_large", message: `Each photograph must be under ${MAX_BYTES / 1024 / 1024} MiB.` }, 413);
    const b = new Uint8Array(await f.arrayBuffer());
    if (sniffImage(b) === null) return json({ error: "unsupported_media_type", message: "Every photograph must be a PNG or JPEG image." }, 415);
    photos.push(b);
  }
  try {
    return json(runHollow(photos, level), 200);
  } catch (e) {
    if (e instanceof ImageDecodeError) return json({ error: "unsupported_media_type", message: "An image could not be decoded." }, 415);
    return json({ error: "internal_error", message: "The net could not be built." }, 500);
  }
}
