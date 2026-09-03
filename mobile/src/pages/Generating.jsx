import React from 'react';

export default function Generating({ progress }) {
  return (
    <div className="grow-center">
      <h1 className="title" style={{ fontSize: 24 }}>Creating Your Video...</h1>
      <div style={{ height: 8 }} />
      <div className="progress-ring" />
      <div style={{ height: 8 }} />
      <p className="subtitle pulse">{progress.message}</p>
      <div className="badge">This usually takes a minute or two</div>
    </div>
  );
}
