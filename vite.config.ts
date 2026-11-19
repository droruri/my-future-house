import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { z } from 'zod';

export default defineConfig(({ mode }) => {
  // Same PORT (from .env or the shell) and default as server/index.ts.
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = z.coerce.number().int().min(1).max(65535).catch(8787).parse(env['PORT']);
  return {
    plugins: [react(), tailwindcss()],
    server: { host: '127.0.0.1', proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
  };
});
