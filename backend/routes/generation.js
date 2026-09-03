const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { nanoid } = require('nanoid');
const config = require('../config');
const templates = require('../templates/templates.json');
const { getProvider } = require('../services/videoGenerator');
const { normalizeToDeliveryFormat } = require('../services/videoGenerator/upscale');
const { swapFaceOntoTemplate } = require('../services/videoGenerator/faceSwap');
const { VIDEOS_DIR, THUMBS_DIR, safeUnlink } = require('../services/storage');
const { broadcast, publicSession } = require('../services/websocket');

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 8 * 60 * 1000;

module.exports = function createGenerationRouter(sessionStore) {
  const router = express.Router();

  router.post('/session/:id/generate', async (req, res) => {
    const sessionId = req.params.id;
    const session = sessionStore.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired.' });
    }
    if (!session.templateId) {
      return res.status(400).json({ error: 'No template selected yet.' });
    }
    if (!hasUsableSelfies(session)) {
      return res.status(400).json({ error: 'No photo uploaded yet. Please take a photo first.' });
    }

    const template = templates.find((t) => t.id === session.templateId && t.active);
    if (!template) {
      return res.status(400).json({ error: 'Selected template is no longer available.' });
    }

    const jobId = nanoid(12);
    sessionStore.update(sessionId, { status: 'GENERATING', jobId, error: null });
    broadcast(sessionId, 'GENERATION_STARTED', { jobId });
    broadcast(sessionId, 'SESSION_STATE', publicSession(sessionStore.get(sessionId)));

    res.json({ jobId, status: 'queued' });

    runGenerationJob(sessionStore, sessionId, jobId, template).catch((err) => {
      console.error(`[generation] job ${jobId} crashed:`, err);
      const current = sessionStore.get(sessionId);
      if (current && current.jobId === jobId) {
        sessionStore.update(sessionId, { status: 'FAILED', error: 'Something went wrong while creating your video.' });
        broadcast(sessionId, 'GENERATION_FAILED', { error: 'Something went wrong while creating your video.' });
        broadcast(sessionId, 'SESSION_STATE', publicSession(sessionStore.get(sessionId)));
      }
    });
  });

  // Polling fallback for clients that miss the WebSocket event (section 26 / 19).
  router.get('/session/:id/generate/:jobId', (req, res) => {
    const session = sessionStore.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired.' });
    }
    if (session.jobId !== req.params.jobId) {
      return res.status(404).json({ error: 'Unknown job for this session.' });
    }
    res.json({ session: publicSession(session) });
  });

  // Diagnostic/preview only: runs JUST the face-swap step (cheap) and returns
  // the resulting image directly - lets identity-preservation quality be
  // checked and iterated on without paying for a full video generation
  // (which costs far more) on every attempt.
  router.post('/session/:id/preview-faceswap', async (req, res) => {
    const session = sessionStore.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired.' });
    }
    if (!session.templateId) {
      return res.status(400).json({ error: 'No template selected yet.' });
    }
    if (!hasUsableSelfies(session)) {
      return res.status(400).json({ error: 'No photo uploaded yet. Please take a photo first.' });
    }
    if (!config.gemini.apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not set - face swap is not configured.' });
    }

    const template = templates.find((t) => t.id === session.templateId && t.active);
    if (!template || !template.thumbnail) {
      return res.status(400).json({ error: 'Selected template is no longer available.' });
    }

    try {
      const selfieBuffers = session.selfiePaths.map((p) => fs.readFileSync(p));
      const templateImagePath = path.join(__dirname, '..', 'templates', 'assets', path.basename(template.thumbnail));
      const templateImageBuffer = fs.readFileSync(templateImagePath);
      const swapped = await swapFaceOntoTemplate({
        selfieBuffers,
        selfieMimeType: 'image/jpeg',
        templateImageBuffer,
        templateImageMimeType: 'image/jpeg'
      });
      const dataUrl = `data:${swapped.imageMimeType};base64,${swapped.imageBuffer.toString('base64')}`;
      res.json({ previewImage: dataUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

function hasUsableSelfies(session) {
  return Boolean(session.selfiePaths?.length) && session.selfiePaths.every((p) => fs.existsSync(p));
}

async function runGenerationJob(sessionStore, sessionId, jobId, template) {
  const provider = getProvider();
  const session = sessionStore.get(sessionId);
  if (!session) return;

  const selfieBuffers = session.selfiePaths.map((p) => fs.readFileSync(p));

  // Fire progress feedback immediately - the face swap step below can take a
  // noticeable few seconds, and guests should never stare at a spinner with
  // zero message change while it runs.
  broadcast(sessionId, 'GENERATION_PROGRESS', { progress: 5, message: 'Preparing your character...' });

  // Swap the guest's face onto the template's own reference photo BEFORE video
  // generation, so the model gets an image that already shows them in the
  // correct costume/pose - instead of guessing the costume from text while
  // anchored on their plain selfie (which produced inconsistent results and a
  // jarring "starts as your selfie" first frame). Falls back to the first
  // selfie if the swap step fails, so a guest never sees a hard error here.
  let imageBuffer = selfieBuffers[0];
  let imageMimeType = 'image/jpeg';

  // The face-swap step (Gemini) is independent of which provider actually
  // generates the video - it just needs GEMINI_API_KEY configured.
  if (config.gemini.apiKey && template.thumbnail) {
    try {
      const templateImagePath = path.join(__dirname, '..', 'templates', 'assets', path.basename(template.thumbnail));
      const templateImageBuffer = fs.readFileSync(templateImagePath);
      const swapped = await swapFaceOntoTemplate({
        selfieBuffers,
        selfieMimeType: 'image/jpeg',
        templateImageBuffer,
        templateImageMimeType: 'image/jpeg'
      });
      imageBuffer = swapped.imageBuffer;
      imageMimeType = swapped.imageMimeType;
    } catch (err) {
      console.error(`[generation] template face swap failed, falling back to raw selfie:`, err.message);
    }
  }

  // Pick a random action each generation so repeat guests on the same template
  // don't all get the identical "walks toward camera" clip - only the action
  // varies, the costume/character description in the prompt stays fixed.
  const actionVariants = template.actionVariants || [];
  const action = actionVariants.length
    ? actionVariants[Math.floor(Math.random() * actionVariants.length)]
    : '';
  const filledPrompt = template.prompt.includes('{{ACTION}}')
    ? template.prompt.replace('{{ACTION}}', action)
    : template.prompt;

  const { providerJobId } = await provider.startJob({
    imageBuffer,
    imageMimeType,
    prompt: filledPrompt,
    negativePrompt: template.negativePrompt,
    durationSeconds: template.duration,
    aspectRatio: template.aspectRatio
  });

  broadcast(sessionId, 'GENERATION_PROGRESS', { progress: 15, message: 'Creating your scene...' });

  const startedAt = Date.now();
  let result;
  const messages = ['Creating your scene...', 'Animating your video...', 'Finalizing your video...'];
  let messageIdx = 0;

  while (true) {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new Error('Video generation timed out.');
    }

    await sleep(POLL_INTERVAL_MS);

    // The session may have been reset/superseded while we were polling.
    const current = sessionStore.get(sessionId);
    if (!current || current.jobId !== jobId) return;

    result = await provider.checkJob(providerJobId);

    if (result.status === 'processing') {
      const progress = Math.min(15 + (result.progress || 0) * 0.6, 85);
      broadcast(sessionId, 'GENERATION_PROGRESS', {
        progress,
        message: messages[messageIdx % messages.length]
      });
      messageIdx++;
      continue;
    }

    if (result.status === 'failed') {
      throw new Error(result.error || 'Video generation failed.');
    }

    break; // completed
  }

  broadcast(sessionId, 'GENERATION_PROGRESS', { progress: 90, message: 'Finalizing your video...' });

  let rawVideoBuffer;
  if (result.videoBuffer) {
    rawVideoBuffer = result.videoBuffer;
  } else if (result.videoUrl) {
    const videoRes = await fetch(result.videoUrl);
    if (!videoRes.ok) throw new Error(`Failed to download generated video (${videoRes.status}).`);
    rawVideoBuffer = Buffer.from(await videoRes.arrayBuffer());
  } else {
    throw new Error('Provider returned no video.');
  }

  const { videoBuffer, thumbnailBuffer } = await normalizeToDeliveryFormat(rawVideoBuffer);

  const videoId = nanoid(14);
  const videoPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
  const thumbPath = path.join(THUMBS_DIR, `${videoId}.jpg`);
  fs.writeFileSync(videoPath, videoBuffer);
  fs.writeFileSync(thumbPath, thumbnailBuffer);

  const expiresAt = Date.now() + config.videoTtlMinutes * 60 * 1000;
  sessionStore.registerVideo(videoId, {
    videoId,
    sessionId,
    path: videoPath,
    thumbnailPath: thumbPath,
    templateId: template.id,
    templateName: template.name,
    createdAt: Date.now(),
    expiresAt
  });

  const videoUrl = `${config.publicBaseUrl}/media/videos/${videoId}.mp4`;
  const thumbnailUrl = `${config.publicBaseUrl}/media/thumbnails/${videoId}.jpg`;

  // Delivered - remove the temporary selfies now (privacy requirement).
  for (const p of session.selfiePaths || []) safeUnlink(p);

  const updated = sessionStore.update(sessionId, {
    status: 'VIDEO_READY',
    videoId,
    videoUrl,
    thumbnailUrl,
    selfiePaths: [],
    selfieExpiresAt: null
  });

  broadcast(sessionId, 'GENERATION_COMPLETE', { videoId, videoUrl, thumbnailUrl, templateName: template.name });
  broadcast(sessionId, 'PLAY_VIDEO', { videoUrl });
  broadcast(sessionId, 'SESSION_STATE', publicSession(updated));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
