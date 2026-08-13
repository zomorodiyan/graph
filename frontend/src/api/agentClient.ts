// Client for the in-app conversational agent. Calls the Claude API directly
// from the browser using the user's own API key (BYOK) — same "your own
// credential, stored locally, used to talk to a third-party API directly"
// pattern already used for GitHub Gist sync (see gistClient.ts's PAT_KEY).
// This keeps the app's "no server" architecture intact: usage is billed to
// the user's own Anthropic account, not routed through anything we host.

import Anthropic from '@anthropic-ai/sdk'
import { getItemByPath } from '../hooks/useGraph'
import { createItem, fetchStructure, serializeItem, serializeStructure, updateItem, UpdatePayload } from './localClient'

// The SDK's own betaTool() helper (helpers/beta/json-schema) builds this
// exact shape — {type: 'custom', name, input_schema, description, run,
// parse}, a plain passthrough parse — but its deep subpath export uses a
// multi-segment wildcard ("./helpers/*") that Rollup fails to resolve at
// build time (Vite dev/esbuild resolves it fine; `vite build` doesn't).
// Reproducing the tiny runtime shape directly sidesteps that entirely.
function makeTool<Input>(options: {
  name: string
  description: string
  inputSchema: Anthropic.Beta.BetaTool.InputSchema
  run: (input: Input) => Promise<string>
}) {
  return {
    type: 'custom' as const,
    name: options.name,
    input_schema: options.inputSchema,
    description: options.description,
    run: options.run,
    parse: (content: unknown) => content as Input,
  }
}

export const API_KEY_KEY = 'anthropic_api_key'
const MODEL = 'claude-opus-5'
// Each tool call the agent makes (view/update/add) burns one iteration —
// generous enough for a multi-step edit, but bounded so a confused loop
// can't run away.
const MAX_TOOL_ITERATIONS = 10

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
suffixes are progress, trailing amounts are cost). When you mention items to
the user, describe them in plain language rather than quoting the raw
Markdown syntax back at them.

You have tools to look at, edit, and add items anywhere in the current graph,
not just what's shown below. Use view_item to look something up (by its
dot-separated path, e.g. "alpha.beta") before editing or adding under it if
you haven't already seen its exact path in this conversation — calling
view_item with an empty path shows the whole graph as an outline, useful for
finding a path when you only know an item's title. If a graph is not
currently open, these tools are unavailable — say so rather than guessing.

