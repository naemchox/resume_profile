import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * index.html is NOT the app entry. It is the built, self-contained page that
 * Live Server opens — CSS and JS inlined, no build step needed to view it.
 *
 * The real Vite entry is index.vite.html. Keeping the two roles in two separate
 * files is the whole point: while they shared the name index.html, every build
 * put the empty template back over the built page and the site went white until
 * someone rebuilt it. Now a build cannot clobber the file people open.
 *
 * Dev server:  npm run dev        (opens /index.vite.html)
 * Rebuild the standalone page:    npm run standalone
 */
const entry = fileURLToPath(new URL('index.vite.html', import.meta.url))

export default defineConfig({
  plugins: [react()],
  server: { open: '/index.vite.html' },
  build: { rollupOptions: { input: entry } },
})
