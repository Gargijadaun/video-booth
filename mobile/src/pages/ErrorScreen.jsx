import React from 'react';

export default function ErrorScreen({ message, onRetry, onBackToTemplates }) {
  return (
    <div className="grow-center">
      <div className="badge" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>⚠ Generation Failed</div>
      <h1 className="title" style={{ fontSize: 22 }}>Something went wrong</h1>
      <p className="subtitle">{message || 'Something went wrong while creating your video.'}</p>
      <div style={{ height: 12 }} />
      <div className="btn-row" style={{ maxWidth: 340 }}>
        <button className="btn btn-secondary" onClick={onBackToTemplates}>BACK TO TEMPLATES</button>
        <button className="btn btn-primary" onClick={onRetry}>TRY AGAIN</button>
      </div>
    </div>
  );
}
