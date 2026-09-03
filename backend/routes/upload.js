const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const config = require('../config');
const { processSelfie, ValidationError } = require('../services/faceProcessor');
const { SELFIES_DIR, safeUnlink } = require('../services/storage');
const { broadcast, publicSession } = require('../services/websocket');

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

  router.post('/session/:id/selfie', (req, res) => {
    upload.single('selfie')(req, res, async (err) => {
      if (err) {
        const message = err instanceof ValidationError ? err.message : 'Upload failed. Please try again.';
        return res.status(400).json({ error: message });
      }

      const session = sessionStore.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No photo received. Please take another photo.' });
      }

      try {
        const { buffer } = await processSelfie(req.file.buffer);

        // Replace any previous selfie for this session.
        safeUnlink(session.selfiePath);

        const filename = `${nanoid(16)}.jpg`;
        const filePath = path.join(SELFIES_DIR, filename);
        fs.writeFileSync(filePath, buffer);

        const selfieExpiresAt = Date.now() + config.selfieTtlMinutes * 60 * 1000;
        const updated = sessionStore.update(req.params.id, {
          status: 'SELFIE_UPLOADED',
          selfiePath: filePath,
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
