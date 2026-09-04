import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchStructure,
  fetchGraphs,
  updateItem,
  createItem,
  deleteItem,
  moveItemUp,
  moveItemDown,
  moveItemToPosition,
  moveItemToParent,
  syncToDrive,
  slugify,
  UpdatePayload,
  StructureItem,
} from '@api'

// Hook to fetch and cache the list of graphs
export function useGraphs() {
  return useQuery({
    queryKey: ['graphs'],
    queryFn: fetchGraphs,
    staleTime: 1000 * 60 * 5, // 5 minutes - graphs list rarely changes
  })
}

// Hook to fetch and cache the full structure
export function useStructure(graphName?: string) {
  return useQuery({
    queryKey: ['structure', graphName],
    queryFn: () => fetchStructure(graphName),
  })
}

// Hook for updating an item with optimistic updates
export function useUpdateItem(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, data }: { path: string; data: UpdatePayload }) =>
      updateItem(path, data, graphName),
    
    // Optimistic update
    onMutate: async ({ path, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })

      // Snapshot previous value
      const previousStructure = queryClient.getQueryData(['structure', graphName])

      // Optimistically update the cache
      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old) return old
        return applyOptimisticUpdate(old, path, data)
      })

      return { previousStructure }
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure', graphName], context.previousStructure)
      }
    },

    // Always refetch after success or error
    onSettled: () => {
      // Background sync to drive
      syncToDrive(graphName).catch(console.error)
    },
  })
}

// Hook for creating a new item with optimistic updates
export function useCreateItem(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ parentPath, data }: { parentPath: string; data: UpdatePayload }) =>
      createItem(parentPath, data, graphName),
    
    // Optimistic update - show new item immediately
    onMutate: async ({ parentPath, data }) => {
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })
      const previousStructure = queryClient.getQueryData(['structure', graphName])

      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old || !data.name) return old
        return applyOptimisticCreate(old, parentPath, data)
      })

      return { previousStructure }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure', graphName], context.previousStructure)
      }
    },

    onSettled: () => {
      // Refetch to get server's response (in case of name conflicts, etc)
      queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
      syncToDrive(graphName).catch(console.error)
    },
  })
}

// Hook for deleting an item with optimistic update
export function useDeleteItem(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (path: string) => deleteItem(path, graphName),
    
    onMutate: async (path) => {
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })
      const previousStructure = queryClient.getQueryData(['structure', graphName])

      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old) return old
        return applyOptimisticDelete(old, path)
      })

      return { previousStructure }
    },

    onError: (_err, _path, context) => {
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure', graphName], context.previousStructure)
      }
    },

    onSettled: () => {
      syncToDrive(graphName).catch(console.error)
    },
  })
}

// Hook for reordering items (up/down buttons) with optimistic updates
export function useMoveItem(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, direction }: { path: string; direction: 'up' | 'down' }) =>
      direction === 'up' ? moveItemUp(path, graphName) : moveItemDown(path, graphName),
    
    // Optimistic update
    onMutate: async ({ path, direction }) => {
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })
      const previousStructure = queryClient.getQueryData(['structure', graphName])

      // Calculate target index based on direction
      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old) return old
        
        const keys = path.split('.')
        const itemKey = keys[keys.length - 1]
        
        // Get parent container
        let parentContainer = old.structure
        for (let i = 0; i < keys.length - 1; i++) {
          if (parentContainer[keys[i]]?.children) {
            parentContainer = parentContainer[keys[i]].children
          } else if (parentContainer[keys[i]]) {
            parentContainer = parentContainer[keys[i]]
          }
        }
        
        const orderedKeys = Object.keys(parentContainer)
        const currentIndex = orderedKeys.indexOf(itemKey)
        
        if (currentIndex === -1) return old
        
        const targetIndex = direction === 'up' 
          ? Math.max(0, currentIndex - 1)
          : Math.min(orderedKeys.length - 1, currentIndex + 1)
        
        if (targetIndex === currentIndex) return old

        return applyOptimisticMoveToPosition(old, path, keys.slice(0, -1).join('.'), targetIndex)
      })

      return { previousStructure }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure', graphName], context.previousStructure)
      }
    },

    onSettled: () => {
      syncToDrive(graphName).catch(console.error)
    },
  })
}

