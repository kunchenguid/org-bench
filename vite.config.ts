import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  test: {
    environment: 'jsdom',
  },
});
