import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Structure, StructureItem } from '@api'
import { getItemByPath } from '../../hooks/useGraph'
import { MOBILE_QUERY } from '../../hooks/useBottomAnchor'
import { usePanelContext } from '../../hooks/usePanelContext'
import ItemResults from '../../components/ItemResults'
import BodyFigure from '../../components/BodyFigure'
import { BodyIcon, ChevronDownIcon, XIcon } from '../../components/icons'
import { BODY_PARTS, BodyPart, bodyPartsOf, partAnchor } from '../../utils/body'
import { BODY_VIEWBOX } from '../../data/bodyFront'
import { filterTree } from '../../utils/tags'

// The body panel's state, owned by GraphView so a body-part tag on any item
// can open it on that part. Kept while moving between pages of the same
// graph; reset when the graph changes.
export function useBodyPanel(graphName?: string) {
  const [active, setActive] = useState(false)
  const [open, setOpen] = useState(true)
  // The selected part's id (see utils/body.ts).
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    setActive(false)
    setSelected(null)
  }, [graphName])
  const show = (partId: string) => {
    setActive(true)
    setOpen(true)
    setSelected(partId)
  }
  const close = () => {
    setActive(false)
    setSelected(null)
  }
  return { active, open, setOpen, selected, setSelected, show, close }
}

export type BodyPanelState = ReturnType<typeof useBodyPanel>

interface BodyPanelProps {
  panel: BodyPanelState
  graphName: string
  structure?: Structure
  // The page's item path ('' at the graph root) — the panel's scope.
  path: string
  anchorRef: React.RefObject<HTMLElement>
  onSaved: () => void
  onTagClick: (tag: string, realPath?: string) => void
}

// One card: a part and the page's items tagged with it, as a synthetic
// top-level item (the part) whose children are the real items, so the
// usual cards render them one level down.
interface Group {
  part: BodyPart
  count: number
  items: Record<string, StructureItem>
  realPaths: Map<string, string>
}

// Past this width the figure lies down and the cards go along it; below,
// it stands and the cards run down it, no wider than this.
const LYING_MIN_WIDTH = 560
const STANDING_MAX_WIDTH = 400
const GAP = 8

// Spreads cards along a row so none overlap, each as near its wished spot
// as the row allows.
function pack(wished: number[], W: number, cardW: number): number[] {
  const n = wished.length
  const lefts = wished.map(x => Math.max(0, Math.min(W - cardW, x)))
  for (let i = 1; i < n; i++) lefts[i] = Math.max(lefts[i], lefts[i - 1] + cardW + GAP)
  for (let i = n - 1; i >= 0; i--) lefts[i] = Math.min(lefts[i], i === n - 1 ? W - cardW : lefts[i + 1] - cardW - GAP)
  return lefts
}

