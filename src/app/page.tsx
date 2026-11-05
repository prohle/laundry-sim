"use client";

import { useCallback, useState } from "react";

export default function Home() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }

      setPhotoUrl(URL.createObjectURL(file));
    },
    [photoUrl],
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

      {/* Upload row */}
      <div className="upload-row">
        <label className="upload-label" htmlFor="photo-input">
          <input
            className="upload-input"
            id="photo-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          Load photo
        </label>
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
          <div className="panel-canvas">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Uploaded photo" />
            ) : (
              <div className="empty-state">
                <div className="empty-state__cross" aria-hidden="true" />
                <span className="empty-state__text">No photo loaded</span>
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
