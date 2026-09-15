import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The API server listens on 127.0.0.1:3000 in development (see src/server/config.ts);
// "localhost" can resolve to ::1 and miss it, so the proxy uses the IPv4 address.
const api = 'http://127.0.0.1:3000';

export default defineConfig({
  root: 'src/client',
  plugins: [svelte({ configFile: false })],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/media': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
