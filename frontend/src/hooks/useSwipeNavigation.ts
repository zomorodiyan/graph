import { useRef, useEffect } from 'react'
import { useZoom } from '../context/ZoomContext'

const SWIPE_THRESHOLD = 50
const SWIPE_VERTICAL_LIMIT = 75

/**
 * Single-finger horizontal swipe: right = zoom in, left = zoom out.
 * Two-finger pinch is handled separately by usePinchZoom.
 */
export function useSwipeNavigation() {
  const { zoomIn, zoomOut } = useZoom()
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
      } else {
        // Multi-touch (pinch) — cancel swipe tracking
        touchStartX.current = null
        touchStartY.current = null
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return

      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY
      const deltaX = touchEndX - touchStartX.current
      const deltaY = Math.abs(touchEndY - touchStartY.current)

      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
        if (deltaX > 0) {
          zoomIn()
        } else {
          zoomOut()
        }
      }

      touchStartX.current = null
      touchStartY.current = null
    }

    document.addEventListener('touchstart', handleTouchStart)
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [zoomIn, zoomOut])
}
