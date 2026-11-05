"use client";

import { useCallback, useState } from "react";

export default function Home() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Revoke the previous object URL to avoid memory leaks
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }

      setPhotoUrl(URL.createObjectURL(file));
    },
    [photoUrl],
  );

  return (
    <main>
      <h1>Fold</h1>

      <div className="upload-area">
        <label htmlFor="photo-input">Photograph an object (mug, bottle, box)</label>
        <input
          id="photo-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
        />
      </div>

      <div className="panels">
        <div className="panel">
          <span className="panel-label">photo</span>
          <div className={`panel-box${photoUrl ? "" : " empty"}`}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Uploaded photo" />
            ) : (
              "No photo yet"
            )}
          </div>
        </div>

        <div className="panel">
          <span className="panel-label">mask</span>
          <div className="panel-box empty">
            {/* mask will appear here in task 1.3 */}
          </div>
        </div>
      </div>
    </main>
  );
}
