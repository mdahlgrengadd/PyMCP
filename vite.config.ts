import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  server: { port: 5173 },

  // Ensure Python files are served as text for Service Worker
  assetsInclude: ['**/*.py'],

  // Serve Service Worker from public directory
  publicDir: 'public',

  // Build configuration for Electron
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep file names predictable for Electron
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
