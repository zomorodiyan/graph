import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

interface UseCircularScrollOptions {
  /** Number of real (non-clone) level-1 items currently in the list. */
  count: number
  /** Identity of the current list — pass the route `path` so a drill-in/out
      navigation forces a full remeasure instead of carrying stale state. */
  resetKey: string
  /** Suppresses the boundary-teleport while true (e.g. a native drag is in
      progress — some browsers auto-scroll a scrollable container near its
      edges during dragover, which would otherwise fight the drag). */
  paused?: boolean
  /** Available viewport height, in px, for the scrollable region. Real
      content taller than this activates circular mode; shorter content
      renders naturally with no clones/scrolling ("no repeating mess" for
      small graphs). */
  budgetPx: number
}

interface UseCircularScrollResult {
  /** True once real content exceeds budgetPx — render the boundary clones
      and let this hook manage scrollTop while true. */
  circular: boolean
  /** How many trailing/leading real items to render in the top/bottom
      clone, respectively (see "why more than one item" below). 0 while not
      circular. */
  cloneCount: number
  /** Attach to the single persistent wrapper around clone-top + real-items +
      clone-bottom. Stays mounted across circular/plain transitions. */
  containerRef: RefObject<HTMLDivElement>
  /** Attach to the top clone group (clones of the LAST `cloneCount` real
      items). Only exists in the DOM while `circular` is true. */
  topCloneRef: RefObject<HTMLDivElement>
  /** Attach to the bottom clone group (clones of the FIRST `cloneCount`
      real items). Only exists in the DOM while `circular` is true. */
  bottomCloneRef: RefObject<HTMLDivElement>
  /** Attach to the wrapper around the real (unwindowed) item list. Always
      mounted, in both modes, so its height can always be measured. */
  realListRef: RefObject<HTMLDivElement>
}

/**
 * Makes a vertical list of items scroll circularly: past the last item loops
 * to the first, past the first loops to the last. Renders the full list once
 * (no windowing) plus a clone of the last `cloneCount` items above it and a
 * clone of the first `cloneCount` items below it, and teleports scrollTop by
 * the real content's height whenever the user scrolls into a clone —
 * imperceptible since the clone is pixel-identical to what it replaces.
 *
 * Why a clone GROUP, not just one item: the browser can only clamp scrollTop
 * at its true native min (0) and max (scrollHeight - clientHeight) — there's
 * no way to intercept "the user scrolled past the seam" earlier than that.
 * At the native max, the entire viewport-height's worth of content is
 * showing, ending flush with the bottom clone's own bottom edge. For that
 * whole visible window to be pixel-identical to real content after a `-=
 * realHeight` shift, the bottom clone must itself be at least a full
 * viewport tall — a single short item's clone isn't enough once the
 * viewport is taller than one item (the common case). So `cloneCount` grows
 * (bounded at `count - 1`, never cloning every real item) until both clone
 * groups are at least `budgetPx` tall. Only activates at all once real
 * content exceeds the viewport ("circular" mode), so short lists that fit
 * on screen still render with zero clones.
 */
export function useCircularScroll({ count, resetKey, paused = false, budgetPx }: UseCircularScrollOptions): UseCircularScrollResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const topCloneRef = useRef<HTMLDivElement>(null)
  const bottomCloneRef = useRef<HTMLDivElement>(null)
  const realListRef = useRef<HTMLDivElement>(null)

  const [circular, setCircular] = useState(false)
  const [cloneCount, setCloneCount] = useState(1)

  const realListHeightRef = useRef(0)
  // Last-known top-clone height, shared across effect re-runs (not a
  // per-effect local) so an async ResizeObserver callback from a
  // just-superseded effect instance can't apply a stale/duplicate delta.
  const topCloneHeightRef = useRef(0)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  // A single self-clone would be pointless (and would reintroduce the
  // visible-duplicate problem for a 1-item list), so circular mode never
  // activates below 2 real items.
  const eligible = count >= 2

  useEffect(() => {
    setCloneCount(1)
    topCloneHeightRef.current = 0
    if (!eligible) setCircular(false)
  }, [eligible, resetKey])

  // Measure real content + both clone groups on every relevant change,
  // decide plain vs. circular, grow cloneCount until both clone groups clear
  // the viewport budget, and compensate scrollTop if the top clone group
  // resized while already circular (a growing/shrinking last item, or the
  // clone group itself growing by one more item, shouldn't visually shift
  // the current view).
  useEffect(() => {
    if (!eligible) return
    const realEl = realListRef.current
    if (!realEl) return

    const measure = () => {
      const realHeight = realEl.scrollHeight
      realListHeightRef.current = realHeight

      const shouldBeCircular = realHeight > budgetPx
      setCircular(prev => (prev === shouldBeCircular ? prev : shouldBeCircular))
      if (!shouldBeCircular) return

      const topEl = topCloneRef.current
      const bottomEl = bottomCloneRef.current
      const container = containerRef.current
      if (!topEl || !bottomEl || !container) return

      const topHeight = topEl.getBoundingClientRect().height
      const bottomHeight = bottomEl.getBoundingClientRect().height

      const prevTopHeight = topCloneHeightRef.current
      const delta = topHeight - prevTopHeight
      // Skip compensation on the very first measurement of a freshly-mounted
      // clone (prevTopHeight === 0) — the layout effect below sets the
      // correct starting scrollTop for that transition instead.
      if (delta !== 0 && prevTopHeight !== 0) container.scrollTop += delta
      topCloneHeightRef.current = topHeight

      if ((topHeight < budgetPx || bottomHeight < budgetPx) && cloneCount < count - 1) {
        setCloneCount(c => Math.min(count - 1, c + 1))
      }
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(realEl)
    if (topCloneRef.current) observer.observe(topCloneRef.current)
    if (bottomCloneRef.current) observer.observe(bottomCloneRef.current)
    return () => observer.disconnect()
  }, [eligible, resetKey, budgetPx, circular, cloneCount, count])

  // Land exactly at the top of real item 1 whenever circular mode
  // (re)activates. Not re-run on cloneCount changes — the measure effect's
  // delta-compensation above already keeps the view stable as the clone
  // group grows from its initial 1-item size.
  useLayoutEffect(() => {
    if (!circular) return
    const container = containerRef.current
    const topEl = topCloneRef.current
    if (!container || !topEl) return
    container.scrollTop = topEl.getBoundingClientRect().height
  }, [circular, resetKey])

  // Boundary crossing -> teleport by exactly the real content's height.
  // scrollTop clamps at the true DOM limits regardless of fling speed, so
  // this is a reliable, un-missable trigger even on a fast flick.
  useEffect(() => {
    if (!circular) return
    const container = containerRef.current
    if (!container) return

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        if (pausedRef.current) return
        const el = containerRef.current
        const realHeight = realListHeightRef.current
        if (!el || realHeight <= 0) return
        if (el.scrollTop <= 0) {
          el.scrollTop += realHeight
        } else if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
          el.scrollTop -= realHeight
        }
      })
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [circular, resetKey])

  return { circular, cloneCount: circular ? cloneCount : 0, containerRef, topCloneRef, bottomCloneRef, realListRef }
}
