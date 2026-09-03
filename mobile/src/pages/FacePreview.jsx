import React, { useEffect, useState } from 'react';
import { apiUrl } from '../config.js';

export default function FacePreview({ sessionId, onRetake, onConfirm }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [previewImage, setPreviewImage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    fetch(apiUrl(`/api/session/${sessionId}/preview-faceswap`), { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setPreviewImage(data.previewImage);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Could not create a preview.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div>
      <div className="grow-center" style={{ flex: 'none', marginBottom: 6 }}>
        <h1 className="title" style={{ fontSize: 22 }}>Check Your Look</h1>
        <p className="subtitle">This is how your face will appear in the video - not the video itself.</p>
      </div>

      {status === 'loading' && (
        <div className="grow-center">
          <div className="progress-ring" />
          <p className="subtitle pulse">Swapping your face onto the costume...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="grow-center">
          <div className="error-banner">{error}</div>
          <div className="btn-row" style={{ maxWidth: 340 }}>
            <button className="btn btn-secondary" onClick={onRetake}>RETAKE PHOTO</button>
            <button className="btn btn-primary" onClick={onConfirm}>GENERATE ANYWAY</button>
          </div>
        </div>
      )}

      {status === 'ready' && previewImage && (
        <div className="grow-center">
          <img
            src={previewImage}
            alt="Face swap preview"
            style={{ width: '100%', maxWidth: 320, borderRadius: 26, boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7)' }}
          />
          <div style={{ height: 8 }} />
          <div className="btn-row" style={{ maxWidth: 340 }}>
            <button className="btn btn-secondary" onClick={onRetake}>RETAKE PHOTO</button>
            <button className="btn btn-primary" onClick={onConfirm}>LOOKS GOOD, GENERATE</button>
          </div>
        </div>
      )}
    </div>
  );
}
