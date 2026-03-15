import { useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNavigationHistory } from '../context/NavigationHistoryContext'

const SWIPE_THRESHOLD = 100 // minimum distance for swipe
const SWIPE_VERTICAL_LIMIT = 75 // max vertical movement to still count as horizontal swipe

/**
 * Hook that adds swipe gesture handlers for back/forward navigation
 * Swipe right: go back in history, or to parent path if no history
 * Swipe left: go forward in history
 */
export function useSwipeNavigation() {
  const { navigateBack, navigateForward, canGoBack } = useNavigationHistory()
  const location = useLocation()
  const navigate = useNavigate()
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
          // Swipe right = go back
          if (canGoBack()) {
            navigateBack()
          } else {
            // No back history - navigate to parent path
            const path = location.pathname
            if (path === '/') {
              // Already at root, do nothing
            } else if (path.startsWith('/g/')) {
              // Graph path: /g/{graphName}/... -> go to parent or main page
              const parts = path.split('/').filter(Boolean) // ['g', 'graphName', ...rest]
              if (parts.length <= 2) {
                // At graph root (/g/graphName), go to main structures page
                navigate('/')
              } else {
                // Go to parent path within graph
                const parentPath = '/' + parts.slice(0, -1).join('/')
                navigate(parentPath)
              }
            } else {
              // Other paths - go to root
              navigate('/')
            }
          }
        } else {
          // Swipe left = go forward
          navigateForward()
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
  }, [navigateBack, navigateForward, canGoBack, location.pathname, navigate])
}
