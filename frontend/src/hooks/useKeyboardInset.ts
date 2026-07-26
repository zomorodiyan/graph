import { useEffect, useState } from 'react'

// Tracks how many px of the viewport's bottom are covered by the on-screen
// keyboard (0 when none is open), via window.visualViewport. Debounced so a
// keyboard's multi-step open/close animation settles on one final value
// instead of recomputing for every intermediate resize event.
//
// window.innerHeight minus visualViewport.height, not a captured baseline:
// on browsers where the layout viewport (innerHeight) already shrinks along
// with the keyboard (Android Chrome, mainly), this self-corrects to ~0 since
// both shrink together — comparing against a pre-keyboard baseline instead
// double-counted the keyboard's height on exactly those browsers, since the
// browser's own shrink and our added inset stacked. On browsers where the
// layout viewport stays put (iOS Safari), this correctly yields the keyboard's
// actual height, since only the visual viewport shrinks there.
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
