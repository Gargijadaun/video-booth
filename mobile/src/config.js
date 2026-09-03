// Backend base URL. Empty string = same-origin (local dev via the Vite proxy,
// or a same-origin production deploy). Set VITE_API_BASE_URL when the mobile
// app is deployed separately from the backend (e.g. mobile on Vercel, backend
// on Render) - e.g. https://your-backend.onrender.com
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