You also have highlight_items, a way to visually point at specific items in
the app itself (a colored ring appears around them) instead of only naming
them in text — use it whenever you refer to particular items, so the user
can spot them in the list without hunting. It replaces your previous
highlights each time, so pass every item you're currently pointing at, not
just new ones; pass an empty array once you've moved on. Separately, the
view below may say the user has highlighted some items themselves — that's
them pointing at something for you, most likely what their message is about.`

interface ViewItemArgs { path: string }
interface UpdateItemArgs {
  path: string
  name?: string
  context?: string
  progress?: string
  cost_amount?: number
  cost_unit?: string
  clear_cost?: boolean
}
interface AddItemArgs { parent_path: string; name: string; context?: string; progress?: string }
interface HighlightItemsArgs { paths: string[] }

function buildTools(graphName: string | undefined, onMutate: () => void, onHighlight: (paths: string[]) => void) {
  if (!graphName) return []

  return [
    makeTool<ViewItemArgs>({
      name: 'view_item',
      description:
        'View an item\'s full details (title, note, progress, cost, and its children) by its dot-separated path in the current graph, e.g. "alpha.beta". Call with an empty path to see the whole graph as an outline first if you do not already know the exact path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Dot-separated path, e.g. "alpha.beta". Empty string for the whole graph.' },
        },
        required: ['path'],
      },
      run: async ({ path }) => {
        const structure = await fetchStructure(graphName)
        if (!path) return serializeStructure(structure.structure) || '(this graph has no items yet)'
        const item = getItemByPath(structure, path)
        if (!item) return `No item found at path "${path}". Try an empty path to see the whole graph.`
        return serializeItem(path, item)
      },
    }),
    makeTool<UpdateItemArgs>({
      name: 'update_item',
      description:
        'Edit an existing item\'s title, note, progress, or cost. Only include the fields you want to change — omitted fields are left untouched.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Dot-separated path to the item to edit.' },
          name: { type: 'string', description: 'New title.' },
          context: { type: 'string', description: 'New free-text note. Pass an empty string to clear it.' },
          progress: { type: 'string', description: 'New progress: "X/Y" (e.g. "3/10") or a 0-100 percent number as a string. Pass an empty string to clear it.' },
          cost_amount: { type: 'number', description: 'New cost amount. Provide together with cost_unit.' },
          cost_unit: { type: 'string', description: 'New cost unit, e.g. "$" or "hr". Provide together with cost_amount.' },
          clear_cost: { type: 'boolean', description: 'Set true to remove the cost entirely.' },
        },
        required: ['path'],
      },
      run: async ({ path, name, context, progress, cost_amount, cost_unit, clear_cost }) => {
        const payload: UpdatePayload = {}
        if (name !== undefined) payload.name = name
        if (context !== undefined) payload.context = context
        if (progress !== undefined) payload.progress = progress
        if (clear_cost) {
          payload.cost = null
        } else if (cost_amount !== undefined || cost_unit !== undefined) {
          if (cost_amount === undefined || cost_unit === undefined) {
            throw new Error('Both cost_amount and cost_unit are required together to set a cost.')
          }
          payload.cost = { amount: cost_amount, unit: cost_unit }
        }
        const result = await updateItem(path, payload, graphName)
        onMutate()
        return `Updated "${result.data.title}" at "${result.path}".`
      },
    }),
    makeTool<AddItemArgs>({
      name: 'add_item',
      description: 'Create a new item under a parent item, or at the top level of the graph.',
      inputSchema: {
        type: 'object',
        properties: {
          parent_path: { type: 'string', description: 'Dot-separated path of the parent to add under. Empty string to add at the top level of the graph.' },
          name: { type: 'string', description: 'Title for the new item.' },
          context: { type: 'string', description: 'Optional free-text note.' },
          progress: { type: 'string', description: 'Optional starting progress, e.g. "0/10".' },
        },
        required: ['parent_path', 'name'],
      },
      run: async ({ parent_path, name, context, progress }) => {
        const payload: UpdatePayload = { name }
        if (context !== undefined) payload.context = context
        if (progress !== undefined) payload.progress = progress
        const result = await createItem(parent_path, payload, graphName)
        onMutate()
        return `Created "${result.data.title}" at "${result.path}".`
      },
    }),
    makeTool<HighlightItemsArgs>({
      name: 'highlight_items',
      description:
        'Visually highlight one or more items in the app (a colored ring appears around them) to point the user at them. Replaces your previous highlights entirely — include every item you\'re still pointing at, not just new ones. Pass an empty array to clear your highlights once you\'ve moved on.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dot-separated paths of the items to highlight, e.g. ["alpha.beta", "gamma"]. Empty array clears your highlights.',
          },
        },
        required: ['paths'],
      },
      run: async ({ paths }) => {
        onHighlight(paths)
        return paths.length ? `Highlighted ${paths.length} item(s).` : 'Cleared your highlights.'
      },
    }),
  ]
}

// Streams a reply for the given conversation, letting the model call the
// view/update/add/highlight tools as needed. onDelta fires with each
// incremental text chunk (across every turn of the tool loop, concatenated
// into one flowing reply); onToolUse fires with a tool's name each time the
// model invokes one, for a lightweight "doing something" indicator. onMutate
// fires after any successful update_item/add_item, so the caller can
// invalidate its React Query cache and see the change reflected live;
// onHighlight fires with the agent's full highlight set each time
// highlight_items is called (an empty array means "cleared"). Throws on
// failure (missing/invalid key, network, refusal, etc.) — callers should
// catch and render an error state.
export async function streamAgentReply(
  messages: AgentChatMessage[],
  viewContext: string,
  graphName: string | undefined,
  onMutate: () => void,
  onHighlight: (paths: string[]) => void,
  onDelta: (text: string) => void,
  onToolUse: (toolName: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const runner = client.beta.messages.toolRunner(
    {
      model: MODEL,
      max_tokens: 4096,
      system: `${SYSTEM_PREAMBLE}\n\nCurrent view:\n${viewContext}`,
      messages,
      tools: buildTools(graphName, onMutate, onHighlight),
      max_iterations: MAX_TOOL_ITERATIONS,
      stream: true,
    },
    { signal },
  )

  for await (const messageStream of runner) {
    for await (const event of messageStream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        onToolUse(event.content_block.name)
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onDelta(event.delta.text)
      }
    }
  }

  const final = await runner.done()
  if (final.stop_reason === 'refusal') {
    throw new Error('The assistant declined to answer that.')
  }
  const textBlock = final.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
  return textBlock?.text ?? ''
}
