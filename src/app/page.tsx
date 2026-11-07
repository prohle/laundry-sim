"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkeletonTree } from "@/lib/skeleton";
import type { CollapseCp } from "@/lib/collapse";
import FoldView from "./FoldView";
import HollowMode, { ModeSwitch, type Mode } from "./Hollow";
import { minimumTier, TIER_TIME_ESTIMATES } from "@/lib/tiers";
import type { TierAttempt } from "@/lib/ladder";
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
  budget?: { requested: number | null; used: number | null; leaves: number } | null;
  views?: ViewVerdict[];
  disagreement?: string | null;
}

/** One entry of `views` in the response; always present, one entry for a single photograph. */
interface ViewVerdict {
  view: number;
  leaves: number | null;
  tier: string | null;
  folds: boolean;
  chosen: boolean;
  shown: boolean;
  refusal: { stage: string; message: string; detail: string | null } | null;
  /** All four tiers for this photograph, failures included. Null for an edited tree. */
  tiers?: TierAttempt[] | null;
}

/** The tier the server shows by default: the highest that folds, else the minimum. */
function defaultTier(tiers: TierAttempt[]): number | null {
  for (let i = tiers.length - 1; i >= 0; i--) if (tiers[i].ok) return i;
  const first = tiers.findIndex((t) => t.attempted);
  return first >= 0 ? first : null;
}

interface Item { id: number; file: File; url: string }

type View =
  | { kind: "empty"; notice: string | null }
  | { kind: "staged"; items: Item[]; notice: string | null }
  | { kind: "processing"; items: Item[] }
  | { kind: "result"; items: Item[]; shown: Item; data: FoldResponse; views: ViewVerdict[]; svg: string }
  | { kind: "refusal"; items: Item[]; shown: Item; data: FoldResponse; views: ViewVerdict[]; message: string }
  | { kind: "error"; items: Item[]; message: string };

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_VIEWS = 4;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let nextId = 1;
const makeItem = (file: File): Item => ({ id: nextId++, file, url: URL.createObjectURL(file) });

export default function Home() {
  const [mode, setMode] = useState<Mode>("fold");
  const sw = <ModeSwitch mode={mode} onMode={setMode} />;
  return mode === "hollow" ? <HollowMode modeSwitch={sw} /> : <FoldMode modeSwitch={sw} />;
}

