import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://<user>.github.io/tacta_counter/ on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/tacta_counter/',
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      // The service worker only caches the app's own files so it opens offline; photos are never stored.
      // A new version is picked up on the next launch, never by reloading a page with a photo in progress.
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeManifestIcons: false, // already matched by globPatterns
      manifest: {
        id: './',
        name: 'Contador Tacta',
        short_name: 'Tacta',
        description: 'Tire uma foto da mesa no fim da partida de Tacta e veja quantos pontos cada cor fez.',
        lang: 'pt-BR',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#121216',
        background_color: '#121216',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    testTimeout: 60_000,
  },
});
