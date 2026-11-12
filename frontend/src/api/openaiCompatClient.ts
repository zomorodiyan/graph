// Runs the agent against any OpenAI-compatible /chat/completions endpoint
// (OpenRouter, Groq, Google Gemini's compatibility layer, a local Ollama,
// …) — the route for free or near-free models. Plain fetch, no SDK: the
// endpoints differ in small ways and a hand-rolled loop is easier to keep
// tolerant than a vendor SDK pinned to one of them. The Claude path stays
// on the official Anthropic SDK (see agentClient.ts); only the tool
// definitions are shared.

export interface CompatTool {
  name: string
  description: string
  input_schema: unknown
  // Typed loosely on purpose: the tool definitions are shared with the
  // Anthropic SDK path, whose makeTool() types each run() to its own input.
  run: (input: any) => Promise<string>
}

interface CompatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface CompatUsage { inputTokens: number; outputTokens: number; usd?: number }

interface RunOptions {
  baseUrl: string
  apiKey: string
  model: string
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  tools: CompatTool[]
  maxIterations: number
  onDelta: (text: string) => void
  onToolUse: (toolName: string) => void
  signal?: AbortSignal
}

// Streams one chat completion, returning its text, any tool calls it asked
// for, and usage if the endpoint reported it. Tool-call arguments arrive as
// fragments across chunks, keyed by index — stitched back together here.
async function streamOnce(
  opts: RunOptions,
  history: CompatMessage[],
): Promise<{ text: string; toolCalls: NonNullable<CompatMessage['tool_calls']>; usage?: CompatUsage; finish: string | null }> {
  const base = opts.baseUrl.replace(/\/+$/, '')
  const isOpenRouter = /openrouter\.ai/.test(base)
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: history,
    stream: true,
  }
  if (opts.tools.length) {
    body.tools = opts.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))
  }
  // OpenRouter reports the request's cost in the final chunk when asked.
  if (isOpenRouter) body.usage = { include: true }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`

  const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = await res.json()
      detail = j?.error?.message ?? j?.message ?? JSON.stringify(j)
    } catch { /* no JSON body */ }
    throw new Error(`${detail}`)
  }
  if (!res.body) throw new Error('Empty response from the model endpoint.')

  let text = ''
  const calls: { id: string; name: string; args: string }[] = []
  let usage: CompatUsage | undefined
  let finish: string | null = null

  const handleChunk = (json: any) => {
    if (json.usage) {
      usage = {
        inputTokens: json.usage.prompt_tokens ?? 0,
        outputTokens: json.usage.completion_tokens ?? 0,
        ...(typeof json.usage.cost === 'number' && { usd: json.usage.cost }),
      }
    }
    if (json.error) throw new Error(json.error.message ?? 'The model endpoint returned an error.')
    const choice = json.choices?.[0]
    if (!choice) return
    if (choice.finish_reason) finish = choice.finish_reason
    const delta = choice.delta ?? choice.message
    if (!delta) return
    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content
      opts.onDelta(delta.content)
    }
    for (const tc of delta.tool_calls ?? []) {
      const idx = tc.index ?? calls.length
      if (!calls[idx]) {
        calls[idx] = { id: tc.id ?? `call_${idx}`, name: '', args: '' }
        if (tc.function?.name) opts.onToolUse(tc.function.name)
      }
      if (tc.id) calls[idx].id = tc.id
      if (tc.function?.name) calls[idx].name = tc.function.name
      if (tc.function?.arguments) calls[idx].args += tc.function.arguments
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try { handleChunk(JSON.parse(payload)) } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
  // A non-streaming endpoint (one that ignored stream:true) answers with a
  // single JSON object instead of SSE lines.
  if (!text && !calls.length && buffer.trim().startsWith('{')) {
    try { handleChunk(JSON.parse(buffer)) } catch { /* not JSON either */ }
  }

  return {
    text,
    toolCalls: calls.filter(Boolean).map(c => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args } })),
    usage,
    finish,
  }
}

export async function runOpenAICompat(opts: RunOptions): Promise<{ text: string; usage: CompatUsage }> {
  const history: CompatMessage[] = [
    { role: 'system', content: opts.system },
    ...opts.messages.map(m => ({ role: m.role, content: m.content })),
  ]
  const totals: CompatUsage = { inputTokens: 0, outputTokens: 0 }
  let costKnown = true
  let lastText = ''

  for (let i = 0; i < opts.maxIterations; i++) {
    const turn = await streamOnce(opts, history)
    if (turn.usage) {
      totals.inputTokens += turn.usage.inputTokens
      totals.outputTokens += turn.usage.outputTokens
      if (turn.usage.usd !== undefined) totals.usd = (totals.usd ?? 0) + turn.usage.usd
      else costKnown = false
    } else {
      costKnown = false
    }
    lastText = turn.text
    if (!turn.toolCalls.length) break

    history.push({ role: 'assistant', content: turn.text || null, tool_calls: turn.toolCalls })
    for (const call of turn.toolCalls) {
      const tool = opts.tools.find(t => t.name === call.function.name)
      let result: string
      if (!tool) {
        result = `Error: no tool named "${call.function.name}".`
      } else {
        try {
          const input = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {}
          result = await tool.run(input)
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      history.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
    if (turn.text) opts.onDelta('\n')
  }

  if (!costKnown) delete totals.usd
  return { text: lastText, usage: totals }
}

// Lists the models an endpoint serves (GET /models) for the settings
// panel's picker. Gemini prefixes ids with "models/", which its chat
// endpoint doesn't want back. OpenRouter's free models sort first.
export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = baseUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const res = await fetch(`${base}/models`, { headers })
  if (!res.ok) throw new Error(`Could not list models (HTTP ${res.status}).`)
  const json = await res.json()
  const items: any[] = Array.isArray(json) ? json : (json.data ?? json.models ?? [])
  const ids = items
    .map(m => (typeof m === 'string' ? m : m.id ?? m.name))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map(id => id.replace(/^models\//, ''))
  const free = ids.filter(id => id.endsWith(':free')).sort()
  const rest = ids.filter(id => !id.endsWith(':free')).sort()
  return [...free, ...rest]
}
