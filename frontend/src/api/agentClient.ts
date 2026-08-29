// Client for the in-app conversational agent. Calls the Claude API directly
// from the browser using the user's own API key (BYOK) — same "your own
// credential, stored locally, used to talk to a third-party API directly"
// pattern already used for GitHub Gist sync (see gistClient.ts's PAT_KEY).
// This keeps the app's "no server" architecture intact: usage is billed to
// the user's own Anthropic account, not routed through anything we host.

import Anthropic from '@anthropic-ai/sdk'
import { getItemByPath } from '../hooks/useGraph'
import { createItem, fetchStructure, serializeItemForAgent, serializeStructureForAgent, updateItem, UpdatePayload } from './localClient'

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

const MENTION_TRUNCATE_LENGTH = 24

const SYSTEM_PREAMBLE = `You are a helpful assistant embedded inside "Knowledge Graph", a personal
hierarchical thinking/taxonomy/planning app. The user is looking at the view
described below (as its Markdown representation — heading depth is nesting
depth, a trailing "(YYYY-MM-DD)" is the item's date, trailing "#word" tokens
are its tags).

Default to the shortest reply that actually answers what was asked — a few
lines, not paragraphs. If asked to list items, list them (plain titles,
nothing more per item) instead of describing each one's contents. Don't add
observations, caveats, opinions, or follow-up questions the user didn't ask
for — answer only what was asked and stop. Go longer only when the user's
message itself calls for it (they ask for detail, analysis, or explicitly
want your take), or when you're about to do something consequential (like a
delete proposal) that genuinely needs explaining first.

When you mention an item by name to the user, write its plain title text with
no markdown emphasis (no bold, no italics, no quotes) — the highlight ring
(see below) is what shows the user exactly which item you mean, not text
styling. If a title is longer than ${MENTION_TRUNCATE_LENGTH} characters,
truncate it to ${MENTION_TRUNCATE_LENGTH} characters and append ".." (two
periods, not an ellipsis), e.g. "Multi-Material Simulatio..". Never quote the
raw Markdown heading syntax back at the user.

Every heading below also ends with its own path in ⟨angle brackets⟩, e.g.
"## Process Simulation (2026-07-15) ⟨projects.process_simulation⟩" — that
⟨...⟩ is the exact, real path for that item. When you call any tool that
takes a path (view_item, update_item, highlight_items,
request_delete_items), copy it verbatim from there. Never guess a path by
normalizing the title yourself (lowercasing it, swapping spaces for
underscores, etc.) — duplicate titles get suffixed, punctuation strips
unpredictably, and a guess that looks reasonable can still be wrong. The
⟨...⟩ marker itself is not part of the title — never include it when you
mention an item to the user.

You have tools to look at, edit, and add items anywhere in the current graph,
not just what's shown below. Use view_item to look something up before
editing or adding under it if you haven't already seen its ⟨path⟩ in this
conversation — calling view_item with an empty path shows the whole graph as
an outline, useful for finding an item's path when you only know its title.
If a graph is not currently open, these tools are unavailable — say so
rather than guessing.

You also have highlight_items, a way to visually point at specific items in
the app itself (a colored ring appears around them) instead of only naming
them in text — use it whenever you refer to particular items, so the user
can spot them in the list without hunting. It replaces your previous
highlights each time, so pass every item you're currently pointing at, not
just new ones; pass an empty array once you've moved on. Separately, the
view below may say the user has highlighted some items themselves — that's
them pointing at something for you, most likely what their message is about.

There is no direct delete tool. To remove an item, call
request_delete_items with the path(s) — this flags them with their own ring
(don't also call highlight_items for the same paths) and makes Confirm/Reject
buttons appear in the app; nothing is actually deleted until the user clicks
Confirm. Say what you're proposing to delete before calling it, and don't
assume it succeeded — you won't be told the outcome unless the user tells you
in their next message, so if it matters, ask.`

interface ViewItemArgs { path: string }
interface UpdateItemArgs {
  path: string
  name?: string
  context?: string
  date?: string
  tags?: string[]
}
interface AddItemArgs { parent_path: string; name: string; context?: string; date?: string; tags?: string[] }
interface HighlightItemsArgs { paths: string[] }
interface RequestDeleteItemsArgs { paths: string[] }

// Both highlight_items and request_delete_items take model-guessed paths —
// the model only ever sees titles in the Markdown outline, so it has to
// infer the dot-path itself, and sometimes gets it wrong (wrong
// normalization, a stale path from earlier in the conversation, etc.).
// Splitting into valid/invalid up front means a bad guess surfaces as
// specific feedback the model can act on, instead of the ring silently not
// appearing (highlight) or Confirm failing with a generic error later (delete).
async function partitionValidPaths(graphName: string, paths: string[]): Promise<{ valid: string[]; invalid: string[] }> {
  const structure = await fetchStructure(graphName)
  const valid: string[] = []
  const invalid: string[] = []
  for (const path of paths) {
    if (getItemByPath(structure, path)) valid.push(path)
    else invalid.push(path)
  }
  return { valid, invalid }
}

