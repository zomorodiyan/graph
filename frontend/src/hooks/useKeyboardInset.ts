import { useEffect, useRef, useState } from 'react'

// Tracks how many px of the viewport's bottom are covered by the on-screen
// keyboard (0 when none is open), via window.visualViewport. Debounced so a
// keyboard's multi-step open/close animation settles on one final value
// instead of recomputing for every intermediate resize event.
//
// Deliberately compares against the visual viewport's OWN height when this
// hook first mounted, not window.innerHeight. On many mobile browsers,
// innerHeight vs visualViewport.height differ even with no keyboard open at
// all (e.g. a collapsing/expanding address bar), which showed up as the sheet
// always sitting a constant amount too far above the keyboard — that offset
// is present in both the baseline and the keyboard-open measurement, so
// comparing the viewport to itself cancels it out and leaves just the
// keyboard's actual contribution.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  const baselineRef = useRef<number | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    if (baselineRef.current === null) {
      baselineRef.current = vv.height
    }

    let debounceId: ReturnType<typeof setTimeout> | null = null
    const measure = () => {
      const baseline = baselineRef.current ?? vv.height
      const covered = baseline - vv.height
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
