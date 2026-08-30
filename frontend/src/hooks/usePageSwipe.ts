import { useRef, useCallback } from 'react'

export const SWIPE_THRESHOLD = 50
export const SWIPE_VERTICAL_LIMIT = 75

// Finds whichever rendered level-1 item (see Section.tsx's data-item-path)
// currently occupies a given Y coordinate.
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
// it starts on an item or empty background space. Swipe left navigates
// into whichever level-1 item occupies the gesture's starting height,
// resolved fresh each gesture via itemPathAtY. The target item is fixed at
// touchstart for the whole gesture (not re-resolved as the finger drifts
// vertically), so a little wobble mid-swipe can't retarget it.
//
// Deliberately no live visual feedback (no translateX-follows-the-finger,
// no "armed" tint) — the bubbles stay put for the whole gesture and the
// action just fires on release past the threshold. Besides being the
// requested feel, this also means touchmove never calls setState: a swipe
// attempt used to re-render on every reported pixel of movement just to
// animate the slide, which is real work competing with the browser's own
// scroll handling on every frame of a normal vertical scroll too, since
// every touchmove on the page ran through this same handler.
//
// Attaches touchmove as a raw, non-passive native listener (via a callback
// `ref`) instead of React's onTouchMove prop, for the same reason the old
// per-item version did: React's delegated touchmove is passive, so
// preventDefault() inside it silently no-ops, and .graph-container
// (touch-action: pan-y, see App.css) needs that preventDefault to keep the
// browser's own direction-lock heuristic from grabbing a horizontal swipe
// before this ever sees the full gesture. preventDefault only fires once the gesture is
// actually trending horizontal (|deltaX| > deltaY) — calling it purely
// because deltaY hasn't yet crossed SWIPE_VERTICAL_LIMIT would also swallow
// the first ~75px of every ordinary vertical scroll, native momentum
// scrolling included, which is what was actually making list scrolling feel
// rough: every scroll attempt anywhere in the list used to fight the
// browser for its first several frames before finally being let through.
// isDragActive: polled fresh in touchmove/touchend (not just captured at
// touchstart) so a long-press that turns into a drag mid-gesture — the
// common case, since the drag only picks up after LONG_PRESS_MS — still gets
// caught. Once a drag is seen active, the swipe is abandoned outright
// (start.current cleared) rather than merely skipped for that one event, so
// touchend can't still fire a swipe from a stale start point after the drag
// itself has already ended.
export function usePageSwipe(onSwipeLeft: (path: string) => void, onSwipeRight: () => void, isDragActive: () => boolean = () => false) {
  const start = useRef<{ x: number; y: number; path: string | null } | null>(null)
  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight, isDragActive })
  callbacksRef.current = { onSwipeLeft, onSwipeRight, isDragActive }

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
        return
      }
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY, path: itemPathAtY(el, t.clientY) }
    }
    function onTouchMove(e: TouchEvent) {
      const s = start.current
      if (!s) return
      if (callbacksRef.current.isDragActive()) {
        start.current = null
        return
      }
      const t = e.touches[0]
      const deltaX = t.clientX - s.x
      const deltaY = Math.abs(t.clientY - s.y)
      if (deltaY > SWIPE_VERTICAL_LIMIT) return // definitely a vertical scroll — let native pan-y handle it
      if (Math.abs(deltaX) <= deltaY) return // not (yet) trending horizontal — don't fight native scroll for an ordinary vertical drag
      if (e.cancelable) e.preventDefault()
    }
    function onTouchEnd(e: TouchEvent) {
      const s = start.current
      start.current = null
      if (!s) return
      if (callbacksRef.current.isDragActive()) return
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

  return { ref }
}
