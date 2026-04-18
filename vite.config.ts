import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts'
  }
});
