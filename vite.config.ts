import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SamdoList',
        short_name: 'SamdoList',
        description: '개인용 시간관리 스터디 플래너',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-101.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-101.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})