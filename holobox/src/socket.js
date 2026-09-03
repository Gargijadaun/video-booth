import { io } from 'socket.io-client';
import { API_BASE } from './config.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || '/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
  }
  return socket;
}
