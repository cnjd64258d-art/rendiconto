import { readFile } from 'node:fs/promises';
import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

// Icons, apple-touch-icon and iOS splash screens are generated at build time
// from a single SVG, so no binary images live in the repository.
const iPhones = [
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone Air',
  'iPhone 17',
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16 Plus',
  'iPhone 16',
  'iPhone 16e',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 14 Plus',
  'iPhone 13 mini',
  'iPhone 11 Pro Max',
  'iPhone 11',
  'iPhone SE 4.7"',
] as const;

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: { background: '#F7F6F3', fit: 'contain' } },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#F7F6F3', fit: 'contain' } },
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.35,
        darkImageResolver: () => readFile('public/logo-dark.svg'),
        resizeOptions: { background: '#FFFFFF', fit: 'contain' },
        darkResizeOptions: { background: '#000000', fit: 'contain' },
        linkMediaOptions: { log: false, addMediaScreen: true, xhtml: false },
        png: { compressionLevel: 9, quality: 70 },
      },
      [...iPhones],
    ),
  },
  images: ['public/logo.svg'],
});
