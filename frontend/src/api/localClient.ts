// Offline client — all data lives in localStorage, no server required.

export interface StructureItem {
  id?: string
  title?: string
  context?: string
  progress?: number
  due?: string
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
  name?: string; progress?: number | ''; context?: string | ''; due?: string | ''
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

function loadStructure(graphName = 'default'): Structure {
  try {
    const raw = localStorage.getItem(dataKey(graphName))
    if (raw) return JSON.parse(raw)
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

// ── Indented-text parser (same format as serializeItem in GraphView) ─────────
function parseIndentedText(text: string): Record<string, StructureItem> {
  const root: Record<string, StructureItem> = {}
  interface Frame { container: Record<string, StructureItem>; indent: number; lastItem: StructureItem | null }
  const stack: Frame[] = [{ container: root, indent: -2, lastItem: null }]

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const indent  = line.length - line.trimStart().length
    const trimmed = line.trim()

    // Quoted string (context) — unescape special characters
    const quotedMatch = trimmed.match(/^"(.+)"$/)
    if (quotedMatch) {
      // Apply to last item in parent frame, unescaping sequences
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].indent < indent && stack[i].lastItem) {
          const escaped = quotedMatch[1]
          const unescaped = escaped.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          stack[i].lastItem!.context = unescaped
          break
        }
      }
      continue
    }

    // Known property line
    const propMatch = trimmed.match(/^(progress|due):\s*(.+)$/)
    if (propMatch) {
      // Find deepest frame with indent < this line's indent and a lastItem
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].indent < indent && stack[i].lastItem) {
          const [, k, v] = propMatch
          const item = stack[i].lastItem!
          if (k === 'progress') item.progress = Number(v)
          else if (k === 'due') item.due = v
          break
        }
      }
      continue
    }

    // Pop stack until correct parent level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()

    const frame = stack[stack.length - 1]
    const rawKey = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'item'
    let key = rawKey, n = 2
    while (key in frame.container) key = `${rawKey}_${n++}`

    const newItem: StructureItem = { title: trimmed, children: {} }
    frame.container[key] = newItem
    frame.lastItem = newItem
    stack.push({ container: newItem.children!, indent, lastItem: null })
  }
  return root
}

// ── Structure serializer (mirrors serializeItem in GraphView) ─────────────────
export function serializeStructure(items: Record<string, StructureItem>, indent = 0): string {
  let out = ''
  const pad = '  '.repeat(indent)
  for (const [key, item] of Object.entries(items)) {
    out += `${pad}${key}\n`
    if (item.progress !== undefined) out += `${pad}  progress: ${item.progress}\n`
    if (item.context) out += `${pad}  context: ${item.context}\n`
    if (item.due)     out += `${pad}  due: ${item.due}\n`
    if (item.children && Object.keys(item.children).length)
      out += serializeStructure(item.children, indent + 1)
  }
  return out
}

// ── Validation ───────────────────────────────────────────────────────────────
function validateUpdatePayload(data: UpdatePayload) {
  if (data.progress !== undefined && data.progress !== '') {
    const p = Number(data.progress)
    if (isNaN(p) || p < 0 || p > 100) throw new Error('Progress must be 0–100')
  }
  if (data.due !== undefined && data.due !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(data.due)) {
    throw new Error('Due date must be YYYY-MM-DD format')
  }
  if (data.name !== undefined && !data.name.trim()) throw new Error('Name cannot be empty')
  if (data.context !== undefined && typeof data.context === 'string' && data.context.length > 10000) {
    throw new Error('Context too long (max 10000 chars)')
  }
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

  if (data.progress !== undefined) {
    if (data.progress === '') delete item.progress
    else item.progress = data.progress as number
  }
  if (data.context !== undefined) {
    if (data.context === '') delete item.context
    else item.context = data.context
  }
  if (data.due !== undefined) {
    if (data.due === '') delete item.due
    else item.due = data.due
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

  const key = data.name.toLowerCase().replace(/ /g, '_')
  const item: StructureItem = {
    title: data.name,
    children: {},
    ...(typeof data.progress === 'number' && { progress: data.progress }),
    ...(data.context && { context: data.context }),
    ...(data.due && { due: data.due }),
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

  const parsed = parseIndentedText(content)
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
  reorderKeys(pk.parent, pk.key, targetIndex)
  saveStructure(graphName, s)
  return { success: true, message: 'Reordered' }
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
    structure = parseIndentedText(initialContent)
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
  return parseIndentedText(text)
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
