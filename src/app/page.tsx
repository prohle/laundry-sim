"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

// ---------------------------------------------------------------------------
// Types matching the worker message protocol
// ---------------------------------------------------------------------------

type WorkerIn =
  | { type: "encode"; imageDataUrl: string }
  | { type: "decode"; pointX: number; pointY: number };

type WorkerOut =
  | { type: "model-loading" }
  | { type: "model-ready" }
  | { type: "model-error"; message: string }
  | { type: "encoding" }
  | { type: "encoded" }
  | { type: "mask"; maskData: Uint8ClampedArray; width: number; height: number; opaque: number }
  | { type: "error"; message: string };

type ModelState = "idle" | "loading" | "ready" | "error";
type SegmentState = "idle" | "encoding" | "decoding" | "done" | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  // ── Photo state ──────────────────────────────────────────────────────────
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The data-URL form of the photo, sent to the worker for encoding.
  const photoDataUrlRef = useRef<string | null>(null);

  // ── Worker / model state ─────────────────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [segmentState, setSegmentState] = useState<SegmentState>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  // ── Mask canvas state ────────────────────────────────────────────────────
  // imageData payload from the last successful mask decode
  const [maskPayload, setMaskPayload] = useState<{
    maskData: Uint8ClampedArray;
    width: number;
    height: number;
    opaque: number;
    photoUrl: string; // which photo this mask belongs to
  } | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const photoImgRef = useRef<HTMLImageElement>(null);

  // ── Click indicator ──────────────────────────────────────────────────────
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // ---------------------------------------------------------------------------
  // Boot the worker once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const worker = new Worker(
      new URL("./segment.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener("message", (e: MessageEvent<WorkerOut>) => {
      const msg = e.data;
      switch (msg.type) {
        case "model-loading":
          setModelState("loading");
          break;
        case "model-ready":
          setModelState("ready");
          break;
        case "model-error":
          setModelState("error");
          setErrorText(msg.message);
          break;
        case "encoding":
          setSegmentState("encoding");
          break;
        case "encoded":
          setSegmentState("idle");
          break;
        case "mask":
          setMaskPayload((prev) => ({
            maskData: msg.maskData,
            width: msg.width,
            height: msg.height,
            opaque: msg.opaque,
            photoUrl: prev?.photoUrl ?? photoUrl ?? "",
          }));
          setSegmentState("done");
          break;
        case "error":
          setSegmentState("error");
          setErrorText(msg.message);
          break;
      }
    });

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Keep maskPayload.photoUrl in sync with current photoUrl when mask arrives
  // ---------------------------------------------------------------------------
  const photoUrlRef = useRef(photoUrl);
  useEffect(() => {
    photoUrlRef.current = photoUrl;
  }, [photoUrl]);

  // Re-render mask onto canvas whenever maskPayload changes
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !maskPayload || !photoUrl) return;

    const { maskData, width, height } = maskPayload;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Composite: photo pixels where mask is opaque, transparent elsewhere.
    // We draw the original photo, then use destination-in to clip to mask shape.
    const img = photoImgRef.current;
    if (!img || !img.complete) return;

    // 1. Draw the original photo at canvas resolution
    ctx.drawImage(img, 0, 0, width, height);

    // 2. Get photo pixel data
    const photoData = ctx.getImageData(0, 0, width, height);
    const photoPixels = photoData.data;

    // 3. Build the output ImageData: photo colour where mask=1, else transparent
    const output = ctx.createImageData(width, height);
    const out = output.data;
    const numMasked = maskData.length / 4; // maskData is already RGBA whites/transparent

    for (let i = 0; i < numMasked; i++) {
      const base = i * 4;
      if (maskData[base + 3] === 255) {
        // This pixel is inside the mask — copy from the photo
        out[base] = photoPixels[base];
        out[base + 1] = photoPixels[base + 1];
        out[base + 2] = photoPixels[base + 2];
        out[base + 3] = 255;
      }
      // else stays [0,0,0,0] → transparent → checkerboard shows through
    }

    ctx.putImageData(output, 0, 0);
  }, [maskPayload, photoUrl]);

  // ---------------------------------------------------------------------------
  // File loading helpers (unchanged from original)
  // ---------------------------------------------------------------------------

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setTypeError(true);
        return;
      }
      setTypeError(false);
      if (photoUrl) URL.revokeObjectURL(photoUrl);

      const url = URL.createObjectURL(file);
      setPhotoUrl(url);
      setMaskPayload(null);
      setClickPos(null);
      setSegmentState("idle");

      // Convert to data URL for the worker (object URLs are origin-scoped
      // but data URLs cross the worker boundary safely).
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        photoDataUrlRef.current = dataUrl;

        // Kick off embedding extraction right away so the first click is fast.
        if (workerRef.current && modelState === "ready") {
          workerRef.current.postMessage({
            type: "encode",
            imageDataUrl: dataUrl,
          } satisfies WorkerIn);
        }
      };
      reader.readAsDataURL(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photoUrl, modelState],
  );

  // When model becomes ready, encode any already-loaded photo
  useEffect(() => {
    if (
      modelState === "ready" &&
      photoDataUrlRef.current &&
      workerRef.current
    ) {
      workerRef.current.postMessage({
        type: "encode",
        imageDataUrl: photoDataUrlRef.current,
      } satisfies WorkerIn);
    }
  }, [modelState]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      e.target.value = "";
    },
    [loadFile],
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    },
    [openPicker],
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
      if (file) loadFile(file);
    },
    [loadFile],
  );

  // ---------------------------------------------------------------------------
  // Click-to-segment on the photo panel
  // ---------------------------------------------------------------------------

  const handlePhotoClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // If no photo loaded, open the file picker
      if (!photoUrl) {
        openPicker();
        return;
      }

      // No model or not yet ready — ignore the segmentation click
      // (the photo was already loaded, so clicking should segment)
      if (modelState !== "ready" || !photoDataUrlRef.current) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const pointX = (e.clientX - rect.left) / rect.width;
      const pointY = (e.clientY - rect.top) / rect.height;

      setClickPos({ x: pointX * 100, y: pointY * 100 });
      setSegmentState("decoding");

      workerRef.current?.postMessage({
        type: "decode",
        pointX,
        pointY,
      } satisfies WorkerIn);
    },
    [photoUrl, modelState, openPicker],
  );

  // ---------------------------------------------------------------------------
  // Derived UI labels
  // ---------------------------------------------------------------------------

  const maskPanelLabel: string = (() => {
    if (modelState === "error") return "Segmentation unavailable";
    if (modelState === "loading") return "Loading model…";
    if (!photoUrl) return "Pending";
    if (segmentState === "encoding") return "Analysing photo…";
    if (segmentState === "decoding") return "Segmenting…";
    if (segmentState === "done") return "Cutout";
    if (segmentState === "error") return "Error";
    return "Click an object in the photo";
  })();

  // Text shown below the photo when photo is loaded and model is ready
  const photoHint: string | null = (() => {
    if (!photoUrl) return null;
    if (modelState === "loading") return "Loading model…";
    if (modelState === "error") return "Segmentation unavailable";
    if (segmentState === "encoding") return "Analysing photo…";
    return "Click an object to segment it";
  })();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="top-bar">
        <span className="top-bar__wordmark">
          Fold<span>.</span>
        </span>
        <span className="top-bar__status">Photo to crease pattern</span>
      </header>

      {/* Upload row */}
      <div className="upload-row">
        <span className="upload-hint">Mug, bottle, or box</span>
        {modelState === "loading" && (
          <span className="upload-hint model-loading-note">
            Loading model — about 40 MB, downloaded once
          </span>
        )}
      </div>

      {/* Two-panel split */}
      <div className="panel-split">
        {/* ── Photo panel ───────────────────────────────────────────────── */}
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">Photo</span>
            {photoUrl && (
              <span className="panel-header__badge">1 image</span>
            )}
          </div>

          {/* Hidden file input */}
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

          {/* Clickable / droppable canvas */}
          <div
            className={[
              "panel-canvas",
              "panel-canvas--upload",
              isDragging ? "panel-canvas--dragging" : "",
              photoUrl && modelState === "ready" ? "panel-canvas--crosshair" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            aria-label={
              photoUrl
                ? "Photo. Click an object to segment it."
                : "Photo upload area. Click or press Enter to choose an image, or drag one here."
            }
            onClick={handlePhotoClick}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {photoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={photoImgRef}
                  src={photoUrl}
                  alt="Uploaded photo"
                />
                {/* Click indicator dot */}
                {clickPos && (
                  <div
                    className="click-dot"
                    style={{
                      left: `${clickPos.x}%`,
                      top: `${clickPos.y}%`,
                    }}
                    aria-hidden="true"
                  />
                )}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state__cross" aria-hidden="true" />
                <span className="empty-state__text">
                  {typeError ? "That file is not an image" : "No photo loaded"}
                </span>
              </div>
            )}
            {typeError && photoUrl && (
              <div
                className="panel-canvas__error"
                role="alert"
                aria-live="polite"
              >
                That file is not an image
              </div>
            )}
            {photoHint && (
              <div className="panel-canvas__hint" aria-live="polite">
                {photoHint}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="panel-split__divider" aria-hidden="true" />

        {/* ── Mask panel ────────────────────────────────────────────────── */}
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">Mask</span>
            {maskPayload && segmentState === "done" && (
              <span className="panel-header__badge">cutout ready</span>
            )}
          </div>

          <div
            className={[
              "panel-canvas",
              modelState === "error" ? "panel-canvas--error-state" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Segmentation output"
          >
            {/* Loading-model overlay */}
            {modelState === "loading" && (
              <div className="segment-overlay">
                <div
                  className="segment-spinner"
                  role="status"
                  aria-label="Loading segmentation model"
                />
                <span className="segment-overlay__text">
                  Loading model
                </span>
                <span className="segment-overlay__sub">
                  About 40 MB — downloaded once
                </span>
              </div>
            )}

            {/* Model error overlay */}
            {modelState === "error" && (
              <div className="segment-overlay segment-overlay--error">
                <span
                  className="segment-overlay__text"
                  role="alert"
                  aria-live="assertive"
                >
                  Segmentation unavailable
                </span>
                {errorText && (
                  <span className="segment-overlay__sub">{errorText}</span>
                )}
              </div>
            )}

            {/* Segmenting spinner */}
            {(segmentState === "encoding" ||
              segmentState === "decoding") &&
              modelState === "ready" && (
                <div className="segment-overlay segment-overlay--active">
                  <div
                    className="segment-spinner"
                    role="status"
                    aria-label="Segmenting"
                  />
                  <span className="segment-overlay__text">
                    {segmentState === "encoding"
                      ? "Analysing photo…"
                      : "Segmenting…"}
                  </span>
                </div>
              )}

            {/* Cutout result */}
            {maskPayload &&
              modelState !== "error" &&
              segmentState !== "encoding" && (
                <div className="cutout-wrapper checkerboard">
                  <canvas
                    ref={maskCanvasRef}
                    className="cutout-canvas"
                    aria-label="Segmented object cutout"
                  />
                </div>
              )}

            {/* Empty / waiting state */}
            {modelState === "ready" &&
              segmentState === "idle" &&
              !maskPayload && (
                <div className="empty-state">
                  <div className="empty-state__cross" aria-hidden="true" />
                  <span className="empty-state__text">{maskPanelLabel}</span>
                </div>
              )}

            {/* Temporary diagnostic readout */}
            {photoUrl && (
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  font: "11px ui-monospace, monospace",
                  opacity: 0.65,
                  color: "#E8A33D",
                  pointerEvents: "none",
                }}
              >
                {modelState}/{segmentState}
                {maskPayload
                  ? ` · ${maskPayload.width}×${maskPayload.height} · ${maskPayload.opaque}px`
                  : ""}
              </div>
            )}

            {/* No-photo-yet + model ready */}
            {modelState !== "loading" &&
              modelState !== "error" &&
              !photoUrl &&
              segmentState === "idle" && (
                <div className="empty-state">
                  <div className="empty-state__cross" aria-hidden="true" />
                  <span className="empty-state__text">Pending</span>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
