// Offline client — all data lives in localStorage, no server required.

export interface StructureItem {
  id?: string
  title?: string
  context?: string
  date?: string  // plain "YYYY-MM-DD", meaning whatever the user/agent wants (due, scheduled, logged) — no fraction, no rollup
  tags?: string[]  // short labels, cut across the tree independent of parent/child
  children?: Record<string, StructureItem>
  [key: string]: unknown
}

export interface Structure {
  metadata: { title: string; description: string; version: string }
  structure: Record<string, StructureItem>
}

export interface GraphInfo {
  name: string; display_name: string; path: string
  modified_at: string; size: number; description: string; version: string; icon: string
}

export interface GraphUpdatePayload { display_name?: string; description?: string; icon?: string }

export interface ItemResponse { path: string; name: string; data: StructureItem }

export interface UpdatePayload {
  name?: string; context?: string | ''
  date?: string | ''  // undefined=untouched, ''=cleared
  tags?: string[]  // undefined=untouched, []=cleared, non-empty=wholesale replace
}

export interface GraphStateVersion { graph: string; version: number; backend: string }

export interface GraphMutation {
  id: string; version: number; type: string; payload: Record<string, unknown>
  actor: string; node_count: number; edge_count: number; created_at?: string
}

export interface GraphMutationsResponse {
  graph: string; since_version: number; latest_version: number; count: number
  mutations: GraphMutation[]
}

// ── Storage keys ────────────────────────────────────────────────────────────
const GRAPHS_LIST_KEY = 'offline_graphs'
const DELETED_KEY    = 'offline_deleted_graphs'
const dataKey  = (n: string) => `offline_graph_${n}`
const metaKey  = (n: string) => `offline_meta_${n}`
const GRAPH_ICONS = ['📊','🎯','📚','💼','🏠','🌟','🚀','💡','🎨','🔬']
const iconFor = (name: string) =>
  GRAPH_ICONS[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRAPH_ICONS.length]

// ── Persistence helpers ──────────────────────────────────────────────────────
function getGraphNames(): string[] {
  try { return JSON.parse(localStorage.getItem(GRAPHS_LIST_KEY) ?? '[]') }
  catch { return [] }
}
function saveGraphNames(names: string[]) {
  localStorage.setItem(GRAPHS_LIST_KEY, JSON.stringify(names))
}

// Tombstones: track locally-deleted graphs so sync removes them from the Gist
export function getDeletedGraphs(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) ?? '{}') }
  catch { return {} }
}
function recordDeletion(name: string) {
  const d = getDeletedGraphs()
  d[name] = new Date().toISOString()
  localStorage.setItem(DELETED_KEY, JSON.stringify(d))
}
export function clearDeletion(name: string) {
  const d = getDeletedGraphs()
  delete d[name]
  localStorage.setItem(DELETED_KEY, JSON.stringify(d))
}

// One-time best-effort cleanup of pre-"date"/"tags" data: a legacy item's
// checkpoints (if any) collapse into a single `date` — the chronologically
// last one, same value the old due-date badge would have shown — and its
// progress/cost are simply dropped (no equivalent). Runs on every load since
// it's cheap and idempotent; the next save() persists the cleaned shape.
function migrateLegacyItem(item: StructureItem): void {
  const legacyCheckpoints = item.checkpoints as { date: string; progress: string }[] | undefined
  if (item.date === undefined && Array.isArray(legacyCheckpoints) && legacyCheckpoints.length) {
    item.date = [...legacyCheckpoints].sort((a, b) => a.date.localeCompare(b.date)).pop()!.date
  }
  delete item.progress
  delete item.checkpoints
  delete item.cost
  if (item.children) for (const child of Object.values(item.children)) migrateLegacyItem(child)
}

function loadStructure(graphName = 'default'): Structure {
  try {
    const raw = localStorage.getItem(dataKey(graphName))
    if (raw) {
      const s = JSON.parse(raw)
      for (const item of Object.values(s.structure as Record<string, StructureItem>)) migrateLegacyItem(item)
      return s
    }
  } catch { /* fall through */ }
  return { metadata: { title: 'My Graph', description: '', version: '1.0' }, structure: {} }
}
function saveStructure(graphName: string, s: Structure) {
  localStorage.setItem(dataKey(graphName), JSON.stringify(s))
}

