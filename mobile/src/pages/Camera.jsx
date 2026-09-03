import React, { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../config.js';

/**
 * Uses the browser's native FaceDetector API (Chrome/Android WebView) for
 * live framing feedback when it's available, and falls back to a plain
 * framing guide + brightness check on browsers that don't support it
 * (notably iOS Safari). Either way, the real face validation happens
 * server-side in faceProcessor.js - this is UX guidance only.
 */
export default function Camera({ sessionId, onBack, onUploaded }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);

  const [phase, setPhase] = useState('loading'); // loading | live | captured | uploading
  const [faceOk, setFaceOk] = useState(false);
  const [hint, setHint] = useState('Position your face inside the frame');
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1440 } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setPhase('live');

        if ('FaceDetector' in window) {
          try {
            detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          } catch {
            detectorRef.current = null;
          }
        }
        detectLoop();
      } catch (err) {
        setError('Camera permission is required to take your photo. Please allow camera access and try again.');
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkBrightness() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const avg = total / (data.length / 4);
    if (avg < 40) setHint('Lighting is too low - move to a brighter area');
    else if (avg > 235) setHint('Too bright - reduce direct light');
    else return true;
    return false;
  }

  async function detectLoop() {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const brightnessOk = checkBrightness();

    if (detectorRef.current) {
      try {
        const faces = await detectorRef.current.detect(videoRef.current);
        if (faces.length === 1 && brightnessOk) {
          setFaceOk(true);
          setHint('Great! Face detected - tap capture');
        } else {
          setFaceOk(false);
          if (brightnessOk) setHint(faces.length === 0 ? 'Position your face inside the frame' : 'Only one person at a time, please');
        }
      } catch {
        setFaceOk(brightnessOk);
      }
    } else if (brightnessOk) {
      setFaceOk(true);
      setHint('Position your face inside the frame, then tap capture');
    }

    rafRef.current = requestAnimationFrame(() => setTimeout(detectLoop, 250));
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const targetWidth = 1080;
    const targetHeight = 1440;
    const targetRatio = targetWidth / targetHeight;

    // Crop a region matching the target's 3:4 aspect ratio (not a square) so
    // drawImage scales it uniformly into the canvas instead of stretching it -
    // a square source into a 3:4 destination was distorting the face
    // vertically in every captured photo.
    const videoRatio = video.videoWidth / video.videoHeight;
    let sx, sy, sw, sh;
    if (videoRatio > targetRatio) {
      sh = video.videoHeight;
      sw = sh * targetRatio;
      sx = (video.videoWidth - sw) / 2;
      sy = 0;
    } else {
      sw = video.videoWidth;
      sh = sw / targetRatio;
      sx = 0;
      sy = (video.videoHeight - sh) / 2;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    // Mirror horizontally so the captured photo matches what the user saw (front camera).
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.92));
    setPhase('captured');
  }

  function retake() {
    setCapturedDataUrl(null);
    setPhase('live');
  }

  async function confirm() {
    setPhase('uploading');
    setError(null);
    try {
      const blob = await (await fetch(capturedDataUrl)).blob();
      const form = new FormData();
      form.append('selfie', blob, 'selfie.jpg');
      const res = await fetch(apiUrl(`/api/session/${sessionId}/selfie`), { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Please take another photo with your face clearly visible.');
        setPhase('captured');
        return;
      }
      onUploaded();
    } catch (err) {
      setError('Upload failed. Please check your connection and try again.');
      setPhase('captured');
    }
  }

  return (
    <div>
      <div className="top-bar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">←</button>
        <span className="brand">Take Your Photo</span>
        <span style={{ width: 44 }} />
      </div>

      <div className="grow-center" style={{ flex: 'none', marginBottom: 6 }}>
        <p className="subtitle">Position your face inside the frame.</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="camera-wrap">
        {phase !== 'captured' && phase !== 'uploading' && (
          <video ref={videoRef} playsInline muted autoPlay style={{ transform: 'scaleX(-1)' }} />
        )}
        {(phase === 'captured' || phase === 'uploading') && capturedDataUrl && (
          <img className="captured" src={capturedDataUrl} alt="Captured selfie" />
        )}
        {phase !== 'captured' && phase !== 'uploading' && (
          <div className="face-guide">
            <div className={`face-oval ${faceOk ? 'ok' : ''}`} />
            <div className="face-hint">{hint}</div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ height: 20 }} />

      {phase === 'live' && (
        <button className="btn btn-primary" disabled={!faceOk} onClick={capture}>
          CAPTURE PHOTO
        </button>
      )}

      {phase === 'captured' && (
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={retake}>RETAKE</button>
          <button className="btn btn-primary" onClick={confirm}>USE THIS PHOTO</button>
        </div>
      )}

      {phase === 'uploading' && (
        <button className="btn btn-primary" disabled>
          Uploading...
        </button>
      )}

      {phase === 'loading' && !error && (
        <div className="grow-center">
          <div className="progress-ring" />
        </div>
      )}
    </div>
  );
}
