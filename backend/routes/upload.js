const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const config = require('../config');
const { processSelfie, ValidationError } = require('../services/faceProcessor');
const { SELFIES_DIR, safeUnlink } = require('../services/storage');
const { broadcast, publicSession } = require('../services/websocket');

const MAX_ANGLES = 3;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new ValidationError('Unsupported file type. Please use JPEG, PNG or WebP.'));
    }
    cb(null, true);
  }
});

module.exports = function createUploadRouter(sessionStore) {
  const router = express.Router();

  // Accepts 1-3 angle photos (field name "selfies", repeated) so the face-swap
  // step can be given multiple reference angles instead of just one frontal
  // shot. Still works fine with a single photo for callers that only send one.
  router.post('/session/:id/selfie', (req, res) => {
    upload.array('selfies', MAX_ANGLES)(req, res, async (err) => {
      if (err) {
        const message = err instanceof ValidationError ? err.message : 'Upload failed. Please try again.';
        return res.status(400).json({ error: message });
      }

      const session = sessionStore.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired.' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No photo received. Please take another photo.' });
      }

      try {
        const processed = await Promise.all(req.files.map((f) => processSelfie(f.buffer)));

        // Replace any previous selfies for this session.
        for (const p of session.selfiePaths || []) safeUnlink(p);

        const filePaths = processed.map(({ buffer }) => {
          const filePath = path.join(SELFIES_DIR, `${nanoid(16)}.jpg`);
          fs.writeFileSync(filePath, buffer);
          return filePath;
        });

        const selfieExpiresAt = Date.now() + config.selfieTtlMinutes * 60 * 1000;
        const updated = sessionStore.update(req.params.id, {
          status: 'SELFIE_UPLOADED',
          selfiePaths: filePaths,
          selfieExpiresAt
        });

        broadcast(req.params.id, 'SELFIE_UPLOADED', {});
        broadcast(req.params.id, 'SESSION_STATE', publicSession(updated));

        res.json({ session: publicSession(updated) });
      } catch (e) {
        const message = e instanceof ValidationError ? e.message : 'Could not process the photo. Please take another photo.';
        res.status(400).json({ error: message });
      }
    });
  });

  return router;
};
