"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkeletonTree } from "@/lib/skeleton";
import type { CollapseCp } from "@/lib/collapse";
import FoldView from "./FoldView";
import { minimumTier } from "@/lib/tiers";
import { addLeaf, deleteLeaf, moveLeaf } from "@/lib/tree-edit";

/** The subset of the POST /api/fold response this screen reads. */
interface FoldResponse {
  ok: boolean;
  refusal: { stage: string; message: string; detail: string | null } | null;
  image: { width: number; height: number; analysedWidth: number; analysedHeight: number } | null;
  tree: SkeletonTree | null;
  minimumTier: { tier: string | null; requiredLeaves: number; reason: string } | null;
  pattern: { svg: string | null; cp?: CollapseCp | null } | null;
  contraction?: { contracted: unknown[]; dropped: { leaf: number; length: number }[] } | null;
  totalMs?: number;
}

type View =
  | { kind: "empty"; notice: string | null }
  | { kind: "processing"; photoUrl: string }
  | { kind: "result"; photoUrl: string; file: File; name: string; data: FoldResponse; svg: string }
  | { kind: "refusal"; photoUrl: string; file: File; data: FoldResponse; message: string }
  | { kind: "error"; photoUrl: string | null; message: string };

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Home() {
  const [view, setView] = useState<View>({ kind: "empty", notice: null });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  // Release the object URL for the photograph when it is replaced and on unmount.
  const setPhotoUrl = useCallback((next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
  }, []);
  useEffect(() => () => {
    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const reset = useCallback((notice: string | null = null) => {
    abortRef.current?.abort();
    setPhotoUrl(null);
    setView({ kind: "empty", notice });
    if (inputRef.current) inputRef.current.value = "";
  }, [setPhotoUrl]);

  const submit = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setView({ kind: "empty", notice: "That file is not a PNG or JPEG photograph." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setView({ kind: "empty", notice: "The photograph must be under 10 MiB." });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const photoUrl = URL.createObjectURL(file);
    setPhotoUrl(photoUrl);
    setView({ kind: "processing", photoUrl });

    try {
      // The raw bytes are the request body; the Content-Type names the format.
      const res = await fetch("/api/fold", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        const message = body?.message ?? `The server answered ${res.status}.`;
        setView({ kind: "error", photoUrl, message });
        return;
      }
      const data = body as FoldResponse;
      // A pattern is shown only when the API says ok and sent one.
      const svg = data.ok === true ? data.pattern?.svg ?? null : null;
      if (svg) {
        setView({ kind: "result", photoUrl, file, name: file.name, data, svg });
      } else {
        setView({
          kind: "refusal",
          photoUrl,
          file,
          data,
          message: data.refusal?.message ?? "The pipeline did not produce a printable pattern.",
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setView({ kind: "error", photoUrl, message: "The server could not be reached." });
    }
  }, [setPhotoUrl]);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void submit(f);
  };

  const busy = view.kind === "processing";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__wordmark">Fold<span>.</span></span>
        <span className="top-bar__status">Photograph to crease pattern</span>
      </header>

      <input
        ref={inputRef}
        className="upload-input"
        type="file"
        accept="image/png,image/jpeg"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFiles(e.target.files)}
      />

      <main className="screen">
        <p className="supported">
          Animals with visible limbs on a plain background. Four to twelve flaps, one square, no cuts.
        </p>

        {view.kind === "empty" && (
          <div
            className={`panel-canvas panel-canvas--upload dropzone${dragging ? " panel-canvas--dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Choose a photograph. Animals with visible limbs on a plain background."
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFiles(e.dataTransfer.files);
            }}
          >
            <div className="empty-state">
              <div className="empty-state__cross" />
              <span className="empty-state__text">Drop a photograph, or click to choose one</span>
              <span className="empty-state__sub">PNG or JPEG, under 10 MiB</span>
              {view.notice && <span className="empty-state__notice" role="alert">{view.notice}</span>}
            </div>
          </div>
        )}

        {view.kind === "processing" && (
          <section className="panel-col panel-col--single" aria-busy="true">
            <div className="panel-canvas panel-canvas--photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.photoUrl} alt="Your photograph" className="photo-plain" />
              <div className="processing-overlay" role="status">
                <div className="processing-spinner" />
                <span className="processing-label">Finding the limbs and packing the paper</span>
              </div>
            </div>
          </section>
        )}

        {(view.kind === "result" || view.kind === "refusal") && (
          <Outcome key={view.photoUrl + view.data.totalMs} view={view} onAgain={() => reset()} />
        )}

        {view.kind === "error" && (
          <section className="panel-col panel-col--single">
            <div className="notice notice--error" role="alert">
              <p className="notice__title">The pattern could not be made</p>
              <p className="notice__body">{view.message}</p>
              <button type="button" className="upload-label" onClick={() => reset()}>
                Try another photograph
              </button>
            </div>
          </section>
        )}

        <p className="privacy">
          The photograph is sent to the server, processed in memory and not stored.
        </p>
      </main>
      {busy && <div className="progress-bar" aria-hidden="true"><div className="progress-bar__fill" /></div>}
    </div>
  );
}

function Outcome({
  view,
  onAgain,
}: {
  view: Extract<View, { kind: "result" | "refusal" }>;
  onAgain: () => void;
}) {
  // The server's latest answer. Folding an edited tree replaces it; the photograph stays.
  const [data, setData] = useState<FoldResponse>(view.data);
  const [svg, setSvg] = useState<string | null>(view.kind === "result" ? view.svg : null);
  const [refusalMessage, setRefusalMessage] = useState<string>(view.kind === "refusal" ? view.message : "");

  // The tree on screen is always the last valid one. `proposed` is what the photograph gave;
  // `folded` is the tree the pattern on screen was made from.
  const [tree, setTree] = useState<SkeletonTree | null>(data.tree);
  const proposed = useRef<SkeletonTree | null>(view.data.tree);
  const [folded, setFolded] = useState<SkeletonTree | null>(data.tree);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [folding, setFolding] = useState(false);

  const isResult = data.ok === true && !!svg;
  const dirty = tree !== folded;
  const tier = dirty && tree ? minimumTier(tree) : data.minimumTier;
  const flaps = tree?.leaves ?? null;

  // A real file: a Blob URL, made in an effect so it survives StrictMode's mount/unmount probe.
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);
  const tierName = data.minimumTier?.tier ?? "pattern";
  useEffect(() => {
    if (!svg || !isResult) { setDownload(null); return; }
    const stem = view.file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "photograph";
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setDownload({ url, filename: `fold-${stem}-${tierName}-crease-pattern.svg` });
    return () => URL.revokeObjectURL(url);
  }, [svg, isResult, view.file, tierName]);

  const apply = (r: { ok: true; tree: SkeletonTree } | { ok: false; message: string }) => {
    if (r.ok) {
      setTree(r.tree);
      setEditNote(null);
    } else {
      setEditNote(`${r.message} The tree is unchanged.`);
    }
  };

  const foldThis = async () => {
    if (!tree || folding) return;
    setFolding(true);
    setEditNote(null);
    try {
      const form = new FormData();
      form.append("image", view.file);
      form.append("tree", JSON.stringify(tree));
      const res = await fetch("/api/fold", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setEditNote(`${body?.message ?? `The server answered ${res.status}.`} The tree is unchanged.`);
        return;
      }
      const next = body as FoldResponse;
      setData(next);
      setSvg(next.ok === true ? next.pattern?.svg ?? null : null);
      setRefusalMessage(next.refusal?.message ?? "The pipeline did not produce a printable pattern.");
      setFolded(tree);
    } catch {
      setEditNote("The server could not be reached. The tree is unchanged.");
    } finally {
      setFolding(false);
    }
  };

  return (
    <section className="outcome">
      <div className="summary" aria-live="polite">
        <div className="summary__item">
          <span className="panel-header__label">Flaps</span>
          <span className="summary__value">{flaps ?? "—"}</span>
        </div>
        <div className="summary__item">
          <span className="panel-header__label">Minimum tier</span>
          <span className="summary__value summary__value--accent">
            {tier?.tier ? cap(tier.tier) : "None"}
          </span>
        </div>
        <p className="summary__reason">{tier?.reason ?? ""}</p>
      </div>

      <div className="panel-split">
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">Photograph and flap tree</span>
            {flaps !== null && <span className="panel-header__badge">{flaps} flaps</span>}
          </div>
          <div className="panel-canvas panel-canvas--photo">
            <TreeOverlay
              photoUrl={view.photoUrl}
              image={data.image}
              tree={tree}
              disabled={folding}
              onMove={(id, x, y) => tree && apply(moveLeaf(tree, id, x, y))}
              onDelete={(id) => tree && apply(deleteLeaf(tree, id))}
              onAdd={(x, y) => tree && apply(addLeaf(tree, x, y))}
            />
          </div>
          {tree ? (
            <div className="edit-bar">
              <p className="edit-bar__help">
                Drag a dot to move a limb. Click a dot to delete it. Click the photograph to add a limb.
              </p>
              {data.contraction && data.contraction.dropped.length > 0 && (
                <p className="edit-bar__note" role="status">
                  Before folding, {data.contraction.dropped.length === 1 ? "one limb was" : `${data.contraction.dropped.length} limbs were`} left
                  out because {data.contraction.dropped.length === 1 ? "it was" : "they were"} too short next to the others to fold as
                  a flap. The pattern has {data.tree?.leaves ?? "—"} flaps, not {tree?.leaves ?? "—"}. Lengthen the short limb to keep it.
                </p>
              )}
              {editNote && <p className="edit-bar__note" role="alert">{editNote}</p>}
              <div className="edit-bar__buttons">
                <button type="button" className="upload-label" disabled={!dirty || folding} onClick={foldThis}>
                  {folding ? "Folding" : "Fold this"}
                </button>
                <button
                  type="button"
                  className="upload-label"
                  disabled={folding || tree === proposed.current}
                  onClick={() => { setTree(proposed.current); setEditNote(null); }}
                >
                  Back to the proposal
                </button>
              </div>
            </div>
          ) : (
            <p className="edit-bar__help">No tree was found, so there is nothing to edit.</p>
          )}
        </div>
        <div className="panel-split__divider" />
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">{isResult ? "Crease pattern" : "No pattern"}</span>
            {isResult && download && (
              <a className="panel-header__badge download" href={download.url} download={download.filename}>
                Download SVG
              </a>
            )}
          </div>
          {dirty && (
            <p className="edit-bar__note" role="status">
              {isResult ? "This pattern is for the tree before your edits." : "This answer is for the tree before your edits."}{" "}
              Fold this to refresh it.
            </p>
          )}
          {isResult ? (
            <div className="panel-canvas panel-canvas--pattern" style={dirty ? { opacity: 0.4 } : undefined}>
              {/* Server-generated SVG from tools/cp-to-svg.ts; scaled to the panel by CSS. */}
              <div className="pattern-svg" role="img" aria-label="Crease pattern" dangerouslySetInnerHTML={{ __html: svg! }} />
            </div>
          ) : (
            <div className="notice" role="alert" style={dirty ? { opacity: 0.6 } : undefined}>
              <p className="notice__title">No pattern for this photograph</p>
              <p className="notice__body">{refusalMessage}</p>
              <p className="notice__body notice__body--dim">
                A pattern is printed only when every crease has a mountain or valley assignment.
              </p>
              <button type="button" className="upload-label" onClick={onAgain}>
                Try another photograph
              </button>
            </div>
          )}
        </div>
      </div>

      {isResult && !dirty && (
        // Paper size matches the printable sheet: the pipeline default of 150 mm.
        <FoldView cp={data.pattern?.cp} paperMm={150} />
      )}

      {isResult && (
        <div className="actions">
          <button type="button" className="upload-label" onClick={onAgain}>
            Try another photograph
          </button>
        </div>
      )}
    </section>
  );
}

const CLICK_SLOP_PX = 4;
const NUDGE = 0.01;

/**
 * The photograph with the tree drawn over it, and the leaves as handles. The SVG shares the photograph's
 * aspect ratio and uses the analysed image's pixel grid as its viewBox, so pixel = origin + coord * scale
 * holds and the overlay scales with the layout. Pointer positions are mapped back through the same frame.
 */
function TreeOverlay({
  photoUrl, image, tree, disabled, onMove, onDelete, onAdd,
}: {
  photoUrl: string;
  image: FoldResponse["image"];
  tree: SkeletonTree | null;
  disabled: boolean;
  onMove: (id: number, x: number, y: number) => void;
  onDelete: (id: number) => void;
  onAdd: (x: number, y: number) => void;
}) {
  const w = image?.analysedWidth ?? 1;
  const h = image?.analysedHeight ?? 1;
  const unit = Math.max(w, h) / 160;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);

  const px = (v: number, origin: number) => origin + v * (tree?.frame.scale ?? 1);
  /** Client pixels to tree coordinates, through the SVG's box and the frame. */
  const toTree = (clientX: number, clientY: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * w;
    const vy = ((clientY - box.top) / box.height) * h;
    return { x: (vx - tree!.frame.originX) / tree!.frame.scale, y: (vy - tree!.frame.originY) / tree!.frame.scale };
  };

  const byId = new Map(tree?.nodes.map((n) => [n.id, n]) ?? []);
  const pos = (n: { id: number; x: number; y: number }) => (drag && drag.id === n.id ? { x: drag.x, y: drag.y } : n);
  const leaves = tree?.nodes.filter((n) => n.degree === 1) ?? [];

  return (
    <div className="overlay" style={{ aspectRatio: `${w} / ${h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="Your photograph" className="photo-plain" />
      {tree && (
        <svg
          ref={svgRef}
          className="overlay__svg overlay__svg--editable"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="group"
          aria-label={`Flap tree with ${leaves.length} flaps drawn over the photograph. Editable.`}
          onClick={(e) => {
            if (disabled) return;
            const p = toTree(e.clientX, e.clientY);
            onAdd(p.x, p.y);
          }}
        >
          <g stroke="#E8A33D" strokeWidth={unit * 0.9} strokeLinecap="round" fill="none" pointerEvents="none">
            {tree.edges.map((e, i) => {
              const a = byId.get(e.from), b = byId.get(e.to);
              if (!a || !b) return null;
              const pa = pos(a), pb = pos(b);
              return (
                <line key={i}
                  x1={px(pa.x, tree.frame.originX)} y1={px(pa.y, tree.frame.originY)}
                  x2={px(pb.x, tree.frame.originX)} y2={px(pb.y, tree.frame.originY)} />
              );
            })}
          </g>
          <g fill="#0B0B0C" stroke="#E8A33D" strokeWidth={unit * 0.6} pointerEvents="none">
            {tree.nodes.filter((n) => n.degree !== 1).map((n) => (
              <circle key={n.id} cx={px(n.x, tree.frame.originX)} cy={px(n.y, tree.frame.originY)} r={unit * 1.1} />
            ))}
          </g>
          {leaves.map((n) => {
            const p = pos(n);
            const cx = px(p.x, tree.frame.originX), cy = px(p.y, tree.frame.originY);
            return (
              <g
                key={n.id}
                className="leaf-handle"
                tabIndex={disabled ? -1 : 0}
                role="button"
                aria-label={`Limb end ${n.id}. Drag to move, click or press Delete to remove, arrow keys to nudge.`}
                style={{ touchAction: "none", cursor: disabled ? "default" : "grab" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  if (disabled) return;
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag({ id: n.id, x: n.x, y: n.y, startX: e.clientX, startY: e.clientY, moved: false });
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.id !== n.id) return;
                  const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > CLICK_SLOP_PX;
                  if (!moved) return;
                  const t = toTree(e.clientX, e.clientY);
                  setDrag({ ...drag, x: t.x, y: t.y, moved: true });
                }}
                onPointerUp={(e) => {
                  if (!drag || drag.id !== n.id) return;
                  e.stopPropagation();
                  const d = drag;
                  setDrag(null);
                  if (d.moved) onMove(n.id, d.x, d.y);
                  else onDelete(n.id);
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (disabled) return;
                  const step: Record<string, [number, number]> = {
                    ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE],
                  };
                  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onDelete(n.id); }
                  else if (step[e.key]) { e.preventDefault(); onMove(n.id, n.x + step[e.key][0], n.y + step[e.key][1]); }
                }}
              >
                <circle cx={cx} cy={cy} r={unit * 4.5} fill="transparent" />
                <circle cx={cx} cy={cy} r={unit * 1.9} fill="#E8A33D" stroke="#0B0B0C" strokeWidth={unit * 0.4} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
