import { useCallback, useRef, useState } from 'react'

// Exported so GraphView's background swipe-to-go-back (a separate, single-
// instance gesture, not per-item) uses the exact same feel as item swipes.
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
  // action — lets the bubble show "this will do something" vs. "this is
  // disabled" instead of dragging just as far either way with no distinction.
  active: boolean
}

// Whole-bubble horizontal swipe: left = navigate into the level-1 item,
// right = navigate up the tree (same action everywhere — items and
// background alike, see GraphView's handleNavigateBack; this hook only
// knows left/right). One level-1 item (Section.tsx) calls this once per
// bubble and attaches the returned `ref` to its own `.section-body` — the
// wrapper around the item's title AND all of its rendered layer2/layer3
// subs, so a swipe starting anywhere in that bubble targets the level-1
// item itself, not whichever sub-row happened to be under the finger.
//
// Attaches touchmove as a raw, non-passive native listener (via a callback
// `ref`) instead of React's onTouchMove prop — React registers its
// delegated touchmove listener as passive, so calling preventDefault()
// inside a synthetic handler silently does nothing. That matters once a
// level-1 list has 2+ items: the whole list now lives inside
// .circular-scroll-container, an always-scrollable ancestor (see
// useCircularScroll.ts) with touch-action: pan-y so vertical revolving-
// scroll keeps working. pan-y still leaves the browser free to natively
// claim any gesture its own direction-lock heuristic reads as vertical —
// which fires on the first few pixels of movement, well before this hook's
// own (more generous) SWIPE_VERTICAL_LIMIT would have ruled it out — so a
// real swipe with any slight vertical wobble at the start could get
// silently grabbed for native scrolling instead of reaching onTouchEnd,
// making the gesture intermittently "just not happen." preventDefault()
// here, the moment horizontal intent looks likely, is what actually wins
// that race back for JS.
//
// A *callback* ref (not useRef + useEffect keyed on `id`) on purpose: the
// element this attaches to can mount/unmount independently of id changing —
// e.g. toggling Raw view swaps .section-body out for a plain <pre> and back
// without itemPath ever changing — and only a callback ref fires on every
// such mount/unmount, so listeners never end up attached to a stale or
// missing node.
export function useItemSwipe(id: string, onSwipeLeft: (() => void) | null, onSwipeRight: (() => void) | null) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<SwipeDrag | null>(null)

  // Read fresh from inside the listeners (created once per DOM node, not
  // once per render) without needing to detach/reattach every time id or
  // the callbacks change identity, which for the callbacks happens on
  // basically every render (Section.tsx passes fresh inline closures).
  const idRef = useRef(id)
  idRef.current = id
  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight })
  callbacksRef.current = { onSwipeLeft, onSwipeRight }

  const cleanupRef = useRef<(() => void) | null>(null)

  const ref = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        start.current = null
        setDrag(null)
        return
      }
      // Claim the gesture so it doesn't also reach a background-level
      // swipe handler (see GraphView.tsx's background swipe-to-go-back).
      e.stopPropagation()
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setDrag({ id: idRef.current, offsetX: 0, active: false })
    }
    function onTouchMove(e: TouchEvent) {
      const s = start.current
      if (!s) return
      const deltaX = e.touches[0].clientX - s.x
      const deltaY = Math.abs(e.touches[0].clientY - s.y)
      if (deltaY > SWIPE_VERTICAL_LIMIT) return // vertical scroll — don't react, let the container's own native pan-y handle it
      e.stopPropagation()
      if (e.cancelable) e.preventDefault()
      const { onSwipeLeft: left, onSwipeRight: right } = callbacksRef.current
      const clamped = Math.max(-MAX_VISUAL_OFFSET, Math.min(MAX_VISUAL_OFFSET, deltaX))
      const wired = clamped < 0 ? !!left : clamped > 0 ? !!right : false
      setDrag({ id: idRef.current, offsetX: clamped, active: wired && Math.abs(deltaX) > SWIPE_THRESHOLD })
    }
    function onTouchEnd(e: TouchEvent) {
      const s = start.current
      start.current = null
      setDrag(null)
      if (!s) return
      e.stopPropagation()
      const deltaX = e.changedTouches[0].clientX - s.x
      const deltaY = Math.abs(e.changedTouches[0].clientY - s.y)
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
        const { onSwipeLeft: left, onSwipeRight: right } = callbacksRef.current
        if (deltaX < 0) left?.()
        else right?.()
      }
    }
    function onTouchCancel() {
      start.current = null
      setDrag(null)
    }

    // touchmove must be non-passive (see the hook doc comment above) to
    // make preventDefault() actually take effect; the others don't call it
    // and stay passive so they never block native scroll/tap handling.
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
