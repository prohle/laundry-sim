"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The subset of the POST /api/fold response this screen reads. */
interface FoldResponse {
  ok: boolean;
  refusal: { stage: string; message: string; detail: string | null } | null;
  image: { width: number; height: number; analysedWidth: number; analysedHeight: number } | null;
  tree: {
    nodes: { id: number; x: number; y: number; degree: number }[];
    edges: { from: number; to: number }[];
    leaves: number;
    frame: { originX: number; originY: number; scale: number };
  } | null;
  minimumTier: { tier: string | null; requiredLeaves: number; reason: string } | null;
  pattern: { svg: string | null } | null;
}

type View =
  | { kind: "empty"; notice: string | null }
  | { kind: "processing"; photoUrl: string }
  | { kind: "result"; photoUrl: string; name: string; data: FoldResponse; svg: string }
  | { kind: "refusal"; photoUrl: string; data: FoldResponse; message: string }
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
        setView({ kind: "result", photoUrl, name: file.name, data, svg });
      } else {
        setView({
          kind: "refusal",
          photoUrl,
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
          Four-legged animals on a plain background. Four to twelve flaps, one square, no cuts.
        </p>

        {view.kind === "empty" && (
          <div
            className={`panel-canvas panel-canvas--upload dropzone${dragging ? " panel-canvas--dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Choose a photograph. Four-legged animals on a plain background."
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
          <Outcome view={view} onAgain={() => reset()} />
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
  const { data } = view;
  const tier = data.minimumTier;
  const isResult = view.kind === "result";
  const svg = isResult ? view.svg : null;

  // A real file: a Blob URL, made in an effect so it survives StrictMode's mount/unmount probe.
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);
  const name = view.kind === "result" ? view.name : "photograph";
  const tierName = tier?.tier ?? "pattern";
  useEffect(() => {
    if (!svg) { setDownload(null); return; }
    const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "photograph";
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setDownload({ url, filename: `fold-${stem}-${tierName}-crease-pattern.svg` });
    return () => URL.revokeObjectURL(url);
  }, [svg, name, tierName]);

  const flaps = data.tree?.leaves ?? tier?.requiredLeaves ?? null;

  return (
    <section className="outcome">
      <div className="summary">
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
            <TreeOverlay photoUrl={view.photoUrl} data={data} />
          </div>
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
          {isResult ? (
            <div className="panel-canvas panel-canvas--pattern">
              {/* Server-generated SVG from tools/cp-to-svg.ts; scaled to the panel by CSS. */}
              <div className="pattern-svg" role="img" aria-label="Crease pattern" dangerouslySetInnerHTML={{ __html: svg! }} />
            </div>
          ) : (
            <div className="notice" role="alert">
              <p className="notice__title">No pattern for this photograph</p>
              <p className="notice__body">{(view as Extract<View, { kind: "refusal" }>).message}</p>
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

/**
 * The photograph with the tree drawn over it. The SVG shares the photograph's aspect ratio and uses the
 * analysed image's pixel grid as its viewBox, so pixel = origin + coord * scale holds and the overlay
 * scales with the layout.
 */
function TreeOverlay({ photoUrl, data }: { photoUrl: string; data: FoldResponse }) {
  const img = data.image;
  const tree = data.tree;
  const w = img?.analysedWidth ?? 1;
  const h = img?.analysedHeight ?? 1;
  const px = (v: number, origin: number) => origin + v * (tree?.frame.scale ?? 1);
  const unit = Math.max(w, h) / 160;

  const byId = new Map(tree?.nodes.map((n) => [n.id, n]) ?? []);
  const leaves = tree?.nodes.filter((n) => n.degree === 1) ?? [];

  return (
    <div className="overlay" style={{ aspectRatio: `${w} / ${h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="Your photograph" className="photo-plain" />
      {tree && (
        <svg
          className="overlay__svg"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Flap tree with ${leaves.length} flaps drawn over the photograph`}
        >
          <g stroke="#E8A33D" strokeWidth={unit * 0.9} strokeLinecap="round" fill="none">
            {tree.edges.map((e, i) => {
              const a = byId.get(e.from), b = byId.get(e.to);
              if (!a || !b) return null;
              return (
                <line key={i}
                  x1={px(a.x, tree.frame.originX)} y1={px(a.y, tree.frame.originY)}
                  x2={px(b.x, tree.frame.originX)} y2={px(b.y, tree.frame.originY)} />
              );
            })}
          </g>
          <g fill="#0B0B0C" stroke="#E8A33D" strokeWidth={unit * 0.6}>
            {tree.nodes.filter((n) => n.degree !== 1).map((n) => (
              <circle key={n.id} cx={px(n.x, tree.frame.originX)} cy={px(n.y, tree.frame.originY)} r={unit * 1.1} />
            ))}
          </g>
          <g fill="#E8A33D" stroke="#0B0B0C" strokeWidth={unit * 0.4}>
            {leaves.map((n) => (
              <circle key={n.id} cx={px(n.x, tree.frame.originX)} cy={px(n.y, tree.frame.originY)} r={unit * 1.9} />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
