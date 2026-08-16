import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

// Fixed height (not measured) of the blank marker rendered at each loop seam
// (top-clone/real-list, real-list/bottom-clone) — see the "why a spacer"
// note on the hook doc comment below. Exported so GraphView.tsx can size the
// actual spacer elements to the exact same number the scroll math below
// uses; keeping it a constant (not a ResizeObserver target) means the
// teleport math never has to wait on an extra measurement round-trip.
export const LOOP_SPACER_PX = 32

// Safety ceiling on cloneCount growth (see the hook doc comment's "why a
// clone GROUP" section) — not a normal operating limit. Real items always
// have positive rendered height, so growth naturally stops once the clone
// group reaches budgetPx, in well under 100 steps for any viewport this app
// will realistically render at. This just guards against runaway growth if
// that assumption were ever violated (e.g. a hypothetical zero-height row).
const MAX_CLONE_COUNT = 500

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
  /** Available viewport height, in px, for the scrollable region — caps how
      tall the container is allowed to render (CSS max-height, see App.css)
      and how big the clone groups need to grow to keep scrolling seamless
      at that height. Does NOT gate whether looping is active at all — see
      `circular` below. */
  budgetPx: number
}

interface UseCircularScrollResult {
  /** True whenever there are 2+ real items — looping is always available,
      not just when content overflows the viewport (see the hook doc
      comment for why). Render the boundary clones and the loop-seam
      spacers, and let this hook manage scrollTop, while true. */
  circular: boolean
  /** How many clone items to render in the top/bottom clone group (see "why
      a clone GROUP" below). Can exceed `count` — a short list's clone group
      wraps around and repeats the list as many times as needed to clear
      `budgetPx`, since there aren't enough distinct items otherwise. 0
      while not circular; the caller is expected to build each group's item
      list by cycling through the real items with `% count`. */
  cloneCount: number
  /** Attach to the single persistent wrapper around clone-top + real-items +
      clone-bottom. Stays mounted across circular/plain transitions. */
  containerRef: RefObject<HTMLDivElement>
  /** Attach to the top clone group (clones of the `cloneCount` items
      immediately preceding real item 1, wrapping/repeating if cloneCount >
      count). Only exists in the DOM while `circular` is true. */
  topCloneRef: RefObject<HTMLDivElement>
  /** Attach to the bottom clone group (clones of the `cloneCount` items
      immediately following the last real item, wrapping/repeating if
      cloneCount > count). Only exists in the DOM while `circular` is
      true. */
  bottomCloneRef: RefObject<HTMLDivElement>
  /** Attach to the wrapper around the real (unwindowed) item list. Always
      mounted, in both modes, so its height can always be measured. */
  realListRef: RefObject<HTMLDivElement>
}

/**
 * Makes a vertical list of items scroll circularly: past the last item loops
 * to the first, past the first loops to the last. Renders the full list once
 * (no windowing) plus a clone of the last `cloneCount` items above it and a
 * clone of the first `cloneCount` items below it, separated from the real
 * list by a blank LOOP_SPACER_PX-tall marker at each seam, and teleports
 * scrollTop by one full loop cycle (real content + both spacers) whenever
 * the user scrolls into a clone — imperceptible since the clone is
 * pixel-identical to what it replaces.
 *
 * Always active once there are 2+ real items, regardless of whether content
 * overflows the viewport — an earlier version only looped once real content
 * was taller than the screen, specifically to avoid a short list ever
 * visibly showing the same item twice with nothing to scroll. The spacer is
 * what replaces that guard now: it marks "the list wraps here" clearly
 * enough that seeing item 1 again — even on one screen, with no scrolling
 * involved for a short list — reads as an intentional loop boundary rather
 * than a glitchy duplicate.
 *
 * Why a clone GROUP, not just one item: the browser can only clamp scrollTop
 * at its true native min (0) and max (scrollHeight - clientHeight) — there's
 * no way to intercept "the user scrolled past the seam" earlier than that.
 * At the native max, the entire viewport-height's worth of content is
 * showing, ending flush with the bottom clone's own bottom edge. For that
 * whole visible window to be pixel-identical to real content after the
 * teleport shift, the bottom clone must itself be at least a full viewport
 * tall — a single short item's clone isn't enough once the viewport is
 * taller than one item (the common case). So `cloneCount` grows until both
 * clone groups are at least `budgetPx` tall, wrapping around to repeat the
 * list more than once if `count` items alone don't reach that height (a
 * short list of 2-4 short rows, for instance, needs several repeats to fill
 * a full-screen budget) — the alternative, capping at `count` items and
 * accepting a clone group shorter than the viewport, would mean the visible
 * window at the scroll boundary ISN'T pixel-identical to what's revealed
 * after the teleport (part of the spacer or real list bleeds into the same
 * screen as the clone), producing a visible snap right at the loop seam.
 */
