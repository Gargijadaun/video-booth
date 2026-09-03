import React from 'react';

export default function QrWelcome({ qrDataUrl }) {
  return (
    <>
      <div className="holo-brand">HOLO<span>BOX</span></div>
      <h1 className="holo-title">AI Video Booth</h1>
      <p className="holo-subtitle">Create Your AI Video</p>

      {qrDataUrl ? (
        <div className="holo-qr-wrap">
          <img src={qrDataUrl} alt="Scan to start" />
        </div>
      ) : (
        <div className="holo-ring" />
      )}

      <p className="holo-scan-hint">Scan this QR code with your phone to start</p>
      <div className="holo-dots">
        <span /><span /><span />
      </div>
    </>
  );
}
