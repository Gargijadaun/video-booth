const sharp = require('sharp');
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
 *
 * Crucially, this also passes a MASK (applies to the first/template image
 * per OpenAI's docs) that makes everything outside the template's face
 * region fully opaque - i.e. physically locked, not just "please don't
 * change this" in the prompt. Without a mask, gpt-image-1 is a general
 * image generator that reinterprets the whole scene from the prompt, which
 * was drifting on body proportions/height, not just the face. The mask is
 * what actually constrains it to a real face-swap rather than a loose
 * reinterpretation.
 */

const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const REQUEST_TIMEOUT_MS = 60 * 1000;

const SWAP_PROMPT = [
  'The transparent (editable) region of Image 1 is the face. Fill it with',
  "the face from Image 2, matching Image 2's identity, skin tone, and facial",
  "features exactly. Blend naturally with Image 1's lighting and skin tone",
  'at the edges. Do not modify anything outside the transparent region -',
  "keep Image 1's body, outfit, pose, proportions, and background",
  'completely unchanged. Photorealistic, no distortion, no blending seams.'
].join(' ');

async function buildFaceMask(width, height, region) {
  const cx = ((region.left + region.right) / 2) * width;
  const cy = ((region.top + region.bottom) / 2) * height;
  const rx = ((region.right - region.left) / 2) * width;
  const ry = ((region.bottom - region.top) / 2) * height;

  // White = locked (opaque, alpha 255), black ellipse = editable (transparent, alpha 0).
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="white"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="black"/>
  </svg>`;

  const { data, info } = await sharp(Buffer.from(svg))
    .png()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const luminance = data[i * info.channels];
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = luminance; // white ellipse background -> opaque; black ellipse -> transparent
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function swapFaceOntoTemplate({ selfieBuffer, selfieMimeType, templateImageBuffer, templateImageMimeType, faceRegion }) {
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

  if (faceRegion) {
    const meta = await sharp(templateImageBuffer).metadata();
    const maskBuffer = await buildFaceMask(meta.width, meta.height, faceRegion);
    // Applied to the first image (the template) per OpenAI's documented behavior.
    form.append('mask', new Blob([maskBuffer], { type: 'image/png' }), 'mask.png');
  }

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
