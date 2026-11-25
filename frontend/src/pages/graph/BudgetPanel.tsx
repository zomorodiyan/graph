import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { GraphInfo, Structure, updateGraph, updateItem } from '@api'
import { getItemByPath } from '../../hooks/useGraph'
import { MOBILE_QUERY } from '../../hooks/useBottomAnchor'
import { useViewOptions } from '../../hooks/useViewOptions'
import { usePanelContext } from '../../hooks/usePanelContext'
import { ChevronDownIcon, ChevronRightIcon, ClockIcon, CoinIcon, XIcon } from '../../components/icons'
import { ValueKind, formatValue, itemValue, withValue } from '../../utils/tags'
import { BUDGET_META_KEY, BudgetNode, buildBudget, hasValues, stepFor } from '../../utils/budget'

// The budget panel's state, owned by GraphView so a value tag ("2h", "$50")
// on any item can open it on that kind, focused on that item. Kept while
// moving between pages of the same graph; reset when the graph changes.
export function useBudgetPanel(graphName?: string) {
  // Which kind is shown — null while the panel is closed.
  const [kind, setKind] = useState<ValueKind | null>(null)
  const [open, setOpen] = useState(true)
  const [focus, setFocus] = useState<string | null>(null)
  useEffect(() => {
    setKind(null)
    setFocus(null)
  }, [graphName])
  const show = (k: ValueKind, path?: string) => {
    setKind(k)
    setOpen(true)
    setFocus(path ?? null)
  }
  const close = () => {
    setKind(null)
    setFocus(null)
  }
  return { kind, setKind, open, setOpen, focus, show, close }
}

export type BudgetPanelState = ReturnType<typeof useBudgetPanel>

interface BudgetPanelProps {
  panel: BudgetPanelState
  graphName: string
  structure?: Structure
  // The page's item path ('' at the graph root) — the panel's scope.
  path: string
  graph?: GraphInfo
  anchorRef: React.RefObject<HTMLElement>
  onSaved: () => void
}

// Fixed series colors (see --series-1..8 in index.css), one per top-level
// row in page order; past eight, the rest share one gray.
const SERIES = 8
function colorOf(index: number, count: number): string {
  return count <= SERIES || index < SERIES - 1 ? `var(--series-${index + 1})` : 'var(--series-other)'
}

const KIND_LABEL: Record<ValueKind, string> = { hours: 'hours', money: 'money' }
// The editing id for the pool itself (item paths never start with "~").
const POOL = '~pool'

