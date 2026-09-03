import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api, /media and /socket.io to the backend so the
// phone app can be run standalone with `npm run dev` during development.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/media': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true }
    }
  }
});
