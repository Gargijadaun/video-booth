const fetch = require('node-fetch');
const config = require('../../../config');

/**
 * Hugging Face Inference Providers.
 * Docs: https://huggingface.co/docs/inference-providers
 *
 * Unlike Fal/Replicate, HF's router serves most image-to-video models as a
 * single synchronous call (send the image, get video bytes back), so there is
 * no separate job queue. To keep the same async provider contract as the
 * other backends, startJob() performs the full call immediately and caches
 * the resulting video bytes in memory under a generated job id; checkJob()
 * just returns that cached result.
 */

const BASE_URL = 'https://router.huggingface.co/hf-inference/models';
const jobCache = new Map(); // providerJobId -> { status, videoBuffer, error }

function assertConfigured() {
  if (!config.huggingface.apiKey) {
    throw new Error('HF_API_KEY is not set. Set it in backend/.env or use VIDEO_PROVIDER=mock.');
  }
}

async function startJob({ imageBuffer, imageMimeType, prompt, durationSeconds }) {
  assertConfigured();

  const providerJobId = `hf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  jobCache.set(providerJobId, { status: 'processing' });

  // Fire and forget - this can take minutes; the job cache is updated when it resolves.
  (async () => {
    try {
      const res = await fetch(`${BASE_URL}/${config.huggingface.model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.huggingface.apiKey}`,
          'Content-Type': imageMimeType,
          'X-Wait-For-Model': 'true'
        },
        body: imageBuffer
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        jobCache.set(providerJobId, { status: 'failed', error: `HF request failed (${res.status}): ${text.slice(0, 300)}` });
        return;
      }

      const videoBuffer = Buffer.from(await res.arrayBuffer());
      jobCache.set(providerJobId, { status: 'completed', videoBuffer });
    } catch (err) {
      jobCache.set(providerJobId, { status: 'failed', error: err.message });
    }
  })();

  return { providerJobId };
}

async function checkJob(providerJobId) {
  const cached = jobCache.get(providerJobId);
  if (!cached) {
    return { status: 'failed', error: 'Unknown Hugging Face job id.' };
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
