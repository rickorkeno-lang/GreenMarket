import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      // Обход CORS для локальной разработки (бриф, раздел 10; CORS на бэке
      // настроен 29.07, HTTPS-домен поднят 30.07). В проде используется
      // VITE_API_BASE напрямую, прокси в билд не попадает.
      '/api/v1/catalog': {
        target: 'https://testapi.vnespecplanpodaz.online',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