// A page's items as spending out of a pool, like skill points in a game
// (see utils/budget.ts for the model): the bar at the top is the pool, one
// colored block per top-level item; the rows below are the legend, each
// with its own bar on the same scale and +/- buttons that move one token
// (half an hour, or a round amount of money) — which edits the item's
// value tag. The pool is the page item's own value tag, or at the graph
// root the graph's budget (its metadata); tapping it sets it. Branches
// without a value of their own roll their children up and open to show
// them; a branch with its own value is a pool for its children, shown as a
// lighter track with the allocated part solid.
function BudgetPanel({ panel, graphName, structure, path, graph, anchorRef, onSaved }: BudgetPanelProps) {
  const { kind, setKind, open, setOpen, focus, close } = panel
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { depth } = useViewOptions()
  const barRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [, setPanelContext] = usePanelContext(graphName, 'budget')
  // The row (path) whose value is being typed, or POOL. Mirrored in a ref
  // so Enter and the blur that follows the input's removal commit once.
  const [editing, setEditing] = useState<string | null>(null)
  const editingRef = useRef<string | null>(null)
  const [draft, setDraft] = useState('')
  // Per-branch open/closed overrides; by default branches open down to the
  // view's depth (2 or 3 levels), like the page itself.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [showEmpty, setShowEmpty] = useState(false)

  const k: ValueKind = kind ?? 'hours'
  const pageItem = path && structure ? getItemByPath(structure, path) : null
  const items = useMemo(() => (path ? pageItem?.children : structure?.structure) ?? {}, [path, pageItem, structure])
  const nodes = useMemo(() => buildBudget(items, path, k), [items, path, k])
  const kinds = useMemo(() => (['hours', 'money'] as ValueKind[]).filter(x => hasValues(items, x)), [items])
  const showKinds = new Set([k, ...kinds]).size > 1
  const pool = pageItem ? itemValue(pageItem, k) : graph?.[BUDGET_META_KEY[k]] ?? null
  const used = nodes.reduce((sum, n) => sum + n.total, 0)
  const over = pool !== null && used > pool + 1e-9
  const scale = Math.max(pool ?? 0, used) || 1
  const step = stepFor(k, pool ?? used)
  const valued = nodes.filter(n => !n.empty)
  const empty = nodes.filter(n => n.empty)
  const viewLevels = depth === 0 ? 3 : depth
  const fmt = (n: number) => formatValue(k, n)
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`
  // Token ticks across the pool bar, every step — doubled up while they'd
  // be too dense to read (a $3000 pool in $50 steps shows $100 ticks).
  let tick = step
  while (scale / tick > 40) tick *= 2
  const ticks = `${(tick / scale) * 100}%`

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
    onSaved()
  }
  // Writes an item's value tag of this kind (null removes it).
  const setValue = async (itemPath: string, amount: number | null) => {
    const item = getItemByPath(structure, itemPath)
    if (!item) return
    await updateItem(itemPath, { tags: withValue(item.tags, k, amount) }, graphName)
    await refresh()
  }
  // The pool: the page item's own value tag, or the graph's budget at the root.
  const setPool = async (amount: number | null) => {
    if (pageItem) {
      await setValue(path, amount)
      return
    }
    await updateGraph(graphName, k === 'hours' ? { hours_budget: amount ?? undefined } : { money_budget: amount ?? undefined })
    await queryClient.invalidateQueries({ queryKey: ['graphs'] })
  }
  // One token more or less; a rolled-up branch gets its own value, starting
  // from its total.
  const bump = (node: BudgetNode, dir: 1 | -1) => {
    const base = node.own ?? node.total
    const next = +Math.max(0, base + dir * step).toFixed(2)
    void setValue(node.path, next || null)
  }
  const startEdit = (id: string, current: number | null) => {
    editingRef.current = id
    setEditing(id)
    setDraft(current === null ? '' : String(+current.toFixed(2)))
  }
  const cancelEdit = () => {
    editingRef.current = null
    setEditing(null)
  }
  const commitEdit = () => {
    const id = editingRef.current
    if (id === null) return
    cancelEdit()
    const text = draft.trim()
    const n = text === '' ? 0 : Number(text)
    if (!Number.isFinite(n) || n < 0) return
    const amount = n > 0 ? +n.toFixed(2) : null
    if (id === POOL) void setPool(amount)
    else void setValue(id, amount)
  }
  // Same target as a click in the graph: into the item if it has children,
  // otherwise its parent page.
  const openItem = (itemPath: string) => {
    const item = getItemByPath(structure, itemPath)
    const target = item?.children && Object.keys(item.children).length > 0
      ? itemPath
      : itemPath.split('.').slice(0, -1).join('.')
    navigate(`/g/${graphName}${target ? `/${target.replace(/\./g, '/')}` : ''}`)
  }
  const isExpanded = (node: BudgetNode, level: number) =>
    overrides.get(node.path) ?? (level < viewLevels - 1 || (focus?.startsWith(`${node.path}.`) ?? false))

  // What the agent is told (see usePanelContext.ts).
  const summary = useMemo(() => {
    const scope = pageItem ? `"${pageItem.title}"` : 'the graph root'
    const poolText = pool !== null
      ? `${fmt(used)} of ${fmt(pool)} used${over ? ` (${fmt(used - pool)} over)` : ` (${fmt(pool - used)} left)`}`
      : `${fmt(used)} in total, no budget set`
    const rows = valued.map(n => `${n.title} ${fmt(n.total)}${n.own !== null && n.allocated > 0 ? ` (${fmt(n.allocated)} allocated inside it)` : ''}`)
    return `The ${KIND_LABEL[k]} budget panel is open for ${scope}: ${poolText}.${rows.length ? ` Items: ${rows.join(', ')}.` : ''}`
  }, [k, pageItem, pool, used, over, nodes]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPanelContext(summary)
    return () => setPanelContext('')
  }, [summary]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phones: keep the page's end above the bottom bar as the panel opens or
  // its rows come and go; desktop brings the bar into view.
  useLayoutEffect(() => {
    if (!open) return
    if (window.matchMedia?.(MOBILE_QUERY).matches) anchorRef.current?.scrollIntoView({ block: 'end' })
    else barRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, k, valued.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // The item whose tag opened the panel.
  useEffect(() => {
    if (focus && open) rowRefs.current.get(focus)?.scrollIntoView({ block: 'nearest' })
  }, [focus, open])

  const valueInput = (label: string) => (
    <input
      className="budget-input"
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={draft}
      autoFocus
      onChange={e => setDraft(e.target.value)}
      onBlur={commitEdit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
        else if (e.key === 'Escape') cancelEdit()
      }}
      aria-label={label}
    />
  )

  const renderRow = (node: BudgetNode, level: number, color: string): JSX.Element => {
    const kids = node.children.filter(c => !c.empty)
    const expanded = kids.length > 0 && isExpanded(node, level)
    // Its own value is a pool its children spend from.
    const hasPool = node.own !== null && node.allocated > 0
    const solid = hasPool ? Math.min(node.allocated, node.own!) : node.total
    const value = hasPool
      ? `${fmt(node.allocated)} of ${fmt(node.own!)}`
      : node.own !== null ? fmt(node.own) : `${fmt(node.total)} total`
    return (
      <div
        key={node.path}
        className={`budget-row${focus === node.path ? ' focus' : ''}${level ? ' nested' : ''}`}
        data-path={node.path}
        ref={el => { if (el) rowRefs.current.set(node.path, el); else rowRefs.current.delete(node.path) }}
      >
        <div className="budget-row-head">
          <span className="budget-swatch" style={{ background: color }} />
          <button type="button" className="budget-row-title" onClick={() => openItem(node.path)} title="Open in the graph">{node.title}</button>
          {kids.length > 0 && (
            <button
              type="button"
              className={`budget-expand${expanded ? ' expanded' : ''}`}
              onClick={() => setOverrides(m => new Map(m).set(node.path, !expanded))}
              title={expanded ? 'Hide its items' : 'Show its items'}
              aria-expanded={expanded}
            >
              <ChevronRightIcon />
            </button>
          )}
          {editing === node.path ? valueInput(`${KIND_LABEL[k]} for ${node.title}`) : (
            <button type="button" className="budget-value" onClick={() => startEdit(node.path, node.own)} title="Tap to type a value">{value}</button>
          )}
          <button type="button" className="budget-step" onClick={() => bump(node, -1)} disabled={(node.own ?? node.total) <= 0} aria-label={`Less ${KIND_LABEL[k]} for ${node.title}`}>−</button>
          <button type="button" className="budget-step" onClick={() => bump(node, 1)} aria-label={`More ${KIND_LABEL[k]} for ${node.title}`}>+</button>
        </div>
        <div className="budget-bar">
          {hasPool && <div className="budget-bar-track" style={{ width: pct(node.own!), background: color }} />}
          <div className="budget-bar-fill" style={{ width: pct(solid), background: color }} />
          {hasPool && node.allocated > node.own! && (
            <div className="budget-bar-over" style={{ left: pct(node.own!), width: pct(Math.min(node.allocated, scale) - node.own!) }} />
          )}
        </div>
        {expanded && kids.map(child => renderRow(child, level + 1, color))}
      </div>
    )
  }

  const renderEmpty = (node: BudgetNode) => (
    <div key={node.path} className="budget-row empty" data-path={node.path}>
      <div className="budget-row-head">
        <span className="budget-swatch" />
        <button type="button" className="budget-row-title" onClick={() => openItem(node.path)} title="Open in the graph">{node.title}</button>
        <button type="button" className="budget-step" onClick={() => bump(node, 1)} aria-label={`Give ${node.title} ${KIND_LABEL[k]}`}>+</button>
      </div>
    </div>
  )

  const scopeTitle = pageItem?.title ?? graph?.display_name ?? graphName
  const poolTitle = pageItem
    ? `The budget is ${pageItem.title}'s own ${KIND_LABEL[k]} tag — tap to change it`
    : `The budget for this graph's top level — tap to change it`
  return (
    <div className={`tag-panel budget-panel${open ? ' open' : ''}`} data-kind={k}>
      <div className="tag-panel-bar" ref={barRef}>
        {showKinds ? (
          <span className="budget-kind" role="group" aria-label="Kind">
            <button type="button" className={k === 'hours' ? 'active' : ''} onClick={() => setKind('hours')} title="Hours" aria-pressed={k === 'hours'}><ClockIcon /></button>
            <button type="button" className={k === 'money' ? 'active' : ''} onClick={() => setKind('money')} title="Money" aria-pressed={k === 'money'}><CoinIcon /></button>
          </span>
        ) : (k === 'hours' ? <ClockIcon /> : <CoinIcon />)}
        <span className="tag-panel-title">{scopeTitle}</span>
        {editing === POOL ? valueInput('Budget') : (
          <button type="button" className={`budget-pool-text${over ? ' over' : ''}`} onClick={() => startEdit(POOL, pool)} title={poolTitle}>
            {pool !== null ? `${fmt(used)} of ${fmt(pool)}` : fmt(used)}
            <span className="budget-pool-note">
              {pool === null ? ' · set budget' : over ? ` · ${fmt(used - pool)} over` : ` · ${fmt(pool - used)} left`}
            </span>
          </button>
        )}
        <span className="tag-panel-spacer" />
        <button type="button" className="tag-panel-close" onClick={close} title="Close" aria-label="Close budget panel"><XIcon /></button>
        <button type="button" className="tag-panel-toggle" onClick={() => setOpen(!open)} title={open ? 'Hide' : 'Show'} aria-label={open ? 'Hide budget panel' : 'Show budget panel'} aria-expanded={open}><ChevronDownIcon /></button>
      </div>
      {open && (
        <div className="budget-body">
          <div className={`budget-pool${over ? ' over' : ''}`} role="img" aria-label={`${fmt(used)}${pool !== null ? ` of ${fmt(pool)}` : ''}`}>
            {valued.map((n, i) => n.total > 0 && (
              <div key={n.path} className="budget-pool-seg" style={{ width: pct(n.total), background: colorOf(i, valued.length) }} title={`${n.title} · ${fmt(n.total)}`} />
            ))}
            <div className="budget-pool-ticks" style={{ '--tick': ticks } as React.CSSProperties} />
            {over && <div className="budget-pool-limit" style={{ left: pct(pool!) }} title={`Budget ${fmt(pool!)}`} />}
          </div>
          <div className="budget-rows">
            {valued.map((n, i) => renderRow(n, 0, colorOf(i, valued.length)))}
            {valued.length === 0 && <div className="panel-note">Nothing here has {KIND_LABEL[k]} yet — tap + on an item to give it some.</div>}
            {empty.length > 0 && valued.length > 0 && (
              <button type="button" className="budget-empty-toggle" onClick={() => setShowEmpty(!showEmpty)} aria-expanded={showEmpty}>
                {empty.length} without {KIND_LABEL[k]} {showEmpty ? '▴' : '▾'}
              </button>
            )}
            {(showEmpty || valued.length === 0) && empty.map(renderEmpty)}
          </div>
        </div>
      )}
    </div>
  )
}

export default BudgetPanel
