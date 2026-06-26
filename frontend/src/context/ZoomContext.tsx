import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 1.5
export const PINCH_ZOOM_STEP = 0.05
const SWIPE_ZOOM_STEP = 0.1
const STORAGE_KEY = 'graph-font-zoom'

interface ZoomContextType {
  zoom: number
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
}

const ZoomContext = createContext<ZoomContextType | null>(null)

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
          return parsed
        }
      }
    }
    return 1.0
  })

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom * 100}%`
    localStorage.setItem(STORAGE_KEY, zoom.toString())
  }, [zoom])

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)))
  }, [])

  const zoomIn = useCallback(() => {
    setZoomState(prev => Math.min(MAX_ZOOM, Math.round((prev + SWIPE_ZOOM_STEP) * 10) / 10))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomState(prev => Math.max(MIN_ZOOM, Math.round((prev - SWIPE_ZOOM_STEP) * 10) / 10))
  }, [])

  return (
    <ZoomContext.Provider value={{ zoom, setZoom, zoomIn, zoomOut }}>
      {children}
    </ZoomContext.Provider>
  )
}

export function useZoom() {
  const context = useContext(ZoomContext)
  if (!context) throw new Error('useZoom must be used within ZoomProvider')
  return context
}
