import { useRef, useEffect, useState, useCallback } from 'react'

const MIN_ZOOM = 0.7
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.05
const STORAGE_KEY = 'graph-font-zoom'

interface ZoomNotification {
  message: string
  type: 'limit' | 'normal'
}

/**
 * Hook that handles pinch gestures to control font size zoom
 * Returns current zoom level and notification state
 */
export function usePinchZoom() {
  // Load initial zoom from localStorage
  const [zoom, setZoom] = useState<number>(() => {
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
  
  const [notification, setNotification] = useState<ZoomNotification | null>(null)
  
  const initialDistance = useRef<number | null>(null)
  const initialZoom = useRef<number>(zoom)
  const notificationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Apply zoom to document
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom * 100}%`
    localStorage.setItem(STORAGE_KEY, zoom.toString())
  }, [zoom])

  const showNotification = useCallback((message: string, type: 'limit' | 'normal' = 'normal') => {
    if (notificationTimeout.current) {
      clearTimeout(notificationTimeout.current)
    }
    setNotification({ message, type })
    notificationTimeout.current = setTimeout(() => {
      setNotification(null)
    }, 1500)
  }, [])

  const getDistance = useCallback((touches: TouchList): number => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }, [])

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        initialDistance.current = getDistance(e.touches)
        initialZoom.current = zoom
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance.current !== null) {
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const scale = currentDistance / initialDistance.current
        
        let newZoom = initialZoom.current * scale
        
        // Clamp and notify
        if (newZoom <= MIN_ZOOM) {
          newZoom = MIN_ZOOM
          if (zoom !== MIN_ZOOM) {
            showNotification('Minimum zoom', 'limit')
          }
        } else if (newZoom >= MAX_ZOOM) {
          newZoom = MAX_ZOOM
          if (zoom !== MAX_ZOOM) {
            showNotification('Maximum zoom', 'limit')
          }
        }
        
        // Round to nearest step for smoother changes
        newZoom = Math.round(newZoom / ZOOM_STEP) * ZOOM_STEP
        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
        
        if (newZoom !== zoom) {
          setZoom(newZoom)
        }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDistance.current = null
      }
    }

    // Use passive: false to allow preventDefault
    document.addEventListener('touchstart', handleTouchStart, { passive: false })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      if (notificationTimeout.current) {
        clearTimeout(notificationTimeout.current)
      }
    }
  }, [zoom, getDistance, showNotification])

  return { zoom, notification }
}
