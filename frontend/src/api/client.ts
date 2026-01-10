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

// Fetch full structure
export async function fetchStructure(): Promise<Structure> {
  const res = await fetch(`${API_BASE}/structure`)
  if (!res.ok) throw new Error('Failed to fetch structure')
  return res.json()
}

// Get a single item by path
export async function getItem(path: string): Promise<ItemResponse> {
  const res = await fetch(`${API_BASE}/items/${path}`)
  if (!res.ok) throw new Error(`Failed to get item: ${path}`)
  return res.json()
}

// Update an item
export async function updateItem(path: string, data: UpdatePayload): Promise<ItemResponse> {
  const res = await fetch(`${API_BASE}/items/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to update item: ${path}`)
  return res.json()
}

// Create a new item under a parent
export async function createItem(parentPath: string, data: UpdatePayload): Promise<ItemResponse> {
  const res = await fetch(`${API_BASE}/items/${parentPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to create item under: ${parentPath}`)
  return res.json()
}

// Delete an item
export async function deleteItem(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}/items/${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete item: ${path}`)
}

// Move item up in order
export async function moveItemUp(path: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${path}/move-up`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to move item: ${path}`)
  return res.json()
}

// Move item down in order
export async function moveItemDown(path: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${path}/move-down`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to move item: ${path}`)
  return res.json()
}

// Reorder item to a specific position
export async function reorderItem(path: string, targetIndex: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/items/${path}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_index: targetIndex }),
  })
  if (!res.ok) throw new Error(`Failed to reorder item: ${path}`)
  return res.json()
}

// Sync to Google Drive
export async function syncToDrive(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/sync-to-drive`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to sync to Google Drive')
  return res.json()
}
