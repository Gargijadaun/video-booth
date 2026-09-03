import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getSocket } from './socket.js';
import { apiUrl } from './config.js';
import Welcome from './pages/Welcome.jsx';
import Templates from './pages/Templates.jsx';
import Camera from './pages/Camera.jsx';
import FacePreview from './pages/FacePreview.jsx';
import Generating from './pages/Generating.jsx';
import Result from './pages/Result.jsx';
import Share from './pages/Share.jsx';
import Gallery from './pages/Gallery.jsx';
import ErrorScreen from './pages/ErrorScreen.jsx';

const GALLERY_KEY = 'holobox_video_gallery';

export function loadGallery() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToGallery(entry) {
  const list = loadGallery();
  list.unshift(entry);
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // storage full/unavailable - non-critical
  }
}

export default function App() {
  const { sessionId } = useParams();
  const [screen, setScreen] = useState('welcome');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [progress, setProgress] = useState({ value: 5, message: 'Preparing your character...' });
  const [session, setSession] = useState(null);
  const [genError, setGenError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function join() {
      socket.emit('phone:join', { sessionId });
    }

    socket.on('connect', () => {
      setConnected(true);
      setConnectionError(null);
      join();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnectionError('Connection to HoloBox lost. Reconnecting...'));

    socket.on('ERROR', (payload) => setConnectionError(payload?.message || 'Connection error.'));
    socket.on('SESSION_STATE', (s) => setSession(s));

    socket.on('GENERATION_PROGRESS', (payload) => {
      setProgress({ value: payload.progress ?? 50, message: payload.message || 'Creating your video...' });
    });
    socket.on('GENERATION_COMPLETE', (payload) => {
      addToGallery({
        videoId: payload.videoId,
        videoUrl: payload.videoUrl,
        thumbnailUrl: payload.thumbnailUrl,
        templateName: payload.templateName,
        createdAt: Date.now()
      });
      setScreen('result');
    });
    socket.on('GENERATION_FAILED', (payload) => {
      setGenError(payload?.error || 'Something went wrong while creating your video.');
      setScreen('error');
    });
    socket.on('RESET', () => {
      setSelectedTemplateId(null);
      setScreen('templates');
    });

    if (socket.connected) join();

    fetch(apiUrl('/api/templates'))
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {});

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('ERROR');
      socket.off('SESSION_STATE');
      socket.off('GENERATION_PROGRESS');
      socket.off('GENERATION_COMPLETE');
      socket.off('GENERATION_FAILED');
      socket.off('RESET');
    };
  }, [sessionId]);

  const goToGallery = useCallback(() => setScreen((prev) => (prev === 'gallery' ? 'templates' : 'gallery')), []);

  const showGalleryButton = ['templates', 'camera', 'result'].includes(screen);

  return (
    <div className="screen">
      {connectionError && screen !== 'welcome' && <div className="error-banner">{connectionError}</div>}

      {showGalleryButton && (
        <div className="top-bar">
          <span className="brand">AI Video Booth</span>
          <button className="icon-btn" onClick={goToGallery} aria-label="Gallery">🎞️</button>
        </div>
      )}

      {screen === 'gallery' && <Gallery onBack={() => setScreen('templates')} />}

      {screen === 'welcome' && (
        <Welcome connected={connected} onStart={() => setScreen('templates')} />
      )}

      {screen === 'templates' && (
        <Templates
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          onContinue={() => {
            socketRef.current.emit('select_template', { sessionId, templateId: selectedTemplateId });
            setScreen('camera');
          }}
        />
      )}

      {screen === 'camera' && (
        <Camera
          sessionId={sessionId}
          onBack={() => setScreen('templates')}
          onUploaded={() => setScreen('facePreview')}
        />
      )}

      {screen === 'facePreview' && (
        <FacePreview
          sessionId={sessionId}
          onRetake={() => setScreen('camera')}
          onConfirm={() => {
            setProgress({ value: 5, message: 'Preparing your character...' });
            setScreen('generating');
            fetch(apiUrl(`/api/session/${sessionId}/generate`), { method: 'POST' }).catch(() => {
              setGenError('Could not start video generation. Please try again.');
              setScreen('error');
            });
          }}
        />
      )}

      {screen === 'generating' && <Generating progress={progress} />}

      {screen === 'result' && (
        <Result
          sessionId={sessionId}
          session={session}
          onShare={() => setScreen('share')}
          onBackToTemplates={() => {
            socketRef.current.emit('reset_session', { sessionId });
            setSelectedTemplateId(null);
            setScreen('templates');
          }}
        />
      )}

      {screen === 'share' && <Share sessionId={sessionId} onDone={() => setScreen('result')} />}

      {screen === 'error' && (
        <ErrorScreen
          message={genError}
          onRetry={() => {
            setGenError(null);
            setScreen('camera');
          }}
          onBackToTemplates={() => {
            socketRef.current.emit('reset_session', { sessionId });
            setSelectedTemplateId(null);
            setGenError(null);
            setScreen('templates');
          }}
        />
      )}
    </div>
  );
}
