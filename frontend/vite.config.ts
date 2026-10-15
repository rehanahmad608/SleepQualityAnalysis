/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Hermetic tests: never pick up a developer's frontend/.env.local (real Supabase settings).
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_API_BASE_URL: '',
      VITE_PASSWORD_RECOVERY_REDIRECT_URL: '',
      VITE_PASSWORD_MIN_LENGTH: '',
    },
  },
});
