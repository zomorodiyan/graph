import { useRef, useState } from 'react'

// Exported so GraphView's background swipe-to-go-back (a separate, single-
// instance gesture, not per-row) uses the exact same feel as row swipes.
export const SWIPE_THRESHOLD = 50
export const SWIPE_VERTICAL_LIMIT = 75
// How far a row visually follows the finger before clamping — purely
// cosmetic, independent of SWIPE_THRESHOLD (which still governs whether the
// gesture actually fires on release).
const MAX_VISUAL_OFFSET = 72

export interface SwipeDrag {
  id: string
  offsetX: number
  // Whether the direction currently being dragged toward is a wired-up
  // action for this row — lets the row show "this will do something" vs.
  // "this is disabled" (e.g. swipe-right where sub-items aren't allowed)
  // instead of dragging just as far either way with no distinction.
  active: boolean
}

// Per-item horizontal swipe: left = navigate into it, right = navigate up
// the tree (same action everywhere — items and background alike, see
// GraphView's handleNavigateBack; this hook only knows left/right).
// Call once per list (not per row — a component rendering N item rows in a
// loop can't call a hook N times) to get a factory that builds touch
// handlers for each row, sharing one in-progress-touch ref so only one row
// reacts to any given gesture, plus the current drag (for visual feedback)
// so the dragged row can follow the finger and others stay still.
export function useItemSwipe() {
  const start = useRef<{ x: number; y: number; id: string } | null>(null)
  const [drag, setDrag] = useState<SwipeDrag | null>(null)

  // onSwipeLeft/onSwipeRight are null when that direction isn't wired up for
  // this row (e.g. layer3 never allows adding a sub-item) — passing null
  // instead of a callback that silently no-ops lets the drag feedback show
  // the difference, and removeDrag/onTouchEnd naturally do nothing for it.
  function makeSwipeHandlers(id: string, onSwipeLeft: (() => void) | null, onSwipeRight: (() => void) | null) {
    return {
      onTouchStart(e: React.TouchEvent) {
        if (e.touches.length !== 1) {
          start.current = null
          setDrag(null)
          return
        }
        // Claim the gesture so it doesn't also reach a background-level
        // swipe handler (see GraphView.tsx's background swipe-to-go-back).
        e.stopPropagation()
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id }
        setDrag({ id, offsetX: 0, active: false })
      },
      onTouchMove(e: React.TouchEvent) {
        const s = start.current
        if (!s || s.id !== id) return
        const deltaX = e.touches[0].clientX - s.x
        const deltaY = Math.abs(e.touches[0].clientY - s.y)
        if (deltaY > SWIPE_VERTICAL_LIMIT) return // vertical scroll — don't react visually
        e.stopPropagation()
        const clamped = Math.max(-MAX_VISUAL_OFFSET, Math.min(MAX_VISUAL_OFFSET, deltaX))
        const wired = clamped < 0 ? !!onSwipeLeft : clamped > 0 ? !!onSwipeRight : false
        setDrag({ id, offsetX: clamped, active: wired && Math.abs(deltaX) > SWIPE_THRESHOLD })
      },
      onTouchEnd(e: React.TouchEvent) {
        const s = start.current
        start.current = null
        setDrag(null)
        if (!s || s.id !== id) return
        e.stopPropagation()
        const deltaX = e.changedTouches[0].clientX - s.x
        const deltaY = Math.abs(e.changedTouches[0].clientY - s.y)
        if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
          if (deltaX < 0) onSwipeLeft?.()
          else onSwipeRight?.()
        }
      },
      onTouchCancel() {
        if (start.current?.id === id) {
          start.current = null
          setDrag(null)
        }
      },
    }
  }

  return { makeSwipeHandlers, drag }
}
