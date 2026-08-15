import { useRef } from 'react'

const LONG_PRESS_MS = 500
// If the pointer drifts this far before the timer fires, treat it as a drag
// (e.g. a slow swipe) rather than a long-press, and cancel the timer — swipe
// gestures on item rows track touch, not pointer, events, so without this a
// slow swipe could still fire the long-press underneath it.
const MOVE_CANCEL_PX = 10

// Short tap (or keyboard Enter/Space, which never fires pointer events) runs
// onClick as normal; holding past LONG_PRESS_MS runs onLongPress instead and
// swallows the click that follows on release, so the two never both fire.
export function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      firedRef.current = false
      clearTimer()
      startRef.current = { x: e.clientX, y: e.clientY }
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = startRef.current
      if (!s) return
      if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) {
        clearTimer()
      }
    },
    onPointerUp: clearTimer,
    onPointerLeave: clearTimer,
    onPointerCancel: clearTimer,
    onClick: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault()
        firedRef.current = false
        return
      }
      onClick()
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
}

// Factory version of the same gesture, for rows rendered in a .map() loop —
// call once per list to get a `makeLongPressHandlers` that builds handlers
// per row, sharing one timer (only one row can be mid-press at a time) —
// rules-of-hooks rules out calling useLongPress itself once per row.
export function useLongPressFactory() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }

  function makeLongPressHandlers(onLongPress: () => void, onClick: () => void) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        firedRef.current = false
        clearTimer()
        startRef.current = { x: e.clientX, y: e.clientY }
        timerRef.current = setTimeout(() => {
          firedRef.current = true
          onLongPress()
        }, LONG_PRESS_MS)
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = startRef.current
        if (!s) return
        if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) {
          clearTimer()
        }
      },
      onPointerUp: clearTimer,
      onPointerLeave: clearTimer,
      onPointerCancel: clearTimer,
      onClick: (e: React.MouseEvent) => {
        if (firedRef.current) {
          e.preventDefault()
          firedRef.current = false
          return
        }
        onClick()
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }
  }

  return makeLongPressHandlers
}
