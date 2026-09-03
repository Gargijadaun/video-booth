import React from 'react';

export default function Ready({ videoUrl, shareQr, onCreateAnother }) {
  return (
    <>
      {videoUrl && <video className="holo-video" src={videoUrl} autoPlay loop muted playsInline />}
      <div className="holo-ready-panel">
        <h1 className="holo-title" style={{ fontSize: 48 }}>Your Video Is Ready!</h1>

        {shareQr ? (
          <div className="holo-qr-wrap" style={{ padding: 20 }}>
            <img src={shareQr} alt="Scan to get your video" style={{ width: 260, height: 260 }} />
          </div>
        ) : (
          <div className="holo-ring" style={{ width: 140, height: 140 }} />
        )}

        <p className="holo-scan-hint">SCAN TO GET YOUR VIDEO</p>
        <p className="holo-subtitle" style={{ fontSize: 20, marginTop: 4 }}>Your video will open on your phone</p>

        <button
          onClick={onCreateAnother}
          style={{
            marginTop: 28,
            padding: '18px 40px',
            borderRadius: 20,
            border: 'none',
            fontSize: 22,
            fontWeight: 800,
            color: '#fff',
            background: 'linear-gradient(135deg,#7c3aed,#06b6d4)',
            cursor: 'pointer'
          }}
        >
          CREATE ANOTHER VIDEO
        </button>
      </div>
    </>
  );
}
