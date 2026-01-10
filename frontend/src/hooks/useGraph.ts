import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchStructure,
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

// Hook to fetch and cache the full structure
export function useStructure() {
  return useQuery({
    queryKey: ['structure'],
    queryFn: fetchStructure,
  })
}

// Hook for updating an item with optimistic updates
export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, data }: { path: string; data: UpdatePayload }) =>
      updateItem(path, data),
    
    // Optimistic update
    onMutate: async ({ path, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['structure'] })

      // Snapshot previous value
      const previousStructure = queryClient.getQueryData(['structure'])

      // Optimistically update the cache
      queryClient.setQueryData(['structure'], (old: any) => {
        if (!old) return old
        return applyOptimisticUpdate(old, path, data)
      })

      return { previousStructure }
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure'], context.previousStructure)
      }
    },

    // Always refetch after success or error
    onSettled: () => {
      // Background sync to drive
      syncToDrive().catch(console.error)
    },
  })
}

// Hook for creating a new item
export function useCreateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ parentPath, data }: { parentPath: string; data: UpdatePayload }) =>
      createItem(parentPath, data),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['structure'] })
      syncToDrive().catch(console.error)
    },
  })
}

// Hook for deleting an item with optimistic update
export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (path: string) => deleteItem(path),
    
    onMutate: async (path) => {
      await queryClient.cancelQueries({ queryKey: ['structure'] })
      const previousStructure = queryClient.getQueryData(['structure'])

      queryClient.setQueryData(['structure'], (old: any) => {
        if (!old) return old
        return applyOptimisticDelete(old, path)
      })

      return { previousStructure }
    },

    onError: (_err, _path, context) => {
      if (context?.previousStructure) {
        queryClient.setQueryData(['structure'], context.previousStructure)
      }
    },

    onSettled: () => {
      syncToDrive().catch(console.error)
    },
  })
}

// Hook for reordering items
export function useMoveItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, direction }: { path: string; direction: 'up' | 'down' }) =>
      direction === 'up' ? moveItemUp(path) : moveItemDown(path),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['structure'] })
      syncToDrive().catch(console.error)
    },
  })
}

// Hook for drag-and-drop reordering
export function useReorderItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, targetIndex }: { path: string; targetIndex: number }) =>
      reorderItem(path, targetIndex),
    
    onSuccess: async () => {
      // Refetch the structure to get the updated order from server
      await queryClient.invalidateQueries({ queryKey: ['structure'] })
      syncToDrive().catch(console.error)
    },

    onError: (err) => {
      console.error('Reorder error:', err)
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
    if (data.progress !== undefined && data.progress !== '') {
      current[finalKey].progress = data.progress
    } else if (data.progress === '') {
      delete current[finalKey].progress
    }
    
    if (data.context !== undefined && data.context !== '') {
      current[finalKey].context = data.context
    } else if (data.context === '') {
      delete current[finalKey].context
    }
    
    if (data.due !== undefined && data.due !== '') {
      current[finalKey].due = data.due
    } else if (data.due === '') {
      delete current[finalKey].due
    }
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
