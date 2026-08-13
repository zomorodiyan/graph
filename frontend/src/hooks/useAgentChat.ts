import { useCallback, useRef, useState } from 'react'
import { AgentChatMessage, getApiKey, saveApiKey, streamAgentReply } from '../api/agentClient'

export function useAgentChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<AgentChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState(getApiKey)
  const abortRef = useRef<AbortController | null>(null)

  const saveKey = useCallback((key: string) => {
    saveApiKey(key)
    setApiKey(getApiKey())
  }, [])

  const sendMessage = useCallback(async (
    text: string,
    viewContext: string,
    graphName: string | undefined,
    onMutate: () => void,
    onHighlight: (paths: string[]) => void,
  ) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    const history = [...messages, { role: 'user' as const, content: trimmed }]
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

  return { isOpen, setIsOpen, messages, isSending, activeTool, error, apiKey, saveKey, sendMessage, stop }
}
