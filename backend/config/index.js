require('dotenv').config();

function num(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  port: num(process.env.PORT, 4000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  // The deployed mobile controller app's URL (e.g. a Vercel deployment). Falls
  // back to the backend serving /booth/session itself for same-origin/local setups.
  mobileAppUrl: (process.env.MOBILE_APP_URL || '').replace(/\/$/, ''),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  videoProvider: process.env.VIDEO_PROVIDER || 'mock',

  fal: {
    apiKey: process.env.FAL_API_KEY || '',
    model: process.env.FAL_MODEL || 'fal-ai/wan-i2v'
  },
  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN || '',
    model: process.env.REPLICATE_MODEL || 'wavespeedai/wan-2.1-i2v-480p'
  },
  huggingface: {
    apiKey: process.env.HF_API_KEY || '',
    model: process.env.HF_MODEL || 'Wan-AI/Wan2.1-I2V-14B-480P'
  },

  selfieTtlMinutes: num(process.env.SELFIE_TTL_MINUTES, 30),
  videoTtlMinutes: num(process.env.VIDEO_TTL_MINUTES, 1440),
  sessionTtlMinutes: num(process.env.SESSION_TTL_MINUTES, 60),

  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 10)
};
