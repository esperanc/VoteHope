import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The API server listens on 127.0.0.1:3000 in development (see src/server/config.ts);
// "localhost" can resolve to ::1 and miss it, so the proxy uses the IPv4 address.
const api = 'http://127.0.0.1:3000';

export default defineConfig({
  root: 'src/client',
  plugins: [svelte({ configFile: false })],
  resolve: {
    // @vscode/markdown-it-katex depends on an older KaTeX; use our single copy.
    dedupe: ['katex'],
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    // The question renderer (KaTeX + markdown-it + DOMPurify) is ~650 kB minified,
    // ~210 kB gzipped; phones download it once and cache it permanently.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    // Keep the browser's Host header: the server builds join links from it.
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/media': { target: api, changeOrigin: false },
      '/socket.io': { target: api, ws: true, changeOrigin: false },
    },
  },
});
