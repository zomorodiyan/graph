import { useEffect, useRef } from 'react'

let nextModalId = 0

// Marks whether *this* hook instance is the one that owns the current
// top-of-stack history entry. Derived from window.history.state (not just an
// internal ref) so React StrictMode's double-invoked effects, or remounts,
// can never push a duplicate entry or desync from real browser history.
export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const modalIdRef = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const ownId = modalIdRef.current
      if (ownId === null) return
      const state = e.state as { modalId?: number } | null
      if (state?.modalId === ownId) return

      modalIdRef.current = null
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const currentState = window.history.state as { modalId?: number } | null

    if (isOpen && modalIdRef.current === null) {
      const id = nextModalId++
      modalIdRef.current = id
      window.history.pushState({ modalId: id }, '')
      return
    }

    if (!isOpen && modalIdRef.current !== null) {
      const ownId = modalIdRef.current
      modalIdRef.current = null
      if (currentState?.modalId === ownId) {
        window.history.back()
      }
    }
  }, [isOpen])
}