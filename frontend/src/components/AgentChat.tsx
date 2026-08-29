import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentChat } from '../hooks/useAgentChat'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useVisualViewportRect } from '../hooks/useVisualViewportRect'
import { useHighlights } from '../hooks/useHighlights'
import { useViewOptions } from '../hooks/useViewOptions'
import { useLongPress } from '../hooks/useLongPress'
import { useTheme } from '../context/ThemeContext'
import { useGraphs, getItemByPath } from '../hooks/useGraph'
import { useSyncManager, SyncAllResult } from '../hooks/useSyncManager'
import { fetchStructure, serializeItem, serializeStructure } from '../api/localClient'
import AgentAccessGuide from './AgentAccessGuide'
import Notification from './Notification'

// View depths cycled by tapping the depth button — 3 levels, 2 levels.
// Raw (0) isn't part of the cycle; long-pressing the button jumps to it directly.
const DEPTHS = [3, 2] as const

// Smallest the permanent bubble can be dragged down to — two different
// floors depending on whether the input row is part of the bubble's own
// layout right now (see .agent-chat-input-row's position:fixed/static
// toggle in App.css). Composing (.expanded): input row (~56px) + handle
// (~16px) + one line of an actual message (~34px, plus the messages-inner
// wrapper's own ~22px padding) ≈ 128px, rounded up a bit for safety so a
// single reply line is never clipped even at the floor. Idle: the bubble
// holds no input row at all (it lives in its own fixed bar at the bottom of
// the screen instead), so the same sum minus the input row's ~56px — just
// handle + one message line + padding ≈ 72px, +4 for the same safety
// margin — is enough, letting the bubble collapse noticeably smaller
// whenever there's nothing being composed.
const MIN_PANEL_HEIGHT_EXPANDED = 132
const MIN_PANEL_HEIGHT_IDLE = 76

// Docked split-pane sizing (>=32rem — see .agent-chat-shell/.agent-chat-splitter
// in App.css). Below 60rem the split stacks (drag adjusts DOCK_HEIGHT
// instead of DOCK_WIDTH) since there isn't room to sit side-by-side at a
// readable width.
const WIDE_SPLIT_QUERY = '(min-width: 60rem)'
const MIN_DOCK_WIDTH = 260
const MAX_DOCK_WIDTH_RATIO = 0.5
const DEFAULT_DOCK_WIDTH = 380
const MIN_DOCK_HEIGHT = 160
const MAX_DOCK_HEIGHT_RATIO = 0.7
const DEFAULT_DOCK_HEIGHT_RATIO = 0.45

function readStoredSize(key: string, fallback: number) {
  const saved = Number(localStorage.getItem(key))
  return saved > 0 ? saved : fallback
}

