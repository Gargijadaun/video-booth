const { Server } = require('socket.io');
const config = require('../config');

let io = null;

function publicSession(session) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    status: session.status,
    templateId: session.templateId,
    videoId: session.videoId,
    videoUrl: session.videoUrl,
    thumbnailUrl: session.thumbnailUrl,
    error: session.error,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt
  };
}

function setupWebSocket(httpServer, sessionStore) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    socket.data.sessionId = null;
    socket.data.role = null;

    socket.on('holobox:join', ({ sessionId } = {}) => {
      const session = sessionStore.get(sessionId);
      if (!session) {
        socket.emit('ERROR', { message: 'Session not found or expired.' });
        return;
      }
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.role = 'holobox';
      session.holoboxSocketId = socket.id;
      socket.emit('SESSION_STATE', publicSession(session));
    });

    socket.on('phone:join', ({ sessionId } = {}) => {
      const session = sessionStore.get(sessionId);
      if (!session) {
        socket.emit('ERROR', { message: 'This session has expired. Please scan the QR code again.' });
        return;
      }
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.role = 'phone';
      session.phoneSocketId = socket.id;
      if (session.status === 'WAITING_FOR_PHONE') {
        sessionStore.update(sessionId, { status: 'PHONE_CONNECTED' });
      }
      const updated = sessionStore.get(sessionId);
      socket.emit('SESSION_CONNECTED', publicSession(updated));
      broadcast(sessionId, 'PHONE_CONNECTED', publicSession(updated));
      broadcast(sessionId, 'SESSION_STATE', publicSession(updated));
    });

    socket.on('select_template', ({ sessionId, templateId } = {}) => {
      const session = sessionStore.get(sessionId);
      if (!session) {
        socket.emit('ERROR', { message: 'Session not found or expired.' });
        return;
      }
      const updated = sessionStore.update(sessionId, { status: 'TEMPLATE_SELECTED', templateId });
      broadcast(sessionId, 'TEMPLATE_SELECTED', { templateId });
      broadcast(sessionId, 'SESSION_STATE', publicSession(updated));
    });

    socket.on('reset_session', ({ sessionId } = {}) => {
      const session = sessionStore.get(sessionId);
      if (!session) return;
      const updated = sessionStore.reset(sessionId);
      broadcast(sessionId, 'RESET', {});
      broadcast(sessionId, 'SESSION_STATE', publicSession(updated));
    });

    socket.on('disconnect', () => {
      const { sessionId, role } = socket.data;
      if (!sessionId) return;
      const session = sessionStore.get(sessionId);
      if (!session) return;
      if (role === 'holobox' && session.holoboxSocketId === socket.id) {
        session.holoboxSocketId = null;
      }
      if (role === 'phone' && session.phoneSocketId === socket.id) {
        session.phoneSocketId = null;
        broadcast(sessionId, 'PHONE_DISCONNECTED', {});
      }
    });
  });

  return io;
}

function broadcast(sessionId, event, payload) {
  if (!io) return;
  io.to(sessionId).emit(event, payload);
}

function getIO() {
  return io;
}

module.exports = { setupWebSocket, broadcast, getIO, publicSession };
