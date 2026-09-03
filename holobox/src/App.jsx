import React, { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket.js';
import { apiUrl } from './config.js';
import QrWelcome from './pages/QrWelcome.jsx';
import Waiting from './pages/Waiting.jsx';
import Generating from './pages/Generating.jsx';
import Playing from './pages/Playing.jsx';
import Ready from './pages/Ready.jsx';

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [screen, setScreen] = useState('qr'); // qr | waiting | generating | playing | ready
  const [progress, setProgress] = useState({ value: 5, message: 'Preparing your character...' });
  const [videoUrl, setVideoUrl] = useState(null);
  const [shareQr, setShareQr] = useState(null);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  async function createSession() {
    const res = await fetch(apiUrl('/api/session'), { method: 'POST' });
    const data = await res.json();
    setSessionId(data.session.sessionId);
    setQrDataUrl(data.qrDataUrl);
    setScreen('qr');
    socketRef.current.emit('holobox:join', { sessionId: data.session.sessionId });
  }

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!sessionId) createSession();
      else socket.emit('holobox:join', { sessionId });
    });

    socket.on('PHONE_CONNECTED', () => setScreen((s) => (s === 'qr' ? 'waiting' : s)));

    socket.on('TEMPLATE_SELECTED', () => setScreen('waiting'));

    socket.on('GENERATION_STARTED', () => {
      setError(null);
      setProgress({ value: 5, message: 'Preparing your character...' });
      setScreen('generating');
    });

    socket.on('GENERATION_PROGRESS', (payload) => {
      setProgress({ value: payload.progress ?? 50, message: payload.message || 'Creating your scene...' });
    });

    socket.on('GENERATION_COMPLETE', (payload) => {
      setVideoUrl(payload.videoUrl);
    });

    socket.on('PLAY_VIDEO', (payload) => {
      setVideoUrl(payload.videoUrl);
      setScreen('playing');
      if (sessionId) {
        fetch(apiUrl(`/api/session/${sessionId}/share`), { method: 'POST' })
          .then((r) => r.json())
          .then((d) => setShareQr(d.qrDataUrl))
          .catch(() => {});
      }
    });

    socket.on('GENERATION_FAILED', (payload) => {
      setError(payload?.error || 'Something went wrong while creating the video.');
      setScreen('waiting');
    });

    socket.on('RESET', () => {
      setVideoUrl(null);
      setShareQr(null);
      setScreen('waiting');
    });

    socket.on('PHONE_DISCONNECTED', () => {
      // Phone dropped mid-session; wait quietly for it to reconnect rather than resetting.
    });

    socket.on('ERROR', () => {
      // Session vanished server-side (expired) - mint a brand new one.
      createSession();
    });

    if (socket.connected && !sessionId) createSession();

    return () => {
      socket.off('connect');
      socket.off('PHONE_CONNECTED');
      socket.off('TEMPLATE_SELECTED');
      socket.off('GENERATION_STARTED');
      socket.off('GENERATION_PROGRESS');
      socket.off('GENERATION_COMPLETE');
      socket.off('PLAY_VIDEO');
      socket.off('GENERATION_FAILED');
      socket.off('RESET');
      socket.off('PHONE_DISCONNECTED');
      socket.off('ERROR');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function handlePlaybackFinished() {
    setScreen('ready');
  }

  function handleCreateAnother() {
    socketRef.current.emit('reset_session', { sessionId });
  }

  return (
    <div className="stage">
      <div className="bg-glow" />
      {screen === 'qr' && <QrWelcome qrDataUrl={qrDataUrl} />}
      {screen === 'waiting' && <Waiting error={error} />}
      {screen === 'generating' && <Generating progress={progress} />}
      {screen === 'playing' && <Playing videoUrl={videoUrl} onFinished={handlePlaybackFinished} />}
      {screen === 'ready' && <Ready videoUrl={videoUrl} shareQr={shareQr} onCreateAnother={handleCreateAnother} />}
    </div>
  );
}
