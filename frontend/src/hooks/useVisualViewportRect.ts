import { useEffect, useState } from 'react'

// The visual viewport's own position/size, in the same coordinate space
// position:fixed uses — no dependency on window.innerHeight at all.
//
// Earlier versions of this tried to derive a "keyboard height" as
// window.innerHeight minus visualViewport.height. That number was
// unreliable across browsers/versions: on some it roughly matched the
// keyboard, on others it came out doubled, on others halved — because
// window.innerHeight's own behavior when a keyboard opens isn't consistent
// (some browsers shrink it in lockstep with the keyboard, some not at all,
// some partially), so subtracting it against visualViewport.height bakes in
// whatever that inconsistency is.
//
// visualViewport.offsetTop and .height are reliable on their own — they ARE
// the actual visible area. Instead of computing a height difference, track
// them directly: an outer element sized/positioned to exactly match the
// visible area, with content pinned to ITS bottom, is correct regardless of
// how any given browser handles innerHeight, since innerHeight never enters
// the calculation.
export function useVisualViewportRect(): { top: number; height: number } {
  const [rect, setRect] = useState(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    return { top: vv?.offsetTop ?? 0, height: vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0) }
  })

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const measure = () => setRect({ top: vv.offsetTop, height: vv.height })

    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    measure()

    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [])

  return rect
}
