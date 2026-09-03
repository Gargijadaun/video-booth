import React from 'react';

export default function Generating({ progress }) {
  return (
    <>
      <div className="holo-badge"><span className="live-dot" /> Generating</div>
      <h1 className="holo-title" style={{ fontSize: 52 }}>Creating Your AI Video</h1>
      <p className="holo-subtitle">Your cinematic experience is being created...</p>
      <div className="holo-ring" />
      <p className="holo-subtitle" style={{ marginTop: 32, fontSize: 24 }}>{progress.message}</p>
    </>
  );
}
