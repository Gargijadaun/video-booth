const fetch = require('node-fetch');
const config = require('../../../config');

/**
 * ElevenLabs Flows Video API - wraps Google Veo 3.1 (and other models)
 * behind ElevenLabs' own infrastructure. Requires an ElevenLabs Pro plan
 * or above for API access.
 *
 * Schema verified directly against ElevenLabs' published OpenAPI spec
 * (https://api.elevenlabs.io/openapi.json), not guessed.
 *
 * POST https://api.elevenlabs.io/v1/flows/video  -> { id, status: "pending" }
 * GET  https://api.elevenlabs.io/v1/flows/video/{id} -> status-discriminated
 *      response: pending/generating -> in progress; completed -> content_url;
 *      failed -> failure_reason/error_message (failed generations aren't
 *      charged, per ElevenLabs' own docs).
 */

const BASE_URL = 'https://api.elevenlabs.io/v1/flows/video';

function assertConfigured() {
  if (!config.elevenlabs.apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set. Set it in backend/.env or use a different VIDEO_PROVIDER.');
  }
}

function mapDurationToEnum(durationSeconds) {
  if (durationSeconds <= 5) return 4;
  if (durationSeconds <= 7) return 6;
  return 8;
}

async function startJob({ imageBuffer, imageMimeType, prompt, negativePrompt, durationSeconds, aspectRatio }) {
  assertConfigured();

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': config.elevenlabs.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model_id: config.elevenlabs.model,
      prompt,
      negative_prompt: negativePrompt,
      duration_secs: mapDurationToEnum(durationSeconds),
      aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
      resolution: '720p',
      // Defaults to true, which this booth never needs and would add cost for.
      generate_audio: false,
      start_frame: {
        type: 'inline_base64',
        content_base64: imageBuffer.toString('base64'),
        mime_type: imageMimeType
      }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ElevenLabs request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  if (!json.id) {
    throw new Error('ElevenLabs did not return a generation id.');
  }

  return { providerJobId: json.id };
}

async function checkJob(providerJobId) {
  assertConfigured();

  const res = await fetch(`${BASE_URL}/${providerJobId}`, {
    headers: { 'xi-api-key': config.elevenlabs.apiKey }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { status: 'failed', error: `ElevenLabs status check failed (${res.status}): ${text.slice(0, 500)}` };
  }

  const result = await res.json();

  if (result.status === 'pending' || result.status === 'generating') {
    return { status: 'processing', progress: result.status === 'generating' ? 60 : 20 };
  }

  if (result.status === 'failed') {
    return { status: 'failed', error: result.error_message || `ElevenLabs generation failed: ${result.failure_reason}` };
  }

  if (result.status !== 'completed') {
    return { status: 'failed', error: `Unexpected ElevenLabs status: ${result.status}` };
  }

  if (!result.content_url) {
    return { status: 'failed', error: 'ElevenLabs completed but returned no content URL.' };
  }

  return { status: 'completed', progress: 100, videoUrl: result.content_url };
}

module.exports = { startJob, checkJob };