function buildTools(
  graphName: string | undefined,
  onMutate: () => void,
  onHighlight: (paths: string[]) => void,
  onDeletePending: (paths: string[]) => void,
) {
  if (!graphName) return []

  return [
    makeTool<ViewItemArgs>({
      name: 'view_item',
      description:
        'View an item\'s full details (title, note, date, tags, and its children) by its dot-separated path in the current graph, e.g. "alpha.beta". Call with an empty path to see the whole graph as an outline first if you do not already know the exact path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The item\'s path, copied from its ⟨...⟩ marker in the outline. Empty string for the whole graph.' },
        },
        required: ['path'],
      },
      run: async ({ path }) => {
        const structure = await fetchStructure(graphName)
        if (!path) return serializeStructureForAgent(structure.structure) || '(this graph has no items yet)'
        const item = getItemByPath(structure, path)
        if (!item) return `No item found at path "${path}". Try an empty path to see the whole graph.`
        return serializeItemForAgent(path, item)
      },
    }),
    makeTool<UpdateItemArgs>({
      name: 'update_item',
      description:
        'Edit an existing item\'s title, note, date, or tags. Only include the fields you want to change — omitted fields are left untouched.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The item\'s path, copied from its ⟨...⟩ marker in the outline.' },
          name: { type: 'string', description: 'New title.' },
          context: { type: 'string', description: 'New free-text note. Pass an empty string to clear it.' },
          date: { type: 'string', description: 'New date, "YYYY-MM-DD" — means whatever the user wants (due, scheduled, logged). Pass an empty string to clear it.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Wholesale replacement for the item\'s tags (short labels, letters/numbers/dash/underscore only). Pass an empty array to clear all tags.' },
        },
        required: ['path'],
      },
      run: async ({ path, name, context, date, tags }) => {
        const payload: UpdatePayload = {}
        if (name !== undefined) payload.name = name
        if (context !== undefined) payload.context = context
        if (date !== undefined) payload.date = date
        if (tags !== undefined) payload.tags = tags
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
          parent_path: { type: 'string', description: 'Path of the parent to add under, copied from its ⟨...⟩ marker in the outline. Empty string to add at the top level of the graph.' },
          name: { type: 'string', description: 'Title for the new item.' },
          context: { type: 'string', description: 'Optional free-text note.' },
          date: { type: 'string', description: 'Optional date, "YYYY-MM-DD".' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags (short labels, letters/numbers/dash/underscore only).' },
        },
        required: ['parent_path', 'name'],
      },
      run: async ({ parent_path, name, context, date, tags }) => {
        const payload: UpdatePayload = { name }
        if (context !== undefined) payload.context = context
        if (date !== undefined) payload.date = date
        if (tags !== undefined) payload.tags = tags
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
            description: 'Paths of the items to highlight, copied from their ⟨...⟩ markers in the outline. Empty array clears your highlights.',
          },
        },
        required: ['paths'],
      },
      run: async ({ paths }) => {
        if (paths.length === 0) {
          onHighlight([])
          return 'Cleared your highlights.'
        }
        const { valid, invalid } = await partitionValidPaths(graphName, paths)
        onHighlight(valid)
        if (invalid.length === 0) return `Highlighted ${valid.length} item(s).`
        const invalidNote = `Could not find, so skipped: ${invalid.join(', ')} — double-check these paths (view_item with an empty path shows the whole outline).`
        return valid.length > 0
          ? `Highlighted ${valid.length} item(s). ${invalidNote}`
          : invalidNote
      },
    }),
    makeTool<RequestDeleteItemsArgs>({
      name: 'request_delete_items',
      description:
        'Propose deleting one or more items (and their children). Does NOT delete anything itself — it flags the items with a ring in the app and shows the user Confirm/Reject buttons; the delete only happens if they click Confirm. Replaces any previous delete proposal. Pass an empty array to withdraw your proposal.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths of the items to propose deleting, copied from their ⟨...⟩ markers in the outline. Empty array withdraws the proposal.',
          },
        },
        required: ['paths'],
      },
      run: async ({ paths }) => {
        if (paths.length === 0) {
          onDeletePending([])
          return 'Withdrew the delete proposal.'
        }
        const { valid, invalid } = await partitionValidPaths(graphName, paths)
        // Unlike highlight (cosmetic), a delete proposal on a path that
        // doesn't exist is worth failing hard on — better the model retries
        // with a correct path than the user sees Confirm/Reject buttons for
        // an item that was never actually flagged.
        if (invalid.length > 0) {
          throw new Error(`These paths don't exist, so nothing was flagged: ${invalid.join(', ')} — double-check with view_item (empty path shows the whole outline) and try again.`)
        }
        onDeletePending(valid)
        return `Flagged ${valid.length} item(s) for deletion — waiting on the user to confirm or reject in the app.`
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
// highlight_items is called (an empty array means "cleared"). onDeletePending
// fires the same way for request_delete_items — the caller owns actually
// deleting anything once the user confirms; this call site only ever flags.
// Throws on failure (missing/invalid key, network, refusal, etc.) — callers
// should catch and render an error state.
export async function streamAgentReply(
  messages: AgentChatMessage[],
  viewContext: string,
  graphName: string | undefined,
  onMutate: () => void,
  onHighlight: (paths: string[]) => void,
  onDeletePending: (paths: string[]) => void,
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
      tools: buildTools(graphName, onMutate, onHighlight, onDeletePending),
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
