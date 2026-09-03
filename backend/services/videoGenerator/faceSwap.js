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

function buildFaceSwapPrompt(selfieImageLabels = "") {
  return [
    "Image 1 is the exact reference image of the character/costume on a plain white studio background.",
    `${selfieImageLabels}.`,
    "",
    "Generate a new version of Image 1 by replacing ONLY the character's face and identity",
    "with the person shown in the provided reference images.",
    "",
    "Use ALL provided reference images of the person together to accurately match the same",
    "real person's identity, facial structure, facial proportions, skin tone, hairline,",
    "forehead, eyebrows, eyes, eyelids, nose, cheeks, lips, jawline, chin, ears, and",
    "overall recognizable facial characteristics.",
    "",
    "The person's identity must remain highly consistent and recognizable.",
    "Do not average the face with the character's original face.",
    "Do not create a new or different person.",
    "",
    "CRITICAL: Preserve the exact head size, head position, head angle, head-to-body ratio,",
    "neck size, body proportions, height, shoulder width, body shape, pose, silhouette,",
    "and overall scale from Image 1.",
    "Do NOT enlarge or shrink the head.",
    "Do NOT change the character's body proportions.",
    "",
    "Preserve EVERYTHING from Image 1 except the facial identity:",
    "- exact costume and clothing",
    "- exact costume design and colors",
    "- cape and fabric",
    "- armor and accessories",
    "- hands and arms",
    "- legs and footwear",
    "- body shape and proportions",
    "- original pose",
    "- original head placement",
    "- original camera angle",
    "- original perspective",
    "- original framing",
    "- original lighting direction",
    "- original composition",
    "",
    "The face must be naturally integrated into the existing head position and geometry.",
    "Match the lighting, shadows, skin texture, color temperature, and exposure of Image 1",
    "so the face looks naturally photographed as part of the original character.",
    "",
    "Keep the character standing in exactly the same position as Image 1.",
    "Both feet must remain firmly planted and fully visible.",
    "Do not alter the stance or body position.",
    "",
    "BACKGROUND REQUIREMENT:",
    "Use a completely plain, solid, pure-white studio background.",
    "No scenery, no room, no environment, no city, no landscape, no objects,",
    "no floor texture, no decorative elements, no gradient background.",
    "",
    "STYLE:",
    "Photorealistic professional studio photography.",
    "Natural realistic skin texture.",
    "Sharp and detailed face.",
    "Clean professional studio lighting.",
    "Seamless face integration.",
    "High facial identity accuracy.",
    "Premium realistic character photography.",
    "",
    "IMPORTANT:",
    "The final image should look almost identical to Image 1 in composition, body, costume,",
    "pose, head size, framing, lighting, and background.",
    "The ONLY meaningful change should be replacing the original face/identity with the",
    "identity of the person shown in the reference images.",
    "",
    "This image will be used as a reference for a later image-to-video generation.",
    "Therefore, keep the character geometry, body proportions, head placement,",
    "costume, pose, and facial identity extremely stable and clean.",
    "",
    "NEGATIVE REQUIREMENTS:",
    "Do not enlarge the head.",
    "Do not shrink the head.",
    "Do not change the head-to-body ratio.",
    "Do not change body proportions.",
    "Do not change height.",
    "Do not change shoulder width.",
    "Do not change neck size.",
    "Do not alter the pose.",
    "Do not change the costume.",
    "Do not change accessories.",
    "Do not change the cape.",
    "Do not change hands, arms, legs, or footwear.",
    "Do not change camera angle or perspective.",
    "Do not crop the body.",
    "Do not cut off the feet.",
    "Do not change the background.",
    "Do not add scenery or environment.",
    "Do not create another person.",
    "Do not create duplicate people.",
    "Do not distort the face.",
    "Do not morph the face.",
    "Do not change the person's identity.",
    "Do not mix identities.",
    "Do not alter recognizable facial features.",
    "Do not create asymmetrical eyes.",
    "Do not distort the nose or mouth.",
    "Do not create plastic-looking skin.",
    "Do not create blurry facial features.",
    "Do not create extra limbs or fingers.",
    "Do not deform the body.",
    "Do not introduce camera distortion.",
    "",
    "FINAL OUTPUT:",
    "One photorealistic full-body character image on a pure solid white background,",
    "with the exact original character appearance preserved and only the face identity",
    "accurately replaced using all provided person reference images."
  ].join(" ");
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

  const selfieImageLabels =
    buffers.length > 1
      ? `Images 2-${buffers.length + 1} are photos of the same real person from different angles`
      : 'Image 2 is a photo of a real person';

  const parts = [
    { text: buildFaceSwapPrompt(selfieImageLabels) },
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
