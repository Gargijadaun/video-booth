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
 * Uses Google's Gemini 2.5 Flash Image ("Nano Banana"), specifically known
 * for strong character/identity consistency across multi-image edits.
 * Schema verified against real generateContent examples (an initial doc
 * fetch returned a hallucinated "interactions" endpoint that doesn't
 * actually exist - confirmed the real one via working code samples instead
 * of trusting a single scraped page).
 *
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Auth: x-goog-api-key header. All reference images go in as separate
 * `parts` with inlineData; the model returns image part(s) back in the
 * same shape.
 *
 * Accepts multiple selfie angles (front/left/right) as additional inlineData
 * parts, in case giving the model more views of the face improves identity
 * accuracy versus a single frontal photo - the earlier single-photo attempt
 * with this same model was noticeably closer than gpt-image-1 but still not
 * exact.
 */

const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 45 * 1000;

function buildPrompt(selfieCount) {
  const selfieImageLabels =
    selfieCount > 1
      ? `Images 2-${selfieCount + 1} are photos of the same real person from different angles`
      : 'Image 2 is a photo of a real person';

  return [
    'Image 1 is a reference photo of a costume/character on a plain white',
    `studio background. ${selfieImageLabels}.`,
    "Generate a new version of Image 1 where the person's face is replaced",
    'with that person\'s face - use all the provided angles to match their',
    'exact identity, facial features, and skin tone as closely as possible.',
    'Do not change anything else: keep the exact body, outfit, pose,',
    'proportions, height, and plain white background from Image 1 unchanged.',
    'Photorealistic, seamless blending, no distortion.'
  ].join(' ');
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function swapFaceOntoTemplate({ selfieBuffers, selfieMimeType, templateImageBuffer, templateImageMimeType }) {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not set - required for template face swap.');
  }

  const buffers = selfieBuffers || [];
  if (buffers.length === 0) {
    throw new Error('At least one selfie image is required for face swap.');
  }

  const url = `${ENDPOINT_BASE}/${config.gemini.model}:generateContent`;

  const parts = [
    { text: buildPrompt(buffers.length) },
    { inlineData: { mimeType: templateImageMimeType, data: templateImageBuffer.toString('base64') } },
    ...buffers.map((buf) => ({ inlineData: { mimeType: selfieMimeType, data: buf.toString('base64') } }))
  ];

  let res;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': config.gemini.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contents: [{ parts }] })
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
    throw new Error(`Face swap request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  const resultParts = json?.candidates?.[0]?.content?.parts || [];
  const imagePart = resultParts.find((p) => p.inlineData?.data);

  if (!imagePart) {
    const textPart = resultParts.find((p) => p.text)?.text;
    throw new Error(`Face swap returned no image. ${textPart ? `Model said: ${textPart.slice(0, 300)}` : ''}`);
  }

  return {
    imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    imageMimeType: imagePart.inlineData.mimeType || 'image/png'
  };
}

module.exports = { swapFaceOntoTemplate };
