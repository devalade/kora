import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { voidPlugin } from 'void';

export default defineConfig({
  plugins: [
    voidPlugin(),
    tailwindcss(),
    tanstackStart({ srcDirectory: 'app' }),
    react(),
  ],
  resolve: {
    alias: {
      '@': new URL('./app', import.meta.url).pathname,
    },
  },
});
