import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const API = 'http://localhost:5252';
const proxy = Object.fromEntries(
  ['/rest', '/auth', '/meta', '/storage'].map((p) => [p, { target: API, changeOrigin: true }]),
);
proxy['/realtime'] = { target: API, ws: true, changeOrigin: true };

export default defineConfig({
  plugins: [react(), tailwind()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5253, proxy },
});
