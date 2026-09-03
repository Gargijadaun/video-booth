const fetch = require('node-fetch');
const config = require('../../config');

/**
 * Swaps the guest's face onto a template's reference photo BEFORE video
 * generation, so the image handed to the video model already shows the
 * guest wearing the exact template costume/pose - instead of the model
 * having to invent the costume from a text description while anchored on
 * the guest's plain selfie (which produced bad, inconsistent results and a
 * jarring "starts as your selfie" first frame).
 *
 * Uses Easel AI's Advanced Face Swap on fal.ai (sync endpoint, not the
 * queue API - a single fast image operation, ~$0.05/call). This is a real
 * face-swap model (face detection + landmark-based blending of the actual
 * source face pixels), not a generative reimagining. Both gpt-image-1 and
 * Gemini 2.5 Flash Image were tried first (see git history) - both are
 * generative models that reconstruct a face "inspired by" the reference
 * rather than transplanting the real one, and both landed in the same
 * "closer but not exact" territory regardless of vendor. That's the
 * architectural ceiling of that whole approach, which is why this uses a
 * purpose-built swap model instead.
 * Docs: https://fal.ai/models/easel-ai/advanced-face-swap
 *
 * Supports an optional second face reference (face_image_1) for extra
 * angles if quality still isn't sufficient with a single frontal photo -
 * not wired up yet since it needs a booth capture-flow change.
 */

const ENDPOINT = 'https://fal.run/easel-ai/advanced-face-swap';
const REQUEST_TIMEOUT_MS = 45 * 1000;

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function swapFaceOntoTemplate({ selfieBuffer, selfieMimeType, templateImageBuffer, templateImageMimeType, gender }) {
  if (!config.fal.apiKey) {
    throw new Error('FAL_API_KEY is not set - required for template face swap.');
  }

  const faceDataUri = `data:${selfieMimeType};base64,${selfieBuffer.toString('base64')}`;
  const targetDataUri = `data:${templateImageMimeType};base64,${templateImageBuffer.toString('base64')}`;

  let res;
  try {
    res = await fetchWithTimeout(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${config.fal.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          face_image_0: faceDataUri,
          gender_0: gender === 'female' ? 'female' : 'male',
          target_image: targetDataUri,
          workflow_type: 'target_hair',
          // upscale adds meaningful extra processing time for a step that
          // should be quick - the video model's own output resolution
          // dominates final quality anyway, so skip it here for speed.
          upscale: false
        })
      },
      REQUEST_TIMEOUT_MS
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Face swap request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Face swap request failed (${res.status}): ${text.slice(0, 400)}`);
  }

  const json = await res.json();
  const imageUrl = json?.image?.url;
  if (!imageUrl) {
    throw new Error('Face swap completed but returned no image URL.');
  }

  let imageRes;
  try {
    imageRes = await fetchWithTimeout(imageUrl, {}, REQUEST_TIMEOUT_MS);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timed out downloading face-swapped image after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  }
  if (!imageRes.ok) {
    throw new Error(`Failed to download face-swapped image (${imageRes.status}).`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  return { imageBuffer, imageMimeType: json.image.content_type || 'image/png' };
}

module.exports = { swapFaceOntoTemplate };
