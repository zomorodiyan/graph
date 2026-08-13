import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// registerType: 'autoUpdate' (vite.config.ts) only bakes skipWaiting/clientsClaim
// into the generated service worker itself — it does NOT, on its own, make an
// already-open tab pick up a new deploy. Without this call, the app was relying
// solely on the plugin's auto-injected bare `navigator.serviceWorker.register()`
// script, which has no update-detection logic at all, so a new deploy stayed
// invisible until the user happened to hard-reload enough times to race past
// the old SW's cache. This sets up the actual periodic check + auto-reload.
registerSW({ immediate: true })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
