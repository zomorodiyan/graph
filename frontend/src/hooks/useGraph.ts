import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchStructure,
  fetchGraphs,
  updateItem,
  createItem,
  deleteItem,
  moveItemUp,
  moveItemDown,
  reorderItem,
  syncToDrive,
  UpdatePayload,
  StructureItem,
} from '../api/client'

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
        
        return applyOptimisticReorder(old, path, targetIndex)
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

// Hook for drag-and-drop reordering with optimistic updates
export function useReorderItem(graphName?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, targetIndex }: { path: string; targetIndex: number }) =>
      reorderItem(path, targetIndex, graphName),
    
    // Optimistic update - immediately show the reordered items
    onMutate: async ({ path, targetIndex }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['structure', graphName] })

      // Snapshot the previous value for rollback
      const previousStructure = queryClient.getQueryData(['structure', graphName])

      // Optimistically update the cache to show new order immediately
      queryClient.setQueryData(['structure', graphName], (old: any) => {
        if (!old) return old
        return applyOptimisticReorder(old, path, targetIndex)
      })

      // Return context with the snapshot for rollback
      return { previousStructure }
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      console.error('Reorder error:', _err)
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
    const normalizedName = data.name ? data.name.toLowerCase().replace(/ /g, '_') : null
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
      if (data.progress !== undefined && data.progress !== '') {
        item.progress = data.progress
      } else if (data.progress === '') {
        delete item.progress
      }
      
      if (data.context !== undefined && data.context !== '') {
        item.context = data.context
      } else if (data.context === '') {
        delete item.context
      }
      
      if (data.due !== undefined && data.due !== '') {
        item.due = data.due
      } else if (data.due === '') {
        delete item.due
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
    if (data.progress !== undefined && data.progress !== '') {
      newItem.progress = data.progress
    }
    if (data.context !== undefined && data.context !== '') {
      newItem.context = data.context
    }
    if (data.due !== undefined && data.due !== '') {
      newItem.due = data.due
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

// Helper function to apply optimistic reorder
function applyOptimisticReorder(structure: any, path: string, targetIndex: number): any {
  const keys = path.split('.')
  const newStructure = JSON.parse(JSON.stringify(structure))
  
  const itemKey = keys[keys.length - 1]
  
  // Get parent container
  let parentContainer = newStructure.structure
  for (let i = 0; i < keys.length - 1; i++) {
    if (parentContainer[keys[i]]?.children) {
      parentContainer = parentContainer[keys[i]].children
    } else if (parentContainer[keys[i]]) {
      parentContainer = parentContainer[keys[i]]
    }
  }
  
  // Get ordered keys and reorder
  const orderedKeys = Object.keys(parentContainer)
  const currentIndex = orderedKeys.indexOf(itemKey)
  
  if (currentIndex === -1) return structure
  
  // Remove from current position
  orderedKeys.splice(currentIndex, 1)
  // Insert at target position
  const safeTargetIndex = Math.min(targetIndex, orderedKeys.length)
  orderedKeys.splice(safeTargetIndex, 0, itemKey)
  
  // Rebuild parent container in new order
  const newParent: Record<string, any> = {}
  for (const key of orderedKeys) {
    newParent[key] = parentContainer[key]
  }
  
  // Replace parent contents
  Object.keys(parentContainer).forEach(k => delete parentContainer[k])
  Object.assign(parentContainer, newParent)
  
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
