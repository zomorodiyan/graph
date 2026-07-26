import { useRef } from 'react'

const SWIPE_THRESHOLD = 50
const SWIPE_VERTICAL_LIMIT = 75

// Per-item horizontal swipe: left = edit, right = add sub-item. Replaces the
// old document-wide swipe-to-zoom gesture. Call once per list (not per row —
// a component rendering N item rows in a loop can't call a hook N times) to
// get a factory that builds touch handlers for each row, sharing one
// in-progress-touch ref so only one row reacts to any given gesture.
export function useItemSwipe() {
  const start = useRef<{ x: number; y: number } | null>(null)

  function makeSwipeHandlers(onSwipeLeft: () => void, onSwipeRight: () => void) {
    return {
      onTouchStart(e: React.TouchEvent) {
        if (e.touches.length !== 1) {
          start.current = null
          return
        }
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      },
      onTouchEnd(e: React.TouchEvent) {
        const s = start.current
        start.current = null
        if (!s) return
        const deltaX = e.changedTouches[0].clientX - s.x
        const deltaY = Math.abs(e.changedTouches[0].clientY - s.y)
        if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
          if (deltaX < 0) onSwipeLeft()
          else onSwipeRight()
        }
      },
    }
  }

  return makeSwipeHandlers
}
