const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');
const { publicSession } = require('../services/websocket');

module.exports = function createSessionRouter(sessionStore) {
  const router = express.Router();

  // Called by the HoloBox app on boot: creates a new booth session and returns
  // the QR code (as a data URL) pointing the phone at the mobile controller app.
  // MOBILE_APP_URL points at a separately-deployed mobile app (e.g. Vercel);
  // without it, falls back to the backend serving /booth/session itself.
  router.post('/session', async (req, res) => {
    const session = sessionStore.createSession();
    const joinUrl = config.mobileAppUrl
      ? `${config.mobileAppUrl}/${session.sessionId}`
      : `${config.publicBaseUrl}/booth/session/${session.sessionId}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 600 });
    res.json({ session: publicSession(session), joinUrl, qrDataUrl });
  });

  router.get('/session/:id', (req, res) => {
    const session = sessionStore.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired.' });
    }
    res.json({ session: publicSession(session) });
  });

  router.get('/templates', (req, res) => {
    const templates = require('../templates/templates.json').filter((t) => t.active);
    // Strip prompt/negativePrompt/actionVariants from the public listing - no reason to ship them to the client.
    // Thumbnail paths in templates.json are relative (served by this backend's own
    // /templates static route) - resolve them to absolute URLs here so a frontend
    // deployed on a different origin (e.g. Vercel) can actually load the images.
    const safe = templates.map(({ prompt, negativePrompt, actionVariants, thumbnail, ...rest }) => ({
      ...rest,
      thumbnail: /^https?:\/\//.test(thumbnail) ? thumbnail : `${config.publicBaseUrl}${thumbnail}`
    }));
    res.json({ templates: safe });
  });

  return router;
};
