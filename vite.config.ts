import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm', '@wllama/wllama']
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
          'vendor-wllama': ['@wllama/wllama'],
          'vendor-markdown': ['marked', 'dompurify'],
          'vendor-validation': ['ajv']
        }
      }
    },
    chunkSizeWarningLimit: 2000
  },
  assetsInclude: ['**/*.wasm']
});
