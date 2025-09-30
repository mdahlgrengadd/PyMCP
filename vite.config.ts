import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm']
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-webllm': ['@mlc-ai/web-llm'],
          'vendor-markdown': ['marked', 'dompurify'],
          'vendor-validation': ['ajv']
        }
      }
    },
    chunkSizeWarningLimit: 2000
  }
});
