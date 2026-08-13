// Client for the in-app conversational agent. Calls the Claude API directly
// from the browser using the user's own API key (BYOK) — same "your own
// credential, stored locally, used to talk to a third-party API directly"
// pattern already used for GitHub Gist sync (see gistClient.ts's PAT_KEY).
// This keeps the app's "no server" architecture intact: usage is billed to
// the user's own Anthropic account, not routed through anything we host.

import Anthropic from '@anthropic-ai/sdk'

export const API_KEY_KEY = 'anthropic_api_key'
const MODEL = 'claude-opus-5'

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? ''
}

export function saveApiKey(key: string) {
  const t = key.trim()
  if (t) localStorage.setItem(API_KEY_KEY, t)
  else localStorage.removeItem(API_KEY_KEY)
}

export interface AgentChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PREAMBLE = `You are a helpful assistant embedded inside "Knowledge Graph", a personal
hierarchical note-taking app. The user is looking at the view described below
(as its Markdown representation — heading depth is nesting depth, "(x/y)"
suffixes are progress, trailing amounts are cost). Answer questions about it
concisely. You cannot edit the graph yet — if asked to make a change, say so
plainly rather than pretending to do it.`

// Streams a reply for the given conversation. onDelta fires with each
// incremental text chunk (for progressive rendering); the resolved string is
// the complete final text. Throws on any failure (missing/invalid key,
// network, refusal, etc.) — callers should catch and render an error state.
export async function streamAgentReply(
  messages: AgentChatMessage[],
  viewContext: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 4096,
      system: `${SYSTEM_PREAMBLE}\n\nCurrent view:\n${viewContext}`,
      messages,
    },
    { signal },
  )

  stream.on('text', onDelta)

  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') {
    throw new Error('The assistant declined to answer that.')
  }
  const textBlock = final.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return textBlock?.text ?? ''
}
