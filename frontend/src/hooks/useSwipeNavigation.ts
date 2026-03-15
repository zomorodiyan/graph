import { useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigationHistory } from '../context/NavigationHistoryContext'

const SWIPE_THRESHOLD = 50 // minimum distance for swipe
const SWIPE_VERTICAL_LIMIT = 75 // max vertical movement to still count as horizontal swipe

/**
 * Hook that adds swipe gesture handlers for tree navigation
 * Swipe right: go one level up toward main page, push current to forward stack
 * Swipe left: pop from forward stack and navigate to that deeper path
 */
export function useSwipeNavigation() {
  const { navigateUp, navigateForward, canGoForward } = useNavigationHistory()
  const location = useLocation()
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return

      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY
      const deltaX = touchEndX - touchStartX.current
      const deltaY = Math.abs(touchEndY - touchStartY.current)

      // Check for horizontal swipe with limited vertical movement
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
        if (deltaX > 0) {
          // Swipe right = go up one level (toward main page)
          if (location.pathname !== '/') {
            navigateUp()
          }
        } else {
          // Swipe left = go back to deeper path (if we have forward history)
          if (canGoForward()) {
            navigateForward()
          }
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
  }, [navigateUp, navigateForward, canGoForward, location.pathname])
}
