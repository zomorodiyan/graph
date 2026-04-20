import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isOffline = env.VITE_OFFLINE_MODE === 'true'
  const base = env.VITE_BASE_URL || '/'

  return {
    base,
    plugins: [
      react(),
      ...(isOffline
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              manifest: {
                name: 'Knowledge Graph',
                short_name: 'Graph',
                description: 'Offline knowledge graph editor',
                theme_color: '#1a1a2e',
                background_color: '#1a1a2e',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/graph/',
                icons: [
                  { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,ico,svg}'],
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@api': isOffline
          ? path.resolve(__dirname, 'src/api/localClient.ts')
          : path.resolve(__dirname, 'src/api/client.ts'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
