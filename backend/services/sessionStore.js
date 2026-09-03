const { nanoid } = require('nanoid');
const config = require('../config');

/**
 * In-memory session store. A "session" is one HoloBox booth run: it is created
 * when the HoloBox boots the QR screen, and lives until it expires or is reset.
 * Sessions are intentionally ephemeral - nothing here is meant to survive a restart.
 */

const STATES = [
  'WAITING_FOR_PHONE',
  'PHONE_CONNECTED',
  'TEMPLATE_SELECTED',
  'WAITING_FOR_SELFIE',
  'SELFIE_UPLOADED',
  'GENERATING',
  'VIDEO_READY',
  'PLAYING',
  'SHARING',
  'COMPLETED',
  'FAILED'
];

class SessionStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.sessions = new Map();
    /** @type {Map<string, object>} */
    this.videos = new Map(); // videoId -> { sessionId, path, thumbnailPath, expiresAt }
  }

  createSession() {
    const sessionId = nanoid(12);
    const now = Date.now();
    const session = {
      sessionId,
      status: 'WAITING_FOR_PHONE',
      templateId: null,
      selfiePath: null,
      selfieExpiresAt: null,
      videoId: null,
      videoUrl: null,
      thumbnailUrl: null,
      jobId: null,
      error: null,
      createdAt: now,
      expiresAt: now + config.sessionTtlMinutes * 60 * 1000,
      holoboxSocketId: null,
      phoneSocketId: null
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  touch(sessionId) {
    const session = this.get(sessionId);
    if (!session) return null;
    session.expiresAt = Date.now() + config.sessionTtlMinutes * 60 * 1000;
    return session;
  }

  update(sessionId, patch) {
    const session = this.get(sessionId);
    if (!session) return null;
    Object.assign(session, patch);
    this.touch(sessionId);
    return session;
  }

  reset(sessionId) {
    return this.update(sessionId, {
      status: 'PHONE_CONNECTED',
      templateId: null,
      selfiePath: null,
      selfieExpiresAt: null,
      videoId: null,
      videoUrl: null,
      thumbnailUrl: null,
      jobId: null,
      error: null
    });
  }

  delete(sessionId) {
    this.sessions.delete(sessionId);
  }

  registerVideo(videoId, data) {
    this.videos.set(videoId, data);
  }

  getVideo(videoId) {
    return this.videos.get(videoId) || null;
  }

  deleteVideo(videoId) {
    this.videos.delete(videoId);
  }

  /** Sweep expired sessions/videos and return the removed items so the caller can clean up files. */
  sweepExpired() {
    const now = Date.now();
    const expiredSessions = [];
    const expiredVideos = [];

    for (const session of this.sessions.values()) {
      if (session.expiresAt < now) {
        expiredSessions.push(session);
        this.sessions.delete(session.sessionId);
      } else if (session.selfiePath && session.selfieExpiresAt && session.selfieExpiresAt < now) {
        expiredSessions.push({ selfieOnly: true, ...session });
        session.selfiePath = null;
        session.selfieExpiresAt = null;
      }
    }

    for (const video of this.videos.values()) {
      if (video.expiresAt < now) {
        expiredVideos.push(video);
        this.videos.delete(video.videoId);
      }
    }

    return { expiredSessions, expiredVideos };
  }
}

module.exports = { SessionStore, STATES };