// Hook for drag-and-drop "before"-zone drops — moves an item to a specific
// position, in the same parent (a plain reorder) or a different one (both
// reparenting and positioning in one move), with optimistic updates.
export function useMoveItemToPosition(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, newParentPath, targetIndex }: { path: string; newParentPath: string; targetIndex: number }) =>
      moveItemToPosition(path, newParentPath, targetIndex, graphName),

    // Optimistic update - immediately show the item in its new spot
    onMutate: async ({ path, newParentPath, targetIndex }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })

      // Snapshot the previous value for rollback
      const previousStructure = queryClient.getQueryData(['structure', graphName])

      // Optimistically update the cache to show the new position immediately
      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old) return old
        return applyOptimisticMoveToPosition(old, path, newParentPath, targetIndex)
      })

      // Return context with the snapshot for rollback
      return { previousStructure }
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      console.error('Move error:', _err)
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure', graphName], context.previousStructure)
      }
    },

    // Background sync after success or error
    onSettled: () => {
      syncToDrive(graphName).catch(console.error)
    },
  })
}

// Hook for drag-to-nest — moves an item to become the last child of a
// different parent, unlike useMoveItemToPosition which lands at a specific
// index rather than always appending.
export function useMoveItemToParent(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, newParentPath }: { path: string; newParentPath: string }) =>
      moveItemToParent(path, newParentPath, graphName),

    onMutate: async ({ path, newParentPath }) => {
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })
      const previousStructure = queryClient.getQueryData(['structure', graphName])
      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old) return old
        return applyOptimisticMove(old, path, newParentPath)
      })
      return { previousStructure }
    },

    onError: (_err, _vars, context) => {
      console.error('Move error:', _err)
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure', graphName], context.previousStructure)
      }
    },

    onSettled: () => {
      syncToDrive(graphName).catch(console.error)
    },
  })
}

// Helper function to apply optimistic move — remove from the old parent's
// children, append as the last child of the new parent, deduping the key the
// same way moveItemToParent does server-side.
function applyOptimisticMove(structure: any, path: string, newParentPath: string): any {
  const keys = path.split('.')
  const newStructure = JSON.parse(JSON.stringify(structure))
  const itemKey = keys[keys.length - 1]

  let parentContainer = newStructure.structure
  for (let i = 0; i < keys.length - 1; i++) {
    if (parentContainer[keys[i]]?.children) parentContainer = parentContainer[keys[i]].children
    else if (parentContainer[keys[i]]) parentContainer = parentContainer[keys[i]]
  }
  const item = parentContainer[itemKey]
  if (!item) return structure
  delete parentContainer[itemKey]

  let targetContainer = newStructure.structure
  if (newParentPath) {
    for (const key of newParentPath.split('.')) {
      if (targetContainer[key]?.children) targetContainer = targetContainer[key].children
      else if (targetContainer[key]) targetContainer = targetContainer[key]
      else return structure // target vanished — bail, no-op
    }
  }

  let newKey = itemKey, n = 2
  while (newKey in targetContainer) newKey = `${itemKey}_${n++}`
  targetContainer[newKey] = item

  return newStructure
}

// Helper function to apply optimistic update
function applyOptimisticUpdate(structure: any, path: string, data: UpdatePayload): any {
  const keys = path.split('.')
  const newStructure = JSON.parse(JSON.stringify(structure))
  
  let current = newStructure.structure
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]]?.children) {
      current = current[keys[i]].children
    } else if (current[keys[i]]) {
      current = current[keys[i]]
    }
  }

  const finalKey = keys[keys.length - 1]
  if (current[finalKey]) {
    // Handle name change (rename)
    const normalizedName = data.name ? slugify(data.name) : null
    if (normalizedName && normalizedName !== finalKey) {
      // Preserve order by rebuilding the object
      const newCurrent: Record<string, any> = {}
      for (const key of Object.keys(current)) {
        if (key === finalKey) {
          newCurrent[normalizedName] = { ...current[finalKey], title: data.name }
        } else {
          newCurrent[key] = current[key]
        }
      }
      // Replace current contents
      Object.keys(current).forEach(k => delete current[k])
      Object.assign(current, newCurrent)
      // Update reference for property changes below
      current = newCurrent
    }
    
    // Get the item (might have been renamed)
    const itemKey = normalizedName && normalizedName !== finalKey ? normalizedName : finalKey
    const item = current[itemKey]
    
    if (item && data.name !== undefined) {
      item.title = data.name
    }
    
    if (item) {
      if (data.date !== undefined && data.date !== '') {
        item.date = data.date
      } else if (data.date === '') {
        delete item.date
      }

      if (data.context !== undefined && data.context !== '') {
        item.context = data.context
      } else if (data.context === '') {
        delete item.context
      }

      if (data.tags !== undefined && data.tags.length > 0) {
        item.tags = data.tags
      } else if (data.tags !== undefined && data.tags.length === 0) {
        delete item.tags
      }
    }
  }

  return newStructure
}

