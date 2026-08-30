import { useRef } from 'react'

const LONG_PRESS_MS = 500
// Matches useLongPress's own threshold — a hold that drifts this far before
// the timer fires is a scroll/swipe starting on the row, not a long-press.
const MOVE_CANCEL_PX = 10

export interface DragGestureCallbacks {
  onDragStart: (path: string) => void
  onDragMove: (clientX: number, clientY: number) => void
  onDrop: () => void
  onCancel: () => void
}

// Mobile's long-press-to-drag gesture for item rows. HTML5 native
// draggable/dragstart/dragover/drop never fire from touch input at all (a
// platform limitation, not something fixable here), so this is a separate,
// touch-driven path to the exact same reorder/nest machinery GraphView
// already built for desktop's mouse-based drag: it doesn't compute drop
// targets itself, just reports raw coordinates via onDragMove and lets the
// caller hit-test (GraphView already owns levelOneKeys/handleDrop/
// handleDropAtPath, the same functions the native path calls).
//
// A tap still runs onTap (unchanged from useLongPress); holding past
// LONG_PRESS_MS now picks the item up instead of opening the editor — see
// GraphView's new Edit button in the selection toolbar for that instead,
// since long-press can't mean both "open the editor" and "start a drag" at
// once (fires from the same hold, before either outcome is known).
//
// Same factory-of-handlers shape as useLongPressFactory (one shared
// timer/state since only one row can be mid-gesture at a time), for the
// same reason: called once per list, not once per row (rules of hooks rule
// out useDragGesture itself living inside a .map()).
export function useDragGestureFactory(callbacks: DragGestureCallbacks) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function makeDragGestureHandlers(itemPath: string, onTap: () => void) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        firedRef.current = false
        clearTimer()
        startRef.current = { x: e.clientX, y: e.clientY }
        timerRef.current = setTimeout(() => {
          firedRef.current = true
          callbacksRef.current.onDragStart(itemPath)
        }, LONG_PRESS_MS)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (firedRef.current) {
          // Suppress the page's own touch-scroll for the rest of this
          // gesture — without this, dragging down/up also scrolls the list
          // underneath the item being moved.
          e.preventDefault()
          callbacksRef.current.onDragMove(e.clientX, e.clientY)
          return
        }
        const s = startRef.current
        if (!s) return
        if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) {
          clearTimer()
          startRef.current = null
        }
      },
      onPointerUp: () => {
        clearTimer()
        if (firedRef.current) callbacksRef.current.onDrop()
        startRef.current = null
      },
      onPointerLeave: () => {
        clearTimer()
        if (firedRef.current) callbacksRef.current.onCancel()
        startRef.current = null
      },
      onPointerCancel: () => {
        clearTimer()
        if (firedRef.current) callbacksRef.current.onCancel()
        startRef.current = null
      },
      onClick: (e: React.MouseEvent) => {
        // Swallow the click that follows a completed drag/long-press so it
        // doesn't also register as a tap (mirrors useLongPress).
        if (firedRef.current) {
          e.preventDefault()
          firedRef.current = false
          return
        }
        onTap()
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }
  }

  return makeDragGestureHandlers
}