export function useCircularScroll({ count, resetKey, paused = false, budgetPx }: UseCircularScrollOptions): UseCircularScrollResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const topCloneRef = useRef<HTMLDivElement>(null)
  const bottomCloneRef = useRef<HTMLDivElement>(null)
  const realListRef = useRef<HTMLDivElement>(null)

  // A single self-clone would be pointless (and there's nothing to mark a
  // "loop" between an item and itself), so looping never activates below 2
  // real items — otherwise always on, independent of content height.
  const circular = count >= 2
  const [cloneCount, setCloneCount] = useState(1)

  const realListHeightRef = useRef(0)
  // Last-known top-clone height, shared across effect re-runs (not a
  // per-effect local) so an async ResizeObserver callback from a
  // just-superseded effect instance can't apply a stale/duplicate delta.
  const topCloneHeightRef = useRef(0)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    setCloneCount(1)
    topCloneHeightRef.current = 0
  }, [circular, resetKey])

  // Measure real content + both clone groups on every relevant change, grow
  // cloneCount until both clone groups clear the viewport budget (so
  // scrolling a genuinely tall list stays seamless — see the hook doc
  // comment), and compensate scrollTop if the top clone group resized while
  // already circular (a growing/shrinking last item, or the clone group
  // itself growing by one more item, shouldn't visually shift the current
  // view).
  useEffect(() => {
    if (!circular) return
    const realEl = realListRef.current
    if (!realEl) return

    const measure = () => {
      const realHeight = realEl.scrollHeight
      realListHeightRef.current = realHeight

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

      const shortfallHeight = Math.max(topHeight, bottomHeight)
      if (shortfallHeight < budgetPx && cloneCount < MAX_CLONE_COUNT) {
        // Jump straight to an estimate of the total count needed, using the
        // current group's own average per-item height, instead of growing
        // by 1 and re-measuring each time — a short list that needs many
        // repeats to fill budgetPx (see the hook doc comment on wrapping)
        // would otherwise take that many sequential render/measure/commit
        // cycles just to settle on mount. Estimate can undershoot a bit for
        // a non-uniform list (top/bottom clones can be built from
        // different, differently-tall items) — the surrounding `if` just
        // runs this again next pass in that case, still far fewer passes
        // than growing by 1.
        const avgItemHeight = shortfallHeight / cloneCount
        const estimate = avgItemHeight > 0
          ? Math.ceil(budgetPx / avgItemHeight) + 1
          : cloneCount + 1
        setCloneCount(c => Math.min(MAX_CLONE_COUNT, Math.max(c + 1, estimate)))
      }
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(realEl)
    if (topCloneRef.current) observer.observe(topCloneRef.current)
    if (bottomCloneRef.current) observer.observe(bottomCloneRef.current)
    return () => observer.disconnect()
  }, [resetKey, budgetPx, circular, cloneCount])

  // Land exactly at the top of real item 1 (past the top clone AND its
  // trailing spacer) whenever circular mode (re)activates. Not re-run on
  // cloneCount changes — the measure effect's delta-compensation above
  // already keeps the view stable as the clone group grows from its initial
  // 1-item size.
  useLayoutEffect(() => {
    if (!circular) return
    const container = containerRef.current
    const topEl = topCloneRef.current
    if (!container || !topEl) return
    container.scrollTop = topEl.getBoundingClientRect().height + LOOP_SPACER_PX
  }, [circular, resetKey])

  // Boundary crossing -> teleport by exactly one loop cycle (real content +
  // the spacer on each side of it). scrollTop clamps at the true DOM limits
  // regardless of fling speed, so this is a reliable, un-missable trigger
  // even on a fast flick.
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
        const el = containerRef.current
        const realHeight = realListHeightRef.current
        if (!el || realHeight <= 0) return

        if (pausedRef.current) return
        const cycleHeight = realHeight + 2 * LOOP_SPACER_PX
        if (el.scrollTop <= 0) {
          el.scrollTop += cycleHeight
        } else if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
          el.scrollTop -= cycleHeight
        }
      })
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [circular, resetKey])

  return { circular, cloneCount: circular ? cloneCount : 0, containerRef, topCloneRef, bottomCloneRef, realListRef }
}
