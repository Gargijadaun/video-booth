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
 * source face), not a generative reimagining - tried gpt-image-1 first
 * (see git history), which even with a locking mask on everything but the
 * face region still couldn't transfer exact identity because it's a
 * diffusion model that reinterprets a face "inspired by" the reference
 * rather than transplanting the real one. That's a ceiling no prompt or
 * mask can fix, which is why this uses a purpose-built swap model instead.
 * Docs: https://fal.ai/models/easel-ai/advanced-face-swap
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
