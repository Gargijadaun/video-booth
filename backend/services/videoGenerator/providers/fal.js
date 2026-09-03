const fetch = require('node-fetch');
const config = require('../../../config');

/**
 * Fal.ai queue-based image-to-video provider (default recommended provider).
 * Docs: https://fal.ai/models/fal-ai/wan-i2v
 *
 * Fal exposes a generic async "queue" protocol that is the same shape for
 * every model it hosts, so this one implementation works for Wan, Kling, or
 * any other fal i2v model - just change FAL_MODEL.
 */

const BASE_URL = 'https://queue.fal.run';

function assertConfigured() {
  if (!config.fal.apiKey) {
    throw new Error('FAL_API_KEY is not set. Set it in backend/.env or use VIDEO_PROVIDER=mock.');
  }
}

async function startJob({ imageBuffer, imageMimeType, prompt, negativePrompt, durationSeconds, aspectRatio }) {
  assertConfigured();

  const dataUri = `data:${imageMimeType};base64,${imageBuffer.toString('base64')}`;

  const res = await fetch(`${BASE_URL}/${config.fal.model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${config.fal.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: dataUri,
      prompt,
      negative_prompt: negativePrompt,
      num_frames: Math.min(durationSeconds * 16, 161),
      aspect_ratio: aspectRatio,
      enable_safety_checker: true
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fal request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.request_id) {
    throw new Error('Fal did not return a request_id.');
  }

  return { providerJobId: json.request_id };
}

async function checkJob(providerJobId) {
  assertConfigured();

  const statusRes = await fetch(`${BASE_URL}/${config.fal.model}/requests/${providerJobId}/status`, {
    headers: { Authorization: `Key ${config.fal.apiKey}` }
  });

  if (!statusRes.ok) {
    const text = await statusRes.text().catch(() => '');
    return { status: 'failed', error: `Fal status check failed (${statusRes.status}): ${text.slice(0, 500)}` };
  }

  const status = await statusRes.json();

  if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
    return { status: 'processing', progress: status.status === 'IN_PROGRESS' ? 60 : 20 };
  }

  if (status.status !== 'COMPLETED') {
    return { status: 'failed', error: `Unexpected Fal status: ${status.status} - ${JSON.stringify(status).slice(0, 500)}` };
  }

  const resultRes = await fetch(`${BASE_URL}/${config.fal.model}/requests/${providerJobId}`, {
    headers: { Authorization: `Key ${config.fal.apiKey}` }
  });

  if (!resultRes.ok) {
    const text = await resultRes.text().catch(() => '');
    return { status: 'failed', error: `Fal result fetch failed (${resultRes.status}): ${text.slice(0, 500)}` };
  }

  const result = await resultRes.json();
  const videoUrl = result?.video?.url || result?.video_url;

  if (!videoUrl) {
    return { status: 'failed', error: 'Fal completed but returned no video URL.' };
  }

  return { status: 'completed', progress: 100, videoUrl };
}

module.exports = { startJob, checkJob };
