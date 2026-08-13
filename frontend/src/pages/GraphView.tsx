import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStructure, useGraphs, useUpdateItem, useDeleteItem, useReorderItem, useMoveItemToParent, useCreateItem, getItemByPath } from '../hooks/useGraph'
import { useHighlights } from '../hooks/useHighlights'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useLongPress } from '../hooks/useLongPress'
import { SWIPE_THRESHOLD, SWIPE_VERTICAL_LIMIT } from '../hooks/useItemSwipe'
import { useTheme } from '../context/ThemeContext'
import { StructureItem, UpdatePayload, pasteItems, serializeItem, getItemDueDate } from '@api'
import InlineItemEditor from '../components/InlineItemEditor'
import MobileEditSheet from '../components/MobileEditSheet'
import Notification from '../components/Notification'
import Section from '../components/Section'
import ContextMenu from '../components/ContextMenu'
import { loadViewPreferences } from '../utils/viewPreferences'
import { daysUntil } from '../utils/dates'

// True on touch-primary devices (no on-screen keyboard problem on desktop,
// so only mobile needs the item-stays-in-place + bottom-sheet editing pattern —
// see MobileEditSheet and the "editInline" prop on Section)
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
}

// Color assignment based on index
const COLORS = ['sky', 'indigo', 'fuchsia']

// View depths cycled by tapping the depth button — 3 levels, 2 levels.
// Raw (0) isn't part of the cycle; long-pressing the button jumps to it directly.
const DEPTHS = [3, 2] as const

// Reorder helper for level-2/3 drags — same in-place delete+reassign trick as
// applyOptimisticReorder in useGraph.ts, but walks a local items snapshot by
// path relative to the current view instead of the full structure.
function reorderLocalItems(
  items: Record<string, StructureItem>,
  relativeParts: string[],
  targetIndex: number,
): Record<string, StructureItem> {
  const newItems = JSON.parse(JSON.stringify(items))
  const itemKey = relativeParts[relativeParts.length - 1]

  let container: Record<string, StructureItem> = newItems
  for (let i = 0; i < relativeParts.length - 1; i++) {
    const key = relativeParts[i]
    if (!container[key]) return items
    container = (container[key].children || {}) as Record<string, StructureItem>
  }

  const orderedKeys = Object.keys(container)
  const currentIndex = orderedKeys.indexOf(itemKey)
  if (currentIndex === -1) return items

  orderedKeys.splice(currentIndex, 1)
  const safeTargetIndex = Math.min(targetIndex, orderedKeys.length)
  orderedKeys.splice(safeTargetIndex, 0, itemKey)

  const reordered: Record<string, StructureItem> = {}
  for (const key of orderedKeys) reordered[key] = container[key]
  Object.keys(container).forEach(k => delete container[k])
  Object.assign(container, reordered)

  return newItems
}

// Ordered sibling keys at `parentRelativeParts` (relative to the current view),
// walking .children the same way applyEdit/handleDelete do below.
function getSiblingOrder(items: Record<string, StructureItem>, parentRelativeParts: string[]): string[] {
  let container = items
  for (const key of parentRelativeParts) {
    if (!container[key]) return []
    container = (container[key].children || {}) as Record<string, StructureItem>
  }
  return Object.keys(container)
}

// Which part of a row a drag is hovering over — the top ~35% means "reorder
// to before this item" (the original behavior), the rest means "nest as a
// child of this item" (drag-to-nest, matches dropping "on top of" an item).
function getDropZone(e: React.DragEvent): 'before' | 'nest' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const relativeY = e.clientY - rect.top
  return relativeY < rect.height * 0.35 ? 'before' : 'nest'
}

