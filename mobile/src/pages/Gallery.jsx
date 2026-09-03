import React from 'react';
import { loadGallery } from '../App.jsx';

export default function Gallery({ onBack }) {
  const items = loadGallery();

  return (
    <div>
      <div className="top-bar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">←</button>
        <span className="brand">Your Videos</span>
        <span style={{ width: 44 }} />
      </div>

      {items.length === 0 && (
        <div className="grow-center">
          <p className="subtitle">No videos yet. Create your first AI video to see it here.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="gallery-grid">
          {items.map((item) => (
            <div className="gallery-item" key={item.videoId}>
              <video src={item.videoUrl} poster={item.thumbnailUrl} muted playsInline preload="metadata" controls />
              <div className="label">{item.templateName}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
