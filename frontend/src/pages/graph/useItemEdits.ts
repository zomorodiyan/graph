import { StructureItem, UpdatePayload, slugify } from '@api'
import { useCreateItem, useUpdateItem } from '../../hooks/useGraph'

type Items = Record<string, StructureItem>

interface ItemEditOptions {
  graphName?: string
  path: string
  rawItems: Items
  serverKeys: string[]
  setLocalItems: React.Dispatch<React.SetStateAction<Items | null>>
  setLocalOrder: React.Dispatch<React.SetStateAction<string[] | null>>
  setPendingItems: React.Dispatch<React.SetStateAction<Set<string>>>
  showNotification: (message: string, type?: 'success' | 'error' | 'syncing') => void
}

// GraphView's item edits — edit, create a child, drop deleted
// paths — each applied to the local (optimistic) tree first for instant
// feedback, then synced through the item mutations. Paths are absolute;
// the local tree is relative to the current page (`path`).
export function useItemEdits({
  graphName, path, rawItems, serverKeys, setLocalItems, setLocalOrder, setPendingItems, showNotification,
}: ItemEditOptions) {
  const updateItem = useUpdateItem(graphName)
  const createItem = useCreateItem(graphName)

  // Apply edit mutation with optimistic local update
  const applyEdit = (itemPath: string, data: UpdatePayload) => {
      // Get the path parts to determine nesting level
      const pathParts = itemPath.split('.')
      const currentPathParts = path ? path.split('.') : []
      
      // Calculate relative path from current view
      // If we're at root and editing "level.work", relativeParts = ["level", "work"]
      // If we're at "level" and editing "level.work", relativeParts = ["work"]
      const relativeParts = pathParts.slice(currentPathParts.length)
      
      const itemKey = relativeParts[relativeParts.length - 1]
      const newName = data.name
      // Normalize name the same way the server does
      const normalizedNewName = newName ? slugify(newName) : null
      const isRename = normalizedNewName && normalizedNewName !== itemKey
      
      // IMMEDIATELY update local state for instant visual feedback
      setLocalItems(prev => {
        if (!prev) return prev
        
        // Deep clone to avoid mutation
        const newItems = JSON.parse(JSON.stringify(prev))
        
        // Navigate to the correct item
        let target = newItems
        
        for (let i = 0; i < relativeParts.length - 1; i++) {
          const key = relativeParts[i]
          if (target[key]) {
            // Navigate into children if they exist, otherwise stay at current level
            target = target[key].children || target[key]
          } else {
            return prev // Item not found, don't update
          }
        }
        
        if (!target[itemKey]) return prev // Item not found
        
        const updatedItem = { ...target[itemKey] }
        
        // Update properties
        if (data.date !== undefined) {
          if (data.date === '') {
            delete updatedItem.date
          } else {
            updatedItem.date = data.date
          }
        }
        if (data.repeat !== undefined) {
          if (data.repeat) updatedItem.repeat = data.repeat
          else delete updatedItem.repeat
        }
        if (data.context !== undefined) {
          if (data.context === '') {
            delete updatedItem.context
          } else {
            updatedItem.context = data.context
          }
        }
        if (data.tags !== undefined) {
          if (data.tags.length === 0) {
            delete updatedItem.tags
          } else {
            updatedItem.tags = data.tags
          }
        }

        // Handle name change (rename)
        if (isRename) {
          delete target[itemKey]
          target[normalizedNewName!] = { ...updatedItem, title: newName }
        } else {
          // Update title if name was sent (even if key didn't change)
          if (newName) {
            updatedItem.title = newName
          }
          target[itemKey] = updatedItem
        }
        
        return newItems
      })
      
      // Update local order if renaming a top-level item
      if (isRename && relativeParts.length === 1) {
        setLocalOrder(prev => 
          prev ? prev.map(k => k === itemKey ? normalizedNewName! : k) : prev
        )
      }
      
      // Mark as pending
      setPendingItems(prev => new Set(prev).add(itemPath))
      
      // Then sync to server in background
      updateItem.mutate(
        { path: itemPath, data },
        {
          onSuccess: () => showNotification('Saved!'),
          onError: () => showNotification('Failed to save', 'error'),
          onSettled: () => {
            // Clear pending status
            setPendingItems(prev => {
              const next = new Set(prev)
              next.delete(itemPath)
              return next
            })
          }
        }
      )
  }

  // Creates a child under parentPath — local tree first, then the server.
  const createChild = (parentPath: string, data: UpdatePayload & { name: string }) => {

    const normalizedName = slugify(data.name)
    const newItem: StructureItem = {
      title: data.name,
      ...(data.date && { date: data.date }),
      ...(data.repeat && { repeat: data.repeat }),
      ...(data.context && { context: data.context }),
      ...(data.tags && data.tags.length > 0 && { tags: data.tags }),
    }

    const currentPathParts = path ? path.split('.') : []
    const relativeParts = parentPath.split('.').slice(currentPathParts.length)

    // Insert (or remove, for rollback) the child at the parent's position in localItems
    const withChild = (items: Record<string, StructureItem>, insert: boolean): Record<string, StructureItem> => {
      const newItems = JSON.parse(JSON.stringify(items))
      let target = newItems
      for (let i = 0; i < relativeParts.length; i++) {
        const key = relativeParts[i]
        if (!target[key]) return items
        if (i === relativeParts.length - 1) {
          if (!target[key].children) target[key].children = {}
          if (insert) target[key].children[normalizedName] = newItem
          else delete target[key].children[normalizedName]
        } else {
          target = target[key].children || target[key]
        }
      }
      return newItems
    }

    // IMMEDIATELY update local state for instant visual feedback
    setLocalItems(prev => prev ? withChild(prev, true) : prev)

    const newItemPath = `${parentPath}.${normalizedName}`
    setPendingItems(prev => new Set(prev).add(newItemPath))

    // Then sync to server in background
    createItem.mutate(
      { parentPath, data },
      {
        onSuccess: () => showNotification('Created!'),
        onError: () => {
          showNotification('Failed to create', 'error')
          setLocalItems(prev => prev ? withChild(prev, false) : prev)
        },
        onSettled: () => {
          setPendingItems(prev => {
            const next = new Set(prev)
            next.delete(newItemPath)
            return next
          })
        }
      }
    )
  }

  // Immediately removes the given absolute paths from local state — the
  // bulk delete,
  // used by handleDeleteSelected/handleConfirmAgentDelete below. Deliberately
  // NOT the null-out-and-let-the-sync-effect-repopulate approach those two
  // used to use: nulling localItems races queryClient.invalidateQueries's own
  // async refetch — the sync effect can repopulate localItems from the
  // still-stale cached "structure" before the invalidated refetch resolves,
  // silently reviving the "deleted" item on screen until something else (a
  // full page reload) forces a genuinely fresh fetch. Editing local state
  // directly has no such race.
  const removePathsFromLocal = (paths: string[]) => {
    const currentPathParts = path ? path.split('.') : []
    const relativePaths = paths
      .map(p => p.split('.').slice(currentPathParts.length))
      .filter(rel => rel.length > 0)

    setLocalItems(prev => {
      const newItems = JSON.parse(JSON.stringify(prev ?? rawItems))
      for (const relativeParts of relativePaths) {
        let target = newItems
        let ok = true
        for (let i = 0; i < relativeParts.length - 1; i++) {
          const key = relativeParts[i]
          if (target[key]) target = target[key].children || target[key]
          else { ok = false; break }
        }
        if (ok) delete target[relativeParts[relativeParts.length - 1]]
      }
      return newItems
    })

    const topLevelDeleted = new Set(relativePaths.filter(rel => rel.length === 1).map(rel => rel[0]))
    if (topLevelDeleted.size > 0) {
      setLocalOrder(prev => (prev ?? serverKeys).filter(k => !topLevelDeleted.has(k)))
    }
  }

  return { applyEdit, createChild, removePathsFromLocal }
}
