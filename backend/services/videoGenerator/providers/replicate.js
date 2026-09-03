const fetch = require('node-fetch');
const config = require('../../../config');

/**
 * Replicate image-to-video provider, targeting minimax/video-01 (Hailuo) by
 * default - it's in Replicate's genuinely free "Try for Free" collection
 * (limited free runs, no credit card required to start). Docs:
 * https://replicate.com/minimax/video-01
 *
 * minimax/video-01 has its own input shape (first_frame_image, prompt,
 * prompt_optimizer) rather than the generic image/negative_prompt/num_frames
 * fields other i2v models use - no negative prompt or explicit frame-count
 * control, and duration is fixed at ~6s by the model itself, not configurable.
 */

const BASE_URL = 'https://api.replicate.com/v1';

function assertConfigured() {
  if (!config.replicate.apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not set. Set it in backend/.env or use VIDEO_PROVIDER=mock.');
  }
}

async function startJob({ imageBuffer, imageMimeType, prompt }) {
  assertConfigured();

  const dataUri = `data:${imageMimeType};base64,${imageBuffer.toString('base64')}`;

  const res = await fetch(`${BASE_URL}/models/${config.replicate.model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${config.replicate.apiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=0'
    },
    body: JSON.stringify({
      input: {
        first_frame_image: dataUri,
        prompt,
        prompt_optimizer: true
      }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Replicate request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.id) {
    throw new Error('Replicate did not return a prediction id.');
  }

  return { providerJobId: json.id };
}

async function checkJob(providerJobId) {
  assertConfigured();

  const res = await fetch(`${BASE_URL}/predictions/${providerJobId}`, {
    headers: { Authorization: `Token ${config.replicate.apiToken}` }
  });

  if (!res.ok) {
    return { status: 'failed', error: `Replicate status check failed (${res.status})` };
  }

  const prediction = await res.json();

  if (prediction.status === 'starting' || prediction.status === 'processing') {
    return { status: 'processing', progress: prediction.status === 'processing' ? 60 : 20 };
  }

  if (prediction.status === 'canceled' || prediction.status === 'failed') {
    return { status: 'failed', error: prediction.error || `Replicate prediction ${prediction.status}` };
  }

  if (prediction.status !== 'succeeded') {
    return { status: 'processing', progress: 40 };
  }

  const output = prediction.output;
  const videoUrl = Array.isArray(output) ? output[0] : output;

  if (!videoUrl) {
    return { status: 'failed', error: 'Replicate succeeded but returned no output video.' };
  }

  return { status: 'completed', progress: 100, videoUrl };
}

module.exports = { startJob, checkJob };