function loadMeta(graphName: string): GraphInfo {
  try {
    const raw = localStorage.getItem(metaKey(graphName))
    if (raw) return JSON.parse(raw)
  } catch { /* fall through */ }
  return {
    name: graphName,
    display_name: graphName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    path: `structures/${graphName}.txt`,
    modified_at: new Date().toISOString(),
    size: 0,
    description: '',
    version: '1.0',
    icon: iconFor(graphName),
  }
}
function saveMeta(graphName: string, meta: GraphInfo) {
  localStorage.setItem(metaKey(graphName), JSON.stringify(meta))
}
function touchMeta(graphName: string) {
  const m = loadMeta(graphName)
  saveMeta(graphName, { ...m, modified_at: new Date().toISOString() })
}

// ── ID / title injection (mirrors server behaviour) ──────────────────────────
function injectIds(items: Record<string, StructureItem>, parentId = '') {
  for (const [key, item] of Object.entries(items)) {
    item.id = parentId ? `${parentId}.${key}` : key
    if (!item.title) item.title = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    if (!item.children) item.children = {}
    injectIds(item.children, item.id)
  }
}

// ── Path navigation ──────────────────────────────────────────────────────────
function getContainer(structure: Record<string, StructureItem>, path: string): Record<string, StructureItem> | null {
  if (!path) return structure
  let cur = structure
  for (const key of path.split('.')) {
    const next = cur[key]
    if (!next) return null
    cur = next.children ?? (next as any)
  }
  return cur
}

function getParentAndKey(structure: Record<string, StructureItem>, path: string): { parent: Record<string, StructureItem>, key: string } | null {
  const parts = path.split('.')
  const key   = parts[parts.length - 1]
  const parent = parts.length === 1 ? structure : getContainer(structure, parts.slice(0, -1).join('.'))
  if (!parent) return null
  return { parent, key }
}

