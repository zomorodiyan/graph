import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

// Right-click item menu. Positioned at the cursor, clamped to stay on-screen,
// closes on outside click/tap, Escape, or scroll.
function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y, visible: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    const clampedX = Math.min(x, window.innerWidth - w - 8)
    const clampedY = Math.min(y, window.innerHeight - h - 8)
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY), visible: true })
  }, [x, y])

  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('touchstart', handlePointerDown, true)
    document.addEventListener('contextmenu', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('touchstart', handlePointerDown, true)
      document.removeEventListener('contextmenu', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ top: pos.y, left: pos.x, visibility: pos.visible ? 'visible' : 'hidden' }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className={`context-menu-item${item.danger ? ' danger' : ''}`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default ContextMenu
