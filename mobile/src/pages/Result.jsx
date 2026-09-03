import React from 'react';

export default function Result({ session, onShare, onBackToTemplates }) {
  if (!session?.videoUrl) {
    return (
      <div className="grow-center">
        <div className="progress-ring" />
      </div>
    );
  }

  return (
    <div className="grow-center">
      <h1 className="title" style={{ fontSize: 24 }}>Your Video Is Ready!</h1>
      <video className="result-video" src={session.videoUrl} poster={session.thumbnailUrl} controls playsInline autoPlay loop />
      <div style={{ height: 8 }} />
      <div className="btn-row" style={{ maxWidth: 340 }}>
        <a className="btn btn-secondary" href={session.videoUrl} download style={{ textDecoration: 'none' }}>
          DOWNLOAD
        </a>
        <button className="btn btn-primary" onClick={onShare}>SHARE</button>
      </div>
      <div style={{ height: 4 }} />
      <button className="btn btn-ghost" style={{ maxWidth: 340 }} onClick={onBackToTemplates}>
        BACK TO TEMPLATES
      </button>
    </div>
  );
}