// Local-items counterpart to applyOptimisticMove in useGraph.ts — removes the
// item from its old parent's children (relative to the current view) and
// appends it as the last child of the new parent, deduping the key the same
// way moveItemToParent does server-side.
function applyLocalMove(
  items: Record<string, StructureItem>,
  itemRelativeParts: string[],
  newParentRelativeParts: string[],
): Record<string, StructureItem> {
  const newItems = JSON.parse(JSON.stringify(items))
  const itemKey = itemRelativeParts[itemRelativeParts.length - 1]

  let oldContainer: Record<string, StructureItem> = newItems
  for (let i = 0; i < itemRelativeParts.length - 1; i++) {
    const key = itemRelativeParts[i]
    if (!oldContainer[key]) return items
    oldContainer = (oldContainer[key].children || {}) as Record<string, StructureItem>
  }
  const item = oldContainer[itemKey]
  if (!item) return items
  delete oldContainer[itemKey]

  let newContainer: Record<string, StructureItem> = newItems
  for (const key of newParentRelativeParts) {
    if (!newContainer[key]) return items
    if (!newContainer[key].children) newContainer[key].children = {}
    newContainer = newContainer[key].children as Record<string, StructureItem>
  }

  let newKey = itemKey, n = 2
  while (newKey in newContainer) newKey = `${itemKey}_${n++}`
  newContainer[newKey] = item

  return newItems
}