// ── Markdown-heading parser (mirrors serializeStructure) ──────────────────────
// Heading depth = nesting depth ("#" = top level, "##" = its children, ...).
// A heading line is `#+ Title (date)? tags?` — tags are the trailing "#word"
// tokens (stripped first since they're outermost), then a trailing "(YYYY-MM-DD)"
// is the date. Everything else is context text for the nearest heading above,
// verbatim (blank lines inside are preserved; only leading/trailing blank lines
// are trimmed).
function parseTagsSuffix(s: string): { rest: string; tags?: string[] } {
  const tags: string[] = []
  let rest = s
  let m: RegExpMatchArray | null
  while ((m = rest.match(/^(.*?)\s+#([\w-]+)$/))) {
    tags.unshift(m[2])
    rest = m[1]
  }
  return tags.length ? { rest, tags } : { rest: s }
}

function parseDateSuffix(s: string): { rest: string; date?: string } {
  const m = s.match(/^(.*?)\s+\((\d{4}-\d{2}-\d{2})\)$/)
  return m ? { rest: m[1], date: m[2] } : { rest: s }
}

// The format reuses plain text for structural markers (a "#+ " heading, a
// trailing "#word" tag, a trailing "(YYYY-MM-DD)" date) — so title/context
// text that already happens to look like one of those markers would
// otherwise be silently reinterpreted as real structure on the next paste
// (e.g. a title literally ending in "#123", or a context line starting with
// "# 1 ..."). A backslash right before the ambiguous character escapes it —
// same trick Markdown itself uses for a literal "#" — reversed by
// unescapeMarker/unescapeContextLine below. Doesn't handle a title/context
// that already contains a literal backslash in that exact position (would
// need escaping backslashes themselves too), but that's rare enough not to
// be worth the extra complexity here.
function escapeTitleForSerialize(title: string): string {
  // Only the LAST trailing "#word" (if any) needs escaping: parseTagsSuffix
  // strips repeatedly from the end, so breaking just its first match (a
  // backslash where it requires plain whitespace before "#") stops it from
  // reaching anything earlier in the title too.
  let t = title.replace(/(\s)#([\w-]+)$/, '$1\\#$2')
  t = t.replace(/(\s)\((\d{4}-\d{2}-\d{2})\)$/, '$1\\($2)')
  return t
}

function unescapeMarker(s: string): string {
  return s.replace(/\\#/g, '#').replace(/\\\(/g, '(')
}

function escapeContextLine(line: string): string {
  return /^#+\s/.test(line) ? `\\${line}` : line
}

function unescapeContextLine(line: string): string {
  return /^\\#+\s/.test(line) ? line.slice(1) : line
}

function parseMarkdownStructure(text: string): Record<string, StructureItem> {
  const root: Record<string, StructureItem> = {}
  interface Frame { container: Record<string, StructureItem>; depth: number; item: StructureItem | null }
  const stack: Frame[] = [{ container: root, depth: 0, item: null }]
  let contextLines: string[] | null = null

  const flushContext = () => {
    const item = stack[stack.length - 1].item
    if (contextLines && item) {
      const text = contextLines.join('\n').trim()
      if (text) item.context = text
    }
    contextLines = null
  }

  // Normalize CRLF/CR (clipboard text on Windows, some editors) to LF — the
  // heading regex is "$"-anchored per line and "." doesn't consume "\r", so a
  // stray trailing "\r" would otherwise make every heading silently fail to match.
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const headingMatch = rawLine.match(/^(#+)\s+(.*)$/)
    if (headingMatch) {
      flushContext()
      const depth = headingMatch[1].length
      const { rest: afterTags, tags } = parseTagsSuffix(headingMatch[2].trim())
      const { rest: rawTitle, date } = parseDateSuffix(afterTags)
      const title = unescapeMarker(rawTitle)

      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop()
      const frame = stack[stack.length - 1]

      const rawKey = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'item'
      let key = rawKey, n = 2
      while (key in frame.container) key = `${rawKey}_${n++}`

      const newItem: StructureItem = { title: title || 'Item', children: {} }
      if (date !== undefined) newItem.date = date
      if (tags !== undefined) newItem.tags = tags

      frame.container[key] = newItem
      stack.push({ container: newItem.children!, depth, item: newItem })
      contextLines = []
      continue
    }

    if (contextLines) contextLines.push(unescapeContextLine(rawLine))
  }
  flushContext()
  return root
}

// ── Structure serializer (mirrors parseMarkdownStructure) ─────────────────────
export function serializeStructure(items: Record<string, StructureItem>, depth = 1): string {
  const hashes = '#'.repeat(depth)
  const blocks = Object.values(items).map(item => {
    const dateSuffix = item.date ? ` (${item.date})` : ''
    const tagsSuffix = item.tags && item.tags.length ? ` ${item.tags.map(t => `#${t}`).join(' ')}` : ''
    let block = `${hashes} ${escapeTitleForSerialize(item.title ?? '')}${dateSuffix}${tagsSuffix}\n`
    if (item.context) block += `${item.context.split('\n').map(escapeContextLine).join('\n')}\n`
    if (item.children && Object.keys(item.children).length)
      block += serializeStructure(item.children, depth + 1)
    return block
  })
  return blocks.join('\n')
}

// Serialize a single item (and its children) — used for single-item clipboard copy.
export function serializeItem(key: string, item: StructureItem, depth = 1): string {
  return serializeStructure({ [key]: item }, depth)
}

// ── Agent-facing serializer (mirrors serializeStructure, never round-tripped) ─
// The agent only ever sees item titles here, never the normalized dot-key
// each tool call actually addresses items by — so every heading also carries
// its own absolute path in ⟨angle brackets⟩, which the agent is instructed to
// copy verbatim instead of reconstructing a path from the title (see
// agentClient.ts's SYSTEM_PREAMBLE). This is a separate text from
// serializeStructure/serializeItem above — those stay byte-identical to the
// human-facing Raw view / copy-paste / Gist format; this one is free to
// diverge since it's never parsed back or shown to the user.
function agentItemBlock(path: string, item: StructureItem, depth: number): string {
  const hashes = '#'.repeat(depth)
  const dateSuffix = item.date ? ` (${item.date})` : ''
  const tagsSuffix = item.tags && item.tags.length ? ` ${item.tags.map(t => `#${t}`).join(' ')}` : ''
  let block = `${hashes} ${item.title}${dateSuffix}${tagsSuffix} ⟨${path}⟩\n`
  if (item.context) block += `${item.context}\n`
  if (item.children && Object.keys(item.children).length) {
    block += Object.entries(item.children)
      .map(([key, child]) => agentItemBlock(`${path}.${key}`, child, depth + 1))
      .join('\n')
  }
  return block
}

export function serializeStructureForAgent(items: Record<string, StructureItem>, parentPath = '', depth = 1): string {
  return Object.entries(items)
    .map(([key, item]) => agentItemBlock(parentPath ? `${parentPath}.${key}` : key, item, depth))
    .join('\n')
}

// Single item (and its children) at a known absolute path — used for
// view_item's result and the "user is viewing X" system-prompt line.
export function serializeItemForAgent(path: string, item: StructureItem, depth = 1): string {
  return agentItemBlock(path, item, depth)
}

// ── Validation ───────────────────────────────────────────────────────────────
function validateDateValue(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Date must be YYYY-MM-DD format')
}

function validateTagsValue(tags: string[]) {
  for (const t of tags) {
    if (typeof t !== 'string' || !t.trim()) throw new Error('Tags cannot be empty')
    if (!/^[\w-]+$/.test(t)) throw new Error('Tags may only contain letters, numbers, underscore, and dash')
  }
}

function validateUpdatePayload(data: UpdatePayload) {
  if (data.date !== undefined && data.date !== '') validateDateValue(data.date)
  if (data.name !== undefined && !data.name.trim()) throw new Error('Name cannot be empty')
  if (data.context !== undefined && typeof data.context === 'string' && data.context.length > 10000) {
    throw new Error('Context too long (max 10000 chars)')
  }
  if (data.tags !== undefined) validateTagsValue(data.tags)
}

// ── Public API (same signatures as client.ts) ────────────────────────────────

export async function fetchStructure(graphName = 'default'): Promise<Structure> {
  const s = loadStructure(graphName)
  injectIds(s.structure)
  return s
}

export async function fetchGraphStructure(graphName: string): Promise<Structure> {
  return fetchStructure(graphName)
}

export async function fetchGraphs(): Promise<GraphInfo[]> {
  return getGraphNames().map(loadMeta)
}

export async function getItem(path: string, graphName = 'default'): Promise<ItemResponse> {
  const s = loadStructure(graphName)
  injectIds(s.structure)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  return { path, name: pk.key, data: pk.parent[pk.key] }
}

export async function updateItem(path: string, data: UpdatePayload, graphName = 'default'): Promise<ItemResponse> {
  validateUpdatePayload(data)
  const s = loadStructure(graphName)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  const { parent, key } = pk
  const item = { ...parent[key] }

  if (data.date !== undefined) {
    if (data.date === '') delete item.date
    else item.date = data.date
  }
  if (data.context !== undefined) {
    if (data.context === '') delete item.context
    else item.context = data.context
  }
  if (data.tags !== undefined) {
    if (data.tags.length === 0) delete item.tags
    else item.tags = data.tags
  }

  if (data.name !== undefined) {
    const newKey = data.name.toLowerCase().replace(/ /g, '_')
    item.title = data.name
    if (newKey !== key) {
      // Rename: rebuild parent preserving order
      const rebuilt: Record<string, StructureItem> = {}
      for (const k of Object.keys(parent)) rebuilt[k === key ? newKey : k] = k === key ? item : parent[k]
      Object.keys(parent).forEach(k => delete parent[k])
      Object.assign(parent, rebuilt)
      saveStructure(graphName, s)
      touchMeta(graphName)
      return { path: path.replace(new RegExp(`\\.?${key}$`), (m) => m.replace(key, newKey)), name: newKey, data: item }
    }
  }

  parent[key] = item
  saveStructure(graphName, s)
  touchMeta(graphName)
  return { path, name: key, data: item }
}

export async function createItem(parentPath: string, data: UpdatePayload, graphName = 'default'): Promise<ItemResponse> {
  validateUpdatePayload(data)
  if (!data.name) throw new Error('Name is required')
  const s = loadStructure(graphName)
  const container = parentPath ? getContainer(s.structure, parentPath) : s.structure
  if (!container) throw new Error(`Parent not found: ${parentPath}`)

  // Suffix duplicate keys (like paste does) instead of overwriting an existing item
  const baseKey = data.name.toLowerCase().replace(/ /g, '_')
  let key = baseKey, n = 2
  while (key in container) key = `${baseKey}_${n++}`
  const item: StructureItem = {
    title: data.name,
    children: {},
    ...(data.date !== undefined && data.date !== '' && { date: data.date }),
    ...(data.context && { context: data.context }),
    ...(data.tags !== undefined && data.tags.length > 0 && { tags: data.tags }),
  }
  container[key] = item
  saveStructure(graphName, s)
  touchMeta(graphName)
  const path = parentPath ? `${parentPath}.${key}` : key
  return { path, name: key, data: item }
}

export async function deleteItem(path: string, graphName = 'default'): Promise<void> {
  const s = loadStructure(graphName)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  delete pk.parent[pk.key]
  saveStructure(graphName, s)
  touchMeta(graphName)
}

export async function pasteItems(
  parentPath: string, content: string, graphName = 'default'
): Promise<{ success: boolean; added: string[] }> {
  const s = loadStructure(graphName)
  const container = parentPath ? getContainer(s.structure, parentPath) : s.structure
  if (!container) throw new Error(`Parent not found: ${parentPath}`)

  const parsed = parseMarkdownStructure(content)
  const added: string[] = []

  for (const [key, item] of Object.entries(parsed)) {
    let finalKey = key, n = 2
    while (finalKey in container) finalKey = `${key}_${n++}`
    container[finalKey] = item
    added.push(parentPath ? `${parentPath}.${finalKey}` : finalKey)
  }

  if (added.length === 0) throw new Error('No items could be parsed from clipboard')
  saveStructure(graphName, s)
  touchMeta(graphName)
  return { success: true, added }
}

function reorderKeys(obj: Record<string, StructureItem>, key: string, targetIndex: number) {
  const keys = Object.keys(obj)
  const from = keys.indexOf(key)
  if (from === -1) return
  keys.splice(from, 1)
  keys.splice(Math.min(targetIndex, keys.length), 0, key)
  const rebuilt: Record<string, StructureItem> = {}
  keys.forEach(k => { rebuilt[k] = obj[k] })
  Object.keys(obj).forEach(k => delete obj[k])
  Object.assign(obj, rebuilt)
}

export async function moveItemUp(path: string, graphName = 'default'): Promise<{ success: boolean; message: string }> {
  const s = loadStructure(graphName)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  const { parent, key } = pk
  const idx = Object.keys(parent).indexOf(key)
  reorderKeys(parent, key, Math.max(0, idx - 1))
  saveStructure(graphName, s)
  return { success: true, message: 'Moved up' }
}

export async function moveItemDown(path: string, graphName = 'default'): Promise<{ success: boolean; message: string }> {
  const s = loadStructure(graphName)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  const { parent, key } = pk
  const keys = Object.keys(parent)
  const idx = keys.indexOf(key)
  reorderKeys(parent, key, Math.min(keys.length - 1, idx + 1))
  saveStructure(graphName, s)
  return { success: true, message: 'Moved down' }
}

export async function reorderItem(path: string, targetIndex: number, graphName = 'default'): Promise<{ success: boolean; message: string }> {
  const s = loadStructure(graphName)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  // targetIndex is the drag-and-drop UI's pre-removal "insert before this
  // row" index, while reorderKeys expects the final post-removal splice
  // index (the contract moveItemUp/moveItemDown already satisfy directly) —
  // convert here rather than in reorderKeys, so those two are unaffected.
  const currentIndex = Object.keys(pk.parent).indexOf(pk.key)
  const adjustedTargetIndex = currentIndex !== -1 && currentIndex < targetIndex ? targetIndex - 1 : targetIndex
  reorderKeys(pk.parent, pk.key, adjustedTargetIndex)
  saveStructure(graphName, s)
  return { success: true, message: 'Reordered' }
}

// Move an item to become the last child of a different parent (drag-to-nest).
// Unlike reorderItem (same parent, position only) this changes which
// container the item lives in — used when a drop lands on an item's body
// rather than the gap between rows.
export async function moveItemToParent(path: string, newParentPath: string, graphName = 'default'): Promise<{ success: boolean; message: string }> {
  const s = loadStructure(graphName)
  const pk = getParentAndKey(s.structure, path)
  if (!pk) throw new Error(`Item not found: ${path}`)
  if (path === newParentPath || newParentPath.startsWith(`${path}.`)) {
    throw new Error('Cannot move an item into itself or its own descendant')
  }

  const container = getContainer(s.structure, newParentPath)
  if (!container) throw new Error(`Parent not found: ${newParentPath}`)

  const item = pk.parent[pk.key]
  delete pk.parent[pk.key]

  let key = pk.key, n = 2
  while (key in container) key = `${pk.key}_${n++}`
  container[key] = item

  saveStructure(graphName, s)
  touchMeta(graphName)
  return { success: true, message: 'Moved' }
}

export async function syncToDrive(_graphName?: string): Promise<{ success: boolean; message: string }> {
  return { success: true, message: 'Offline mode — no sync' }
}

export async function fetchStructureText(graphName = 'default'): Promise<string> {
  const s = loadStructure(graphName)
  return serializeStructure(s.structure)
}

export async function createGraph(name: string, description = '', initialContent?: string | null): Promise<GraphInfo> {
  const names = getGraphNames()
  if (names.includes(name)) throw new Error(`Graph "${name}" already exists`)
  names.push(name)
  saveGraphNames(names)

  let structure: Record<string, StructureItem> = {}
  if (initialContent?.trim()) {
    structure = parseMarkdownStructure(initialContent)
  }
  saveStructure(name, { metadata: { title: name, description, version: '1.0' }, structure })

  const meta: GraphInfo = {
    name,
    display_name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    path: `structures/${name}.txt`,
    modified_at: new Date().toISOString(),
    size: 0,
    description,
    version: '1.0',
    icon: iconFor(name),
  }
  saveMeta(name, meta)
  return meta
}

export async function deleteGraph(name: string): Promise<void> {
  const names = getGraphNames().filter(n => n !== name)
  saveGraphNames(names)
  localStorage.removeItem(dataKey(name))
  localStorage.removeItem(metaKey(name))
  recordDeletion(name)
}

export async function updateGraph(name: string, data: GraphUpdatePayload): Promise<GraphInfo> {
  const meta = loadMeta(name)
  const updated = { ...meta, ...data, modified_at: new Date().toISOString() }
  saveMeta(name, updated)
  return updated
}

export async function fetchGraphStateVersion(graphName: string): Promise<GraphStateVersion> {
  return { graph: graphName, version: 0, backend: 'offline' }
}

export async function fetchGraphMutations(graphName: string, sinceVersion = 0): Promise<GraphMutationsResponse> {
  return { graph: graphName, since_version: sinceVersion, latest_version: 0, count: 0, mutations: [] }
}

// ── Parse structure body text (used by Gist sync pull) ───────────────────────
export function parseStructureText(text: string): Record<string, StructureItem> {
  return parseMarkdownStructure(text)
}

// ── Bulk import: replace a graph's full structure (used by sync pull) ─────────
export async function importStructure(
  graphName: string,
  structure: Structure,
  meta: Partial<GraphInfo> = {},
): Promise<void> {
  const names = getGraphNames()
  if (!names.includes(graphName)) {
    names.push(graphName)
    saveGraphNames(names)
  }
  saveStructure(graphName, structure)
  const existing = loadMeta(graphName)
  saveMeta(graphName, {
    ...existing,
    ...meta,
    name: graphName,
    modified_at: meta.modified_at ?? new Date().toISOString(),
  })
}