// Persistent, app-wide chat surface (mounted once in App.tsx, so it survives
// navigation between the graphs list and any individual graph — "from
// within any view" per the App Features template). On mobile this is a
// PERMANENT top-anchored bubble (see .agent-chat-shell in App.css) whose
// outer bounds (position + height) never move. Idle (not composing), the
// bubble shows only messages + the resize handle — the whole input row
// (theme/depth/ctx/sync buttons + textarea + send), a single line tall,
// lives in its own `position: fixed` bar at the true bottom of the screen
// instead, via a CSS toggle on `.agent-chat-input-row` keyed off `.expanded`
// (see App.css) — it stays a child of this component's JSX/DOM the whole
// time, never unmounted. Focusing the textarea flips that class: the row
// rejoins the bubble's own flex flow at its bottom (`position: static`) and
// the view-buttons hide (no room once composing), while the bubble itself
// doesn't move or resize. The hardware/gesture back button (and Escape)
// blur the textarea and undo both, via useModalBackButton below. Desktop
// keeps the original collapsed-bar / expanded-card toggle behavior,
// unaffected by any of this — see the `min-width: 32rem` overrides in
// App.css. Talks to the Claude API directly from the browser with the
// user's own key (see agentClient.ts), which can view, edit, and add items
// in the currently open graph via tools.
function AgentChat({ panelOpen, setPanelOpen }: { panelOpen: boolean; setPanelOpen: (open: boolean) => void }) {
  const { expanded, setExpanded, messages, isSending, activeTool, error, apiKey, saveKey, sendMessage, stop } = useAgentChat()
  const [draft, setDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const location = useLocation()
  // useParams() only sees params of the route it's nested inside — this
  // component is mounted as a sibling of <Routes> (see App.tsx) so it can
  // survive navigation instead of remounting per view, which means it sits
  // outside any <Route> match entirely. Pull graphName from the URL
  // directly instead, same shape GraphView.tsx itself assumes.
  const graphName = location.pathname.match(/^\/g\/([^/]+)/)?.[1]
  // Same queryKey shape as useGraph.ts's useStructure — shares its cache
  // entry when GraphView already has this graph loaded, instead of
  // duplicating the fetch. Gated on graphName so this never runs on the
  // graphs-list page (fetchStructure(undefined) would silently default to
  // a graph literally named "default").
  const { data: structure } = useQuery({
    queryKey: ['structure', graphName],
    queryFn: () => fetchStructure(graphName),
    enabled: Boolean(graphName),
  })
  const { data: graphs } = useGraphs()
  const { userHighlights, setAgentHighlights } = useHighlights(graphName)

  // Theme is a global toggle, relevant everywhere. Depth/note only make
  // sense with a graph open, so their buttons are gated on graphName below.
  const { toggleTheme } = useTheme()
  const { depth, viewMode, minimalView, setDepth, setViewMode, setMinimalView } = useViewOptions()
  const depthLongPress = useLongPress(
    () => setDepth(0),
    () => setDepth(d => {
      const idx = (DEPTHS as readonly number[]).indexOf(d)
      return DEPTHS[(idx + 1) % DEPTHS.length]
    }),
  )
  const ctxLongPress = useLongPress(
    () => setMinimalView(v => !v),
    () => {
      if (minimalView) { setMinimalView(false); return }
      setViewMode(m => m === 'context' ? 'default' : 'context')
    },
  )

  // GitHub Gist sync — moved here from StructuresView.tsx so its button (and
  // the "Connect GitHub Gist" guide/PAT form it opens when there's no token
  // yet) can live alongside the theme/depth/note buttons (see the graphs-
  // list-only gating below). StructuresView still shows the per-graph sync
  // status badges, reading them via loadSyncStatus() rather than holding
  // its own copy of this hook's state — useSyncManager's internal state is
  // plain useState (not shared across separate call sites), so this is now
  // the one and only place that calls it.
  const { isSyncing, pat, configure, syncAll } = useSyncManager(queryClient)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'syncing' } | null>(null)
  const [showGistConfig, setShowGistConfig] = useState(false)
  const [showAgentGuide, setShowAgentGuide] = useState(false)
  const [patInput, setPatInput] = useState('')
  const patInputRef = useRef<HTMLInputElement>(null)

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), type === 'error' ? 8000 : 3000)
  }

  // Same favicon-reflects-sync-state effect StructuresView used to own.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) return
    link.href = pat ? '/icon-colored.svg' : '/icon.svg'
  }, [pat])

  useModalBackButton(showAgentGuide, () => setShowAgentGuide(false))

  const handleSyncClick = async () => {
    if (!pat) {
      setPatInput('')
      setShowGistConfig(true)
      setTimeout(() => patInputRef.current?.focus(), 50)
      return
    }
    const { error, pushed, pulled }: SyncAllResult = await syncAll()
    if (error) {
      showNotification(error, 'error')
    } else if (pushed === 0 && pulled === 0) {
      showNotification('Everything up to date')
    } else {
      const parts = []
      if (pushed) parts.push(`${pushed} pushed`)
      if (pulled) parts.push(`${pulled} pulled`)
      showNotification(`Synced — ${parts.join(', ')}`)
    }
  }

  // Tap runs handleSyncClick as before; long-press opens the agent-access
  // guide instead (independent of connection state).
  const syncLongPress = useLongPress(() => setShowAgentGuide(true), handleSyncClick)

  const handleSaveGistConfig = async () => {
    configure(patInput, '')
    setShowGistConfig(false)
    const { error, pushed, pulled } = await syncAll()
    if (error) {
      showNotification(error, 'error')
    } else if (pushed === 0 && pulled === 0) {
      showNotification('Connected — nothing to sync yet')
    } else {
      const parts = []
      if (pushed) parts.push(`${pushed} pushed`)
      if (pulled) parts.push(`${pulled} pulled`)
      showNotification(`Connected — ${parts.join(', ')}`)
    }
  }

  // Blurs the input (dismissing the keyboard on mobile) and marks composing
  // as done — on mobile that just brings the view-buttons row back, on
  // desktop it also collapses the card. Used by Escape, losing focus
  // entirely, and (via useModalBackButton) the hardware/gesture back button
  // — which is what makes "press back to dismiss the keyboard" also bring
  // the row back, since both go through this same path.
  const collapse = () => {
    inputRef.current?.blur()
    setExpanded(false)
  }

  useModalBackButton(expanded, collapse)

  // Only `height` is used — the visible area's height above any on-screen
  // keyboard, consulted for the permanent bubble's default size and as the
  // drag handle's max bound (see below). `top` isn't needed: the mobile
  // bubble is always position:fixed; top:0, no keyboard-relative
  // positioning left to compute.
  const { height } = useVisualViewportRect()

  // Draggable height of the permanent mobile bubble (desktop ignores this —
  // its CSS forces height:auto regardless, see App.css). Starts at the idle
  // floor (expanded is always false on mount, see useAgentChat) and stays
  // there until the user actually drags, after which it's remembered for
  // the rest of the session — composing/blurring no longer resets it, since
  // the bubble isn't collapsing/expanding anymore, just staying put like
  // the user set it. A fixed floor needs no viewport measurement to be
  // correct, unlike an earlier version of this that defaulted to a third of
  // the visible height and had to keep re-deriving that fraction as the
  // keyboard animated open/closed.
  const [panelHeight, setPanelHeight] = useState(MIN_PANEL_HEIGHT_IDLE)
  const hasDraggedRef = useRef(false)
  // Once the user has dragged, a shrinking viewport (keyboard opening,
  // rotation) can't leave the panel taller than the new visible area —
  // before any drag the panel just sits at its fixed floor, nothing to
  // reclamp.
  useEffect(() => {
    if (hasDraggedRef.current) setPanelHeight(h => Math.min(h, height))
  }, [height])

  // The permanent mobile bubble is position:fixed, so it doesn't reserve
  // any space in normal page flow — GraphView/StructuresView's own content
  // still starts at the true top of the page and would render right
  // underneath it (covered) without this. Publishing the live height as a
  // CSS var (read via a mobile-only padding-top in App.css/StructuresView
  // .css) lets those pages push their own content down by exactly this
  // much, live, as the user drags the bubble bigger/smaller — rather than
  // wiring up cross-component React state for something purely presentational.
  // Desktop's CSS never references this var, so setting it unconditionally
  // (not gated on viewport width) is harmless there. useLayoutEffect (not
  // useEffect) so this is set before paint — otherwise there'd be a
  // one-frame flash of page content under the bubble before it gets
  // pushed down.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--agent-bubble-height', `${panelHeight}px`)
  }, [panelHeight])

  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const handleResizeStart = (e: React.PointerEvent) => {
    // The handle itself isn't focusable, so without this the browser's
    // default mousedown-on-non-focusable-element behavior blurs the
    // textarea right as the drag starts — which fires handleContainerBlur
    // and collapses the panel out from under the drag before it can do
    // anything. preventDefault keeps focus (and expanded) exactly as-is.
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    hasDraggedRef.current = true
    dragStateRef.current = { startY: e.clientY, startHeight: panelHeight }
  }
  const handleResizeMove = (e: React.PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag) return
    const next = drag.startHeight + (e.clientY - drag.startY)
    const floor = expanded ? MIN_PANEL_HEIGHT_EXPANDED : MIN_PANEL_HEIGHT_IDLE
    setPanelHeight(Math.min(Math.max(next, floor), height))
  }
  const handleResizeEnd = () => {
    dragStateRef.current = null
  }

  // Composing needs more room than idle (the input row joins the bubble's
  // own layout — see MIN_PANEL_HEIGHT_EXPANDED above), so a height the user
  // dragged down to while idle could be too short once they start typing.
  // Bump it up to the composing floor right when that happens; never
  // shrinks it back down on blur — a height the user deliberately set stays
  // put, exactly like normal (see hasDraggedRef's own comment above).
  useEffect(() => {
    if (expanded) setPanelHeight(h => Math.max(h, MIN_PANEL_HEIGHT_EXPANDED))
  }, [expanded])

  // Docked panel's own size (>=32rem only — mobile ignores these, see
  // panelHeight above). Two independent dimensions since row-split (wide)
  // and column-split (narrow) modes resize different axes; each keeps
  // whatever the user last dragged it to, persisted separately so switching
  // orientation by resizing the browser window doesn't lose either one.
  const [dockWidth, setDockWidthRaw] = useState(() => readStoredSize('agent-panel-width', DEFAULT_DOCK_WIDTH))
  const [dockHeight, setDockHeightRaw] = useState(() => readStoredSize('agent-panel-height', Math.round(window.innerHeight * DEFAULT_DOCK_HEIGHT_RATIO)))
  useEffect(() => { localStorage.setItem('agent-panel-width', String(dockWidth)) }, [dockWidth])
  useEffect(() => { localStorage.setItem('agent-panel-height', String(dockHeight)) }, [dockHeight])
  const setDockWidth = (w: number) => setDockWidthRaw(Math.min(Math.max(w, MIN_DOCK_WIDTH), window.innerWidth * MAX_DOCK_WIDTH_RATIO))
  const setDockHeight = (h: number) => setDockHeightRaw(Math.min(Math.max(h, MIN_DOCK_HEIGHT), window.innerHeight * MAX_DOCK_HEIGHT_RATIO))

  // Splitter drag (.agent-chat-splitter) — orientation is read fresh off
  // matchMedia at drag-start rather than tracked in state, since it only
  // matters for the duration of one drag and the CSS breakpoint is the
  // single source of truth for which axis is actually visible.
  const splitDragRef = useRef<{ axis: 'x' | 'y'; start: number; startSize: number } | null>(null)
  const handleSplitterDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const isWide = window.matchMedia(WIDE_SPLIT_QUERY).matches
    splitDragRef.current = isWide
      ? { axis: 'x', start: e.clientX, startSize: dockWidth }
      : { axis: 'y', start: e.clientY, startSize: dockHeight }
  }
  const handleSplitterMove = (e: React.PointerEvent) => {
    const drag = splitDragRef.current
    if (!drag) return
    // The panel sits after the splitter (to its right, or below it), so
    // dragging toward the panel (left/up) should grow it — hence the sign
    // flip on both axes.
    if (drag.axis === 'x') setDockWidth(drag.startSize - (e.clientX - drag.start))
    else setDockHeight(drag.startSize - (e.clientY - drag.start))
  }
  const handleSplitterUp = () => {
    splitDragRef.current = null
  }

  const viewContext = useMemo(() => {
    if (!graphName) {
      if (!graphs?.length) return 'The user is on the graphs list, which is empty.'
      return `The user is on the graphs list. Available graphs:\n${graphs.map(g => `- ${g.display_name} (${g.name})`).join('\n')}`
    }
    const items = structure?.structure
    if (!items) return `The user is inside the graph "${graphName}" (still loading).`

    const prefix = `/g/${graphName}`
    const remaining = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : ''
    const path = remaining === '' || remaining === '/' ? '' : remaining.slice(1).replace(/\//g, '.')

    const item = path ? getItemByPath(structure, path) : null
    const base = item
      ? `The user is viewing "${item.title}" inside the graph "${graphName}":\n${serializeItem('item', item)}`
      : `The user is at the root of the graph "${graphName}":\n${serializeStructure(items)}`

    if (!userHighlights.length) return base
    const highlightLines = userHighlights.map(p => {
      const h = getItemByPath(structure, p)
      return `- ${p}${h ? ` ("${h.title}")` : ''}`
    })
    return `${base}\n\nThe user has highlighted these items themselves:\n${highlightLines.join('\n')}`
  }, [graphName, structure, graphs, location.pathname, userHighlights])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight })
  }, [messages])

  // Focus the message box once a key gets connected while expanded (e.g.
  // right after saving it in the key-setup form) — expanding otherwise
  // always originates FROM focusing the textarea, so no separate effect is
  // needed for that direction.
  useEffect(() => {
    if (expanded && apiKey) inputRef.current?.focus()
  }, [apiKey])

  // Telegram-style grow-with-content input, capped so it can't swallow the
  // whole panel.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [draft])

  // Same box, two meanings depending on connection state: with no key
  // saved yet, whatever's typed here IS the key (submitting routes to
  // saveKey instead of sendMessage) — no separate key-entry form anymore.
  const handleSend = () => {
    if (!draft.trim() || isSending) return
    if (!apiKey) {
      saveKey(draft)
      setDraft('')
      return
    }
    sendMessage(
      draft,
      viewContext,
      graphName,
      () => {
        queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
        // GraphView keeps its own optimistic "localItems" snapshot that a
        // plain invalidation above doesn't reach (see GraphView.tsx's
        // agentMutationSignal) — bump it so an agent-driven edit/add actually
        // shows up on screen instead of only landing in localStorage.
        queryClient.setQueryData(['agent-mutation-signal', graphName], (n: number = 0) => n + 1)
      },
      setAgentHighlights,
    )
    setDraft('')
  }

  // Collapse when focus leaves the whole panel (not just the textarea) —
  // e.g. tapping Send, which lives in the same container, must NOT collapse
  // it mid-send. Same relatedTarget-containment check InlineItemEditor.tsx
  // uses for its own commit-on-blur.
  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const nextFocused = e.relatedTarget as Node | null
    if (nextFocused && e.currentTarget.contains(nextFocused)) return
    setExpanded(false)
  }

  return (
    <>
    {/* Docked split-pane drag handle (>=32rem, panel open only — see
        .agent-chat-splitter in App.css). Sits between .app-main and the
        shell in DOM order so flex places it right at their boundary; axis
        (width vs height) is purely CSS-driven by the same 60rem breakpoint
        handleSplitterDown reads via matchMedia. */}
    {panelOpen && (
      <div
        className="agent-chat-splitter"
        onPointerDown={handleSplitterDown}
        onPointerMove={handleSplitterMove}
        onPointerUp={handleSplitterUp}
        onPointerCancel={handleSplitterUp}
        title="Drag to resize"
      />
    )}
    <div
      className={`agent-chat-shell${expanded ? ' expanded' : ''}${panelOpen ? ' docked-open' : ' docked-closed'}`}
      style={{ height: panelHeight, ...({ '--agent-panel-width': `${dockWidth}px`, '--agent-panel-height': `${dockHeight}px` } as React.CSSProperties) }}
      onBlur={handleContainerBlur}
    >
      {/* Docked-only header (>=32rem, see .agent-chat-dock-header in
          App.css) — collapses the panel back to the reopen tab. Mobile and
          the old floating-card desktop look never had a header, so this
          stays hidden below 32rem via CSS, not a class toggle. */}
      <div className="agent-chat-dock-header">
        <button
          className="agent-chat-dock-collapse"
          onClick={() => setPanelOpen(false)}
          title="Collapse agent panel"
        >
          ✕
        </button>
      </div>
      {!apiKey ? (
        <div className="agent-chat-key-setup">
          <p className="agent-chat-key-title">Connect your Anthropic API key</p>
          <p className="agent-chat-key-hint">
            Chat calls the Claude API directly from your browser with your own key —
            usage is billed to your Anthropic account, not to this app. Get one at{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>, then paste it below.
          </p>
        </div>
      ) : (
        // The padding lives on the inner div, not this one — this outer
        // element is the flex item that needs to shrink to true zero when
        // the panel's dragged to MIN_PANEL_HEIGHT (see .agent-chat-messages
        // in App.css), and fixed padding can't be shrunk away by
        // min-height:0. Overflow from the (padded) inner content just
        // scrolls within this outer element instead of pushing the input
        // row/resize handle below it out of the panel.
        <div className="agent-chat-messages" ref={messagesRef}>
          <div className="agent-chat-messages-inner">
            {messages.length === 0 && !error && (
              <p className="agent-chat-empty">Ask, or tell it to edit or add items.</p>
            )}
            {messages.map((m, i) => {
              const isStreamingReply = m.role === 'assistant' && isSending && i === messages.length - 1
              return (
                <div key={i} className={`agent-chat-message ${m.role}`}>
                  {m.content || (isStreamingReply ? '…' : '')}
                  {isStreamingReply && activeTool && (
                    <div className="agent-chat-tool-use">Using {activeTool}…</div>
                  )}
                </div>
              )
            })}
            {error && <div className="agent-chat-error">{error}</div>}
          </div>
        </div>
      )}

      {/* Never unmounted — the textarea's DOM node (and its focus) must
          never be disturbed. Idle (not composing): the WHOLE row — buttons
          + textbox + send — is pulled out via position:fixed into its own
          bar at the true bottom of the screen (see .agent-chat-input-row
          in App.css), since the permanent bubble itself shows no input
          until you actually focus it. Composing (.expanded): the row
          rejoins the bubble's own flex flow at its bottom instead — the
          bubble's own bounds never move, only this internal reflow happens
          — and the view-buttons group hides (CSS descendant selector, no
          class toggle needed) since there's no room for it there and it
          doesn't apply mid-chat anyway. Desktop ignores all of this — the
          row is always part of the collapsed-bar/expanded-card's own
          layout, unchanged from before. */}
      <div className="agent-chat-input-row">
        <div className="agent-chat-view-buttons">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" />
          {graphName && (
            <button
              className={`depth-toggle active${depth === 0 ? ' raw' : ''}`}
              {...depthLongPress}
              title={depth === 0 ? 'Raw view — tap to return, long-press elsewhere for Raw' : `Showing ${depth} levels — tap to cycle, long-press for Raw`}
            >{depth === 0 ? 'R' : depth}</button>
          )}
          {graphName && (
            <button
              className={`ctx-toggle${viewMode === 'context' ? ' active' : ''}${minimalView ? ' minimal' : ''}`}
              {...ctxLongPress}
              title={minimalView
                ? 'Minimal view — tap to return to normal'
                : `${viewMode === 'context' ? 'Note on' : 'Note off'} — tap to toggle, long-press for minimal view`}
            >N</button>
          )}
          {!graphName && (
            <button
              className={`sync-toggle${isSyncing ? ' spinning' : ''}${pat ? ' active' : ''}`}
              {...syncLongPress}
              title={pat ? 'Sync with GitHub Gist — long-press for agent access' : 'Connect GitHub to enable sync — long-press for agent access'}
              disabled={isSyncing}
            >↻</button>
          )}
        </div>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              collapse()
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={apiKey ? 'Message the agent…' : 'Enter key'}
          rows={1}
        />
        {isSending ? (
          <button className="agent-chat-send stop" onClick={stop} title="Stop">&#9632;</button>
        ) : (
          <button className="agent-chat-send" onClick={handleSend} disabled={!draft.trim()} title={apiKey ? 'Send' : 'Save key'}>&#10148;</button>
        )}
      </div>

      <div
        className="agent-chat-resize-handle"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        title="Drag to resize"
      >
        <div className="agent-chat-resize-grip" />
      </div>
    </div>

    {/* Replaces the docked panel when collapsed (>=32rem — hidden below
        that via CSS, mobile has no collapse concept at all). */}
    {!panelOpen && (
      <button className="agent-panel-reopen" onClick={() => setPanelOpen(true)} title="Open agent panel">
        Agent
      </button>
    )}

    {notification && <Notification message={notification.message} type={notification.type} />}

    {showGistConfig && (
      <div className="gist-config-panel">
        <div className="gist-config-guide">
          <p className="gist-guide-title">Connect GitHub Gist for sync</p>
          <ol className="gist-guide-steps">
            <li>Go to <a href="https://github.com/settings/tokens/new?scopes=gist&description=Knowledge+Graph+Sync" target="_blank" rel="noreferrer">github.com → Settings → Tokens</a></li>
            <li>Check only <strong>gist</strong> scope, generate &amp; copy the token</li>
            <li>Paste it below — your graphs sync to a private Gist only you can see</li>
          </ol>
        </div>
        <div className="gist-config-inputs">
          <input
            ref={patInputRef}
            type="password"
            placeholder="Paste GitHub token here"
            value={patInput}
            onChange={e => setPatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveGistConfig(); if (e.key === 'Escape') setShowGistConfig(false) }}
          />
          <div className="gist-config-actions">
            <button className="btn-save-url" onClick={handleSaveGistConfig} disabled={!patInput.trim()}>Connect</button>
            <button className="btn-cancel-url" onClick={() => setShowGistConfig(false)}>Cancel</button>
          </div>
        </div>
      </div>
    )}

    {showAgentGuide && <AgentAccessGuide onClose={() => setShowAgentGuide(false)} />}
    </>
  )
}

export default AgentChat
