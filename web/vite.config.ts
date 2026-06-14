import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // tanstackRouter must come before the react plugin
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // The SPA calls /api/* → the Rust Lambda. Run `cargo lambda watch` for a
      // local backend, or set API_PROXY_TARGET to a deployed URL. Proxying keeps
      // the browser same-origin, so there's no CORS to configure in dev.
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
