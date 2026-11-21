import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
const commit = (process.env.GITHUB_SHA ?? 'dev').slice(0, 7);

// GitHub Pages serves the app from https://<user>.github.io/rendiconto/
const base = '/rendiconto/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt": the new service worker waits until the user taps "Aggiorna".
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        id: base,
        name: 'Rendiconto',
        short_name: 'Rendiconto',
        description: 'Le tue finanze di tutti i giorni, solo sul tuo iPhone.',
        lang: 'it-IT',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        categories: ['finance', 'productivity'],
        shortcuts: [
          {
            name: 'Aggiungi spesa',
            short_name: 'Aggiungi',
            description: 'Registra subito una nuova spesa',
            url: `${base}?add=1`,
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // iOS snapshots splash screens at install time; no need to precache ~40 PNGs.
        globIgnores: ['**/apple-splash-*'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
