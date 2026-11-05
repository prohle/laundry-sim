"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Stage = "empty" | "cutting" | "done" | "error";

export default function Home() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("empty");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoUrlRef = useRef<string | null>(null);
  const cutoutUrlRef = useRef<string | null>(null);

  useEffect(() => {
    photoUrlRef.current = photoUrl;
  }, [photoUrl]);
  useEffect(() => {
    cutoutUrlRef.current = cutoutUrl;
  }, [cutoutUrl]);

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
            <span className="panel-header__label">Mask</span>
            {stage === "done" && (
              <span className="panel-header__badge">cutout ready</span>
            )}
          </div>

          <div className="panel-canvas" aria-label="Segmentation output">
            {cutoutUrl ? (
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
