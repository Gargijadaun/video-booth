# HoloBox AI Video Booth

A two-screen AI video booth: a **HoloBox display** (1080×1920) shows a QR code, plays the
final cinematic video, and shows a share QR at the end. A **phone**, opened by scanning
that QR, is the controller: pick a template, take a selfie, watch generation progress,
then download/share the result. Both are tied together by a Node/Express + Socket.IO
backend and a session id.

```
holobox/   React app for the big vertical display
mobile/    React app that runs on the guest's phone
backend/   Express + Socket.IO server, AI provider abstraction, temp storage
```

## How it works

```
HoloBox boots -> POST /api/session -> QR code (links to /booth/session/{id})
   -> phone scans QR -> phone:join over WebSocket -> HoloBox shows "Get Ready"
   -> phone picks a template -> phone takes a selfie -> POST .../selfie
   -> POST .../generate -> backend calls the AI provider, polls it, upscales
      the result to 1080x1920 with ffmpeg -> WebSocket GENERATION_COMPLETE
   -> HoloBox autoplays the video full-screen, phone shows Download/Share
   -> SHARE mints a signed-looking /video/{id} page + QR for a second phone
   -> CREATE ANOTHER VIDEO resets the session (same phone, no re-scan needed)
```

Session state lives only in memory on the backend and is swept on a timer
(`backend/utils/cleanup.js`) - selfies, generated videos and sessions all
expire and get deleted from disk automatically (see `.env` TTLs below).

## AI video generation

Video generation sits behind one interface, `VideoGenerationProvider`
(`backend/services/videoGenerator/index.js`):

```js
startJob({ imageBuffer, imageMimeType, prompt, negativePrompt, durationSeconds, aspectRatio })
  -> { providerJobId }
checkJob(providerJobId)
  -> { status: 'processing' | 'completed' | 'failed', progress?, videoUrl?, videoBuffer?, error? }
```

Implementations ship for:

