import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAgentChat } from '../hooks/useAgentChat'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useVisualViewportRect } from '../hooks/useVisualViewportRect'
import { useHighlights } from '../hooks/useHighlights'
import { useGraphs, getItemByPath } from '../hooks/useGraph'
import { fetchStructure, serializeItem, serializeStructure } from '../api/localClient'

// Persistent, app-wide chat surface (mounted once in App.tsx, so it survives
// navigation between the graphs list and any individual graph — "from
// within any view" per the App Features template). Telegram-style: the
// input row is always visible at the bottom of every screen (no toggle to
// open/close), and focusing it expands the panel to show history/key-setup
// above it. Talks to the Claude API directly from the browser with the
// user's own key (see agentClient.ts), which can view, edit, and add items
// in the currently open graph via tools.
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

  // Blurs the input (if focused) and collapses back to the bar-only state.
  // Used by the close button, Escape, and losing focus entirely.
  const collapse = () => {
    inputRef.current?.blur()
    setExpanded(false)
  }

  useModalBackButton(expanded, collapse)

  const { top, height } = useVisualViewportRect()
  const keyboardLikelyOpen = height < window.innerHeight - 80 // same heuristic as MobileEditSheet.tsx

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
    <div className="agent-chat-viewport" style={{ top, height }}>
      <div
        className={`agent-chat-panel${expanded ? ' expanded' : ''}${keyboardLikelyOpen ? ' keyboard-open' : ''}`}
        onBlur={handleContainerBlur}
      >
        <div className="agent-chat-header">
          <span>Agent</span>
          <button className="agent-chat-close" onClick={collapse} title="Close">&times;</button>
        </div>

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
            keyboard mid-transition). See useVisualViewportRect.ts's own
            comment for why the *positioning* half of this already works
            regardless of expanded/collapsed state. */}
        <div className="agent-chat-input-row">
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
            placeholder={apiKey ? 'Message the agent…' : 'Tap to connect your API key…'}
            rows={1}
          />
          {isSending ? (
            <button className="agent-chat-send stop" onClick={stop} title="Stop">&#9632;</button>
          ) : (
            <button className="agent-chat-send" onClick={handleSend} disabled={!draft.trim() || !apiKey} title="Send">&#10148;</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AgentChat
