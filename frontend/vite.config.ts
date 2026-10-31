import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in dev as in production (behind the reverse proxy), so cookies need no CORS tricks.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