// Helper function to apply optimistic create
function applyOptimisticCreate(structure: any, parentPath: string, data: UpdatePayload): any {
  const newStructure = JSON.parse(JSON.stringify(structure))
  
  // Navigate to parent container
  let parentContainer = newStructure.structure
  if (parentPath) {
    const keys = parentPath.split('.')
    for (const key of keys) {
      if (parentContainer[key]?.children) {
        parentContainer = parentContainer[key].children
      } else if (parentContainer[key]) {
        parentContainer = parentContainer[key]
      }
    }
  }
  
  // Add new item
  if (data.name) {
    const newItem: Record<string, any> = {}
    if (data.date !== undefined && data.date !== '') {
      newItem.date = data.date
    }
    if (data.context !== undefined && data.context !== '') {
      newItem.context = data.context
    }
    if (data.tags !== undefined && data.tags.length > 0) {
      newItem.tags = data.tags
    }
    parentContainer[data.name] = newItem
  }
  
  return newStructure
}

// Helper function to apply optimistic delete
function applyOptimisticDelete(structure: any, path: string): any {
  const keys = path.split('.')
  const newStructure = JSON.parse(JSON.stringify(structure))
  
  let current = newStructure.structure
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]]?.children) {
      current = current[keys[i]].children
    } else if (current[keys[i]]) {
      current = current[keys[i]]
    }
  }

  const finalKey = keys[keys.length - 1]
  delete current[finalKey]

  return newStructure
}

// Helper function to apply an optimistic move-to-position — combines
// applyOptimisticMove (reparent) and the old applyOptimisticReorder
// (position) into one operation, since "before"-zone drops always mean
// "insert before this item's own list" now, whether that's the dragged
// item's current parent or a different one (see moveItemToPosition
// server-side for the matching same-parent-index-adjustment logic).
function applyOptimisticMoveToPosition(structure: any, path: string, newParentPath: string, targetIndex: number): any {
  const keys = path.split('.')
  const newStructure = JSON.parse(JSON.stringify(structure))
  const itemKey = keys[keys.length - 1]

  let parentContainer = newStructure.structure
  for (let i = 0; i < keys.length - 1; i++) {
    if (parentContainer[keys[i]]?.children) parentContainer = parentContainer[keys[i]].children
    else if (parentContainer[keys[i]]) parentContainer = parentContainer[keys[i]]
  }
  const item = parentContainer[itemKey]
  if (!item) return structure

  let targetContainer = newStructure.structure
  if (newParentPath) {
    for (const key of newParentPath.split('.')) {
      if (targetContainer[key]?.children) targetContainer = targetContainer[key].children
      else if (targetContainer[key]) targetContainer = targetContainer[key]
      else return structure // target vanished — bail, no-op
    }
  }

  const sameParent = targetContainer === parentContainer
  const oldIndex = Object.keys(parentContainer).indexOf(itemKey)
  delete parentContainer[itemKey]

  let key = itemKey
  if (!sameParent) {
    let n = 2
    while (key in targetContainer) key = `${itemKey}_${n++}`
  }

  // targetIndex is the drop target's index before removal ("insert before
  // this row"); a same-parent forward move needs it shifted back by one to
  // still land before the same visual row once the dragged item is gone —
  // a cross-parent move needs no such adjustment, since the dragged item
  // was never part of the target list to begin with.
  const adjustedTargetIndex = sameParent && oldIndex !== -1 && oldIndex < targetIndex ? targetIndex - 1 : targetIndex
  const orderedKeys = Object.keys(targetContainer)
  const safeIndex = Math.max(0, Math.min(adjustedTargetIndex, orderedKeys.length))
  orderedKeys.splice(safeIndex, 0, key)

  // Rebuild target container in new order
  const newTarget: Record<string, any> = {}
  for (const k of orderedKeys) {
    newTarget[k] = k === key ? item : targetContainer[k]
  }

  // Replace target contents
  Object.keys(targetContainer).forEach(k => delete targetContainer[k])
  Object.assign(targetContainer, newTarget)

  return newStructure
}

// Helper to navigate structure and get item by path
export function getItemByPath(structure: any, path: string): StructureItem | null {
  if (!path || !structure?.structure) return null
  
  const keys = path.split('.')
  let current = structure.structure
  
  for (const key of keys) {
    if (current[key]) {
      current = current[key]
    } else if (current.children?.[key]) {
      current = current.children[key]
    } else {
      return null
    }
  }
  
  return current
}
