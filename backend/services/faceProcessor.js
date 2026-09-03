const sharp = require('sharp');

// Sharp's default ~50MB decode cache is unnecessary overhead here (each
// selfie is processed once) and worth shedding on memory-constrained hosts.
sharp.cache(false);

const MIN_DIMENSION = 400;
const MAX_DIMENSION = 4096;

/**
 * Validates and normalizes an uploaded selfie.
 *
 * Real-time face framing/lighting feedback happens client-side (the phone camera
 * screen, using the browser FaceDetector API where available). Here we do the
 * server-side checks that must never be trusted to the client: real image
 * dimensions/format via sharp, then re-encode to a clean, size-capped JPEG with
 * EXIF orientation baked in so the video generation API always receives a
 * predictable upright portrait image.
 */
async function processSelfie(inputBuffer) {
  let metadata;
  try {
    metadata = await sharp(inputBuffer).metadata();
  } catch (err) {
    throw new ValidationError('Could not read the image. Please take another photo.');
  }

  if (!metadata.width || !metadata.height) {
    throw new ValidationError('Could not read the image. Please take another photo.');
  }

  if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
    throw new ValidationError('Photo resolution is too low. Please take another photo.');
  }

  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new ValidationError('Photo resolution is too high. Please take another photo.');
  }

  // Re-encode: bake in EXIF rotation, strip metadata (privacy), cap size, normalize to JPEG.
  // progressive:false (baseline) is required - ffmpeg's image2 demuxer fails to read
  // dimensions from progressive/mozjpeg-encoded stills, which silently hangs generation.
  const normalized = await sharp(inputBuffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, progressive: false, mozjpeg: false })
    .toBuffer();

  return {
    buffer: normalized,
    width: metadata.width,
    height: metadata.height
  };
}

class ValidationError extends Error {}

module.exports = { processSelfie, ValidationError };
