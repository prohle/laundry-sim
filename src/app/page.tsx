"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildPattern, drawPattern, type CreasePattern } from "@/lib/crease";
import Relief3D from "./Relief3D";

const GRID = 16;
const LEVELS = 4;

type Stage = "empty" | "cutting" | "done" | "error";

export default function Home() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("empty");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const [view, setView] = useState<"3d" | "pattern" | "cutout">("3d");
  const [creaseCount, setCreaseCount] = useState<number | null>(null);
  const [pattern, setPattern] = useState<CreasePattern | null>(null);
  const [foldProgress, setFoldProgress] = useState(0);
  const patternCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoUrlRef = useRef<string | null>(null);
  const cutoutUrlRef = useRef<string | null>(null);

  useEffect(() => {
    photoUrlRef.current = photoUrl;
  }, [photoUrl]);
  useEffect(() => {
    cutoutUrlRef.current = cutoutUrl;
  }, [cutoutUrl]);

  // Build the crease pattern from the cutout.
  useEffect(() => {
    if (!cutoutUrl || view !== "pattern") return;
    const img = new Image();
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width = GRID;
      off.height = GRID;
      const octx = off.getContext("2d");
      if (!octx) return;
      octx.drawImage(img, 0, 0, GRID, GRID);
      const data = octx.getImageData(0, 0, GRID, GRID).data;
      const pattern = buildPattern(data, GRID, LEVELS);
      setCreaseCount(pattern.creases.length);
      setPattern(pattern);
      if (patternCanvasRef.current) {
        drawPattern(patternCanvasRef.current, pattern, 640);
      }
    };
    img.src = cutoutUrl;
  }, [cutoutUrl, view]);

  // Animate the fold when a new pattern arrives.
  useEffect(() => {
    if (!pattern) return;
    setFoldProgress(0);
    let start: number | null = null;
    let raf = 0;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / 1400);
      setFoldProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pattern]);

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setTypeError(true);
      return;
    }
    setTypeError(false);
    setErrorText(null);

    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    if (cutoutUrlRef.current) URL.revokeObjectURL(cutoutUrlRef.current);

    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    setCutoutUrl(null);
    setStage("cutting");

    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(file);
      setCutoutUrl(URL.createObjectURL(blob));
      setStage("done");
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Segmentation failed");
      setStage("error");
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
      e.target.value = "";
    },
    [loadFile],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handlePanelClick = useCallback(() => {
    if (!photoUrl) openPicker();
  }, [photoUrl, openPicker]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === "Enter" || e.key === " ") && !photoUrl) {
        e.preventDefault();
        openPicker();
      }
    },
    [photoUrl, openPicker],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragging(false);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const rightLabel =
    stage === "cutting"
      ? "Removing background…"
      : stage === "done"
        ? "Cutout"
        : stage === "error"
          ? "Segmentation unavailable"
          : "Pending";

  return (
    <div className="app-shell">
      {stage === "cutting" && (
        <div className="progress-bar" aria-hidden="true">
          <div className="progress-bar__fill" />
        </div>
      )}

      <header className="top-bar">
        <span className="top-bar__wordmark">
          Fold<span>.</span>
        </span>
        <span className="top-bar__status">Photo to crease pattern</span>
      </header>

      <div className="upload-row">
        <span className="upload-hint">Mug, bottle, or box</span>
        {stage === "cutting" && (
          <span className="upload-hint model-loading-note">
            First run downloads the model once
          </span>
        )}
      </div>

      <div className="panel-split">
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">Photo</span>
            {photoUrl && <span className="panel-header__badge">1 image</span>}
          </div>

          <input
            ref={inputRef}
            className="upload-input"
            id="photo-input"
            type="file"
            accept="image/*"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleFileChange}
          />

          <div
            className={[
              "panel-canvas",
              "panel-canvas--upload",
              isDragging ? "panel-canvas--dragging" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            aria-label={
              photoUrl
                ? "Photo"
                : "Photo upload area. Click or press Enter to choose an image, or drag one here."
            }
            onClick={handlePanelClick}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photoUrl} alt="Uploaded photo" />
            ) : (
              <div className="empty-state">
                <div className="empty-state__cross" aria-hidden="true" />
                <span className="empty-state__text">
                  {typeError ? "That file is not an image" : "No photo loaded"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="panel-split__divider" aria-hidden="true" />

        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">
              {view === "3d"
                ? "Folded"
                : view === "pattern"
                  ? "Crease pattern"
                  : "Cutout"}
            </span>
            {stage === "done" && (
              <span className="panel-header__badge">
                {view === "pattern" && creaseCount !== null
                  ? `${creaseCount} creases`
                  : "ready"}
              </span>
            )}
          </div>

          {stage === "done" && (
            <div className="upload-row" style={{ paddingBottom: 8 }}>
              {(["3d", "pattern", "cutout"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="upload-hint"
                  onClick={() => setView(v)}
                  style={{
                    opacity: view === v ? 1 : 0.45,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {v === "3d" ? "3D" : v === "pattern" ? "Pattern" : "Cutout"}
                </button>
              ))}
            </div>
          )}

          <div className="panel-canvas" aria-label="Crease pattern output">
            {stage === "cutting" ? (
              <div className="processing-overlay">
                <div
                  className="processing-spinner"
                  role="status"
                  aria-label="Processing photo"
                />
                <span className="processing-label">Removing background</span>
                <span className="processing-sub">
                  First run downloads the model once — this can take a minute
                </span>
              </div>
            ) : pattern && view === "3d" ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ flex: 1, minHeight: 0 }}>
                  <Relief3D pattern={pattern} progress={foldProgress} />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={foldProgress}
                    onChange={(e) => setFoldProgress(Number(e.target.value))}
                    aria-label="Fold progress"
                    style={{ flex: 1, accentColor: "#E8A33D" }}
                  />
                  <span
                    style={{
                      font: "11px ui-monospace, monospace",
                      color: "rgba(242,240,235,0.6)",
                      minWidth: "3ch",
                      textAlign: "right",
                    }}
                  >
                    {Math.round(foldProgress * 100)}%
                  </span>
                </div>
              </div>
            ) : cutoutUrl && view === "pattern" ? (
              <canvas
                ref={patternCanvasRef}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                aria-label="Generated crease pattern"
              />
            ) : cutoutUrl && view === "cutout" ? (
              <div className="cutout-wrapper checkerboard">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cutoutUrl} alt="Segmented object cutout" />
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__cross" aria-hidden="true" />
                <span className="empty-state__text">{rightLabel}</span>
              </div>
            )}

            {errorText && (
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 10,
                  right: 10,
                  font: "11px ui-monospace, monospace",
                  color: "#E8A33D",
                  opacity: 0.8,
                }}
              >
                {errorText}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
