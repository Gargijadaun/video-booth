const path = require('path');
const os = require('os');
const fs = require('fs');
const { nanoid } = require('nanoid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;

/**
 * Normalizes whatever the AI provider returned into the final delivery asset:
 * an H.264 MP4 at exactly 1080x1920 / 30fps, plus a JPG thumbnail.
 *
 * Generation resolution and delivery resolution are treated as separate
 * stages on purpose - Wan/Fal/Replicate models each have different native
 * output sizes, so this step scales-to-cover and center-crops (never
 * stretches) whatever comes back to fit the HoloBox's 9:16 frame exactly.
 */
async function normalizeToDeliveryFormat(inputVideoBuffer) {
  const tmpIn = path.join(os.tmpdir(), `${nanoid(8)}_in.mp4`);
  const tmpOut = path.join(os.tmpdir(), `${nanoid(8)}_out.mp4`);
  const tmpThumb = path.join(os.tmpdir(), `${nanoid(8)}_thumb.jpg`);

  fs.writeFileSync(tmpIn, inputVideoBuffer);

  await new Promise((resolve, reject) => {
    ffmpeg(tmpIn)
      .videoFilters([
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
        `fps=${TARGET_FPS}`,
        'format=yuv420p'
      ])
      // veryfast/threads 1/no lookahead trades a little encode efficiency for a
      // much smaller peak memory footprint - needed to fit low-memory hosts
      // (e.g. a 512MB free-tier dyno) encoding a full 1080x1920 stream.
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 22',
        '-threads 1',
        '-x264-params rc-lookahead=10:ref=1',
        '-movflags +faststart',
        '-an'
      ])
      .output(tmpOut)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  await new Promise((resolve, reject) => {
    ffmpeg(tmpOut)
      .screenshots({
        timestamps: ['1'],
        filename: path.basename(tmpThumb),
        folder: path.dirname(tmpThumb),
        size: `${TARGET_WIDTH}x${TARGET_HEIGHT}`
      })
      .on('end', resolve)
      .on('error', reject);
  });

  const videoBuffer = fs.readFileSync(tmpOut);
  const thumbnailBuffer = fs.readFileSync(tmpThumb);

  for (const f of [tmpIn, tmpOut, tmpThumb]) {
    fs.unlink(f, () => {});
  }

  return { videoBuffer, thumbnailBuffer };
}

module.exports = { normalizeToDeliveryFormat, TARGET_WIDTH, TARGET_HEIGHT, TARGET_FPS };
