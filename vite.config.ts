import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  server: { port: 5173 },

  // Ensure Python files are served as text for Service Worker
  assetsInclude: ['**/*.py'],

  // Serve Service Worker from public directory
  publicDir: 'public'
});
