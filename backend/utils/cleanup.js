const { safeUnlink } = require('../services/storage');

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Periodically removes expired sessions, selfies and videos from disk and
 * from the in-memory store. This is what makes the "temporary storage /
 * auto-delete" privacy requirements actually happen instead of just being a
 * comment.
 */
function startCleanupSweeper(sessionStore) {
  const interval = setInterval(() => {
    const { expiredSessions, expiredVideos } = sessionStore.sweepExpired();

    for (const session of expiredSessions) {
      safeUnlink(session.selfiePath);
    }

    for (const video of expiredVideos) {
      safeUnlink(video.path);
      safeUnlink(video.thumbnailPath);
    }

    if (expiredSessions.length || expiredVideos.length) {
      console.log(`[cleanup] removed ${expiredSessions.length} session artifact(s), ${expiredVideos.length} video(s)`);
    }
  }, SWEEP_INTERVAL_MS);

  interval.unref();
  return interval;
}

module.exports = { startCleanupSweeper };
