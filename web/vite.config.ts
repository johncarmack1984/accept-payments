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
      // The SPA calls /sessions/:id same-origin; in dev, forward it to the Rust
      // Lambda (cargo lambda watch, or API_PROXY_TARGET). In production the
      // Lambda serves the SPA, so the same path is already same-origin.
      '/sessions': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
})