- **`fal`** (recommended) - [fal.ai](https://fal.ai), image-to-video (Wan 2.2 / Kling / etc).
  Pay-as-you-go with a free trial credit; simplest queue-based API.
- **`replicate`** - [replicate.com](https://replicate.com), same idea, different queue API.
- **`huggingface`** - [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers),
  synchronous call wrapped in the same async contract.
- **`mock`** (default, no API key needed) - builds a Ken-Burns-style animated
  clip from the selfie with ffmpeg so you can exercise the *entire* pipeline
  (upload -> generate -> upscale -> deliver -> play on HoloBox -> share) with
  zero external dependencies. Switch `VIDEO_PROVIDER` once you have a key.

Whatever the provider returns, `backend/services/videoGenerator/upscale.js`
scales-to-cover and center-crops it (never stretches) to the final delivery
format: **1080×1920, 30fps, H.264 MP4**, plus a JPG thumbnail.

Templates (10 total: 5 male, 5 female) and their prompts live in
`backend/templates/templates.json` - edit/add/disable templates there, no
code changes needed. Placeholder gradient thumbnails are in
`backend/templates/assets/*.svg`; replace with real preview art/video whenever
you have it.

## Running it

Requires Node 18+.

```bash
npm run install:all        # installs backend, mobile, holobox
cp backend/.env.example backend/.env   # then edit as needed
npm run dev                 # runs backend (4000), mobile (5173), holobox (5174)
```

Open `http://localhost:5174` for the HoloBox display and follow the QR
(in dev it points at `PUBLIC_BASE_URL`, so set that to an address your phone
can actually reach, e.g. your machine's LAN IP: `http://192.168.1.23:4000`).

For a real event: build both frontends and let the backend serve everything
from one origin (simplest for a kiosk box and for QR codes to work over LAN):

```bash
npm run build                # builds mobile/dist and holobox/dist
PUBLIC_BASE_URL=http://<kiosk-ip>:4000 npm run start --prefix backend
```

Then point the HoloBox's kiosk browser at `http://<kiosk-ip>:4000/holobox`.

### Environment variables (`backend/.env`)

| Variable | Purpose |
|---|---|
| `PORT`, `PUBLIC_BASE_URL`, `CORS_ORIGIN` | Server basics. `PUBLIC_BASE_URL` is baked into share-video QR codes and links. |
| `MOBILE_APP_URL` | URL of the separately-deployed mobile app (e.g. Vercel). Baked into the HoloBox's join QR. Leave blank for same-origin/local setups. |
| `VIDEO_PROVIDER` | `fal` \| `replicate` \| `huggingface` \| `mock` |
| `FAL_API_KEY`, `FAL_MODEL` | fal.ai auth + model id |
| `REPLICATE_API_TOKEN`, `REPLICATE_MODEL` | Replicate auth + model id |
| `HF_API_KEY`, `HF_MODEL` | Hugging Face auth + model id |
| `SELFIE_TTL_MINUTES` / `VIDEO_TTL_MINUTES` / `SESSION_TTL_MINUTES` | Auto-delete timers |
| `MAX_UPLOAD_MB` | Selfie upload size cap |

API keys only ever live in `backend/.env` / server env - neither frontend ever
sees them.

## Production deployment (split hosting: Vercel + Render)

Vercel serves static frontends, not long-running stateful servers (Socket.IO
connections, local disk storage, multi-minute ffmpeg/AI polling jobs). So this
app deploys as **three separate services**:

| Service | Where | What |
|---|---|---|
| `holobox/` | Vercel | Static SPA, deployed at its own domain |
| `mobile/` | Vercel | Static SPA, deployed at its own domain |
| `backend/` | Render (or Railway/Fly/any Node host) | The stateful Express + Socket.IO + ffmpeg server |

### 1. Backend on Render

A Blueprint is already checked in at the repo root (`render.yaml`, pointing
`rootDir: backend`). In the Render dashboard: **New +** -> **Blueprint** ->
connect this GitHub repo -> Render detects `render.yaml` and creates the web
service. Fill in the `sync: false` env vars it prompts for:

- `FAL_API_KEY` - your fal.ai key
- `PUBLIC_BASE_URL` - the Render service's own URL once assigned, e.g. `https://holobox-video-booth-backend.onrender.com` (redeploy after setting it)
- `MOBILE_APP_URL` - the mobile app's Vercel URL (step 2)

Render's free plan spins the service down after inactivity - the first
request after idle will be slow (cold start) while it spins back up.

### 2. Frontends on Vercel

Each of `holobox/` and `mobile/` is its own Vercel project (`vercel --prod`
from inside each directory, or connect the repo in the Vercel dashboard with
that directory as the project root). Both need one env var pointing at the
backend from step 1:

```
VITE_API_BASE_URL=https://holobox-video-booth-backend.onrender.com
```

Set it in the Vercel project's Settings -> Environment Variables, then
redeploy (env vars are baked in at build time, so a redeploy is required
after changing one). Without it, both apps fall back to same-origin calls,
which only works when the backend serves them itself (the local/kiosk setup
in "Running it" above).

### 3. Wire it together

Once both are deployed: put the mobile app's Vercel URL into the backend's
`MOBILE_APP_URL` and the backend's own Render URL into `PUBLIC_BASE_URL`,
redeploy the backend, and redeploy both frontends with `VITE_API_BASE_URL`
set. The HoloBox's QR will then point guests at the Vercel-hosted mobile app,
and both frontends will talk to the Render backend for everything else
(templates, selfie upload, generation, share links, media playback).

## Notes on scope / pragmatic choices

- **Face guidance** on the phone uses the browser's native `FaceDetector` API
  where available (Chrome/Android WebView), plus a brightness check, purely
  for UX framing feedback. The real validation is server-side
  (`backend/services/faceProcessor.js`, via `sharp`) - dimensions, format,
  re-encoding, EXIF-safe orientation. No face-recognition model is bundled;
  identity preservation is delegated to the chosen AI provider's
  image-to-video model, which is what actually needs to hold the face steady
  across the generated frames.
- **Storage** is local disk under `backend/data/` (selfies/videos/thumbnails),
  swept by a timer. Swap `backend/services/storage.js` for S3/GCS if you need
  multi-box/multi-region deployment - nothing else in the app depends on it
  being local disk.
- **Gallery** ("saved videos" button on the phone) is a per-device
  `localStorage` list of the videos that phone generated, since the booth has
  no accounts by design (section: "no account required").
- Character names like Spider-Man/Batman/etc. are intentionally **not** used
  anywhere - templates are original genre-alike characters per the brief.
