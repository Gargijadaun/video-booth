import React, { useEffect, useRef } from 'react';

const MAX_LOOPS = 2;

// A kiosk HoloBox browser is expected to be launched with autoplay-with-sound
// allowed (e.g. --autoplay-policy=no-user-gesture-required). We still fall
// back to muted playback if the browser blocks unmuted autoplay, so the
// screen never gets stuck on a black/frozen video.
export default function Playing({ videoUrl, onFinished }) {
  const videoRef = useRef(null);
  const loopsRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }, [videoUrl]);

  function handleEnded() {
    loopsRef.current += 1;
    if (loopsRef.current >= MAX_LOOPS) {
      onFinished();
      return;
    }
    videoRef.current?.play().catch(() => {});
  }

  return <video ref={videoRef} className="holo-video" src={videoUrl} playsInline onEnded={handleEnded} />;
}
