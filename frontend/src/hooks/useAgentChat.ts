import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentChatMessage, getApiKey, saveApiKey, streamAgentReply } from '../api/agentClient'

// Persisted in localStorage (like everything else in this app — graphs,
// theme, the API key) rather than only living in React state, so the
// conversation survives a reload/tab close instead of vanishing. One global
// thread, not per-graph — matches how the panel already behaves today,
// surviving navigation between graphs and the graphs list within a session.
const MESSAGES_KEY = 'agent_chat_messages'
// The whole array is replayed to the API on every turn (no trimming/caching
// today), so an unbounded persisted history means unbounded, ever-growing
// cost and latency per message, not just a storage concern. Capping to the
// last ~10 exchanges keeps that bounded while still giving the agent real
// continuity across a reload.
const MAX_STORED_MESSAGES = 20

function loadMessages(): AgentChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? capMessages(parsed) : []
  } catch {
    return []
  }
}
function capMessages(msgs: AgentChatMessage[], limit = MAX_STORED_MESSAGES): AgentChatMessage[] {
  return msgs.length > limit ? msgs.slice(-limit) : msgs
}

export function useAgentChat() {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<AgentChatMessage[]>(loadMessages)
  const [isSending, setIsSending] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState(getApiKey)
  const abortRef = useRef<AbortController | null>(null)

  const saveKey = useCallback((key: string) => {
    saveApiKey(key)
    setApiKey(getApiKey())
  }, [])

  // Debounced persistence — streaming can fire many small deltas per second,
  // and writing the whole array to localStorage on every one is wasted work.
  // Waiting until 300ms of quiet (covers between-delta gaps mid-stream, and
  // fires quickly once a reply finishes) keeps writes infrequent without
  // meaningfully delaying what actually gets saved.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
    }, 300)
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [messages])

  const clearMessages = useCallback(() => {
    setMessages([])
    localStorage.removeItem(MESSAGES_KEY)
  }, [])

  const sendMessage = useCallback(async (
    text: string,
    viewContext: string,
    graphName: string | undefined,
    onMutate: () => void,
    onHighlight: (paths: string[]) => void,
    onDeletePending: (paths: string[]) => void,
  ) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    // Capped to MAX_STORED_MESSAGES-1 (not the full cap) so the assistant
    // placeholder appended right below never needs a second trim of its own
    // — a trim there would shift every index by however many messages it
    // dropped, silently invalidating assistantIndex right as streaming starts.
    const history = capMessages([...messages, { role: 'user' as const, content: trimmed }], MAX_STORED_MESSAGES - 1)
    setMessages(history)
    setError(null)
    setActiveTool(null)
    setIsSending(true)

    // Placeholder assistant message that fills in as deltas stream — index
    // captured now so onDelta below always targets the right slot even
    // though state updates are batched/async.
    const assistantIndex = history.length
    setMessages(m => [...m, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamAgentReply(
        history,
        viewContext,
        graphName,
        onMutate,
        onHighlight,
        onDeletePending,
        delta => {
          setMessages(m => {
            const next = [...m]
            next[assistantIndex] = { role: 'assistant', content: next[assistantIndex].content + delta }
            return next
          })
        },
        toolName => setActiveTool(toolName),
        controller.signal,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(
        message === 'NO_API_KEY'
          ? 'Add your Anthropic API key to start chatting.'
          : /authentication|invalid.*key|401/i.test(message)
            ? 'That API key was rejected — check it and try again.'
            : message || 'Something went wrong.',
      )
      // Drop the empty/partial assistant placeholder so the error is the
      // only trace of this turn, instead of leaving a blank bubble behind.
      setMessages(m => m.filter((_, i) => i !== assistantIndex || m[i].content))
    } finally {
      setIsSending(false)
      setActiveTool(null)
      abortRef.current = null
    }
  }, [messages, isSending])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { expanded, setExpanded, messages, isSending, activeTool, error, apiKey, saveKey, sendMessage, stop, clearMessages }
}
