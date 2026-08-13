// Offline client — all data lives in localStorage, no server required.

export interface StructureItem {
  id?: string
  title?: string
  context?: string
  progress?: string  // "X/Y" fraction, e.g. "3/10" or "40/100" (displayed as "40%" when Y is 100)
  cost?: { amount: number; unit: string }  // unit defaults to "$" in the editor when left blank
  // Sorted by date; "X/Y" per entry, same format as progress. There is no separate
  // "due date" field — a due date IS a checkpoint whose progress normalizes to
  // done===total (e.g. "1/1", "5/5"); see getItemDueDate.
  checkpoints?: { date: string; progress: string }[]
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
  name?: string; progress?: string | ''; context?: string | ''
  cost?: { amount: number; unit: string } | null  // undefined=untouched, null=cleared
  checkpoints?: { date: string; progress: string }[]  // undefined=untouched, []=cleared, non-empty=wholesale replace
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

// A due date is a checkpoint whose progress normalizes to done===total — the
// planned "finish line". Only the chronologically LAST checkpoint can be that
// finish line (interpolation holds flat past it); if it isn't done===total,
// the item has milestones but no due date yet.
export function getItemDueDate(item: Pick<StructureItem, 'checkpoints'>): string | undefined {
  const cps = item.checkpoints
  if (!cps || !cps.length) return undefined
  const last = [...cps].sort((a, b) => a.date.localeCompare(b.date))[cps.length - 1]
  const m = last.progress.match(/^(\d+)\/(\d+)$/)
  if (!m || m[1] !== m[2]) return undefined
  return last.date
}

// Cost display/serialization: currency-like symbols prefix the number ("$500"),
// alphanumeric units suffix it ("40h") — matches how people already write both.
export function formatCost(cost: { amount: number; unit: string } | undefined): string | null {
  if (!cost) return null
  const isSymbol = /^[^a-zA-Z0-9]+$/.test(cost.unit)
  return isSymbol ? `${cost.unit}${cost.amount}` : `${cost.amount}${cost.unit}`
}

export interface ValueTotal { actual: number; target?: number }

// A non-leaf's own `cost` is a target/budget, not spent money — it must never be
// added into an ancestor's rollup (that would double-count it on top of its own
// children). Only true leaves contribute to the actual sum.
function accumulateLeafValues(item: StructureItem, totals: Record<string, number>): void {
  const children = item.children ? Object.values(item.children) : []
  if (children.length === 0) {
    if (item.cost && typeof item.cost.amount === 'number' && !isNaN(item.cost.amount) && item.cost.unit) {
      totals[item.cost.unit] = (totals[item.cost.unit] ?? 0) + item.cost.amount
    }
    return
  }
  for (const child of children) accumulateLeafValues(child, totals)
}

// Leaf: its own value, shown plainly. Parent: sum of all leaf values in its
// subtree — and if the parent itself has a `cost` set, that value is the
// denominator (a target/budget) the leaf sum is measured against, per unit.
// Walks the real item.children tree to unbounded depth, independent of how
// many levels Section.tsx renders at once.
export function sumValues(item: StructureItem): Record<string, ValueTotal> {
  const hasChildren = !!item.children && Object.keys(item.children).length > 0
  const totals: Record<string, number> = {}

  if (hasChildren) {
    for (const child of Object.values(item.children!)) accumulateLeafValues(child, totals)
  } else if (item.cost && typeof item.cost.amount === 'number' && !isNaN(item.cost.amount) && item.cost.unit) {
    totals[item.cost.unit] = item.cost.amount
  }

  const out: Record<string, ValueTotal> = {}
  for (const unit of Object.keys(totals)) {
    // Round once, after all additions — rounding per recursion level would compound error.
    out[unit] = { actual: Math.round(totals[unit] * 100) / 100 }
  }

  if (hasChildren && item.cost && typeof item.cost.amount === 'number' && !isNaN(item.cost.amount) && item.cost.unit) {
    const unit = item.cost.unit
    out[unit] = { actual: out[unit]?.actual ?? 0, target: Math.round(item.cost.amount * 100) / 100 }
  }

  return out
}

// Multi-unit display: each unit formatted via formatCost's own symbol/suffix heuristic,
// joined with " · ". A unit with a target renders as "actual/target" (fraction against
// the parent's own value) instead of the plain amount. Empty totals (nothing anywhere
// in the subtree) → null, no badge — same as today's "no cost = no badge".
export function formatValueTotals(totals: Record<string, ValueTotal>): string | null {
  const units = Object.keys(totals)
  if (units.length === 0) return null
  return units.map(unit => {
    const { actual, target } = totals[unit]
    if (target === undefined) return formatCost({ amount: actual, unit })
    const isSymbol = /^[^a-zA-Z0-9]+$/.test(unit)
    return isSymbol ? `${unit}${actual}/${target}` : `${actual}/${target}${unit}`
  }).join(' · ')
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
// A heading line is `#+ Title (progress)? cost?` — cost is the trailing token
// (stripped first since it's the outermost), then a trailing "(x/y)" is progress.
// A "- date: x/y" line is a checkpoint (attached to the nearest heading above);
// a bare "Checkpoints:" line is a cosmetic label, skipped on parse. Everything
// else is context text for the nearest heading above, verbatim (blank lines
// inside are preserved; only leading/trailing blank lines are trimmed).
function parseCostSuffix(s: string): { rest: string; cost?: { amount: number; unit: string } } {
  let m = s.match(/^(.*?)\s+(\d+(?:\.\d+)?)([a-zA-Z]+)$/)
  if (m) return { rest: m[1], cost: { amount: Number(m[2]), unit: m[3] } }
  m = s.match(/^(.*?)\s+([^\sa-zA-Z0-9(){}[\]"]+)(\d+(?:\.\d+)?)$/)
  if (m) return { rest: m[1], cost: { amount: Number(m[3]), unit: m[2] } }
  return { rest: s }
}

function parseProgressSuffix(s: string): { rest: string; progress?: string } {
  const m = s.match(/^(.*?)\s+\((\d+\/\d+)\)$/)
  return m ? { rest: m[1], progress: m[2] } : { rest: s }
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
      const { rest: afterCost, cost } = parseCostSuffix(headingMatch[2].trim())
      const { rest: title, progress } = parseProgressSuffix(afterCost)

      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop()
      const frame = stack[stack.length - 1]

      const rawKey = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'item'
      let key = rawKey, n = 2
      while (key in frame.container) key = `${rawKey}_${n++}`

      const newItem: StructureItem = { title: title || 'Item', children: {} }
      if (progress !== undefined) newItem.progress = progress
      if (cost !== undefined) newItem.cost = cost

      frame.container[key] = newItem
      stack.push({ container: newItem.children!, depth, item: newItem })
      contextLines = []
      continue
    }

    const trimmed = rawLine.trim()
    if (trimmed === 'Checkpoints:') continue

    const cpMatch = trimmed.match(/^-\s+(\d{4}-\d{2}-\d{2}):\s*(\d+\/\d+)\s*$/)
    const currentItem = stack[stack.length - 1].item
    if (cpMatch && currentItem) {
      currentItem.checkpoints = [...(currentItem.checkpoints ?? []), { date: cpMatch[1], progress: cpMatch[2] }]
      continue
    }

    if (contextLines) contextLines.push(rawLine)
  }
  flushContext()
  return root
}

// ── Structure serializer (mirrors parseMarkdownStructure) ─────────────────────
export function serializeStructure(items: Record<string, StructureItem>, depth = 1): string {
  const hashes = '#'.repeat(depth)
  const blocks = Object.values(items).map(item => {
    const progressSuffix = item.progress !== undefined ? ` (${item.progress})` : ''
    const costText = formatCost(item.cost)
    const costSuffix = costText ? ` ${costText}` : ''
    let block = `${hashes} ${item.title}${progressSuffix}${costSuffix}\n`
    if (item.context) block += `${item.context}\n`
    if (item.checkpoints && item.checkpoints.length) {
      block += `Checkpoints:\n`
      for (const cp of [...item.checkpoints].sort((a, b) => a.date.localeCompare(b.date))) {
        block += `- ${cp.date}: ${cp.progress}\n`
      }
    }
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

// ── Validation ───────────────────────────────────────────────────────────────
function validateProgressValue(s: string, label = 'Progress') {
  const xy = s.match(/^(\d+)\/(\d+)$/)
  if (xy) {
    const total = Number(xy[2])
    if (total <= 0) throw new Error(`${label} total must be > 0`)
  } else {
    const p = Number(s)
    if (isNaN(p) || p < 0 || p > 100) throw new Error(`${label} must be 0–100 or X/Y format`)
  }
}

function validateCostValue(cost: { amount: number; unit: string }) {
  if (typeof cost.amount !== 'number' || isNaN(cost.amount) || cost.amount < 0) {
    throw new Error('Cost amount must be a non-negative number')
  }
  if (typeof cost.unit !== 'string' || !cost.unit.trim()) throw new Error('Cost unit cannot be empty')
}

function validateUpdatePayload(data: UpdatePayload) {
  if (data.progress !== undefined && data.progress !== '') {
    validateProgressValue(String(data.progress))
  }
  if (data.cost !== undefined && data.cost !== null) validateCostValue(data.cost)
  if (data.name !== undefined && !data.name.trim()) throw new Error('Name cannot be empty')
  if (data.context !== undefined && typeof data.context === 'string' && data.context.length > 10000) {
    throw new Error('Context too long (max 10000 chars)')
  }
  if (data.checkpoints !== undefined) {
    for (const cp of data.checkpoints) {
      if (!cp || typeof cp.date !== 'string' || typeof cp.progress !== 'string') {
        throw new Error('Invalid checkpoint entry')
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cp.date)) throw new Error('Checkpoint date must be YYYY-MM-DD format')
      validateProgressValue(cp.progress, 'Checkpoint progress')
    }
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
    else item.progress = data.progress
  }
  if (data.context !== undefined) {
    if (data.context === '') delete item.context
    else item.context = data.context
  }
  if (data.cost !== undefined) {
    if (data.cost === null) delete item.cost
    else item.cost = data.cost
  }
  if (data.checkpoints !== undefined) {
    if (data.checkpoints.length === 0) delete item.checkpoints
    else item.checkpoints = data.checkpoints
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
    ...(data.progress !== undefined && data.progress !== '' && { progress: data.progress }),
    ...(data.context && { context: data.context }),
    ...(data.cost && { cost: data.cost }),
    ...(data.checkpoints !== undefined && data.checkpoints.length > 0 && { checkpoints: data.checkpoints }),
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
  reorderKeys(pk.parent, pk.key, targetIndex)
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
