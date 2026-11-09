import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Cabeceras de seguridad del front compilado (`vite preview`). El front y la API comparten origen (proxy `/api`),
// así que todo es 'self'. Solo para preview: una CSP en `vite dev` rompe el HMR (inyecta scripts y un WebSocket).
// Avisos de ZAP aceptados (informativos, medidos): Cross-Origin-Embedder-Policy (no hay recursos de otros orígenes que aislar),
// Cache-Control 10049 (avisa igual con no-cache que con no-store, probado) y «Modern Web Application» (solo detecta que es una SPA).
export const CABECERAS_PREVIEW: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Solo loopback, como la API; el proxy deja front y API en el mismo origen.
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3100' } },
  // El front compilado (`vite preview`) lleva las cabeceras de seguridad; `vite dev` no (una CSP rompe el HMR).
  preview: { headers: CABECERAS_PREVIEW },
  test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], include: ['test/**/*.test.{ts,tsx}'] },
});
