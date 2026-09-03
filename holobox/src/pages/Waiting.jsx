import React from 'react';

export default function Waiting({ error }) {
  return (
    <>
      <div className="holo-badge"><span className="live-dot" /> Phone Connected</div>
      <h1 className="holo-title" style={{ fontSize: 52 }}>Get Ready</h1>
      <p className="holo-subtitle">Follow the steps on your phone to choose a template and take your photo.</p>
      {error && (
        <p className="holo-subtitle" style={{ color: '#fca5a5', fontWeight: 700 }}>{error}</p>
      )}
      <div className="holo-dots">
        <span /><span /><span />
      </div>
    </>
  );
}
