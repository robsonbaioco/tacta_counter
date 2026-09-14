import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG app icons in public/ from public/icon.svg: `npm run icons`.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#121216' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#121216' } },
  },
  images: ['public/icon.svg'],
});
