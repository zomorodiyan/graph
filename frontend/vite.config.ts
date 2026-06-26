import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env  = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_URL || '/'

  return {
    base,
    plugins: [
      react(),
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
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png',     purpose: 'any'      },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png',     purpose: 'maskable' },
            { src: 'icon.svg',     sizes: 'any',     type: 'image/svg+xml', purpose: 'any'      },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,png}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@api': path.resolve(__dirname, 'src/api/localClient.ts'),
      },
    },
  }
})
