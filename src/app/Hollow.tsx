"use client";

import { useEffect, useRef, useState } from "react";
import NetFoldView from "./NetFoldView";
import type { NetFold } from "@/lib/netfold";
import { SLOT_ANGLES, SLOT_NAMES, MAX_HOLLOW_VIEWS, MIN_HOLLOW_VIEWS } from "@/lib/hollow-slots";

export type Mode = "fold" | "hollow";

export function ModeSwitch({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div className="mode-switch" role="group" aria-label="Mode">
      <button type="button" className="mode-switch__btn" aria-pressed={mode === "fold"} onClick={() => onMode("fold")}>Fold</button>
      <button type="button" className="mode-switch__btn" aria-pressed={mode === "hollow"} onClick={() => onMode("hollow")}>Hollow</button>
    </div>
  );
}

interface HollowResponse {
  ok: boolean;
  refusal: { stage: string; message: string; detail: string | null } | null;
  level: number;
  faces: number | null;
  tabs: number | null;
  tabsDropped: number | null;
  paper: { name: string; width: number; height: number };
  bbox: { width: number; height: number } | null;
  volume: number | null;
  assembly: { parts: number; tabsToGlue: number; tabsToTape: number; note: string } | null;
  svg: string | null;
  fold: NetFold | null;
  closureGapMm: number | null;
}

interface Item { id: number; file: File; url: string }
type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; data: HollowResponse }
  | { kind: "error"; message: string };

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;
let nextId = 1;

export default function HollowMode({ modeSwitch }: { modeSwitch: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef<Map<number, string>>(new Map());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const live = urls.current;
    return () => { abort.current?.abort(); for (const u of live.values()) URL.revokeObjectURL(u); live.clear(); };
  }, []);

  const add = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    const notes: string[] = [];
    const room = MAX_HOLLOW_VIEWS - items.length;
    const ok = list.filter((f) => {
      if (!ACCEPTED.includes(f.type)) { notes.push(`${f.name} is not a PNG or JPEG photograph.`); return false; }
      if (f.size > MAX_BYTES) { notes.push(`${f.name} is over 10 MiB.`); return false; }
      return true;
    });
    if (ok.length > room) notes.push(`Only ${MAX_HOLLOW_VIEWS} photographs are used; ${ok.length - room} left out.`);
    const added = ok.slice(0, Math.max(room, 0)).map((file) => {
      const it = { id: nextId++, file, url: URL.createObjectURL(file) };
      urls.current.set(it.id, it.url);
      return it;
    });
    setItems([...items, ...added]);
    setNotice(notes.length ? notes.join(" ") : null);
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (id: number) => {
    const u = urls.current.get(id);
    if (u) { URL.revokeObjectURL(u); urls.current.delete(id); }
    setItems(items.filter((i) => i.id !== id));
    setState({ kind: "idle" });
  };

  const make = async (lv: 0 | 1) => {
    abort.current?.abort();
    const c = new AbortController();
    abort.current = c;
    setState({ kind: "busy" });
    try {
      const form = new FormData();
      for (const i of items) form.append("image", i.file, i.file.name);
      form.append("level", String(lv));
      const res = await fetch("/api/hollow", { method: "POST", body: form, signal: c.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) setState({ kind: "error", message: body?.message ?? `The server answered ${res.status}.` });
      else setState({ kind: "done", data: body as HollowResponse });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setState({ kind: "error", message: "The server could not be reached." });
    }
  };

  const busy = state.kind === "busy";
  const d = state.kind === "done" ? state.data : null;
  const svgUrl = d?.ok && d.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.svg)}` : null;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__wordmark">Fold<span>.</span></span>
        {modeSwitch}
        <span className="top-bar__status">Photographs to a net</span>
      </header>
      <input ref={inputRef} className="upload-input" type="file" multiple accept="image/png,image/jpeg"
        tabIndex={-1} aria-hidden="true" onChange={(e) => add(e.target.files)} />
      <main className="screen">
        <p className="supported">
          Hollow mode: cut, fold, glue, into a closed volume. It is not origami. Two to four photographs of one upright object,
          each showing all of it at the same height, with a rounded outline and no dents or holes.
        </p>

        <section className="hollow-slots" aria-label="Photograph slots">
          <p className="hollow-order">
            Add the photographs in this order: Front (0°), Right (90°), Back (180°), Left (270°). The first photograph you add is
            the Front, the second the Right, and so on. If the order is wrong the shape is wrong.
          </p>
          <ul className="hollow-slots__list">
            {SLOT_NAMES.map((name, n) => {
              const it = items[n];
              return (
                <li key={name} className={`hollow-slot${it ? " hollow-slot--filled" : ""}`}>
                  <span className="hollow-slot__label">{name} ({SLOT_ANGLES[n]}°)</span>
                  {it ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt="" className="thumb__img" />
                      <span className="thumb__name" title={it.file.name}>{it.file.name}</span>
                      <button type="button" className="thumb__remove" aria-label={`Remove ${it.file.name}`} onClick={() => remove(it.id)}>×</button>
                    </>
                  ) : (
                    <span className="hollow-slot__empty">{n < MIN_HOLLOW_VIEWS ? "needed" : "optional"}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {notice && <p className="edit-bar__note" role="alert">{notice}</p>}
        </section>

        <p className="hollow-facts">20 faces only. An 80-face version was removed: its net overlapped itself from every starting face on every shape tried.</p>

        <div className="edit-bar__buttons">
          <button type="button" className="upload-label" disabled={busy || items.length >= MAX_HOLLOW_VIEWS} onClick={() => inputRef.current?.click()}>
            Add a photograph
          </button>
          <button type="button" className="upload-label" disabled={busy || items.length === 0} onClick={() => void make(0)}>
            Make the net
          </button>
        </div>

        {busy && <p role="status" className="hollow-status">Building the shape and unfolding it</p>}

        {state.kind === "error" && (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">The net could not be made</p>
            <p className="notice__body">{state.message}</p>
          </div>
        )}

        {d && !d.ok && d.refusal && (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">No net was made</p>
            <p className="notice__body">{d.refusal.message}</p>
          </div>
        )}

        {d && d.ok && svgUrl && d.assembly && (
          <section className="hollow-result" aria-label="Net">
            <div className="hollow-note" role="status">
              <p>{d.assembly.note}</p>
              <p className="hollow-facts">
                {d.faces} faces · {d.tabs} tabs · {d.tabsDropped} dropped · {d.paper.name} {d.paper.width} × {d.paper.height} mm
                {d.volume !== null ? ` · mesh volume ${Math.round(d.volume)} mm³ before scaling to the paper` : ""}
              </p>
              <p className="hollow-facts">A rough skin around the outlines you gave, not a replica.</p>
            </div>
            <div className="hollow-pair">
              <figure className="hollow-pair__net">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgUrl} alt={`Net with ${d.faces} faces and ${d.tabs} tabs: solid lines are cuts, dashed lines are folds.`} className="hollow-net" />
                <figcaption className="hollow-facts">For printing: cut the solid lines, fold the dashed ones.</figcaption>
              </figure>
              {d.fold && <NetFoldView key={svgUrl} fold={d.fold} />}
            </div>
            <a className="upload-label" href={svgUrl} download="hollow-net.svg">Download the net (SVG)</a>
          </section>
        )}

        <p className="privacy">The photographs are sent to the server, processed in memory and not stored.</p>
      </main>
    </div>
  );
}
