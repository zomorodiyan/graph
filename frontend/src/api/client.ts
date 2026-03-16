// API client for communicating with FastAPI backend

const API_BASE = '/api'

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
  metadata: {
    title: string
    description: string
    version: string
  }
  structure: Record<string, StructureItem>
}

export interface GraphInfo {
  name: string
  display_name: string
  path: string
  modified_at: string
  size: number
  description: string
  version: string
  icon: string
}

export interface GraphUpdatePayload {
  display_name?: string
  description?: string
  icon?: string
}

export interface ItemResponse {
  path: string
  name: string
  data: StructureItem
}

export interface UpdatePayload {
  name?: string
  progress?: number | ''
  context?: string | ''
  due?: string | ''
}

// Helper to build API URL path based on graphName
function buildApiPath(graphName?: string): string {
  return graphName ? `${API_BASE}/graphs/${graphName}` : API_BASE
}

// Fetch full structure
export async function fetchStructure(graphName?: string): Promise<Structure> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/structure`)
  if (!res.ok) throw new Error('Failed to fetch structure')
  return res.json()
}

// Get a single item by path
export async function getItem(path: string, graphName?: string): Promise<ItemResponse> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${path}`)
  if (!res.ok) throw new Error(`Failed to get item: ${path}`)
  return res.json()
}

// Update an item
export async function updateItem(path: string, data: UpdatePayload, graphName?: string): Promise<ItemResponse> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to update item: ${path}`)
  return res.json()
}

// Create a new item under a parent
export async function createItem(parentPath: string, data: UpdatePayload, graphName?: string): Promise<ItemResponse> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${parentPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to create item under: ${parentPath}`)
  return res.json()
}

// Delete an item
export async function deleteItem(path: string, graphName?: string): Promise<void> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete item: ${path}`)
}

// Paste content from clipboard to create items
export async function pasteItems(parentPath: string, content: string, graphName?: string): Promise<{ success: boolean; added: string[] }> {
  const basePath = buildApiPath(graphName)
  // Use 'root' for empty path to avoid double slash
  const safePath = parentPath || 'root'
  const res = await fetch(`${basePath}/items/${safePath}/paste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    console.error('Paste error:', errorText)
    throw new Error(`Failed to paste items: ${errorText}`)
  }
  return res.json()
}

// Move item up in order
export async function moveItemUp(path: string, graphName?: string): Promise<{ success: boolean; message: string }> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${path}/move-up`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to move item: ${path}`)
  return res.json()
}

// Move item down in order
export async function moveItemDown(path: string, graphName?: string): Promise<{ success: boolean; message: string }> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${path}/move-down`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to move item: ${path}`)
  return res.json()
}

// Reorder item to a specific position
export async function reorderItem(path: string, targetIndex: number, graphName?: string): Promise<{ success: boolean; message: string }> {
  const basePath = buildApiPath(graphName)
  const res = await fetch(`${basePath}/items/${path}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_index: targetIndex }),
  })
  if (!res.ok) throw new Error(`Failed to reorder item: ${path}`)
  return res.json()
}

// Sync to Google Drive (default structure or specific graph)
export async function syncToDrive(graphName?: string): Promise<{ success: boolean; message: string }> {
  if (graphName) {
    // Sync specific graph
    const res = await fetch(`${API_BASE}/graphs/${graphName}/sync`, { method: 'POST' })
    if (!res.ok) throw new Error(`Failed to sync graph ${graphName} to Google Drive`)
    return res.json()
  } else {
    // Sync default structure
    const res = await fetch(`${API_BASE}/sync-to-drive`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to sync to Google Drive')
    return res.json()
  }
}

// Fetch structure as raw text (same format as Google Drive file)
export async function fetchStructureText(graphName?: string): Promise<string> {
  const url = graphName 
    ? `${API_BASE}/graphs/${graphName}/structure/text`
    : `${API_BASE}/structure/text`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch structure text')
  const data = await res.json()
  return data.content
}

// ============================================================================
// GRAPHS (MULTI-STRUCTURE) API
// ============================================================================

// List all available graphs
export async function fetchGraphs(): Promise<GraphInfo[]> {
  const res = await fetch(`${API_BASE}/graphs`)
  if (!res.ok) throw new Error('Failed to fetch graphs')
  return res.json()
}

// Create a new graph
export async function createGraph(name: string, description?: string, initialContent?: string): Promise<GraphInfo> {
  const res = await fetch(`${API_BASE}/graphs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name, 
      description: description || '',
      initial_content: initialContent || null 
    }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to create graph')
  }
  return res.json()
}

// Delete a graph
export async function deleteGraph(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/graphs/${name}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete graph: ${name}`)
}

// Update a graph's metadata
export async function updateGraph(name: string, data: GraphUpdatePayload): Promise<GraphInfo> {
  const res = await fetch(`${API_BASE}/graphs/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || `Failed to update graph: ${name}`)
  }
  return res.json()
}

// Fetch structure for a specific graph
export async function fetchGraphStructure(graphName: string): Promise<Structure> {
  const res = await fetch(`${API_BASE}/graphs/${graphName}/structure`)
  if (!res.ok) throw new Error(`Failed to fetch structure for graph: ${graphName}`)
  return res.json()
}
