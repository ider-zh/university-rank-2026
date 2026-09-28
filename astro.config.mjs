import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['lambdax220'],
  },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
