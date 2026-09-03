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
 * Uses codeplugtech/face-swap on Replicate - cheap (~$0.001-0.006/call),
 * fast (usually well under a minute), CPU-only model.
 * Docs: https://replicate.com/codeplugtech/face-swap
 *
 * Replicate is prediction+poll based (no sync endpoint like fal had), so
 * this creates a prediction and polls it, same pattern as the main video
 * provider, with its own timeout so a stuck prediction can never hang the
 * whole generation indefinitely.
 */

const BASE_URL = 'https://api.replicate.com/v1';
const MODEL = 'codeplugtech/face-swap';
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 90 * 1000;

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function swapFaceOntoTemplate({ selfieBuffer, selfieMimeType, templateImageBuffer, templateImageMimeType }) {
  if (!config.replicate.apiToken) {
    throw new Error('REPLICATE_API_TOKEN is not set - required for template face swap.');
  }

  const swapDataUri = `data:${selfieMimeType};base64,${selfieBuffer.toString('base64')}`;
  const inputDataUri = `data:${templateImageMimeType};base64,${templateImageBuffer.toString('base64')}`;

  let createRes;
  try {
    createRes = await fetchWithTimeout(
      `${BASE_URL}/models/${MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${config.replicate.apiToken}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=0'
        },
        body: JSON.stringify({
          input: {
            input_image: inputDataUri,
            swap_image: swapDataUri
          }
        })
      },
      15000
    );
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Face swap request timed out starting the prediction.');
    throw err;
  }

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Face swap request failed (${createRes.status}): ${text.slice(0, 400)}`);
  }

  const prediction = await createRes.json();
  if (!prediction.id) {
    throw new Error('Replicate did not return a prediction id for face swap.');
  }

  const startedAt = Date.now();
  let finalPrediction;

  while (true) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(`Face swap timed out after ${MAX_WAIT_MS / 1000}s.`);
    }

    await sleep(POLL_INTERVAL_MS);

    let statusRes;
    try {
      statusRes = await fetchWithTimeout(
        `${BASE_URL}/predictions/${prediction.id}`,
        { headers: { Authorization: `Token ${config.replicate.apiToken}` } },
        15000
      );
    } catch (err) {
      if (err.name === 'AbortError') continue; // transient - keep polling within the overall MAX_WAIT_MS budget
      throw err;
    }

    if (!statusRes.ok) {
      throw new Error(`Face swap status check failed (${statusRes.status}).`);
    }

    finalPrediction = await statusRes.json();

    if (finalPrediction.status === 'succeeded') break;
    if (finalPrediction.status === 'failed' || finalPrediction.status === 'canceled') {
      throw new Error(`Face swap ${finalPrediction.status}: ${finalPrediction.error || 'unknown error'}`);
    }
    // starting / processing - keep polling
  }

  const output = finalPrediction.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl) {
    throw new Error('Face swap succeeded but returned no output image.');
  }

  let imageRes;
  try {
    imageRes = await fetchWithTimeout(imageUrl, {}, 30000);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timed out downloading the face-swapped image.');
    throw err;
  }
  if (!imageRes.ok) {
    throw new Error(`Failed to download face-swapped image (${imageRes.status}).`);
  }

  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  return { imageBuffer, imageMimeType: 'image/png' };
}

module.exports = { swapFaceOntoTemplate };
