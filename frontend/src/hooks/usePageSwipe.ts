import { useCallback, useRef, useState } from 'react'

export const SWIPE_THRESHOLD = 50
export const SWIPE_VERTICAL_LIMIT = 75
// How far a row visually follows the finger before clamping — purely
// cosmetic, independent of SWIPE_THRESHOLD (which still governs whether the
// gesture actually fires on release).
const MAX_VISUAL_OFFSET = 72

export interface PageSwipeDrag {
  path: string
  offsetX: number
  // Whether the direction currently being dragged toward is a wired-up
  // action — lets the bubble show "this will do something" vs. "this is
  // disabled" instead of dragging just as far either way with no distinction.
  active: boolean
}

// Finds whichever rendered level-1 item — real OR a circular-scroll clone,
// both carry the same data-item-path (see Section.tsx) — currently occupies
// a given Y coordinate. Deliberately bounding-rect based, not
// elementFromPoint: clones are pointer-events: none so the browser's own
// hit-testing sees straight through them to whatever's behind, never their
// own data attribute — this is what actually lets a swipe starting on a
// clone (a real gap before this hook existed) resolve to the real item it's
// standing in for.
function itemPathAtY(container: HTMLElement, y: number): string | null {
  const els = container.querySelectorAll<HTMLElement>('[data-item-path]')
  for (let i = 0; i < els.length; i++) {
    const rect = els[i].getBoundingClientRect()
    if (y >= rect.top && y <= rect.bottom) return els[i].dataset.itemPath ?? null
  }
  return null
}

// One swipe gesture, anywhere on the graph page — not one listener per item
// (the previous design). Swipe right always navigates up the tree, whether
// it starts on an item, a clone, or empty background space. Swipe left
// navigates into whichever level-1 item occupies the gesture's starting
// height, resolved fresh each gesture via itemPathAtY rather than relying
// on which DOM node happened to catch the touch — the same item reads as
// swipeable whether what's currently rendered at that height is the real
// row or one of its circular-scroll clones. The target item is fixed at
// touchstart for the whole gesture (not re-resolved as the finger drifts
// vertically), so a little wobble mid-swipe can't retarget it.
//
// Attaches touchmove as a raw, non-passive native listener (via a callback
// `ref`) instead of React's onTouchMove prop, for the same reason the old
// per-item version did: React's delegated touchmove is passive, so
// preventDefault() inside it silently no-ops, and .circular-scroll-container
// (touch-action: pan-y) needs that preventDefault to keep the browser's own
// direction-lock heuristic from grabbing a horizontal swipe with any
// vertical wobble before this ever sees the full gesture.
export function usePageSwipe(onSwipeLeft: (path: string) => void, onSwipeRight: () => void) {
  const start = useRef<{ x: number; y: number; path: string | null } | null>(null)
  const [drag, setDrag] = useState<PageSwipeDrag | null>(null)

  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight })
  callbacksRef.current = { onSwipeLeft, onSwipeRight }

  const cleanupRef = useRef<(() => void) | null>(null)

  const ref = useCallback((maybeEl: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!maybeEl) return
    // A fresh const, not the parameter itself — TS doesn't carry a
    // parameter's null-narrowing into nested function declarations (they
    // could in principle be invoked later, after further reassignment), so
    // the touch handlers below would otherwise still see `HTMLDivElement |
    // null`. A separately-bound const's narrowing does persist into them.
    const el = maybeEl

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        start.current = null
        setDrag(null)
        return
      }
      const t = e.touches[0]
      const path = itemPathAtY(el, t.clientY)
      start.current = { x: t.clientX, y: t.clientY, path }
      if (path) setDrag({ path, offsetX: 0, active: false })
    }
    function onTouchMove(e: TouchEvent) {
      const s = start.current
      if (!s) return
      const t = e.touches[0]
      const deltaX = t.clientX - s.x
      const deltaY = Math.abs(t.clientY - s.y)
      if (deltaY > SWIPE_VERTICAL_LIMIT) return // vertical scroll — don't react, let native pan-y handle it
      if (e.cancelable) e.preventDefault()
      const clamped = Math.max(-MAX_VISUAL_OFFSET, Math.min(MAX_VISUAL_OFFSET, deltaX))
      // Right is always wired (goes up the tree from anywhere); left only
      // when a real item was under the finger at touchstart.
      const wired = clamped < 0 ? !!s.path : true
      if (s.path) setDrag({ path: s.path, offsetX: clamped, active: wired && Math.abs(deltaX) > SWIPE_THRESHOLD })
    }
    function onTouchEnd(e: TouchEvent) {
      const s = start.current
      start.current = null
      setDrag(null)
      if (!s) return
      const t = e.changedTouches[0]
      const deltaX = t.clientX - s.x
      const deltaY = Math.abs(t.clientY - s.y)
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
        const { onSwipeLeft: left, onSwipeRight: right } = callbacksRef.current
        if (deltaX < 0) { if (s.path) left(s.path) }
        else right()
      }
    }
    function onTouchCancel() {
      start.current = null
      setDrag(null)
    }

    // touchmove is the only one that needs { cancelable } respected via
    // non-passive registration; the rest never call preventDefault and stay
    // passive so they never block native scroll/tap handling.
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    cleanupRef.current = () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])

  return { ref, drag }
}
