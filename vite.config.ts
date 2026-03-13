import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tegaaki',
        short_name: 'Tegaaki',
        description: '漢字辞典 Tegaaki — 手書きで引ける漢字辞典',
        start_url: '/',
        display: 'standalone',
        background_color: '#fafaf8',
        theme_color: '#fafaf8',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/model\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tegaaki-model',
              expiration: { maxAgeSeconds: 365 * 24 * 3600 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tegaaki-fonts',
              expiration: { maxAgeSeconds: 365 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
})
