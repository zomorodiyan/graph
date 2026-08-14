import { useEffect, useMemo, useRef, useState } from 'react'
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

// Smallest the expanded panel can be dragged down to — roughly one input row
// plus the resize handle's own strip, so "just one line of input" stays true.
const MIN_PANEL_HEIGHT = 72

// Persistent, app-wide chat surface (mounted once in App.tsx, so it survives
// navigation between the graphs list and any individual graph — "from
// within any view" per the App Features template). Telegram-style: a single
// compose bar (theme/depth/note buttons + textbox + send) is always visible
// at the bottom of every screen. Focusing the textbox expands it into a
// TOP-anchored, user-resizable panel instead of trying to keep a
// bottom-anchored panel pinned above the on-screen keyboard via JS — the
// top edge needs no keyboard tracking at all (it's always 0), and
// visualViewport height is only consulted as a max-drag clamp, not raced
// against scroll on every frame (see useViewOptions.ts / the drag handlers
// below). Talks to the Claude API directly from the browser with the user's
// own key (see agentClient.ts), which can view, edit, and add items in the
// currently open graph via tools.
function AgentChat() {
  const { expanded, setExpanded, messages, isSending, activeTool, error, apiKey, saveKey, sendMessage, stop } = useAgentChat()
  const [draft, setDraft] = useState('')
  const [keyInput, setKeyInput] = useState('')
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

  // Blurs the input (if focused) and collapses back to the bar-only state.
  // Used by the close button, Escape, and losing focus entirely.
  const collapse = () => {
    inputRef.current?.blur()
    setExpanded(false)
  }

  useModalBackButton(expanded, collapse)

  // Only `height` is used — the visible area's height above any on-screen
  // keyboard, consulted purely as the drag handle's max bound (see below).
  // `top` isn't needed: the expanded panel is always position:fixed; top:0,
  // no keyboard-relative positioning left to compute.
  const { height } = useVisualViewportRect()

  // Draggable height of the expanded panel. Defaults to a third of the
  // visible height and keeps tracking it live (in case the keyboard is
  // still animating open when this first sets) until the user actually
  // drags, after which only a downward clamp applies if the visible height
  // shrinks further. Resets on every collapse->expand transition.
  const [panelHeight, setPanelHeight] = useState(0)
  const hasDraggedRef = useRef(false)
  useEffect(() => {
    if (!expanded) {
      hasDraggedRef.current = false
      return
    }
    if (!hasDraggedRef.current) {
      setPanelHeight(Math.round(height / 3))
    } else {
      setPanelHeight(h => Math.min(h, height))
    }
  }, [expanded, height])

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

  const handleSend = () => {
    if (!draft.trim() || isSending) return
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

  const handleSaveKey = () => {
    if (!keyInput.trim()) return
    saveKey(keyInput)
    setKeyInput('')
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
      style={expanded ? { height: panelHeight } : undefined}
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
            </a>.
          </p>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
          />
          <button className="agent-chat-save-key" onClick={handleSaveKey} disabled={!keyInput.trim()}>
            Save key
          </button>
        </div>
      ) : (
        <div className="agent-chat-messages" ref={messagesRef}>
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
      )}

      {/* Always rendered — collapsed state IS this row, so the textarea's
          DOM node must never unmount (would drop focus / close the
          keyboard mid-transition). Theme/depth/note buttons live here too,
          Telegram/WhatsApp-style, hidden via CSS (not unmounted) once
          expanded. */}
      <div className="agent-chat-input-row">
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
          <button className="agent-chat-send" onClick={handleSend} disabled={!draft.trim() || !apiKey} title="Send">&#10148;</button>
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
