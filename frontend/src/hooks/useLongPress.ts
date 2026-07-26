import { useRef } from 'react'

const LONG_PRESS_MS = 500

// Short tap (or keyboard Enter/Space, which never fires pointer events) runs
// onClick as normal; holding past LONG_PRESS_MS runs onLongPress instead and
// swallows the click that follows on release, so the two never both fire.
export function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return {
    onPointerDown: () => {
      firedRef.current = false
      clearTimer()
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
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
