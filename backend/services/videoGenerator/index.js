const config = require('../../config');

/**
 * VideoGenerationProvider - the abstraction every backend (Fal, Replicate,
 * Hugging Face, a self-hosted Wan endpoint, ...) must implement. Swapping the
 * active AI provider is a one-line env var change (VIDEO_PROVIDER); nothing
 * else in the app talks to a specific vendor API directly.
 *
 * Contract:
 *   startJob({ imageBuffer, imageMimeType, prompt, negativePrompt, durationSeconds, aspectRatio })
 *     -> Promise<{ providerJobId }>
 *
 *   checkJob(providerJobId)
 *     -> Promise<{ status: 'processing'|'completed'|'failed', progress?: number, videoUrl?: string, error?: string }>
 */

function getProvider() {
  switch (config.videoProvider) {
    case 'fal':
      return require('./providers/fal');
    case 'replicate':
      return require('./providers/replicate');
    case 'huggingface':
      return require('./providers/huggingface');
    case 'mock':
    default:
      return require('./providers/mock');
  }
}

module.exports = { getProvider };
