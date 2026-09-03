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
 * queue API - it's a single fast image operation, ~$0.05/call).
 * Docs: https://fal.ai/models/easel-ai/advanced-face-swap
 */

const ENDPOINT = 'https://fal.run/easel-ai/advanced-face-swap';

async function swapFaceOntoTemplate({ selfieBuffer, selfieMimeType, templateImageBuffer, templateImageMimeType, gender }) {
  if (!config.fal.apiKey) {
    throw new Error('FAL_API_KEY is not set - required for template face swap.');
  }

  const faceDataUri = `data:${selfieMimeType};base64,${selfieBuffer.toString('base64')}`;
  const targetDataUri = `data:${templateImageMimeType};base64,${templateImageBuffer.toString('base64')}`;

  const res = await fetch(ENDPOINT, {
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
      upscale: true
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Face swap request failed (${res.status}): ${text.slice(0, 400)}`);
  }

  const json = await res.json();
  const imageUrl = json?.image?.url;
  if (!imageUrl) {
    throw new Error('Face swap completed but returned no image URL.');
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download face-swapped image (${imageRes.status}).`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  return { imageBuffer, imageMimeType: json.image.content_type || 'image/png' };
}

module.exports = { swapFaceOntoTemplate };
