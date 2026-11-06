import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    // og/index.html is the share-preview card (src/og.tsx); scripts/build-og-images.mjs screenshots it into dist/og/*.png.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        og: fileURLToPath(new URL('./og/index.html', import.meta.url)),
      },
    },
  },
})
