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
  const [enabledDepths, setEnabledDepths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('enabled-depths')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [3, 2, 1, 0]
  })
  const [depth, setDepth] = useState<0 | 1 | 2 | 3>(() => {
    try {
      const saved = localStorage.getItem('active-depth')
      if (saved !== null) {
        const parsed = Number(saved)
        if ([0, 1, 2, 3].includes(parsed) && enabledDepths.includes(parsed)) return parsed as 0 | 1 | 2 | 3
      }
    } catch {}
    return (enabledDepths[0] ?? 3) as 0 | 1 | 2 | 3
  })
  const [showDepthPicker, setShowDepthPicker] = useState(false)
  const depthPickerRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPress = useRef(false)
  const [viewMode, setViewMode] = useState<'default' | 'context'>(() => {
    try {
      const saved = localStorage.getItem('active-view-mode')
      if (saved === 'default' || saved === 'context') return saved
    } catch {}
    return 'context'
  })
  const { data: structure, isLoading, error } = useStructure(graphName)
  const { data: graphs = [] } = useGraphs()
  const viewPreferences = useMemo(() => loadViewPreferences(), [location.key])
  
  const updateItem = useUpdateItem(graphName)
  const deleteItemMutation = useDeleteItem(graphName)
  const reorderItem = useReorderItem(graphName)
  const createItem = useCreateItem(graphName)
  
  const containerRef = useRef<HTMLDivElement>(null)

  // Persist enabled depths
  useEffect(() => {
    localStorage.setItem('enabled-depths', JSON.stringify(enabledDepths))
  }, [enabledDepths])

  // Persist active depth so it's consistent across menu <-> graph navigation
  useEffect(() => {
    localStorage.setItem('active-depth', String(depth))
  }, [depth])

  // Persist context toggle so it's consistent across menu <-> graph navigation
  useEffect(() => {
    localStorage.setItem('active-view-mode', viewMode)
  }, [viewMode])

  // Close depth picker on outside click
  useEffect(() => {
    if (!showDepthPicker) return
    const handleOutside = (e: PointerEvent) => {
      if (depthPickerRef.current && !depthPickerRef.current.contains(e.target as Node)) {
        setShowDepthPicker(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [showDepthPicker])

  const cycleDepth = () => {
    const sorted = [...enabledDepths].sort((a, b) => b - a) as (0 | 1 | 2 | 3)[]
    const idx = sorted.indexOf(depth)
    setDepth(sorted[idx === -1 ? 0 : (idx + 1) % sorted.length])
  }

  const toggleEnabledDepth = (d: number) => {
    if (enabledDepths.includes(d) && enabledDepths.length === 1) return
    const next = enabledDepths.includes(d)
      ? enabledDepths.filter(x => x !== d)
      : [...enabledDepths, d]
    setEnabledDepths(next)
    if (!next.includes(depth)) {
      const sorted = [...next].sort((a, b) => b - a) as (0 | 1 | 2 | 3)[]
      setDepth(sorted[0])
    }
  }

  const handleDepthPointerDown = () => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      setShowDepthPicker(true)
    }, 500)
  }

  const handleDepthPointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (!isLongPress.current) cycleDepth()
    isLongPress.current = false
  }

  const handleDepthPointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    isLongPress.current = false
  }

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
  // LOCAL order state - this is what controls the visual display
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  
  // LOCAL items state - for immediate visual updates on edits
  const [localItems, setLocalItems] = useState<Record<string, StructureItem> | null>(null)
  
  // Track items that are being synced (pending) - these show loading and can't be dragged
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set())
  
  // Inline create state - 'top' or 'bottom' determines where the editor appears and where the item lands
  const [inlineCreate, setInlineCreate] = useState<'top' | 'bottom' | false>(false)

  // Inline edit state for item editing
  const [inlineEdit, setInlineEdit] = useState<{ path: string } | null>(null)
  
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error' | 'syncing'
  } | null>(null)

  useModalBackButton(!!inlineCreate || Boolean(inlineEdit), () => {
    if (inlineEdit) { setInlineEdit(null); return }
    setInlineCreate(false)
  })

  // Show notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'syncing' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Parse "X/Y" into {done, total, pct} — pct capped at 100 for bar width
  const parseProgressValue = (p: string | undefined): { done: number; total: number; pct: number } | null => {
    if (p === undefined || p === null) return null
    const m = String(p).match(/^(\d+)\/(\d+)$/)
    if (!m) return null
    const done = Number(m[1]), total = Number(m[2])
    return { done, total, pct: total > 0 ? Math.min((done / total) * 100, 100) : 0 }
  }

  // Due-date bucket
  const getDueCategory = (dueDate: string): 'over' | 'day' | 'week' | 'month' | null => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'over'
    if (diffDays === 0) return 'day'
    if (diffDays <= 7) return 'week'
    if (diffDays <= 30) return 'month'
    return null
  }

  // Progress bucket — 3 states
  const getProgressCategory = (progress: string): 'not_started' | 'in_progress' | 'done' | null => {
    const info = parseProgressValue(progress)
    if (!info) return null
    if (info.done <= 0) return 'not_started'
    if (info.done >= info.total) return 'done'
    return 'in_progress'
  }

  // Recursively collect items with due dates
  const collectDueItems = (items: Record<string, StructureItem>, parentPath = ''): Array<{path: string, item: StructureItem, title: string}> => {
    const result: Array<{path: string, item: StructureItem, title: string}> = []
    for (const [key, item] of Object.entries(items)) {
      const itemPath = parentPath ? `${parentPath}.${key}` : key
      if (item.due) result.push({ path: itemPath, item, title: item.title || key })
      if (item.children) result.push(...collectDueItems(item.children, itemPath))
    }
    return result
  }

  // Recursively collect items with progress values
  const collectProgressItems = (items: Record<string, StructureItem>, parentPath = ''): Array<{path: string, item: StructureItem, title: string}> => {
    const result: Array<{path: string, item: StructureItem, title: string}> = []
    for (const [key, item] of Object.entries(items)) {
      const itemPath = parentPath ? `${parentPath}.${key}` : key
      if (item.progress !== undefined && item.progress !== null) result.push({ path: itemPath, item, title: item.title || key })
      if (item.children) result.push(...collectProgressItems(item.children, itemPath))
    }
    return result
  }

  // Subtree to scan — scoped to the current page path
  const getScanRoot = (scopePath: string): Record<string, StructureItem> => {
    if (!structure?.structure) return {}
    if (!scopePath) {
      const r = { ...structure.structure }
      delete r.overview
      return r
    }
    const item = getItemByPath(structure, scopePath)
    return item?.children ? { ...item.children } : {}
  }

  // Virtual items for a time category with absolute paths
  const getTimeChildrenFromRoot = (
    category: 'over' | 'day' | 'week' | 'month',
    rootItems: Record<string, StructureItem>,
    contextPrefix: string
  ): Record<string, StructureItem> => {
    const filtered = collectDueItems(rootItems).filter(({ item }) => item.due && getDueCategory(item.due) === category)
    const result: Record<string, StructureItem> = {}
    for (const { path: relPath, item, title } of filtered) {
      const key = relPath.replace(/\./g, '_')
      const fullPath = contextPrefix ? `${contextPrefix}.${relPath}` : relPath
      const parentLabel = fullPath.split('.').slice(0, -1)
        .map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' › ')
      result[key] = {
        ...item, title,
        context: viewMode === 'context' && parentLabel ? `📍 ${parentLabel}` : undefined,
        originalPath: fullPath, nonEditable: true, children: undefined,
      }
    }
    return result
  }

  // Virtual items for a progress category with absolute paths
  const getProgressChildrenFromRoot = (
    category: 'not_started' | 'in_progress' | 'done',
    rootItems: Record<string, StructureItem>,
    contextPrefix: string
  ): Record<string, StructureItem> => {
    const filtered = collectProgressItems(rootItems).filter(({ item }) =>
      item.progress !== undefined && item.progress !== null &&
      getProgressCategory(item.progress as string) === category
    )
    const result: Record<string, StructureItem> = {}
    for (const { path: relPath, item, title } of filtered) {
      const key = relPath.replace(/\./g, '_')
      const fullPath = contextPrefix ? `${contextPrefix}.${relPath}` : relPath
      const parentLabel = fullPath.split('.').slice(0, -1)
        .map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' › ')
      result[key] = {
        ...item, title,
        context: viewMode === 'context' && parentLabel ? `📍 ${parentLabel}` : undefined,
        originalPath: fullPath, nonEditable: true, children: undefined,
      }
    }
    return result
  }

  // Merged Overview section scoped to a path
  const buildOverviewSection = (scopePath: string): StructureItem | null => {
    if (!structure?.structure) return null
    const rootItems = getScanRoot(scopePath)
    const children: Record<string, StructureItem> = {}

    if (viewPreferences.showTime) {
      const timeCategories: Array<['over' | 'day' | 'week' | 'month', string]> = [
        ['over', 'Overdue'], ['day', 'Today'], ['week', 'This Week'], ['month', 'This Month'],
      ]
      for (const [cat, label] of timeCategories) {
        const items = getTimeChildrenFromRoot(cat, rootItems, scopePath)
        const count = Object.keys(items).length
        if (count > 0) children[cat] = { title: `${label} (${count})`, nonEditable: true, children: items }
      }
    }

    if (viewPreferences.showProgress) {
      const progressCategories: Array<['not_started' | 'in_progress' | 'done', string]> = [
        ['not_started', 'Not Started'], ['in_progress', 'In Progress'], ['done', 'Done'],
      ]
      for (const [cat, label] of progressCategories) {
        const items = getProgressChildrenFromRoot(cat, rootItems, scopePath)
        const count = Object.keys(items).length
        if (count > 0) children[cat] = { title: `${label} (${count})`, nonEditable: true, children: items }
      }
    }

    if (Object.keys(children).length === 0) return null
    return { title: 'Overview', nonEditable: true, children }
  }

  // Get current level items
  const getCurrentItems = () => {
    if (!structure?.structure) return {}

    const pathParts = path ? path.split('.') : []
    const overviewIdx = pathParts.indexOf('overview')

    // Virtual overview path at any depth: "overview", "career.overview", "overview.day", etc.
    if (overviewIdx >= 0) {
      const scopePath = pathParts.slice(0, overviewIdx).join('.')
      const categoryParts = pathParts.slice(overviewIdx + 1)
      const rootItems = getScanRoot(scopePath)

      if (categoryParts.length === 0) {
        return buildOverviewSection(scopePath)?.children ?? {}
      }
      if (categoryParts.length === 1) {
        const cat = categoryParts[0]
        if (['over', 'day', 'week', 'month'].includes(cat))
          return getTimeChildrenFromRoot(cat as 'over' | 'day' | 'week' | 'month', rootItems, scopePath)
        if (['not_started', 'in_progress', 'done'].includes(cat))
          return getProgressChildrenFromRoot(cat as 'not_started' | 'in_progress' | 'done', rootItems, scopePath)
      }
      return {}
    }

    // Regular path — build base items then append overview
    let baseItems: Record<string, StructureItem>
    if (!path) {
      baseItems = { ...structure.structure }
      delete baseItems.overview
    } else {
      const item = getItemByPath(structure, path)
      baseItems = { ...(item?.children || {}) }
    }

    const overviewSection = buildOverviewSection(path || '')
    if (overviewSection) baseItems.overview = overviewSection
    return baseItems
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

  // Per-bubble width rule: once a bubble is wide enough to show L1 beside a
  // row of L2 blocks (each with its own row of L3 items), switch it to that
  // layout via .section-wrapper--wide; narrower bubbles stay fully stacked.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const REM = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const WIDE_PX = 28 * REM

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        const el = entry.target as HTMLElement
        el.classList.toggle('section-wrapper--wide', w >= WIDE_PX)
      }
    })

    container.querySelectorAll('.section-wrapper').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [structure])
  
  // The display items: always overlay the virtual overview from rawItems so it stays reactive
  const displayItems = useMemo(() => {
    if (localItems) {
      const merged = { ...localItems }
      delete merged.overview
      if (rawItems.overview) merged.overview = rawItems.overview
      return merged
    }
    return rawItems
  }, [localItems, rawItems])

  // The display order: real items first (stable), overview always last
  const displayOrder = useMemo(() => {
    const order = localOrder || serverKeys
    if (localItems) {
      const result = order.filter(k => k !== 'overview')
      if (rawItems.overview) result.push('overview')
      return result
    }
    return order
  }, [localOrder, serverKeys, localItems, rawItems])

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
  const handleAddClick = (position: 'top' | 'bottom') => {
    setInlineCreate(position)
  }

  // Handle paste item from clipboard
  const handlePasteItem = async (position: 'top' | 'bottom') => {
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
        if (position === 'top' && result.added.length > 0) {
          // Read fresh items from cache and put newly pasted ones at the front
          const fresh = queryClient.getQueryData<{ structure: Record<string, StructureItem> }>(['structure', graphName])
          let freshItems: Record<string, StructureItem> = fresh?.structure || {}
          if (path) {
            for (const part of path.split('.')) {
              freshItems = ((freshItems[part] as StructureItem)?.children || {}) as Record<string, StructureItem>
            }
          }
          const addedKeys = result.added.filter((k: string) => k in freshItems)
          const restKeys = Object.keys(freshItems).filter(k => !result.added.includes(k))
          setLocalItems(freshItems)
          setLocalOrder([...addedKeys, ...restKeys])
        } else {
          setLocalOrder(null)
          setLocalItems(null)
        }
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
    const createPosition = inlineCreate  // capture before clearing
    setInlineCreate(false)

    const itemPath = path || ''

    if (data.name) {
      // Normalize name the same way the server does
      const normalizedName = data.name.toLowerCase().replace(/ /g, '_')

      const newItem: StructureItem = {
        title: data.name,
        ...(data.progress && { progress: data.progress }),
        ...(data.context && { context: data.context }),
        ...(data.due && { due: data.due }),
      }

      // Use callback pattern to avoid stale closure
      setLocalItems(prev => prev ? { ...prev, [normalizedName]: newItem } : { [normalizedName]: newItem })
      setLocalOrder(prev => prev
        ? (createPosition === 'top' ? [normalizedName, ...prev] : [...prev, normalizedName])
        : [normalizedName]
      )

      // Mark as pending with normalized path
      const newItemPath = itemPath ? `${itemPath}.${normalizedName}` : normalizedName
      setPendingItems(prev => new Set(prev).add(newItemPath))

      // Then sync to server in background
      createItem.mutate(
        { parentPath: itemPath, data },
        {
          onSuccess: async () => {
            if (createPosition === 'top') {
              // Server appends by default; reorder it to the front to persist the position
              try { await reorderItem.mutateAsync({ path: newItemPath, targetIndex: 0 }) } catch { /* silent */ }
            }
            showNotification('Created!')
          },
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
            updatedItem.progress = data.progress
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
  const isVirtualView = !!(path && path.split('.').includes('overview'))

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
    } catch (err) {
      showNotification('Failed to copy', 'error')
    }
  }

  return (
    <>
      {!inlineEdit && !inlineCreate && (
        <div className="top-buttons">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" />
          <div ref={depthPickerRef} className={`depth-wrapper${showDepthPicker ? ' depth-wrapper--open' : ''}`}>
            {showDepthPicker ? (
              <div className="depth-picker">
                {([3, 2, 1, 0] as const).map(d => (
                  <button
                    key={d}
                    className={`depth-toggle depth-picker-btn${enabledDepths.includes(d) ? ' enabled' : ''}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => toggleEnabledDepth(d)}
                  >{d}</button>
                ))}
              </div>
            ) : (
              <button
                className="depth-toggle"
                onPointerDown={handleDepthPointerDown}
                onPointerUp={handleDepthPointerUp}
                onPointerCancel={handleDepthPointerCancel}
                title={depth === 3 ? 'Showing 3 levels — hold to configure' : depth === 2 ? 'Showing 2 levels — hold to configure' : depth === 1 ? 'Showing 1 level — hold to configure' : 'Raw view — hold to configure'}
              >{depth}</button>
            )}
          </div>
          <button
            className={`ctx-toggle${viewMode === 'context' ? ' active' : ''}`}
            onClick={() => setViewMode(m => m === 'context' ? 'default' : 'context')}
            title={viewMode === 'context' ? 'Context on — tap to hide' : 'Context off — tap to show'}
          >C</button>
        </div>
      )}

      {/* Breadcrumb — fixed below bottom buttons */}
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
        {/* New + Paste — top card (creates/pastes at the top of the list) */}
        {!isVirtualView && (
          <div className="section-wrapper new-paste-wrapper">
            <div className="section">
              <div className="layer1 color-slate" onClick={() => handleAddClick('top')} title="Add new item at top">
                <span className="item-title">+ New</span>
              </div>
              <div className="layer1 color-slate" onClick={() => handlePasteItem('top')} title="Paste from clipboard at top">
                <span className="item-title">Paste</span>
              </div>
            </div>
          </div>
        )}
        {/* Inline create editor — top position */}
        {!isVirtualView && inlineCreate === 'top' && (
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
        {/* Sections - rendered in local order for instant drag feedback */}
        {displayOrder.filter(k => k !== 'overview').map((key, index) => {
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

        {displayOrder.filter(k => k !== 'overview').length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {/* Inline create editor — bottom position */}
        {!isVirtualView && inlineCreate === 'bottom' && (
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

        {/* New + Paste — bottom card (creates/pastes at the bottom of the list) */}
        {!isVirtualView && (
          <div className="section-wrapper new-paste-wrapper">
            <div className="section">
              <div className="layer1 color-slate" onClick={() => handleAddClick('bottom')} title="Add new item at bottom">
                <span className="item-title">+ New</span>
              </div>
              <div className="layer1 color-slate" onClick={() => handlePasteItem('bottom')} title="Paste from clipboard at bottom">
                <span className="item-title">Paste</span>
              </div>
            </div>
          </div>
        )}

        {/* Overview card — always last */}
        {displayItems['overview'] && (
          <div key="overview" className="section-wrapper virtual-section">
            <Section
              itemKey="overview"
              item={displayItems['overview'] as StructureItem}
              parentPath={path || ''}
              colorIndex={displayOrder.indexOf('overview') % COLORS.length}
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
              rawText={depth === 0 ? serializeItem('overview', displayItems['overview'] as StructureItem, 0).trimEnd() : undefined}
            />
          </div>
        )}
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
