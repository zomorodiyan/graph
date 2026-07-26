import { useEffect, useState } from 'react'

// Tracks how many px of the viewport's bottom are covered by the on-screen
// keyboard (0 when none is open), via window.visualViewport. Debounced so a
// keyboard's multi-step open/close animation settles on one final value
// instead of recomputing for every intermediate resize event.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    let debounceId: ReturnType<typeof setTimeout> | null = null
    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(Math.max(0, Math.round(covered)))
    }
    const scheduleMeasure = () => {
      if (debounceId !== null) clearTimeout(debounceId)
      debounceId = setTimeout(measure, 120)
    }

    vv.addEventListener('resize', scheduleMeasure)
    scheduleMeasure() // catch the keyboard already being open when this mounts

    return () => {
      vv.removeEventListener('resize', scheduleMeasure)
      if (debounceId !== null) clearTimeout(debounceId)
    }
  }, [])

  return inset
}
