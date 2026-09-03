const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');

module.exports = function createVideoRouter(sessionStore) {
  const router = express.Router();

  // Called by the phone's SHARE button: mints (or re-mints) the public share QR for a video.
  router.post('/api/session/:id/share', async (req, res) => {
    const session = sessionStore.get(req.params.id);
    if (!session || !session.videoId) {
      return res.status(404).json({ error: 'No video available to share yet.' });
    }
    const shareUrl = `${config.publicBaseUrl}/video/${session.videoId}`;
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 600 });
    res.json({ shareUrl, qrDataUrl });
  });

  router.get('/api/video/:id/info', (req, res) => {
    const video = sessionStore.getVideo(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'This video has expired or does not exist.' });
    }
    res.json({
      videoId: video.videoId,
      videoUrl: `${config.publicBaseUrl}/media/videos/${video.videoId}.mp4`,
      thumbnailUrl: `${config.publicBaseUrl}/media/thumbnails/${video.videoId}.jpg`,
      templateName: video.templateName,
      expiresAt: video.expiresAt
    });
  });

  // Simple standalone shareable page - what opens when a second phone scans the SHARE QR.
  router.get('/video/:id', (req, res) => {
    const video = sessionStore.getVideo(req.params.id);
    if (!video) {
      return res.status(404).send(renderVideoPage({ notFound: true }));
    }
    res.send(
      renderVideoPage({
        videoUrl: `/media/videos/${video.videoId}.mp4`,
        thumbnailUrl: `/media/thumbnails/${video.videoId}.jpg`,
        templateName: video.templateName
      })
    );
  });

  return router;
};

function renderVideoPage({ notFound, videoUrl, thumbnailUrl, templateName }) {
  if (notFound) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Video Expired - HoloBox Video Booth</title>
    <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a12;color:#f2f2f7;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px}</style>
    </head><body><div><h1>This video has expired</h1><p style="color:#9a9aab">Generated videos are only available for a limited time. Please create a new one at the HoloBox.</p></div></body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(templateName || 'Your Video')} - HoloBox Video Booth</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#1a1a2e,#05050a 70%);color:#f2f2f7;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;padding:24px 16px 48px}
    h1{font-size:20px;font-weight:600;margin:16px 0 4px;text-align:center}
    p.sub{color:#9a9aab;margin:0 0 20px;text-align:center}
    video{width:100%;max-width:380px;aspect-ratio:9/16;border-radius:20px;background:#000;box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .actions{display:flex;gap:12px;margin-top:20px;width:100%;max-width:380px}
    a.btn{flex:1;text-align:center;padding:14px 18px;border-radius:14px;text-decoration:none;font-weight:600;font-size:15px}
    .primary{background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff}
    .secondary{background:rgba(255,255,255,.08);color:#f2f2f7;border:1px solid rgba(255,255,255,.15)}
  </style>
  </head><body>
    <h1>${escapeHtml(templateName || 'Your AI Video')}</h1>
    <p class="sub">Created at the HoloBox Video Booth</p>
    <video src="${videoUrl}" poster="${thumbnailUrl}" controls playsinline autoplay loop></video>
    <div class="actions">
      <a class="btn primary" href="${videoUrl}" download>Download</a>
      <a class="btn secondary" href="#" onclick="shareVideo(event)">Share</a>
    </div>
    <script>
      async function shareVideo(e){
        e.preventDefault();
        if (navigator.share) {
          try { await navigator.share({ title: document.title, url: window.location.href }); return; } catch (err) {}
        }
        try { await navigator.clipboard.writeText(window.location.href); alert('Link copied!'); } catch (err) { alert(window.location.href); }
      }
    </script>
  </body></html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