function FoldMode({ modeSwitch }: { modeSwitch: React.ReactNode }) {
  const [view, setView] = useState<View>({ kind: "empty", notice: null });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Every object URL made and not yet revoked, so none leaks when photographs are removed or replaced.
  const liveRef = useRef<Map<number, string>>(new Map());

  const track = (items: Item[]) => { for (const i of items) liveRef.current.set(i.id, i.url); };
  const release = (ids: number[] | "all") => {
    for (const [id, url] of [...liveRef.current]) {
      if (ids === "all" || ids.includes(id)) { URL.revokeObjectURL(url); liveRef.current.delete(id); }
    }
  };
  useEffect(() => {
    const live = liveRef.current;
    return () => {
      abortRef.current?.abort();
      for (const url of live.values()) URL.revokeObjectURL(url);
      live.clear();
    };
  }, []);

  const reset = useCallback((notice: string | null = null) => {
    abortRef.current?.abort();
    for (const url of liveRef.current.values()) URL.revokeObjectURL(url);
    liveRef.current.clear();
    setView({ kind: "empty", notice });
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /** Add photographs to the staged set (up to four), with a plain notice for any that were left out. */
  const addFiles = (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const current = view.kind === "staged" ? view.items : [];
    const notes: string[] = [];
    const accepted: File[] = [];
    for (const f of list) {
      if (!ACCEPTED.includes(f.type)) notes.push(`${f.name} is not a PNG or JPEG photograph.`);
      else if (f.size > MAX_BYTES) notes.push(`${f.name} is over 10 MiB.`);
      else accepted.push(f);
    }
    const room = MAX_VIEWS - current.length;
    if (accepted.length > room) notes.push(`Only ${MAX_VIEWS} photographs are used; ${accepted.length - room} left out.`);
    const added = accepted.slice(0, Math.max(room, 0)).map(makeItem);
    track(added);
    const items = [...current, ...added];
    const notice = notes.length ? notes.join(" ") : null;
    setView(items.length ? { kind: "staged", items, notice } : { kind: "empty", notice });
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeItem = (id: number) => {
    if (view.kind !== "staged") return;
    release([id]);
    const items = view.items.filter((i) => i.id !== id);
    setView(items.length ? { kind: "staged", items, notice: null } : { kind: "empty", notice: null });
  };

  const submit = useCallback(async (items: Item[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ kind: "processing", items });

    try {
      // One `image` part per photograph, in the order shown.
      const form = new FormData();
      for (const i of items) form.append("image", i.file, i.file.name);
      const res = await fetch("/api/fold", { method: "POST", body: form, signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        const message = body?.message ?? `The server answered ${res.status}.`;
        setView({ kind: "error", items, message });
        return;
      }
      const data = body as FoldResponse;
      const views = data.views?.length ? data.views : [];
      const shownAt = Math.max(0, views.findIndex((v) => v.shown));
      const shown = items[shownAt] ?? items[0];
      // A pattern is shown only when the API says ok and sent one.
      const svg = data.ok === true ? data.pattern?.svg ?? null : null;
      if (svg) {
        setView({ kind: "result", items, shown, data, views, svg });
      } else {
        setView({
          kind: "refusal", items, shown, data, views,
          message: data.refusal?.message ?? "The pipeline did not produce a printable pattern.",
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setView({ kind: "error", items, message: "The server could not be reached." });
    }
  }, []);

  const busy = view.kind === "processing";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__wordmark">Fold<span>.</span></span>
        {modeSwitch}
        <span className="top-bar__status">Photograph to crease pattern</span>
      </header>

      <input
        ref={inputRef}
        className="upload-input"
        type="file"
        multiple
        accept="image/png,image/jpeg"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => addFiles(e.target.files)}
      />

      <main className="screen">
        <p className="supported">
          One to four photographs of one object with distinct protrusions, from different angles. Four to six flaps in practice, one square, no cuts. A tier that does not fold can be opened to see why.
        </p>

        {(view.kind === "empty" || view.kind === "staged") && (
          <div
            className={`panel-canvas panel-canvas--upload dropzone${view.kind === "staged" ? " dropzone--staged" : ""}${dragging ? " panel-canvas--dragging" : ""}`}
            role={view.kind === "empty" ? "button" : "group"}
            tabIndex={view.kind === "empty" ? 0 : undefined}
            aria-label={view.kind === "empty"
              ? "Choose one to four photographs of the same object, from different angles."
              : "Photographs chosen. Drop more to add."}
            onClick={view.kind === "empty" ? () => inputRef.current?.click() : undefined}
            onKeyDown={view.kind === "empty" ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            } : undefined}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            {view.kind === "empty" ? (
              <div className="empty-state">
                <div className="empty-state__cross" />
                <span className="empty-state__text">Drop up to four photographs, or click to choose them</span>
                <span className="empty-state__sub">PNG or JPEG, under 10 MiB each</span>
                <span className="empty-state__sub">More views help when a limb is hidden in one of them.</span>
                {view.notice && <span className="empty-state__notice" role="alert">{view.notice}</span>}
              </div>
            ) : (
              <div className="staged">
                <ul className="thumbs" aria-label="Chosen photographs">
                  {view.items.map((i, n) => (
                    <li key={i.id} className="thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.url} alt="" className="thumb__img" />
                      <span className="thumb__name" title={i.file.name}>{n + 1}. {i.file.name}</span>
                      <button
                        type="button"
                        className="thumb__remove"
                        aria-label={`Remove ${i.file.name}`}
                        onClick={() => removeItem(i.id)}
                      >×</button>
                    </li>
                  ))}
                </ul>
                <p className="edit-bar__help">
                  {view.items.length} of {MAX_VIEWS} photographs. More views help when a limb is hidden in one of them.
                </p>
                {view.notice && <p className="edit-bar__note" role="alert">{view.notice}</p>}
                <div className="edit-bar__buttons">
                  <button type="button" className="upload-label" onClick={() => void submit(view.items)}>
                    Make the pattern
                  </button>
                  <button
                    type="button"
                    className="upload-label"
                    disabled={view.items.length >= MAX_VIEWS}
                    onClick={() => inputRef.current?.click()}
                  >
                    Add a photograph
                  </button>
                  <button type="button" className="upload-label" onClick={() => reset()}>Start again</button>
                </div>
              </div>
            )}
          </div>
        )}

        {view.kind === "processing" && (
          <section className="panel-col panel-col--single" aria-busy="true">
            <div className="panel-canvas panel-canvas--photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.items[0].url} alt="Your photograph" className="photo-plain" />
              <div className="processing-overlay" role="status">
                <div className="processing-spinner" />
                <span className="processing-label">
                  {view.items.length > 1 ? `Reading ${view.items.length} views` : "Finding the protrusions and packing the paper"}
                </span>
              </div>
            </div>
          </section>
        )}

        {(view.kind === "result" || view.kind === "refusal") && (
          <Outcome key={view.items.map((i) => i.id).join("-") + view.data.totalMs} view={view} onAgain={() => reset()} />
        )}

        {view.kind === "error" && (
          <section className="panel-col panel-col--single">
            <div className="notice notice--error" role="alert">
              <p className="notice__title">The pattern could not be made</p>
              <p className="notice__body">{view.message}</p>
              <button type="button" className="upload-label" onClick={() => reset()}>
                Try other photographs
              </button>
            </div>
          </section>
        )}

        <p className="privacy">
          The photographs are sent to the server, processed in memory and not stored.
        </p>
      </main>
      {busy && <div className="progress-bar" aria-hidden="true"><div className="progress-bar__fill" /></div>}
    </div>
  );
}

/** One row per photograph: label, flaps, tier, whether it folds, which was used, and why not if refused. */
function ViewsTable({ items, views, disagreement }: { items: Item[]; views: ViewVerdict[]; disagreement: string | null }) {
  return (
    <div className="views">
      {disagreement && <p className="views__disagreement" role="status">{disagreement}</p>}
      <ul className="views__list" aria-label="Verdict for each photograph">
        {views.map((v, n) => {
          const item = items[n];
          return (
            <li key={v.view} className={`views__row${v.chosen ? " views__row--chosen" : ""}${v.refusal ? " views__row--refused" : ""}`}>
              {item && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="views__thumb" />
              )}
              <div className="views__text">
                <span className="views__label" title={item?.file.name}>View {v.view}{item ? ` · ${item.file.name}` : ""}</span>
                <span className="views__facts">
                  {v.leaves === null ? "No flaps found" : `${v.leaves} flaps`}
                  {" · "}{v.tier ? cap(v.tier) : "no tier"}
                  {" · "}{v.folds ? "folds" : "does not fold"}
                </span>
                {v.refusal && <span className="views__reason">{v.refusal.message}</span>}
              </div>
              {v.chosen && <span className="views__chosen">Used</span>}
            </li>
          );
        })}
      </ul>
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
  // The per-view verdicts belong to the upload; folding an edited tree re-solves the shown view only.
  const { views, disagreement } = { views: view.views, disagreement: view.data.disagreement ?? null };
  const [svg, setSvg] = useState<string | null>(view.kind === "result" ? view.svg : null);
  const [refusalMessage, setRefusalMessage] = useState<string>(view.kind === "refusal" ? view.message : "");

  // The tree on screen is always the last valid one. `proposed` is what the photograph gave;
  // `folded` is the tree the pattern on screen was made from.
  const [tree, setTree] = useState<SkeletonTree | null>(data.tree);
  const proposed = useRef<SkeletonTree | null>(view.data.tree);
  const [folded, setFolded] = useState<SkeletonTree | null>(data.tree);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [folding, setFolding] = useState(false);
  // All four tiers of the shown photograph, held in memory. Choosing a chip reads from here; no request.
  const ladder = view.views.find((v) => v.shown)?.tiers ?? null;
  // The selected tier; null after an edited tree is folded (that tree is solved as given).
  const [selected, setSelected] = useState<number | null>(ladder ? defaultTier(ladder) : null);

  const isResult = data.ok === true && !!svg;
  const dirty = tree !== folded;
  const showFold = isResult && !dirty;
  const tier = dirty && tree ? minimumTier(tree) : data.minimumTier;
  const flaps = tree?.leaves ?? null;

  // A real file: a Blob URL, made in an effect so it survives StrictMode's mount/unmount probe.
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);
  const tierName = (selected !== null && ladder?.[selected]?.tier) || (ladder ? "edited" : data.minimumTier?.tier) || "pattern";
  useEffect(() => {
    if (!svg || !isResult) { setDownload(null); return; }
    const stem = view.shown.file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "photograph";
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setDownload({ url, filename: `fold-${stem}-${tierName}-crease-pattern.svg` });
    return () => URL.revokeObjectURL(url);
  }, [svg, isResult, view.shown.file, tierName]);

  const apply = (r: { ok: true; tree: SkeletonTree } | { ok: false; message: string }) => {
    if (r.ok) {
      setTree(r.tree);
      setEditNote(null);
    } else {
      setEditNote(`${r.message} The tree is unchanged.`);
    }
  };

  /**
   * Swap to a tier already in memory. A tier that folds brings its pattern; one that did not brings its tree and
   * its refusal reason and no pattern (3.26). A tier below the minimum was never solved and has no tree.
   */
  const chooseTier = (i: number) => {
    const a = ladder?.[i];
    if (!a || !a.tree || folding || i === selected) return;
    if (a.ok && a.pattern) {
      setData((d) => ({
        ...d, ok: true, refusal: null, tree: a.tree, contraction: a.contraction,
        pattern: { svg: a.pattern!.svg, cp: a.pattern!.cp as CollapseCp },
        budget: { requested: a.budget, used: a.budget, leaves: a.leaves ?? 0 },
      }));
      setSvg(a.pattern.svg);
      setRefusalMessage("");
    } else {
      const message = a.refusal?.message ?? "This tier did not produce a printable pattern.";
      setData((d) => ({
        ...d, ok: false, refusal: a.refusal, tree: a.tree, contraction: a.contraction, pattern: null,
        budget: { requested: a.budget, used: a.budget, leaves: a.leaves ?? 0 },
      }));
      setSvg(null);
      setRefusalMessage(message);
    }
    setTree(a.tree);
    setFolded(a.tree);
    proposed.current = a.tree;
    setEditNote(null);
    setSelected(i);
  };

  const foldThis = async () => {
    if (!tree || folding) return;
    setFolding(true);
    setEditNote(null);
    try {
      const form = new FormData();
      form.append("image", view.shown.file);
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
      setSelected(null);
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

      {ladder && (
        <div className="tiers" role="group" aria-label="Difficulty tier">
          <div className="tiers__chips">
            {ladder.map((t, i) => {
              const isMin = t.attempted && !ladder.slice(0, i).some((x) => x.attempted);
              const status = t.ok ? (t.sameAs ? `same as ${cap(t.sameAs)}` : isMin ? "minimum" : null) : t.short;
              return (
                <button
                  key={t.tier}
                  type="button"
                  className={`tiers__chip${t.ok ? "" : " tiers__chip--unavailable"}`}
                  aria-pressed={selected === i}
                  disabled={!t.tree || folding}
                  onClick={() => chooseTier(i)}
                >
                  <span className="tiers__name">{cap(t.tier)} {t.budget}</span>
                  <span className="tiers__sub">{t.budget} flaps, about {TIER_TIME_ESTIMATES[t.tier]}</span>
                  {status && <span className="tiers__sub">{status}</span>}
                </button>
              );
            })}
          </div>
          <p className="tiers__help" role="status">
            {folding ? "Folding" : selected === null
              ? "The pattern was made from your edited tree. Choose a tier to go back to the photograph's tree."
              : "A tier that does not fold can be chosen to see its tree and why. Times are estimates, not yet measured."}
            {data.budget && selected !== null && !folding ? ` Flaps in this pattern: ${data.budget.leaves}.` : ""}
          </p>
        </div>
      )}

      {views.length > 1 && <ViewsTable items={view.items} views={views} disagreement={disagreement} />}

      <div className={`panel-split${showFold ? " panel-split--fold" : ""}`}>
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">
              {views.length > 1 ? `View ${views.findIndex((v) => v.shown) + 1}: photograph and flap tree` : "Photograph and flap tree"}
            </span>
            {flaps !== null && <span className="panel-header__badge">{flaps} flaps</span>}
          </div>
          <div className="panel-canvas panel-canvas--photo">
            <TreeOverlay
              photoUrl={view.shown.url}
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
                  Before folding, {data.contraction.dropped.length === 1 ? "one protrusion was" : `${data.contraction.dropped.length} protrusions were`} left
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
                Try other photographs
              </button>
            </div>
          )}
        </div>
        {showFold && (
          <>
            <div className="panel-split__divider" />
            <div className="panel-col">
              <div className="panel-header">
                <span className="panel-header__label">3D fold, computed from the pattern</span>
              </div>
              {/* Paper size matches the printable sheet: the pipeline default of 150 mm. */}
              <FoldView key={selected ?? "edited"} cp={data.pattern?.cp} paperMm={150} />
            </div>
          </>
        )}
      </div>

      {isResult && (
        <div className="actions">
          <button type="button" className="upload-label" onClick={onAgain}>
            Try other photographs
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
