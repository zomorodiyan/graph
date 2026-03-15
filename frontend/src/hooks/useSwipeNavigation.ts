import { useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigationHistory } from '../context/NavigationHistoryContext'

const SWIPE_THRESHOLD = 100 // minimum distance for swipe
const SWIPE_VERTICAL_LIMIT = 75 // max vertical movement to still count as horizontal swipe

/**
 * Hook that adds swipe gesture handlers for tree navigation
 * Swipe right: go one level up in tree hierarchy (toward main page), remembers where we were
 * Swipe left: go back to child path (only if we came up from there)
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
          // Swipe right = go up one level in tree (toward main page)
          const path = location.pathname
          
          if (path === '/') {
            // Already at root, do nothing
          } else if (path.startsWith('/g/')) {
            // Graph path: /g/{graphName}/... -> go to parent
            const parts = path.split('/').filter(Boolean) // ['g', 'graphName', ...rest]
            if (parts.length <= 2) {
              // At graph root (/g/graphName), go to main structures page
              navigateUp('/')
            } else {
              // Go to parent path within graph
              const parentPath = '/' + parts.slice(0, -1).join('/')
              navigateUp(parentPath)
            }
          } else {
            // Other paths - go to root
            navigateUp('/')
          }
        } else {
          // Swipe left = go back to child path (if we came from there)
          if (canGoForward()) {
            navigateForward()
          }
          // Otherwise do nothing
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
