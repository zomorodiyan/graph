import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useStructure, useGraphs, useUpdateItem, useDeleteItem, useReorderItem, useCreateItem, getItemByPath } from '../hooks/useGraph'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useSwipeNavigation } from '../hooks/useSwipeNavigation'
import { useTheme } from '../context/ThemeContext'
import { StructureItem, UpdatePayload, pasteItems } from '@api'
import InlineItemEditor from '../components/InlineItemEditor'
import Notification from '../components/Notification'
import Section from '../components/Section'
import { loadViewPreferences } from '../utils/viewPreferences'

// Color assignment based on index
const COLORS = ['sky', 'indigo', 'fuchsia']

function GraphView() {
  const location = useLocation()
  const { graphName } = useParams<{ graphName?: string }>()
  
  // Parse path from URL, handling both /g/{graphName}/... and legacy /... routes
  const getPathFromLocation = () => {
    const pathname = location.pathname
    if (graphName) {
      // Route: /g/{graphName}/path/to/item -> path.to.item
      const prefix = `/g/${graphName}`
      const remaining = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
      return remaining === '' || remaining === '/' ? '' : remaining.slice(1).replace(/\//g, '.')
    } else {
      // Legacy route: /path/to/item -> path.to.item
      return pathname === '/' ? '' : pathname.slice(1).replace(/\//g, '.')
    }
  }
  
  const path = getPathFromLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // Enable swipe navigation (browser-like back/forward)
  useSwipeNavigation()
  const { toggleTheme } = useTheme()
  const [depth, setDepth] = useState<0 | 1 | 2 | 3>(3)
  const [viewMode, setViewMode] = useState<'default' | 'context'>('context')
  const { data: structure, isLoading, error } = useStructure(graphName)
  const { data: graphs = [] } = useGraphs()
  const viewPreferences = useMemo(() => loadViewPreferences(), [location.key])
  
  const updateItem = useUpdateItem(graphName)
  const deleteItemMutation = useDeleteItem(graphName)
  const reorderItem = useReorderItem(graphName)
  const createItem = useCreateItem(graphName)
  
  const containerRef = useRef<HTMLDivElement>(null)

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
  // LOCAL order state - this is what controls the visual display
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  
  // LOCAL items state - for immediate visual updates on edits
  const [localItems, setLocalItems] = useState<Record<string, StructureItem> | null>(null)
  
  // Track items that are being synced (pending) - these show loading and can't be dragged
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set())
  
  // Inline create state - shows editor at bottom of list for new item
  const [inlineCreate, setInlineCreate] = useState(false)

  // Inline edit state for item editing
  const [inlineEdit, setInlineEdit] = useState<{ path: string } | null>(null)
  
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error' | 'syncing'
  } | null>(null)

  useModalBackButton(inlineCreate || Boolean(inlineEdit), () => {
    if (inlineEdit) { setInlineEdit(null); return }
    setInlineCreate(false)
  })

  // Show notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'syncing' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Helper to get due category
  const getDueCategory = (dueDate: string): 'over' | 'day' | 'week' | 'month' | null => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) return 'over'
    if (diffDays === 0) return 'day'
    if (diffDays <= 7) return 'week'
    if (diffDays <= 30) return 'month'
    return null
  }

  // Helper to get progress category
  const getProgressCategory = (progress: number): 'blocked' | 'low' | 'mid' | 'high' | 'done' | null => {
    if (progress < 0 || progress > 100) return null
    if (progress === 0) return 'blocked'
    if (progress < 25) return 'low'
    if (progress < 75) return 'mid'
    if (progress < 100) return 'high'
    if (progress === 100) return 'done'
    return null
  }

  // Collect all items with due dates from the structure
  const collectDueItems = (items: Record<string, StructureItem>, parentPath: string = ''): Array<{path: string, item: StructureItem, title: string}> => {
    const result: Array<{path: string, item: StructureItem, title: string}> = []
    
    for (const [key, item] of Object.entries(items)) {
      const itemPath = parentPath ? `${parentPath}.${key}` : key
      
      if (item.due) {
        result.push({ path: itemPath, item, title: item.title || key })
      }
      
      if (item.children) {
        result.push(...collectDueItems(item.children, itemPath))
      }
    }
    
    return result
  }

  // Collect all items with progress values from the structure
  const collectProgressItems = (items: Record<string, StructureItem>, parentPath: string = ''): Array<{path: string, item: StructureItem, title: string}> => {
    const result: Array<{path: string, item: StructureItem, title: string}> = []
    
    for (const [key, item] of Object.entries(items)) {
      const itemPath = parentPath ? `${parentPath}.${key}` : key
      
      if (item.progress !== undefined && item.progress !== null) {
        result.push({ path: itemPath, item, title: item.title || key })
      }
      
      if (item.children) {
        result.push(...collectProgressItems(item.children, itemPath))
      }
    }
    
    return result
  }

  // Build virtual children for time categories
  const getTimeChildren = (category: 'over' | 'day' | 'week' | 'month'): Record<string, StructureItem> => {
    if (!structure?.structure) return {}
    
    // Collect from structure, excluding the 'time' and 'progress' sections
    const structureWithoutVirtual = { ...structure.structure }
    delete structureWithoutVirtual.time
    delete structureWithoutVirtual.progress
    
    const allItems = collectDueItems(structureWithoutVirtual)
    const filtered = allItems.filter(({ item }) => {
      if (!item.due) return false
      return getDueCategory(item.due) === category
    })
    
    const result: Record<string, StructureItem> = {}
    for (const { path: itemPath, item, title } of filtered) {
      // Use a unique key based on the path
      const key = itemPath.replace(/\./g, '_')
      // Show parent path only (remove the item name itself)
      const pathParts = itemPath.split('.')
      const parentPath = pathParts.slice(0, -1).map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' › ')
      result[key] = {
        ...item,
        title: title,
        context: viewMode === 'context' && parentPath ? `📍 ${parentPath}` : undefined,
        originalPath: itemPath, // Store original path for navigation
        nonEditable: true, // Time items are not editable - they navigate to original
        children: undefined // Don't show nested children in time view
      }
    }
    
    return result
  }

  // Build virtual children for progress categories
  const getProgressChildren = (category: 'blocked' | 'low' | 'mid' | 'high' | 'done'): Record<string, StructureItem> => {
    if (!structure?.structure) return {}
    
    // Collect from structure, excluding the 'time' and 'progress' sections
    const structureWithoutVirtual = { ...structure.structure }
    delete structureWithoutVirtual.time
    delete structureWithoutVirtual.progress
    
    const allItems = collectProgressItems(structureWithoutVirtual)
    const filtered = allItems.filter(({ item }) => {
      if (item.progress === undefined || item.progress === null) return false
      return getProgressCategory(item.progress) === category
    })
    
    const result: Record<string, StructureItem> = {}
    for (const { path: itemPath, item, title } of filtered) {
      // Use a unique key based on the path
      const key = itemPath.replace(/\./g, '_')
      // Show parent path only (remove the item name itself)
      const pathParts = itemPath.split('.')
      const parentPath = pathParts.slice(0, -1).map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' › ')
      result[key] = {
        ...item,
        title: title,
        context: viewMode === 'context' && parentPath ? `📍 ${parentPath}` : undefined,
        originalPath: itemPath, // Store original path for navigation
        nonEditable: true, // Progress items are not editable - they navigate to original
        children: undefined // Don't show nested children in progress view
      }
    }
    
    return result
  }

  // Build auto-generated Time section if any items have due dates
  const buildTimeSection = (): StructureItem | null => {
    if (!structure?.structure) return null
    
    // Check if any items have due dates (excluding virtual sections)
    const structureWithoutVirtual = { ...structure.structure }
    delete structureWithoutVirtual.time
    delete structureWithoutVirtual.progress
    
    const allDueItems = collectDueItems(structureWithoutVirtual)
    if (allDueItems.length === 0) return null
    
    // Build the time section with categories - only include non-empty ones
    const categories = ['over', 'day', 'week', 'month'] as const
    const timeChildren: Record<string, StructureItem> = {}
    
    for (const category of categories) {
      const dueItems = getTimeChildren(category)
      const count = Object.keys(dueItems).length
      // Only include category if it has items
      if (count > 0) {
        const titles = { over: 'Over', day: 'Day', week: 'Week', month: 'Month' }
        timeChildren[category] = {
          title: `${titles[category]} (${count})`,
          nonEditable: true,
          children: dueItems
        }
      }
    }
    
    // Only return Time section if at least one category has items
    if (Object.keys(timeChildren).length === 0) return null
    
    return {
      title: 'Time',
      nonEditable: true,
      children: timeChildren
    }
  }

  // Build auto-generated Progress section if any items have progress values
  const buildProgressSection = (): StructureItem | null => {
    if (!structure?.structure) return null
    
    // Check if any items have progress (excluding virtual sections)
    const structureWithoutVirtual = { ...structure.structure }
    delete structureWithoutVirtual.time
    delete structureWithoutVirtual.progress
    
    const allProgressItems = collectProgressItems(structureWithoutVirtual)
    if (allProgressItems.length === 0) return null
    
    // Build the progress section with categories - only include non-empty ones
    const categories = ['blocked', 'low', 'mid', 'high', 'done'] as const
    const progressChildren: Record<string, StructureItem> = {}
    
    for (const category of categories) {
      const progressItems = getProgressChildren(category)
      const count = Object.keys(progressItems).length
      // Only include category if it has items
      if (count > 0) {
        const titles = { blocked: 'Blocked (0%)', low: 'Low (1-24%)', mid: 'Mid (25-74%)', high: 'High (75-99%)', done: 'Done (100%)' }
        progressChildren[category] = {
          title: `${titles[category]} (${count})`,
          nonEditable: true,
          children: progressItems
        }
      }
    }
    
    // Only return Progress section if at least one category has items
    if (Object.keys(progressChildren).length === 0) return null
    
    return {
      title: 'Progress',
      nonEditable: true,
      children: progressChildren
    }
  }

  // Get current level items
  const getCurrentItems = () => {
    if (!structure?.structure) return {}
    
    if (!path) {
      // Root level - auto-generate time and progress sections
      const items = { ...structure.structure }
      
      // Remove any existing virtual sections (they're auto-generated)
      delete items.time
      delete items.progress
      
      // Auto-generate Time section if there are items with due dates
      const timeSection = viewPreferences.showTime ? buildTimeSection() : null
      if (timeSection) {
        items.time = timeSection
      }
      
      // Auto-generate Progress section if there are items with progress values
      const progressSection = viewPreferences.showProgress ? buildProgressSection() : null
      if (progressSection) {
        items.progress = progressSection
      }
      
      return items
    }
    
    // Check if we're viewing "time" - show auto-generated time categories
    if (path === 'time') {
      if (!viewPreferences.showTime) return {}
      const timeSection = buildTimeSection()
      if (timeSection?.children) {
        return timeSection.children
      }
      return {}
    }
    
    // Check if we're in a time category (time.over, time.day, time.week, time.month)
    const pathParts = path.split('.')
    if (pathParts[0] === 'time' && pathParts.length === 2) {
      if (!viewPreferences.showTime) return {}
      const category = pathParts[1] as 'over' | 'day' | 'week' | 'month'
      if (['over', 'day', 'week', 'month'].includes(category)) {
        // Return the items directly as sections
        return getTimeChildren(category)
      }
    }
    
    // Check if we're viewing "progress" - show auto-generated progress categories
    if (path === 'progress') {
      if (!viewPreferences.showProgress) return {}
      const progressSection = buildProgressSection()
      if (progressSection?.children) {
        return progressSection.children
      }
      return {}
    }
    
    // Check if we're in a progress category (progress.blocked, progress.low, etc.)
    if (pathParts[0] === 'progress' && pathParts.length === 2) {
      if (!viewPreferences.showProgress) return {}
      const category = pathParts[1] as 'blocked' | 'low' | 'mid' | 'high' | 'done'
      if (['blocked', 'low', 'mid', 'high', 'done'].includes(category)) {
        // Return the items directly as sections
        return getProgressChildren(category)
      }
    }
    
    const item = getItemByPath(structure, path)
    if (item?.children) {
      return item.children
    }
    return {}
  }

  // Get the raw items from structure
  const rawItems = getCurrentItems()
  
  // Server keys - stable reference using JSON string comparison
  const rawItemsKeyString = Object.keys(rawItems).join(',')
  const serverKeys = useMemo(() => Object.keys(rawItems), [rawItemsKeyString])
  
  // Sync local state when PATH changes OR when data first loads (localItems is null)
  // This prevents server response from overwriting our local optimistic updates during edits
  useEffect(() => {
    // Only sync if:
    // 1. localItems is null (initial load or path changed)
    // 2. OR path changed (handled by dependency array)
    if (localItems === null && Object.keys(rawItems).length > 0) {
      setLocalOrder(Object.keys(rawItems))
      setLocalItems(rawItems)
    }
  }, [rawItemsKeyString, localItems])
  
  // Reset local state when path changes (navigating to different view)
  useEffect(() => {
    setLocalOrder(null)
    setLocalItems(null)
  }, [path])

  // Per-bubble compactness: apply CSS classes based on each section-wrapper's rendered width
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const REM = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const COMPACT_PX = 28 * REM  // < 28rem → L2 below L1
    const STACK_PX = 20 * REM    // < 20rem → L3 below L2

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        const el = entry.target as HTMLElement
        el.classList.toggle('section-wrapper--compact', w < COMPACT_PX)
        el.classList.toggle('section-wrapper--stack', w < STACK_PX)
      }
    })

    container.querySelectorAll('.section-wrapper').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [structure])
  
  // The display items: use local items if available, otherwise raw items from server
  // At root level, always overlay the virtual time/progress sections from rawItems
  // so they update reactively when items gain/lose due dates or progress values
  const displayItems = useMemo(() => {
    const base = localItems || rawItems
    if (!path && localItems) {
      const merged = { ...localItems }
      delete merged.time
      delete merged.progress
      if (rawItems.time) merged.time = rawItems.time
      if (rawItems.progress) merged.progress = rawItems.progress
      return merged
    }
    return base
  }, [localItems, rawItems, path])

  // The display order: use local order if available, otherwise server order
  // At root level, ensure virtual time/progress keys are included
  const displayOrder = useMemo(() => {
    const order = localOrder || serverKeys
    if (!path && localItems) {
      const result = order.filter(k => k !== 'time' && k !== 'progress')
      if (rawItems.time) result.push('time')
      if (rawItems.progress) result.push('progress')
      return result
    }
    return order
  }, [localOrder, serverKeys, path, localItems, rawItems])

  // Helper to build URL paths with optional graph prefix
  const buildPath = (itemPath: string) => {
    const base = graphName ? `/g/${graphName}` : ''
    return itemPath ? `${base}/${itemPath.replace(/\./g, '/')}` : base || '/'
  }

  // Build breadcrumb
  const getBreadcrumb = () => {
    const crumbs = []
    
    // Add "Graphs" link if we're in a specific graph
    if (graphName) {
      crumbs.push({ label: '⛩', path: '/', isRoot: true })
      const graphDisplay = graphs.find(g => g.name === graphName)?.display_name
        ?? graphName.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      crumbs.push({ label: graphDisplay, path: `/g/${graphName}` })
    } else {
      crumbs.push({ label: 'Home', path: '/' })
    }
    
    if (!path) return crumbs
    
    const parts = path.split('.')
    let currentPath = ''
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}.${part}` : part
      const item = getItemByPath(structure, currentPath)
      crumbs.push({
        label: item?.title || part,
        path: buildPath(currentPath)
      })
    }
    
    return crumbs
  }

  // Handle item click - navigate to item page (always, even without children)
  const handleItemClick = (itemPath: string, _hasChildren: boolean) => {
    // For time/progress view items that have an originalPath, navigate to the parent location
    const currentItems = getCurrentItems()
    
    // Traverse the path to find the item
    const pathParts = itemPath.split('.')
    const basePath = path ? path.split('.') : []
    const relativeParts = pathParts.slice(basePath.length)
    
    let targetItem: StructureItem | undefined = undefined
    let current: Record<string, StructureItem> | undefined = currentItems
    
    for (const part of relativeParts) {
      if (!current) break
      targetItem = current[part]
      current = targetItem?.children
    }
    
    if (targetItem?.originalPath) {
      // Navigate to the parent location (where the item appears)
      const originalPath = targetItem.originalPath as string
      const originalParts = originalPath.split('.')
      // Go to the parent path (remove the item name itself)
      const parentPath = originalParts.slice(0, -1).join('.')
      navigate(buildPath(parentPath || ''), { replace: true })
    } else {
      navigate(buildPath(itemPath), { replace: true })
    }
  }

  // Handle edit click
  const handleEditClick = (itemPath: string, _name: string, _data: StructureItem) => {
    setInlineEdit({ path: itemPath })
  }

  // Handle add new item click
  const handleAddClick = () => {
    setInlineCreate(true)
  }

  // Handle paste item from clipboard
  const handlePasteItem = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        showNotification('Clipboard is empty', 'error')
        return
      }
      
      const parentPath = path || ''
      
      const result = await pasteItems(parentPath, text, graphName)
      if (result.success) {
        await queryClient.refetchQueries({ queryKey: ['structure', graphName], exact: true })
        setLocalOrder(null)
        setLocalItems(null)
        showNotification(`Pasted ${result.added.length} item(s)!`)
      }
    } catch (err: any) {
      console.error('Paste error:', err)
      const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to paste'
      showNotification(msg.substring(0, 60), 'error')
    }
  }

  // Handle create save from inline editor - uses local state for instant feedback
  const handleCreateSave = (data: UpdatePayload) => {
    setInlineCreate(false)

    const itemPath = path || ''

    if (data.name) {
      // Normalize name the same way the server does
      const normalizedName = data.name.toLowerCase().replace(/ /g, '_')

      const newItem: StructureItem = {
        title: data.name,
        ...(typeof data.progress === 'number' && { progress: data.progress }),
        ...(data.context && { context: data.context }),
        ...(data.due && { due: data.due }),
      }

      // Use callback pattern to avoid stale closure
      setLocalItems(prev => prev ? { ...prev, [normalizedName]: newItem } : { [normalizedName]: newItem })
      setLocalOrder(prev => prev ? [...prev, normalizedName] : [normalizedName])

      // Mark as pending with normalized path
      const newItemPath = itemPath ? `${itemPath}.${normalizedName}` : normalizedName
      setPendingItems(prev => new Set(prev).add(newItemPath))

      // Then sync to server in background
      createItem.mutate(
        { parentPath: itemPath, data },
        {
          onSuccess: () => showNotification('Created!'),
          onError: () => {
            showNotification('Failed to create', 'error')
            // On error, remove from local state since it wasn't created
            setLocalItems(prev => {
              if (!prev) return prev
              const newItems = { ...prev }
              delete newItems[normalizedName]
              return newItems
            })
            setLocalOrder(prev => prev ? prev.filter(k => k !== normalizedName) : prev)
          },
          onSettled: () => {
            // Clear pending status - item can now be dragged
            setPendingItems(prev => {
              const next = new Set(prev)
              next.delete(newItemPath)
              return next
            })
          }
        }
      )
    }
  }

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
      const normalizedNewName = newName ? newName.toLowerCase().replace(/ /g, '_') : null
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
        if (data.progress !== undefined) {
          if (data.progress === '') {
            delete updatedItem.progress
          } else {
            updatedItem.progress = data.progress as number
          }
        }
        if (data.context !== undefined) {
          if (data.context === '') {
            delete updatedItem.context
          } else {
            updatedItem.context = data.context
          }
        }
        if (data.due !== undefined) {
          if (data.due === '') {
            delete updatedItem.due
          } else {
            updatedItem.due = data.due
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

  // Handle inline save - saves when fields changed, otherwise cancels
  const handleInlineSave = (itemPath: string, data: UpdatePayload) => {
    const hasChanges = Object.keys(data).length > 0
    setInlineEdit(null)
    if (!hasChanges) return
    applyEdit(itemPath, data)
  }

  // Handle delete - uses local state for instant feedback (like handleDrop)
  const handleDelete = (pathToDelete: string) => {
    setInlineEdit(null)
    const pathParts = pathToDelete.split('.')
    const currentPathParts = path ? path.split('.') : []
    
    // Calculate relative path from current view
    const relativeParts = pathParts.slice(currentPathParts.length)
    const itemKey = relativeParts[relativeParts.length - 1]
    
    // IMMEDIATELY update local state for instant visual feedback
    setLocalItems(prev => {
      if (!prev) return prev
      
      // Deep clone to avoid mutation
      const newItems = JSON.parse(JSON.stringify(prev))
      
      // Navigate to the parent of the item to delete
      let target = newItems
      for (let i = 0; i < relativeParts.length - 1; i++) {
        const key = relativeParts[i]
        if (target[key]) {
          target = target[key].children || target[key]
        } else {
          return prev // Item not found
        }
      }
      
      if (!target[itemKey]) return prev
      delete target[itemKey]
      return newItems
    })
    
    // Only update local order if deleting a top-level item
    if (relativeParts.length === 1) {
      setLocalOrder(prev => prev ? prev.filter(k => k !== itemKey) : prev)
    }
    
    // Then sync to server in background
    deleteItemMutation.mutate(pathToDelete, {
      onSuccess: () => showNotification('Deleted!'),
      onError: () => showNotification('Failed to delete', 'error'),
    })
  }

  // Drag and drop handlers
  const handleDragStart = (itemPath: string) => {
    setDraggedItem(itemPath)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverIndex(null)
  }

  const handleDrop = async (targetIndex: number) => {
    if (!draggedItem) return
    
    const itemToReorder = draggedItem
    const draggedKey = itemToReorder.split('.').pop()!
    
    setDraggedItem(null)
    setDragOverIndex(null)
    
    // Check if dropped in same position - do nothing
    const currentIndex = localOrder?.indexOf(draggedKey) ?? -1
    if (currentIndex === targetIndex || currentIndex === -1) {
      return
    }
    
    // IMMEDIATELY update local order for instant visual feedback
    setLocalOrder(prevOrder => {
      if (!prevOrder) return prevOrder
      const idx = prevOrder.indexOf(draggedKey)
      if (idx === -1) return prevOrder
      
      const newOrder = [...prevOrder]
      newOrder.splice(idx, 1)
      newOrder.splice(targetIndex, 0, draggedKey)
      return newOrder
    })
    
    // Then sync to server in background
    try {
      await reorderItem.mutateAsync({ path: itemToReorder, targetIndex })
      showNotification('Reordered!')
    } catch (err: any) {
      // Rollback on error - reset to server order
      setLocalOrder(serverKeys)
      const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to reorder'
      showNotification(msg.substring(0, 60), 'error')
    }
  }

  if (isLoading) {
    return <div className="loading">Loading...</div>
  }

  if (error) {
    return <div className="error">Error loading structure: {(error as Error).message}</div>
  }

  const breadcrumb = getBreadcrumb()
  
  // Check if we're in a virtual view (time or progress - items can't be edited/reordered)
  const isVirtualView = path === 'time' || path?.startsWith('time.') || path === 'progress' || path?.startsWith('progress.')

  // Serialize an item and its children to structure.txt format
  const serializeItem = (key: string, item: StructureItem, indent: number = 0): string => {
    const spaces = '  '.repeat(indent)
    let result = `${spaces}${key}\n`
    
    // Add properties
    if (item.progress !== undefined) {
      result += `${spaces}  progress: ${item.progress}\n`
    }
    if (item.context) {
      // Escape backslashes and quotes for safe serialization
      const escaped = item.context.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      result += `${spaces}  "${escaped}"\n`
    }
    if (item.due) {
      result += `${spaces}  due: ${item.due}\n`
    }
    
    // Add children
    if (item.children) {
      for (const [childKey, childItem] of Object.entries(item.children)) {
        result += serializeItem(childKey, childItem as StructureItem, indent + 1)
      }
    }
    
    return result
  }

  const handleCopyItem = async (itemKey: string, item: StructureItem) => {
    try {
      const text = serializeItem(itemKey, item, 0)
      await navigator.clipboard.writeText(text.trimEnd())
      showNotification('Copied!')
    } catch (err) {
      showNotification('Failed to copy', 'error')
    }
  }

  return (
    <>
      {!inlineEdit && !inlineCreate && (
        <div className="top-buttons">
          <button
            className={`ctx-toggle${viewMode === 'context' ? ' active' : ''}`}
            onClick={() => setViewMode(m => m === 'context' ? 'default' : 'context')}
            title={viewMode === 'context' ? 'Context on — tap to hide' : 'Context off — tap to show'}
          >C</button>
          <button
            className="depth-toggle"
            onClick={() => setDepth(d => d === 3 ? 2 : d === 2 ? 1 : d === 1 ? 0 : 3)}
            title={depth === 3 ? 'Showing 3 levels' : depth === 2 ? 'Showing 2 levels' : depth === 1 ? 'Showing 1 level' : 'Raw view'}
          >{depth}</button>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" />
        </div>
      )}

      {/* Breadcrumb — fixed above bottom buttons */}
      {!inlineEdit && !inlineCreate && (
        <nav className="breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.path}>
              {i > 0 && ' / '}
              {i === breadcrumb.length - 1 ? (
                <span>{crumb.label}</span>
              ) : (
                <Link to={crumb.path} replace={!crumb.isRoot}>{crumb.label}</Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="graph-container" ref={containerRef}>
        {/* Items grid — CSS columns for tight packing with no gaps */}
        <div className="items-grid">
        {/* New + Paste — first card */}
        {!isVirtualView && (
          <div className="section-wrapper new-paste-wrapper">
            <div className="section">
              <div className="layer1 color-utility" onClick={handleAddClick} title="Add new item">
                <span className="item-title">+ New</span>
              </div>
              <div className="layer1 color-utility" onClick={handlePasteItem} title="Paste from clipboard">
                <span className="item-title">Paste</span>
              </div>
            </div>
          </div>
        )}
        {/* Sections - rendered in local order for instant drag feedback */}
        {displayOrder.filter(k => k !== 'time' && k !== 'progress').map((key, index) => {
          const item = displayItems[key]
          if (!item) return null
          const itemPath = path ? `${path}.${key}` : key
          const isPending = pendingItems.has(itemPath)
          const canDrag = !isPending && !isVirtualView && !inlineEdit
          
          return (
            <div
              key={key}
              draggable={canDrag}
              onDragStart={(e) => {
                // Only allow drag from background, not from text or interactive elements
                const target = e.target as HTMLElement
                if (
                  target.classList.contains('item-title') ||
                  target.classList.contains('layer2-item') ||
                  target.classList.contains('layer3-item') ||
                  target.classList.contains('layer2-title') ||
                  target.classList.contains('layer3-title') ||
                  target.classList.contains('copy-handle') ||
                  target.classList.contains('item-edit-zone') ||
                  target.tagName === 'BUTTON' ||
                  target.tagName === 'A' ||
                  target.tagName === 'INPUT' ||
                  target.tagName === 'TEXTAREA'
                ) {
                  e.preventDefault()
                  return
                }
                handleDragStart(itemPath)
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={() => handleDrop(index)}
              className={`section-wrapper ${draggedItem === itemPath ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''} ${isPending ? 'pending' : ''}`}
            >
              <Section
                key={key}
                itemKey={key}
                item={item as StructureItem}
                parentPath={path || ''}
                colorIndex={index % COLORS.length}
                onItemClick={handleItemClick}
                onEditClick={handleEditClick}
                editingPath={inlineEdit?.path || null}
                onInlineSave={handleInlineSave}
                onInlineCancel={() => setInlineEdit(null)}
                onInlineDelete={handleDelete}
                onCopyClick={handleCopyItem}
                isPending={isPending}
                isTimeView={isVirtualView}
                showContext={viewMode === 'context'}
                depth={depth}
                showRaw={depth === 0}
                rawText={depth === 0 ? serializeItem(key, item as StructureItem, 0).trimEnd() : undefined}
              />
            </div>
          )
        })}

        {displayOrder.filter(k => k !== 'time' && k !== 'progress').length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {/* Inline create editor - appears as last item in list */}
        {!isVirtualView && inlineCreate && (
          <div className="section">
            <div className="layer1-container">
              <InlineItemEditor
                itemKey=""
                item={{} as StructureItem}
                onSave={handleCreateSave}
                onCancel={() => setInlineCreate(false)}
              />
            </div>
          </div>
        )}

        {/* Time and Progress cards - always last */}
        {['time', 'progress'].map((virtualKey) => {
          const item = displayItems[virtualKey]
          if (!item) return null
          const virtualIndex = displayOrder.indexOf(virtualKey)
          return (
            <div key={virtualKey} className="section-wrapper virtual-section">
              <Section
                itemKey={virtualKey}
                item={item as StructureItem}
                parentPath={path || ''}
                colorIndex={virtualIndex >= 0 ? virtualIndex % COLORS.length : 0}
                onItemClick={handleItemClick}
                onEditClick={handleEditClick}
                editingPath={inlineEdit?.path || null}
                onInlineSave={handleInlineSave}
                onInlineCancel={() => setInlineEdit(null)}
                onInlineDelete={handleDelete}
                onCopyClick={handleCopyItem}
                isPending={false}
                isTimeView={true}
                showContext={viewMode === 'context'}
                depth={depth}
                showRaw={depth === 0}
                rawText={depth === 0 ? serializeItem(virtualKey, item as StructureItem, 0).trimEnd() : undefined}
              />
            </div>
          )
        })}
        </div>{/* end items-grid */}
      </div>

      {/* Notification */}
      {notification && (
        <Notification message={notification.message} type={notification.type} />
      )}
    </>
  )
}

export default GraphView
