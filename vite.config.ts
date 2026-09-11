import { defineConfig } from 'vitest/config';

// Served from https://<user>.github.io/tacta_counter/ on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/tacta_counter/',
  worker: { format: 'es' },
  test: {
    testTimeout: 60_000,
  },
});
