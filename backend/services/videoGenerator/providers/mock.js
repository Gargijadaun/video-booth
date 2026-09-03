const path = require('path');
const os = require('os');
const fs = require('fs');
const { nanoid } = require('nanoid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Mock provider - used automatically when no real AI provider is configured
 * (VIDEO_PROVIDER=mock, or as a documented fallback). It does NOT call any
 * external AI. It builds a simple animated "Ken Burns" style video from the
 * user's selfie with ffmpeg so the entire booth pipeline (upload -> generate
 * -> upscale -> deliver -> play on HoloBox) can be exercised end-to-end
 * without an API key. Swap VIDEO_PROVIDER to fal/replicate/huggingface for
 * real AI-generated video.
 */

const jobCache = new Map();

async function startJob({ imageBuffer, durationSeconds }) {
  const providerJobId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  jobCache.set(providerJobId, { status: 'processing' });

  const tmpImage = path.join(os.tmpdir(), `${nanoid(8)}.jpg`);
  const tmpVideo = path.join(os.tmpdir(), `${nanoid(8)}.mp4`);
  fs.writeFileSync(tmpImage, imageBuffer);

  const duration = durationSeconds || 10;
  const fps = 24;
  const totalFrames = duration * fps;

  // Render at a small size - zoompan decodes/scales every frame individually
  // and is memory-hungry at full 1080x1920 (enough to OOM a 512MB free-tier
  // dyno). The upscale step (upscale.js) does a single-pass scale+crop to the
  // real 1080x1920 delivery size afterward, which is far cheaper.
  const workingWidth = 360;
  const workingHeight = 640;

  ffmpeg(tmpImage)
    .inputOptions(['-loop 1'])
    .videoFilters([
      `scale=${workingWidth}:${workingHeight}:force_original_aspect_ratio=increase`,
      `crop=${workingWidth}:${workingHeight}`,
      `zoompan=z='min(zoom+0.0015,1.3)':d=${totalFrames}:s=${workingWidth}x${workingHeight}:fps=${fps}`,
      `format=yuv420p`
    ])
    .outputOptions([`-t ${duration}`, '-movflags +faststart'])
    .output(tmpVideo)
    .on('end', () => {
      const videoBuffer = fs.readFileSync(tmpVideo);
      jobCache.set(providerJobId, { status: 'completed', videoBuffer });
      fs.unlink(tmpImage, () => {});
      fs.unlink(tmpVideo, () => {});
    })
    .on('error', (err) => {
      jobCache.set(providerJobId, { status: 'failed', error: err.message });
      fs.unlink(tmpImage, () => {});
    })
    .run();

  return { providerJobId };
}

async function checkJob(providerJobId) {
  const cached = jobCache.get(providerJobId);
  if (!cached) {
    return { status: 'failed', error: 'Unknown mock job id.' };
  }

  if (cached.status === 'processing') {
    return { status: 'processing', progress: 50 };
  }

  if (cached.status === 'failed') {
    jobCache.delete(providerJobId);
    return { status: 'failed', error: cached.error };
  }

  jobCache.delete(providerJobId);
  return { status: 'completed', progress: 100, videoBuffer: cached.videoBuffer };
}

module.exports = { startJob, checkJob };
