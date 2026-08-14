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
import { fetchStructure, serializeItem, serializeStructure } from '../api/localClient'

// View depths cycled by tapping the depth button — 3 levels, 2 levels.
// Raw (0) isn't part of the cycle; long-pressing the button jumps to it directly.
const DEPTHS = [3, 2] as const

// Smallest the permanent bubble can be dragged down to — enough to still
// show a line or two of actual conversation above the input row, not just
// the input row itself (a bare-minimum floor felt too easy to shrink down
// to something useless). Purely a UX floor, easy to retune.
const MIN_PANEL_HEIGHT = 180

// Persistent, app-wide chat surface (mounted once in App.tsx, so it survives
// navigation between the graphs list and any individual graph — "from
// within any view" per the App Features template). On mobile this is a
// PERMANENT top-anchored bubble (see .agent-chat-shell in App.css) —
// scrollable conversation history above a fixed input row, always visible,
// user-resizable via the drag handle. Focusing the textarea doesn't move or
// resize anything; it only (a) makes the theme/depth/note buttons — now a
// separate fixed row at the bottom of the screen, see .agent-chat-view-
// buttons — hide temporarily so the keyboard doesn't cover them uselessly,
// and (b) wires up the hardware/gesture back button to blur the textarea
// (dismissing the keyboard) and bring that row back, via useModalBackButton
// below. Desktop keeps the original collapsed-bar / expanded-card toggle
// behavior, unaffected by any of this — see the `min-width: 32rem` overrides
// in App.css. Talks to the Claude API directly from the browser with the
// user's own key (see agentClient.ts), which can view, edit, and add items
// in the currently open graph via tools.
function AgentChat() {
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
  // its CSS forces height:auto regardless, see App.css). Defaults to a
  // third of the visible height and keeps tracking it live (in case the
  // keyboard is still animating open when this first sets, or opens/closes
  // later) until the user actually drags, after which it's remembered for
  // the rest of the session — composing/blurring no longer resets it, since
  // the bubble isn't collapsing/expanding anymore, just staying put like
  // the user set it.
  // Lazy-initialized from the real viewport (not 0) so there's no flash of
  // a collapsed-to-nothing bubble before the effect below corrects it —
  // the height style is now applied unconditionally (see the JSX), unlike
  // before when it only applied while expanded.
  const [panelHeight, setPanelHeight] = useState(() =>
    Math.round((typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 0) / 3)
  )
  const hasDraggedRef = useRef(false)
  useEffect(() => {
    if (!hasDraggedRef.current) {
      setPanelHeight(Math.round(height / 3))
    } else {
      setPanelHeight(h => Math.min(h, height))
    }
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
    setPanelHeight(Math.min(Math.max(next, MIN_PANEL_HEIGHT), height))
  }
  const handleResizeEnd = () => {
    dragStateRef.current = null
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
    <div
      className={`agent-chat-shell${expanded ? ' expanded' : ''}`}
      style={{ height: panelHeight }}
      onBlur={handleContainerBlur}
    >
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
              <p className="agent-chat-empty">Ask about what's in view, or tell it to edit or add items.</p>
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
          never be disturbed. Theme/depth/note buttons wrap in their own
          group: on mobile that group is pulled out via position:fixed into
          its own row at the bottom of the screen (see .agent-chat-view-
          buttons in App.css) — a separate, hideable-while-composing row,
          not part of this bar — while on desktop it stays inline right
          here (display:contents), unchanged from before. Living in this
          same DOM position either way means no extra state to keep two
          copies of these buttons in sync. */}
      <div className="agent-chat-input-row">
        <div className={`agent-chat-view-buttons${expanded ? ' hidden' : ''}`}>
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
  )
}

export default AgentChat
