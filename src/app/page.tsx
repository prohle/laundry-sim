"use client";

import { useCallback, useRef, useState } from "react";

export default function Home() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typeError, setTypeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setTypeError(true);
        return;
      }
      setTypeError(false);
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
      setPhotoUrl(URL.createObjectURL(file));
    },
    [photoUrl],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      // reset so the same file can be re-selected
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
      // only clear when leaving the panel itself, not a child
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

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="top-bar">
        <span className="top-bar__wordmark">
          Fold<span>.</span>
        </span>
        <span className="top-bar__status">Photo to crease pattern</span>
      </header>

      {/* Upload row — hint text only; upload action lives on the panel */}
      <div className="upload-row">
        <span className="upload-hint">Mug, bottle, or box</span>
      </div>

      {/* Two-panel split */}
      <div className="panel-split">
        {/* Photo panel */}
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
            className={`panel-canvas panel-canvas--upload${isDragging ? " panel-canvas--dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Photo upload area. Click or press Enter to choose an image, or drag one here."
            onClick={openPicker}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Uploaded photo" />
            ) : (
              <div className="empty-state">
                <div className="empty-state__cross" aria-hidden="true" />
                <span className="empty-state__text">
                  {typeError ? "That file is not an image" : "No photo loaded"}
                </span>
              </div>
            )}
            {/* Error shown over an existing image when a non-image is dropped */}
            {typeError && photoUrl && (
              <div className="panel-canvas__error" role="alert" aria-live="polite">
                That file is not an image
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="panel-split__divider" aria-hidden="true" />

        {/* Mask panel */}
        <div className="panel-col">
          <div className="panel-header">
            <span className="panel-header__label">Mask</span>
          </div>
          <div className="panel-canvas">
            {/* mask will appear here in task 1.3 */}
            <div className="empty-state">
              <div className="empty-state__cross" aria-hidden="true" />
              <span className="empty-state__text">Pending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
