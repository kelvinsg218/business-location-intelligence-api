import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The browser only ever talks to the origin that served the page. In development
// that is this dev server, which forwards "/api" (the JSON API, and "/api-docs",
// the Swagger UI) to the backend. That keeps the API same-origin, so the
// HttpOnly SameSite=Strict session cookie works and no CORS is needed.
//
// DEV_API_PROXY_TARGET is read by this config only (it has no VITE_ prefix, so it
// is never exposed to the browser); it is only useful when the backend does not
// listen on its default port.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api': { target: env.DEV_API_PROXY_TARGET || 'http://localhost:3000' } };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy,
    },
    preview: { proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      globals: false,
      // Tests must not depend on a developer's local .env: they always run
      // against the same-origin default (empty base URL).
      env: { VITE_API_BASE_URL: '' },
    },
  };
});
