import React, { useEffect, useState } from 'react';
import { apiUrl } from '../config.js';

export default function Share({ sessionId, onDone }) {
  const [qr, setQr] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [error, setError] = useState(null);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);

  useEffect(() => {
    setNativeShareAvailable(typeof navigator.share === 'function');
    fetch(apiUrl(`/api/session/${sessionId}/share`), { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setQr(d.qrDataUrl);
        setShareUrl(d.shareUrl);
      })
      .catch((e) => setError(e.message || 'Could not create a share link.'));
  }, [sessionId]);

  async function nativeShare() {
    try {
      await navigator.share({ title: 'My AI Video Booth video', url: shareUrl });
    } catch {
      // user cancelled - ignore
    }
  }

  return (
    <div className="grow-center">
      <button className="icon-btn" style={{ position: 'absolute', top: 20, left: 20 }} onClick={onDone} aria-label="Back">←</button>
      <h1 className="title" style={{ fontSize: 24 }}>Scan to Get Your Video</h1>
      <p className="subtitle">Scan this QR code with another phone - your video will open there.</p>

      {error && <div className="error-banner">{error}</div>}

      {qr && (
        <div className="qr-card pulse">
          <img src={qr} alt="Share QR code" />
        </div>
      )}

      {!qr && !error && <div className="progress-ring" />}

      {nativeShareAvailable && shareUrl && (
        <button className="btn btn-primary" style={{ maxWidth: 280, marginTop: 12 }} onClick={nativeShare}>
          SHARE LINK
        </button>
      )}
    </div>
  );
}
