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
 * Auth: x-goog-api-key header. Multiple images go in as separate `parts`
 * with inlineData; the model returns image part(s) back in the same shape.
 *
 * Unlike the OpenAI attempt, there's no mask parameter here - identity and
 * "don't change anything else" are both carried by the prompt alone, relying
 * on this model's specific strength at holding everything but the requested
 * edit steady.
 */

const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 45 * 1000;

const SWAP_PROMPT = [
  'Image 1 is a reference photo of a costume/character on a plain white',
  'studio background. Image 2 is a photo of a real person. Generate a new',
  "version of Image 1 where the person's face is replaced with the face",
  'from Image 2 - same identity, same facial features, same skin tone as',
  'Image 2. Do not change anything else: keep the exact body, outfit, pose,',
  'proportions, height, and plain white background from Image 1 unchanged.',
  'Photorealistic, seamless blending, no distortion.'
].join(' ');

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function swapFaceOntoTemplate({ selfieBuffer, selfieMimeType, templateImageBuffer, templateImageMimeType }) {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not set - required for template face swap.');
  }

  const url = `${ENDPOINT_BASE}/${config.gemini.model}:generateContent`;

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
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: SWAP_PROMPT },
                { inlineData: { mimeType: templateImageMimeType, data: templateImageBuffer.toString('base64') } },
                { inlineData: { mimeType: selfieMimeType, data: selfieBuffer.toString('base64') } }
              ]
            }
          ]
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
    throw new Error(`Face swap request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (!imagePart) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(`Face swap returned no image. ${textPart ? `Model said: ${textPart.slice(0, 300)}` : ''}`);
  }

  return {
    imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    imageMimeType: imagePart.inlineData.mimeType || 'image/png'
  };
}

module.exports = { swapFaceOntoTemplate };
