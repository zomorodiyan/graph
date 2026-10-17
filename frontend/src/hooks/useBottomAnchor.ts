import { useLayoutEffect, useRef } from 'react'

// The phone (portrait) layout — same breakpoint as the rest of the mobile
// CSS (App.css's min-width: 32rem overrides).
export const MOBILE_QUERY = '(max-width: 31.999rem)'

// Phone layout is bottom-anchored, for one-handed use: each page opens
// scrolled so the element this ref is on (placed right after the page's
// main content) sits just above the fixed bottom bar — see its
// scroll-margin-bottom in App.css — and the extra space App.css adds above
// the content lets the first items be scrolled down to the bottom too.
// Re-anchors whenever `key` changes (a new page) once `ready` (data loaded).
export function useBottomAnchor<T extends HTMLElement>(key: string, ready: boolean) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    if (!ready || !window.matchMedia?.(MOBILE_QUERY).matches) return
    ref.current?.scrollIntoView({ block: 'end' })
  }, [key, ready])
  return ref
}
