import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const allowedHosts = ['lineup.hidenfree.com', 'localhost', '127.0.0.1'];
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is restricted to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts,
      port: Number(process.env.PORT) || 24622,
      host: '0.0.0.0',
      watch: {
        ignored: [
          '**/public/img/players/**',
          '**/public/img/players-uefa/**',
          '**/data/**',
        ],
      },
    },
    preview: {
      allowedHosts,
      host: '0.0.0.0',
    },
  };
});
