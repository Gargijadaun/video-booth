require('dotenv').config();

function num(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

// Dashboard env var UIs (Render included) can leave a stray trailing newline
// or whitespace when a value is pasted in - trim defensively so a URL never
// ends up with a literal \n embedded in it (breaks src/href attributes).
function str(val, fallback) {
  const trimmed = (val || '').trim();
  return trimmed || fallback;
}

module.exports = {
  port: num(process.env.PORT, 4000),
  publicBaseUrl: str(process.env.PUBLIC_BASE_URL, 'http://localhost:4000').replace(/\/$/, ''),
  // The deployed mobile controller app's URL (e.g. a Vercel deployment). Falls
  // back to the backend serving /booth/session itself for same-origin/local setups.
  mobileAppUrl: str(process.env.MOBILE_APP_URL, '').replace(/\/$/, ''),
  corsOrigin: str(process.env.CORS_ORIGIN, '*'),

  videoProvider: str(process.env.VIDEO_PROVIDER, 'mock'),

  fal: {
    apiKey: str(process.env.FAL_API_KEY, ''),
    model: str(process.env.FAL_MODEL, 'fal-ai/wan-i2v')
  },
  replicate: {
    apiToken: str(process.env.REPLICATE_API_TOKEN, ''),
    model: str(process.env.REPLICATE_MODEL, 'wavespeedai/wan-2.1-i2v-480p')
  },
  huggingface: {
    apiKey: str(process.env.HF_API_KEY, ''),
    model: str(process.env.HF_MODEL, 'Wan-AI/Wan2.1-I2V-14B-480P')
  },

  selfieTtlMinutes: num(process.env.SELFIE_TTL_MINUTES, 30),
  videoTtlMinutes: num(process.env.VIDEO_TTL_MINUTES, 1440),
  sessionTtlMinutes: num(process.env.SESSION_TTL_MINUTES, 60),

  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 10)
};