function GraphView() {
  const location = useLocation()
  const { graphName } = useParams<{ graphName?: string }>()
  
  // Parse path from URL: /g/{graphName}/path/to/item -> path.to.item
  const getPathFromLocation = () => {
    const pathname = location.pathname
    const prefix = `/g/${graphName}`
    const remaining = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
    return remaining === '' || remaining === '/' ? '' : remaining.slice(1).replace(/\//g, '.')
  }
  
  const path = getPathFromLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const { toggleTheme } = useTheme()
  const [isMobile, setIsMobile] = useState(isTouchDevice)
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: none) and (pointer: coarse)')
    if (!mq) return
    const handler = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [depth, setDepth] = useState<0 | 2 | 3>(() => {
    try {
      const saved = localStorage.getItem('active-depth')
      if (saved !== null) {
        const parsed = Number(saved)
        if ([0, 2, 3].includes(parsed)) return parsed as 0 | 2 | 3
      }
    } catch {}
    return 3
  })
  const [viewMode, setViewMode] = useState<'default' | 'context'>(() => {
    try {
      const saved = localStorage.getItem('active-view-mode')
      if (saved === 'default' || saved === 'context') return saved
    } catch {}
    return 'context'
  })
  // Long-press on the context button — hides progress/cost/due/notes too,
  // leaving just item titles. Independent of viewMode (which only toggles notes).
  const [minimalView, setMinimalView] = useState<boolean>(() => {
    try {
      return localStorage.getItem('active-minimal-view') === 'true'
    } catch { return false }
  })
  useEffect(() => {
    localStorage.setItem('active-minimal-view', String(minimalView))
  }, [minimalView])
  // Depth button: tap cycles 3/2, long-press jumps straight to Raw (0).
  const depthLongPress = useLongPress(
    () => setDepth(0),
    () => setDepth(d => {
      const idx = (DEPTHS as readonly number[]).indexOf(d)
      return DEPTHS[(idx + 1) % DEPTHS.length]
    }),
  )
  // Context button: long-press enters minimal (titles-only) view; tap exits it if
  // active, otherwise tap toggles notes. So the same tap gesture that got a user
  // into minimal view (via a follow-up press) also gets them back out.
  const ctxLongPress = useLongPress(
    () => setMinimalView(v => !v),
    () => {
      if (minimalView) { setMinimalView(false); return }
      setViewMode(m => m === 'context' ? 'default' : 'context')
    },
  )
  const { data: structure, isLoading, error } = useStructure(graphName)
  const { data: graphs = [] } = useGraphs()
  // Bumped by AgentChat.tsx after a tool-driven edit/add, which mutates the
  // graph from outside every setLocalItems call site below (drag, inline
  // edit, etc. all patch localItems explicitly — this is the one path that
  // can't, since it happens in a sibling component). A plain query
  // invalidation refreshes `structure` but leaves the already-populated
  // localItems snapshot below untouched; watching this signal instead of
  // trying to detect "did structure change externally" keeps every existing
  // optimistic-update path (which also touches the query cache) unaffected.
  const { data: agentMutationSignal } = useQuery({
    queryKey: ['agent-mutation-signal', graphName],
    queryFn: () => 0,
    initialData: 0,
    staleTime: Infinity,
  })
  // Two-way "point at an item" channel with the agent chat — see
  // useHighlights.ts. Converted to Sets here (once per render) so every
  // row's highlightClasses() lookup in Section.tsx is O(1).
  const { userHighlights, agentHighlights, toggleUserHighlight } = useHighlights(graphName)
  const userHighlightSet = useMemo(() => new Set(userHighlights), [userHighlights])
  const agentHighlightSet = useMemo(() => new Set(agentHighlights), [agentHighlights])
  const viewPreferences = useMemo(() => loadViewPreferences(), [location.key])
  
  const updateItem = useUpdateItem(graphName)
  const deleteItemMutation = useDeleteItem(graphName)
  const reorderItem = useReorderItem(graphName)
  const moveToParent = useMoveItemToParent(graphName)
  const createItem = useCreateItem(graphName)
  
  // Persist active depth so it's consistent across menu <-> graph navigation
  useEffect(() => {
    localStorage.setItem('active-depth', String(depth))
  }, [depth])

  // Persist context toggle so it's consistent across menu <-> graph navigation
  useEffect(() => {
    localStorage.setItem('active-view-mode', viewMode)
  }, [viewMode])

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // Drag-over target for level-2/3 drags, tracked by path (unlike dragOverIndex,
  // which is a level-1-only list position) — see handleDropAtPath.
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  // Which part of the hovered row the drag is over — 'before' reorders (the
  // original behavior), 'nest' makes the dragged item a child of the hovered
  // one. Shared across all three levels; see getDropZone.
  const [dragOverZone, setDragOverZone] = useState<'before' | 'nest' | null>(null)
  
  // LOCAL order state - this is what controls the visual display
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  
  // LOCAL items state - for immediate visual updates on edits
  const [localItems, setLocalItems] = useState<Record<string, StructureItem> | null>(null)
  
  // Track items that are being synced (pending) - these show loading and can't be dragged
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set())
  
  // Inline create state - 'top' or 'bottom' determines where the editor appears and where the item lands
  const [inlineCreate, setInlineCreate] = useState<'top' | 'bottom' | false>(false)

  // Sub-item create state — the parent path whose "+" chip is currently an editor
  const [subCreate, setSubCreate] = useState<string | null>(null)

  // Inline edit state for item editing
  const [inlineEdit, setInlineEdit] = useState<{ path: string } | null>(null)

  // Right-click item menu — path + screen position of the row that was right-clicked
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number; canAddSub: boolean } | null>(null)

  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error' | 'syncing'
  } | null>(null)

  useModalBackButton(!!inlineCreate || Boolean(inlineEdit) || !!subCreate, () => {
    if (inlineEdit) { setInlineEdit(null); return }
    if (subCreate) { setSubCreate(null); return }
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
    const diffDays = daysUntil(dueDate)
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
      if (getItemDueDate(item)) result.push({ path: itemPath, item, title: item.title || key })
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
    const filtered = collectDueItems(rootItems).filter(({ item }) => getDueCategory(getItemDueDate(item)!) === category)
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
        ['done', 'Done'],
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
  
  // Reset local state when path changes (navigating to different view), or
  // when the agent has mutated this graph (see agentMutationSignal above)
  useEffect(() => {
    setLocalOrder(null)
    setLocalItems(null)
  }, [path, agentMutationSignal])

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

  // Resolves a clicked/swiped item's real path (unwrapping virtual/Overview
  // references back to where the item actually lives) — shared by
  // handleItemClick and handleNavigateInto below.
  const resolveRealPath = (itemPath: string): string => {
    const currentItems = getCurrentItems()
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
    return (targetItem?.originalPath as string | undefined) ?? itemPath
  }

  // Handle item click - navigate to the item's PARENT page, so the clicked
  // item shows up as a 1st-level item alongside its siblings (with its own
  // children/grandchildren now visible as the 2nd/3rd levels below it).
  const handleItemClick = (itemPath: string) => {
    const realPath = resolveRealPath(itemPath)
    const parentPath = realPath.split('.').slice(0, -1).join('.')
    // Push (not replace) so the hardware/OS back gesture — and the
    // background swipe-left gesture, which just calls navigate(-1) — step
    // back up through the levels actually visited, like normal browser back.
    navigate(buildPath(parentPath))
  }

  // Swipe-left-to-navigate-into-it on a level-1 row (mobile gesture — see
  // Section.tsx). Level-1 items have no "go to parent" navigation today
  // because their own parent IS the current page (handleItemClick's trick
  // would just reload the same page) — this goes straight to the item's own
  // path instead, so its children become the new level-1 list.
  const handleNavigateInto = (itemPath: string) => {
    navigate(buildPath(resolveRealPath(itemPath)))
  }

  // Swipe-right always means "go up the tree", regardless of what it starts
  // on — a row's own swipe-right (see Section.tsx) calls this same function,
  // and this background handler covers empty space, so the gesture works
  // the same everywhere rather than only off of items. Just triggers a real
  // back navigation, identical to the hardware/OS back gesture. Per-row
  // swipe handlers (useItemSwipe) call stopPropagation, so this background
  // handler only ever sees touches that started on empty space.
  const handleNavigateBack = () => navigate(-1)
  const backSwipeStart = useRef<{ x: number; y: number } | null>(null)
  const handleBackgroundTouchStart = (e: React.TouchEvent) => {
    backSwipeStart.current = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null
  }
  const handleBackgroundTouchEnd = (e: React.TouchEvent) => {
    const s = backSwipeStart.current
    backSwipeStart.current = null
    if (!s) return
    const deltaX = e.changedTouches[0].clientX - s.x
    const deltaY = Math.abs(e.changedTouches[0].clientY - s.y)
    if (deltaX > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
      handleNavigateBack()
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

  // Handle paste as a specific item's sub-items (per-item paste trigger) — the only
  // way to paste under an item that has no children yet, since navigating "into" it
  // normally requires an existing child as a stepping stone (see handleItemClick)
  const handlePasteSubItem = async (parentPath: string) => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        showNotification('Clipboard is empty', 'error')
        return
      }

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
        ...(data.cost && { cost: data.cost }),
        ...(data.checkpoints && data.checkpoints.length > 0 && { checkpoints: data.checkpoints }),
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

  // Handle right-click on an item row — open the Delete/New/Paste menu at the cursor
  const handleItemContextMenu = (e: React.MouseEvent, itemPath: string, canAddSub: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ path: itemPath, x: e.clientX, y: e.clientY, canAddSub })
  }

  // Handle "+" chip click — open the sub-create editor under this parent
  const handleSubCreateStart = (parentPath: string) => {
    setInlineEdit(null)
    setInlineCreate(false)
    setSubCreate(parentPath)
  }

  // Handle save from a "+" chip editor — creates a child under parentPath
  const handleSubCreateSave = (parentPath: string, data: UpdatePayload) => {
    setSubCreate(null)
    if (!data.name) return

    const normalizedName = data.name.toLowerCase().replace(/ /g, '_')
    const newItem: StructureItem = {
      title: data.name,
      ...(data.progress && { progress: data.progress }),
      ...(data.context && { context: data.context }),
      ...(data.cost && { cost: data.cost }),
      ...(data.checkpoints && data.checkpoints.length > 0 && { checkpoints: data.checkpoints }),
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
        if (data.cost !== undefined) {
          if (data.cost === null) {
            delete updatedItem.cost
          } else {
            updatedItem.cost = data.cost
          }
        }
        if (data.checkpoints !== undefined) {
          if (data.checkpoints.length === 0) {
            delete updatedItem.checkpoints
          } else {
            updatedItem.checkpoints = data.checkpoints
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
    setDragOverZone(getDropZone(e))
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverIndex(null)
    setDragOverPath(null)
    setDragOverZone(null)
  }

  // Shared "nest as a child of the drop target" handler for all three levels
  // — unlike reordering, this allows moving across different parents (that's
  // the whole point of drag-to-nest). Guards against nesting an item into
  // itself or one of its own descendants, mirroring moveItemToParent's check.
  const handleNestDrop = async (itemPath: string, newParentPath: string) => {
    if (itemPath === newParentPath || newParentPath.startsWith(`${itemPath}.`)) return

    // IMMEDIATELY update local state for instant visual feedback. Both ends
    // are always within the current view's displayed subtree (they're both
    // on screen at once), so this should always apply — the prefix check is
    // just a defensive fallback.
    const prefix = path ? `${path}.` : ''
    if (localItems && itemPath.startsWith(prefix) && newParentPath.startsWith(prefix)) {
      const itemRelative = itemPath.slice(prefix.length).split('.')
      const parentRelative = newParentPath.slice(prefix.length).split('.')
      setLocalItems(prev => prev ? applyLocalMove(prev, itemRelative, parentRelative) : prev)
      if (itemRelative.length === 1) {
        setLocalOrder(prev => prev ? prev.filter(k => k !== itemRelative[0]) : prev)
      }
    }

    try {
      await moveToParent.mutateAsync({ path: itemPath, newParentPath })
      showNotification('Moved!')
    } catch (err: any) {
      setLocalItems(rawItems)
      setLocalOrder(serverKeys)
      const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to move'
      showNotification(msg.substring(0, 60), 'error')
    }
  }

  const handleDrop = async (targetIndex: number) => {
    if (!draggedItem) return

    const itemToReorder = draggedItem
    const draggedKey = itemToReorder.split('.').pop()!
    const zone = dragOverZone

    setDraggedItem(null)
    setDragOverIndex(null)
    setDragOverZone(null)

    if (zone === 'nest') {
      const targetKey = displayOrder[targetIndex]
      if (!targetKey || targetKey === 'overview') return
      const targetPath = path ? `${path}.${targetKey}` : targetKey
      await handleNestDrop(itemToReorder, targetPath)
      return
    }

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

  // Drop handler for level-2/3 items. 'before' zone: reorders among siblings
  // only (same parent as the dragged item) — a drop over a different
  // parent's list is a no-op rather than reparenting. 'nest' zone: hands off
  // to handleNestDrop, which allows crossing into a different parent since
  // that's the point of drag-to-nest. Level-1 keeps using handleDrop above.
  const handleDropAtPath = async (targetPath: string, zone: 'before' | 'nest') => {
    if (!draggedItem) return
    const itemToReorder = draggedItem
    setDraggedItem(null)
    setDragOverPath(null)
    setDragOverZone(null)

    if (zone === 'nest') {
      await handleNestDrop(itemToReorder, targetPath)
      return
    }

    const prefix = path ? `${path}.` : ''
    if (!itemToReorder.startsWith(prefix) || !targetPath.startsWith(prefix)) return

    const draggedRelative = itemToReorder.slice(prefix.length).split('.')
    const targetRelative = targetPath.slice(prefix.length).split('.')
    const draggedKey = draggedRelative[draggedRelative.length - 1]
    const targetKey = targetRelative[targetRelative.length - 1]
    const parentRelative = draggedRelative.slice(0, -1)
    if (targetRelative.slice(0, -1).join('.') !== parentRelative.join('.')) return

    const siblingKeys = getSiblingOrder(displayItems, parentRelative)
    const currentIndex = siblingKeys.indexOf(draggedKey)
    const targetIndex = siblingKeys.indexOf(targetKey)
    if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) return

    // IMMEDIATELY update local state for instant visual feedback
    setLocalItems(prev => prev ? reorderLocalItems(prev, draggedRelative, targetIndex) : prev)

    // Then sync to server in background
    try {
      await reorderItem.mutateAsync({ path: itemToReorder, targetIndex })
      showNotification('Reordered!')
    } catch (err: any) {
      // Rollback on error - reset to server order
      setLocalItems(rawItems)
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

  const handleCopyItem = async (itemKey: string, item: StructureItem) => {
    try {
      const text = serializeItem(itemKey, item, 1)
      await navigator.clipboard.writeText(text.trimEnd())
    } catch (err) {
      showNotification('Failed to copy', 'error')
    }
  }

  // Mobile-only: whichever of edit / sub-create / top-level-create is active,
  // resolved into the props MobileEditSheet needs. The corresponding item (or
  // its parent, for sub-create) gets a border highlight in the list instead —
  // see Section.tsx's "editInline" prop and the ".item-editing" CSS class.
  const mobileSheet = (() => {
    if (!isMobile) return null
    if (inlineEdit) {
      const item = getItemByPath(structure, inlineEdit.path)
      if (!item) return null
      return {
        itemKey: inlineEdit.path.split('.').pop() ?? '',
        item,
        onSave: (data: UpdatePayload) => handleInlineSave(inlineEdit.path, data),
        onCancel: () => setInlineEdit(null),
        onDelete: () => handleDelete(inlineEdit.path),
      }
    }
    if (subCreate) {
      const parentItem = getItemByPath(structure, subCreate)
      return {
        itemKey: '',
        item: {} as StructureItem,
        defaultName: 'new item',
        parentLabel: parentItem?.title || subCreate,
        onSave: (data: UpdatePayload) => handleSubCreateSave(subCreate, data),
        onCancel: () => setSubCreate(null),
      }
    }
    if (inlineCreate) {
      return {
        itemKey: '',
        item: {} as StructureItem,
        onSave: handleCreateSave,
        onCancel: () => setInlineCreate(false),
      }
    }
    return null
  })()

  return (
    <>
      {!inlineEdit && !inlineCreate && !subCreate && (
        <div className="top-buttons">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" />
          <button
            className={`depth-toggle active${depth === 0 ? ' raw' : ''}`}
            {...depthLongPress}
            title={depth === 0 ? 'Raw view — tap to return, long-press elsewhere for Raw' : `Showing ${depth} levels — tap to cycle, long-press for Raw`}
          >{depth === 0 ? 'R' : depth}</button>
          <button
            className={`ctx-toggle${viewMode === 'context' ? ' active' : ''}${minimalView ? ' minimal' : ''}`}
            {...ctxLongPress}
            title={minimalView
              ? 'Minimal view — tap to return to normal'
              : `${viewMode === 'context' ? 'Context on' : 'Context off'} — tap to toggle, long-press for minimal view`}
          >C</button>
        </div>
      )}

      {/* Breadcrumb — fixed below bottom buttons */}
      {!inlineEdit && !inlineCreate && !subCreate && (
        <nav className="breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.path}>
              {i > 0 && ' / '}
              {i === breadcrumb.length - 1 ? (
                <span>{crumb.label}</span>
              ) : (
                <Link to={crumb.path}>{crumb.label}</Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <div
        className="graph-container"
        onTouchStart={handleBackgroundTouchStart}
        onTouchEnd={handleBackgroundTouchEnd}
      >
        {/* Items grid — CSS columns for tight packing with no gaps. Locked
            while the mobile sheet is open so a tap/swipe on a background row
            can't land at the same time as a tap inside the sheet — without
            this, tapping a different row while editing could both commit the
            current edit and immediately trigger that row's own action. */}
        <div className={`items-grid${isMobile && mobileSheet ? ' items-grid-locked' : ''}`}>
        {/* New + Paste — top card (creates/pastes at the top of the list) */}
        {!isVirtualView && (
          <div className="section-wrapper new-paste-wrapper">
            <div className="section">
              <div className="layer1 add-item" onClick={() => handleAddClick('top')} title="Add new item at top">
                <span className="item-title">+ New</span>
              </div>
              <div className="layer1 add-item" onClick={() => handlePasteItem('top')} title="Paste from clipboard at top">
                <span className="item-title">Paste</span>
              </div>
            </div>
          </div>
        )}
        {/* Inline create editor — top position */}
        {!isVirtualView && inlineCreate === 'top' && !isMobile && (
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
          const canDrag = !isPending && !isVirtualView && !inlineEdit && !subCreate
          
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
              className={`section-wrapper ${draggedItem === itemPath ? 'dragging' : ''} ${dragOverIndex === index && dragOverZone === 'nest' ? 'drag-over-nest' : ''} ${dragOverIndex === index && dragOverZone !== 'nest' ? 'drag-over' : ''} ${isPending ? 'pending' : ''}`}
            >
              <Section
                key={key}
                itemKey={key}
                item={item as StructureItem}
                parentPath={path || ''}
                colorIndex={index % COLORS.length}
                onItemClick={handleItemClick}
                onNavigateInto={handleNavigateInto}
                onNavigateBack={handleNavigateBack}
                onEditClick={handleEditClick}
                editingPath={inlineEdit?.path || null}
                editInline={!isMobile}
                onInlineSave={handleInlineSave}
                onInlineCancel={() => setInlineEdit(null)}
                onInlineDelete={handleDelete}
                onCopyClick={handleCopyItem}
                creatingPath={subCreate}
                onSubCreateStart={handleSubCreateStart}
                onSubCreateSave={handleSubCreateSave}
                onSubCreateCancel={() => setSubCreate(null)}
                onContextMenu={handleItemContextMenu}
                onToggleHighlight={toggleUserHighlight}
                userHighlights={userHighlightSet}
                agentHighlights={agentHighlightSet}
                isPending={isPending}
                draggedPath={draggedItem}
                dragOverPath={dragOverPath}
                dragOverZone={dragOverZone}
                onItemDragStart={handleDragStart}
                onItemDragOver={(p, z) => { setDragOverPath(p); setDragOverZone(z) }}
                onItemDragEnd={handleDragEnd}
                onItemDrop={handleDropAtPath}
                dragEnabled={!isVirtualView && !inlineEdit && !subCreate}
                pendingPaths={pendingItems}
                isTimeView={isVirtualView}
                showContext={viewMode === 'context' && !minimalView}
                minimal={minimalView}
                depth={depth}
                showRaw={depth === 0}
                rawText={depth === 0 ? serializeItem(key, item as StructureItem, 1).trimEnd() : undefined}
              />
            </div>
          )
        })}

        {displayOrder.filter(k => k !== 'overview').length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {/* Inline create editor — bottom position */}
        {!isVirtualView && inlineCreate === 'bottom' && !isMobile && (
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
              <div className="layer1 add-item" onClick={() => handleAddClick('bottom')} title="Add new item at bottom">
                <span className="item-title">+ New</span>
              </div>
              <div className="layer1 add-item" onClick={() => handlePasteItem('bottom')} title="Paste from clipboard at bottom">
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
              editInline={!isMobile}
              onInlineSave={handleInlineSave}
              onInlineCancel={() => setInlineEdit(null)}
              onInlineDelete={handleDelete}
              onCopyClick={handleCopyItem}
              onToggleHighlight={toggleUserHighlight}
              userHighlights={userHighlightSet}
              agentHighlights={agentHighlightSet}
              isPending={false}
              isTimeView={true}
              showContext={viewMode === 'context' && !minimalView}
              minimal={minimalView}
              depth={depth}
              showRaw={depth === 0}
              rawText={depth === 0 ? serializeItem('overview', displayItems['overview'] as StructureItem, 1).trimEnd() : undefined}
            />
          </div>
        )}
        </div>{/* end items-grid */}
      </div>

      {/* Notification */}
      {notification && (
        <Notification message={notification.message} type={notification.type} />
      )}

      {/* Right-click item menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Edit', onClick: () => setInlineEdit({ path: contextMenu.path }) },
            ...(contextMenu.canAddSub ? [{ label: 'New', onClick: () => handleSubCreateStart(contextMenu.path) }] : []),
            ...(contextMenu.canAddSub ? [{ label: 'Paste', onClick: () => handlePasteSubItem(contextMenu.path) }] : []),
            { label: 'Delete', onClick: () => handleDelete(contextMenu.path), danger: true },
          ]}
        />
      )}

      {/* Mobile edit/create sheet — see the mobileSheet derivation above */}
      {mobileSheet && <MobileEditSheet {...mobileSheet} />}
    </>
  )
}

export default GraphView