// The page's body-part-tagged items over the anatomy figure (see
// BodyFigure.tsx): one translucent card per part, laid at the part's place
// on the body — down the standing figure on phones, in two rows along the
// figure lying on its back on wide panels, with a short leader when a card
// had to move away from its part. Parts with items are tinted, the
// selected one solid. Tapping a part, or a card's heading, selects it.
function BodyPanel({ panel, graphName, structure, path, anchorRef, onSaved, onTagClick }: BodyPanelProps) {
  const { open, setOpen, selected, setSelected, close } = panel
  const barRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const figureRef = useRef<HTMLDivElement>(null)
  const leadersRef = useRef<SVGSVGElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [, setPanelContext] = usePanelContext(graphName, 'body')

  const pageItem = path && structure ? getItemByPath(structure, path) : null
  const items = useMemo(() => (path ? pageItem?.children : structure?.structure) ?? {}, [path, pageItem, structure])

  const groups = useMemo<Group[]>(() => {
    const present = new Set<string>()
    const walk = (tree: Record<string, StructureItem>) => {
      for (const item of Object.values(tree)) {
        for (const p of bodyPartsOf(item)) present.add(p.id)
        if (item.children) walk(item.children)
      }
    }
    walk(items)
    return BODY_PARTS.filter(p => present.has(p.id)).map((part, i) => {
      const r = filterTree(items, item => bodyPartsOf(item).includes(part), `b${i}_`, path)
      const key = `p_${part.id}`
      const realPaths = new Map([...r.realPaths].map(([view, real]) => [`${key}.${view}`, real]))
      return { part, count: r.count, items: { [key]: { title: part.label, children: r.items } }, realPaths }
    })
  }, [items, path])
  const presentIds = useMemo(() => new Set(groups.map(g => g.part.id)), [groups])
  const selectedPart = selected ? BODY_PARTS.find(p => p.id === selected) ?? null : null

  // The panel's width decides the layout; watched while open.
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    // A scrollbar coming and going as the stage grows and shrinks would
    // nudge the width back and forth; such small changes are ignored.
    const update = () => setWidth(prev => (prev && Math.abs(prev - el.clientWidth) < 24 ? prev : el.clientWidth))
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])
  const lying = width >= LYING_MIN_WIDTH

  // Places the figure and the cards (absolute, in the stage) from the
  // cards' rendered heights, so it runs after every render and again when
  // a card grows or shrinks (notes opening, edits).
  const layout = useCallback(() => {
    const stage = stageRef.current, figure = figureRef.current
    if (!stage || !figure || !width) return
    const [, vy, vw, vh] = BODY_VIEWBOX
    const cards = groups.flatMap(g => { const el = cardRefs.current.get(g.part.id); return el ? [{ g, el }] : [] })
    const leaders = leadersRef.current
    if (leaders) leaders.innerHTML = ''
    if (!lying) {
      const W = Math.min(width, STANDING_MAX_WIDTH), scale = W / vw, H = vh * scale
      stage.style.width = `${W}px`
      figure.style.width = `${W}px`
      figure.style.top = '0px'
      const cardW = Math.round(W * 0.72), left = Math.round((W - cardW) / 2)
      let prevBottom = 0, maxBottom = H
      const sorted = cards.map(c => ({ ...c, a: partAnchor(c.g.part, false) })).sort((p, q) => p.a[1] - q.a[1])
      for (const c of sorted) {
        c.el.style.width = `${cardW}px`
        c.el.style.left = `${left}px`
        const top = Math.max((c.a[1] - vy) * scale - 14, prevBottom + GAP)
        c.el.style.top = `${top}px`
        prevBottom = top + c.el.offsetHeight
        maxBottom = Math.max(maxBottom, prevBottom)
      }
      stage.style.height = `${maxBottom + 4}px`
      return
    }
    const W = width, scale = W / vh, H = vw * scale, mid = H / 2
    stage.style.width = `${W}px`
    figure.style.width = `${W}px`
    const sorted = cards.map(c => ({ ...c, a: partAnchor(c.g.part, true) })).sort((p, q) => p.a[0] - q.a[0])
    const perRow = Math.max(1, Math.ceil(sorted.length / 2))
    const cardW = Math.round(Math.max(120, Math.min(200, (W - GAP * (perRow - 1)) / perRow)))
    for (const c of sorted) c.el.style.width = `${cardW}px`
    const rows = [sorted.filter((_, i) => i % 2 === 0), sorted.filter((_, i) => i % 2 === 1)]
    // The top row hangs down to the body's middle; the figure moves down
    // so the tallest card still fits above.
    const tallest = Math.max(0, ...rows[0].map(c => c.el.offsetHeight))
    const offset = Math.max(0, tallest + 4 - mid)
    figure.style.top = `${offset}px`
    let maxBottom = offset + H
    const lines: string[] = []
    rows.forEach((row, r) => {
      const lefts = pack(row.map(c => c.a[0] * scale - cardW / 2), W, cardW)
      row.forEach((c, i) => {
        const left = lefts[i], h = c.el.offsetHeight
        const top = r === 0 ? offset + mid - 4 - h : offset + mid + 4
        c.el.style.left = `${left}px`
        c.el.style.top = `${top}px`
        maxBottom = Math.max(maxBottom, top + h)
        const ax = c.a[0] * scale, ay = offset + c.a[1] * scale, cx = left + cardW / 2
        const cy = r === 0 ? top + h : top
        if (Math.abs(cx - ax) > 36 || (r === 0 && ay > cy + 24) || (r === 1 && ay < cy - 24)) {
          const x1 = Math.max(left + 10, Math.min(left + cardW - 10, ax))
          lines.push(`<line x1="${x1}" y1="${cy}" x2="${ax}" y2="${ay}"/><circle cx="${ax}" cy="${ay}" r="3"/>`)
        }
      })
    })
    if (leaders) leaders.innerHTML = lines.join('')
    stage.style.height = `${maxBottom + 4}px`
  }, [groups, lying, width])
  useLayoutEffect(() => {
    if (open) layout()
  }, [layout, open])
  useEffect(() => {
    if (!open || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => layout())
    for (const el of cardRefs.current.values()) ro.observe(el)
    return () => ro.disconnect()
  }, [layout, open, groups])

  // What the agent is told (see usePanelContext.ts).
  const summary = useMemo(() => {
    const scope = pageItem ? `"${pageItem.title}"` : 'the graph root'
    if (!groups.length) return `The body panel is open for ${scope}, but nothing here has a body-part tag yet.`
    const parts = groups.map(g => `${g.part.label.toLowerCase()} (${g.count})`).join(', ')
    return `The body panel is open for ${scope}, showing its items on a body figure by part: ${parts}.${selectedPart ? ` Selected: ${selectedPart.label.toLowerCase()}.` : ''}`
  }, [groups, pageItem, selectedPart])
  useEffect(() => {
    setPanelContext(summary)
    return () => setPanelContext('')
  }, [summary]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phones: keep the page's end above the bottom bar as the panel opens;
  // desktop brings the bar into view.
  useLayoutEffect(() => {
    if (!open) return
    if (window.matchMedia?.(MOBILE_QUERY).matches) anchorRef.current?.scrollIntoView({ block: 'end' })
    else barRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, groups.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected && open) cardRefs.current.get(selected)?.scrollIntoView({ block: 'nearest' })
  }, [selected, open])

  const count = groups.reduce((sum, g) => sum + g.count, 0)
  return (
    <div className={`tag-panel body-panel${open ? ' open' : ''}`}>
      <div className="tag-panel-bar" ref={barRef}>
        <BodyIcon />
        <span className="tag-panel-title">{pageItem?.title ?? 'Body'}</span>
        <span className="tag-panel-count">
          {groups.length} {groups.length === 1 ? 'part' : 'parts'} · {count} {count === 1 ? 'item' : 'items'}
        </span>
        <span className="tag-panel-spacer" />
        <button type="button" className="tag-panel-close" onClick={close} title="Close" aria-label="Close body panel">
          <XIcon />
        </button>
        <button
          type="button"
          className="tag-panel-toggle"
          onClick={() => setOpen(!open)}
          title={open ? 'Hide' : 'Show'}
          aria-label={open ? 'Hide body panel' : 'Show body panel'}
          aria-expanded={open}
        >
          <ChevronDownIcon />
        </button>
      </div>
      {open && (
        <div className="body-content" ref={contentRef}>
          <div className={`body-stage ${lying ? 'lying' : 'standing'}`} ref={stageRef}>
            <div className="body-figure-wrap" ref={figureRef}>
              <BodyFigure
                present={presentIds}
                selected={selected}
                lying={lying}
                onPartClick={p => { if (presentIds.has(p.id)) setSelected(p.id) }}
              />
            </div>
            {lying && <svg className="body-leaders" ref={leadersRef} />}
            {groups.map(g => (
              <div
                key={g.part.id}
                className={`body-card${selected === g.part.id ? ' sel' : ''}`}
                data-part={g.part.id}
                ref={el => { if (el) cardRefs.current.set(g.part.id, el); else cardRefs.current.delete(g.part.id) }}
              >
                <ItemResults
                  graphName={graphName}
                  structure={structure!}
                  items={g.items}
                  realPaths={g.realPaths}
                  onSaved={onSaved}
                  onTagClick={onTagClick}
                  onSyntheticClick={() => setSelected(g.part.id)}
                />
              </div>
            ))}
          </div>
          {groups.length === 0 && (
            <div className="panel-note">
              Nothing here has a body-part tag yet{selectedPart ? ` — ${selectedPart.label.toLowerCase()} is tagged elsewhere in the graph` : ''}.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BodyPanel
