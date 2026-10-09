import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
