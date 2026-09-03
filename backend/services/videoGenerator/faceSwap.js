const config = require('../../config');

/**
 * Swaps the guest's face onto a template's reference photo BEFORE video
 * generation, so the image handed to the video model already shows the
 * guest wearing the exact template costume/pose - instead of the model
 * having to invent the costume from a text description while anchored on
 * the guest's plain selfie (which produced bad, inconsistent results and a
 * jarring "starts as your selfie" first frame).
 *
 * Uses OpenAI's image edit endpoint (gpt-image-1), which accepts multiple
 * reference images plus a text prompt in one call - no dedicated "face swap"
 * endpoint exists, but multi-image editing with an explicit instruction
 * achieves the same result. Synchronous (no polling needed).
 * Schema verified against OpenAI's own published OpenAPI spec
 * (https://github.com/openai/openai-openapi), not guessed.
 */

const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const REQUEST_TIMEOUT_MS = 60 * 1000;

const SWAP_PROMPT = [
  "Swap the face from Image 2 onto Image 1, keeping Image 1's body, outfit,",
  'pose, and proportions completely unchanged. Preserve Image 1\'s exact',
  'background (plain white studio background, no scenery, no shadows,',
  'no gradients). Photorealistic, consistent face identity from Image 2,',
  'no distortion, no blending artifacts, natural skin tones, seamless',
  'integration.'
].join(' ');

async function swapFaceOntoTemplate({ selfieBuffer, selfieMimeType, templateImageBuffer, templateImageMimeType }) {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not set - required for template face swap.');
  }

  const form = new FormData();
  form.append('model', config.openai.model);
  form.append('prompt', SWAP_PROMPT);
  form.append('size', '1024x1536');
  // Image 1 = template (body/outfit/background to keep), Image 2 = selfie
  // (face to use) - matches the ordering the prompt above refers to.
  form.append('image[]', new Blob([templateImageBuffer], { type: templateImageMimeType }), 'template.jpg');
  form.append('image[]', new Blob([selfieBuffer], { type: selfieMimeType }), 'selfie.jpg');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openai.apiKey}` },
      body: form,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Face swap request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Face swap request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('Face swap completed but returned no image data.');
  }

  return { imageBuffer: Buffer.from(b64, 'base64'), imageMimeType: 'image/png' };
}

module.exports = { swapFaceOntoTemplate };
