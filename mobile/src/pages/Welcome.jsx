import React from 'react';

export default function Welcome({ connected, onStart }) {
  return (
    <div className="grow-center">
      <div className="badge pulse">{connected ? '● Connected to HoloBox' : '○ Connecting...'}</div>
      <h1 className="title" style={{ marginTop: 18 }}>Welcome to AI Video Booth</h1>
      <p className="subtitle">Create a personalized cinematic video using your own face.</p>
      <div style={{ height: 24 }} />
      <button className="btn btn-primary" style={{ maxWidth: 280 }} disabled={!connected} onClick={onStart}>
        START
      </button>
    </div>
  );
}
