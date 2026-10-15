import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {rmSync} from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

let buildOutDir = 'dist';

export default defineConfig({
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Eurosol Solar CRM',
          short_name: 'Eurosol CRM',
          description: 'Eurosol Solar CRM - Manage leads, surveys, quotations, installations, inventory, payments and more',
          theme_color: '#ea580c',
          background_color: '#f8fafc',
          display: 'standalone',
          display_override: ['window-controls-overlay'],
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff}'],
          globIgnores: ['uploads/**'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // Sensitive CRM data should not be cached (M7) — use NetworkOnly for /v1
          runtimeCaching: [
            {
              urlPattern: /\/v1\/.*/i,
              handler: 'NetworkOnly',
              options: {},
            },
          ],
        },
      }),
      {
        name: 'remove-uploads-from-build',
        apply: 'build',
        configResolved(config) {
          buildOutDir = config.build.outDir;
        },
        closeBundle() {
          rmSync(path.resolve(buildOutDir, 'uploads'), {recursive: true, force: true});
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      hmr: false,
      proxy: {
        '/v1': {
          target: 'https://api.eurosolservice.com',
          changeOrigin: true,
          secure: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('proxy error', err);
            });
          },
        },
        '/uploads': {
          target: 'https://api.eurosolservice.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts'],
            'vendor-ui': ['lucide-react', 'sonner', '@base-ui/react'],
            'vendor-pdf': ['html2canvas', 'jspdf'],
            'vendor-motion': ['motion'],
          },
        },
      },
    },
});
