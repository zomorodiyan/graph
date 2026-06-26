import { useRef, useEffect, useCallback } from 'react'
import { useZoom, MIN_ZOOM, MAX_ZOOM, PINCH_ZOOM_STEP } from '../context/ZoomContext'

export function usePinchZoom() {
  const { zoom, setZoom } = useZoom()
  const initialDistance = useRef<number | null>(null)
  const initialZoom = useRef<number>(zoom)

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

        let newZoom = initialZoom.current * (1 + (scale - 1) * 0.5)
        newZoom = Math.round(newZoom / PINCH_ZOOM_STEP) * PINCH_ZOOM_STEP
        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))

        setZoom(newZoom)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDistance.current = null
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: false })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [zoom, getDistance, setZoom])

  return { zoom }
}
