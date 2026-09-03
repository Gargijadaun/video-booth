const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const config = require('./config');
const { SessionStore } = require('./services/sessionStore');
const { setupWebSocket } = require('./services/websocket');
const { startCleanupSweeper } = require('./utils/cleanup');
const { VIDEOS_DIR, THUMBS_DIR } = require('./services/storage');
const { sessionLimiter, uploadLimiter, generationLimiter } = require('./middleware/rateLimit');

const app = express();
const httpServer = http.createServer(app);

// Render (and most PaaS hosts) sit one reverse proxy in front of this app and
// set X-Forwarded-For accordingly. Trusting exactly that one hop lets
// express-rate-limit (and req.ip generally) see the real client IP instead
// of the proxy's, without blindly trusting an arbitrary forwarded chain a
// client could spoof.
app.set('trust proxy', 1);

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

const sessionStore = new SessionStore();
setupWebSocket(httpServer, sessionStore);
startCleanupSweeper(sessionStore);

// Generated media - short-lived, cleaned up by utils/cleanup.js.
app.use('/media/videos', express.static(VIDEOS_DIR, { maxAge: '1h' }));
app.use('/media/thumbnails', express.static(THUMBS_DIR, { maxAge: '1h' }));

// Static template thumbnails/preview assets referenced by templates.json.
app.use('/templates', express.static(path.join(__dirname, 'templates', 'assets')));

app.use('/api', sessionLimiter, require('./routes/session')(sessionStore));
app.use('/api', uploadLimiter, require('./routes/upload')(sessionStore));
app.use('/api', generationLimiter, require('./routes/generation')(sessionStore));
app.use('/', require('./routes/video')(sessionStore));

// Optional same-origin fallback: if the frontends were built and copied next to
// this server (npm run build in /mobile and /holobox), serve them here too. In
// the normal split deployment (frontends on Vercel, this backend on Render/etc.)
// these directories won't exist and are silently skipped.
const mobileDist = path.join(__dirname, '..', 'mobile', 'dist');
const holoboxDist = path.join(__dirname, '..', 'holobox', 'dist');

if (fs.existsSync(mobileDist)) {
  app.use('/booth/session', express.static(mobileDist));
  app.get('/booth/session/:id', (req, res) => {
    res.sendFile(path.join(mobileDist, 'index.html'));
  });
}

if (fs.existsSync(holoboxDist)) {
  app.use('/holobox', express.static(holoboxDist));
  app.get('/holobox', (req, res) => {
    res.sendFile(path.join(holoboxDist, 'index.html'));
  });
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

httpServer.listen(config.port, () => {
  console.log(`HoloBox Video Booth backend listening on port ${config.port}`);
  console.log(`Video provider: ${config.videoProvider}`);
  console.log(`Public base URL: ${config.publicBaseUrl}`);
});
