import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType, Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStructure, useGraphs, useUpdateItem, useDeleteItem, useReorderItem, useMoveItemToParent, useCreateItem, getItemByPath } from '../hooks/useGraph'
import { useHighlights } from '../hooks/useHighlights'
import { useViewOptions } from '../hooks/useViewOptions'
import { useCircularScroll, LOOP_SPACER_PX } from '../hooks/useCircularScroll'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { SWIPE_THRESHOLD, SWIPE_VERTICAL_LIMIT } from '../hooks/useItemSwipe'
import { StructureItem, Structure, UpdatePayload, pasteItems, serializeItem, serializeStructure, deleteItem } from '@api'
import MobileEditSheet from '../components/MobileEditSheet'
import Notification from '../components/Notification'
import Section from '../components/Section'
import ContextMenu from '../components/ContextMenu'
import GraphMinimap from '../components/GraphMinimap'

// True on touch-primary devices (no on-screen keyboard problem on desktop,
// so only mobile needs the item-stays-in-place + bottom-sheet editing pattern —
// see MobileEditSheet and the "editInline" prop on Section)
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
}

// Color assignment based on index
const COLORS = ['sky', 'indigo', 'fuchsia']

// Wired into the two circular-loop boundary clones in place of every real
// interactive callback (not just left as pointer-events:none + inert state
// props) — defense in depth, so a clone can't trigger a real side effect
// (opening an editor, starting a drag, navigating) even if some future code
// path or automation dispatches an event straight at it, bypassing the CSS
// hit-testing block a real user gesture would be subject to.
const noop = () => {}

// Reserve, in px, subtracted from the viewport height to get the circular
// scroll container's height budget — mirrors `.circular-scroll-container
// .circular`'s max-height calc in App.css (just the agent bar's own
// height, nothing extra — the breadcrumb is allowed to overlap the list's
// last bit of content, since it has its own background). Looping itself is
// always on once a list has 2+ items (see useCircularScroll.ts) — this
// budget only bounds how tall the container is allowed to render and how
// big the clone groups need to grow to keep scrolling seamless at that
// height. Uses the mobile --agent-bar-height (58px); being off by the
// desktop bump doesn't materially matter here since it only feeds that
// clone-sizing math, not the actual rendered max-height (pure CSS, and
// responsive to the real var).
const CIRCULAR_SCROLL_CHROME_RESERVE_PX = 58

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

// Given a set of absolute dot-paths, returns the subset that have no OTHER
// selected path as an ancestor — the "top" of each selected branch. Deleting
// just these (and nothing else) removes every selected path, since any
// non-root selected path is already inside one of these subtrees.
function selectionRoots(paths: string[]): string[] {
  const set = new Set(paths)
  return paths.filter(p => {
    const parts = p.split('.')
    for (let i = parts.length - 1; i >= 1; i--) {
      if (set.has(parts.slice(0, i).join('.'))) return false
    }
    return true
  })
}

// Rebuilds only the selected items into a forest for copying — each one
// nested under its nearest SELECTED ancestor (skipping any unselected items
// in between, so a selected grandchild under an unselected child re-roots
// directly under its selected grandparent), with unselected children left
// out entirely. "Preserve parenthood [between selected items] if possible."
function buildSelectionForest(structure: Structure, selectedPaths: string[]): Record<string, StructureItem> {
  const set = new Set(selectedPaths)
  const childrenOf = new Map<string | null, string[]>()
  for (const p of selectedPaths) {
    const parts = p.split('.')
    let parent: string | null = null
    for (let i = parts.length - 1; i >= 1; i--) {
      const candidate = parts.slice(0, i).join('.')
      if (set.has(candidate)) { parent = candidate; break }
    }
    if (!childrenOf.has(parent)) childrenOf.set(parent, [])
    childrenOf.get(parent)!.push(p)
  }
  function buildNode(p: string): StructureItem | null {
    const item = getItemByPath(structure, p)
    if (!item) return null
    const node: StructureItem = { ...item, children: {} }
    for (const childPath of childrenOf.get(p) || []) {
      const built = buildNode(childPath)
      if (built) node.children![childPath.split('.').pop()!] = built
    }
    return node
  }
  const forest: Record<string, StructureItem> = {}
  for (const rootPath of childrenOf.get(null) || []) {
    const built = buildNode(rootPath)
    if (built) forest[rootPath.split('.').pop()!] = built
  }
  return forest
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

  const [isMobile, setIsMobile] = useState(isTouchDevice)
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: none) and (pointer: coarse)')
    if (!mq) return
    const handler = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  // Tracked reactively (not read inline at render time) so rotating a device
  // or resizing the window updates the circular-scroll height budget below.
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  useEffect(() => {
    const handler = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  // Depth / note-view state and its buttons now live in AgentChat.tsx's
  // unified compose bar (see useViewOptions.ts) — GraphView still owns what
  // these values DRIVE (Section props, context-injection closures below),
  // just no longer the buttons or the persistence effects.
  const { depth, viewMode, minimalView } = useViewOptions()
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
  const { userHighlights, agentHighlights, toggleUserHighlight, clearUserHighlights } = useHighlights(graphName)
  const userHighlightSet = useMemo(() => new Set(userHighlights), [userHighlights])
  const agentHighlightSet = useMemo(() => new Set(agentHighlights), [agentHighlights])

  // The literal hardware/browser back button (a real history POP) is a
  // separate code path from handleNavigateBack below, which clears
  // highlights itself but navigates via PUSH (an explicit target path, not
  // browser-history back — see its own comment for why). Covers it here so
  // highlighting stays temporary regardless of which "back" the user uses.
  const navigationType = useNavigationType()
  useEffect(() => {
    if (navigationType === 'POP') clearUserHighlights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, navigationType])

  const updateItem = useUpdateItem(graphName)
  const deleteItemMutation = useDeleteItem(graphName)
  const reorderItem = useReorderItem(graphName)
  const moveToParent = useMoveItemToParent(graphName)
  const createItem = useCreateItem(graphName)

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

  useModalBackButton(Boolean(inlineEdit) || !!subCreate, () => {
    if (inlineEdit) { setInlineEdit(null); return }
    setSubCreate(null)
  })

  // Show notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'syncing' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Get current level items
  const getCurrentItems = () => {
    if (!structure?.structure) return {}
    if (!path) return { ...structure.structure }
    const item = getItemByPath(structure, path)
    return { ...(item?.children || {}) }
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

  const displayItems = useMemo(() => localItems || rawItems, [localItems, rawItems])

  const displayOrder = useMemo(() => localOrder || serverKeys, [localOrder, serverKeys])

  // Level-1 keys actually rendered as items.
  const levelOneKeys = displayOrder

  // Circular ("revolving") scroll for the level-1 item list — see
  // useCircularScroll.ts. Resets on `path` change (a drill-in/out is
  // conceptually a brand-new list) and pauses while a level-1 drag is live
  // (some browsers auto-scroll a scrollable container near its edges during
  // dragover, which would otherwise fight the drag).
  const circularBudgetPx = Math.max(200, viewportHeight - CIRCULAR_SCROLL_CHROME_RESERVE_PX)
  const { circular, cloneCount, containerRef: circularContainerRef, topCloneRef, bottomCloneRef, realListRef } = useCircularScroll({
    count: levelOneKeys.length,
    resetKey: path,
    paused: !!draggedItem,
    budgetPx: circularBudgetPx,
  })

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
    // Push (not replace) so the hardware/OS back gesture still steps back up
    // through the levels actually visited, like normal browser back — swipe-
    // right (handleNavigateBack below) doesn't rely on this at all, it
    // computes its target from the current URL directly.
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

  // Swipe-right always means "go up the tree" — one level shallower, and
  // eventually out to the graphs list — regardless of what it starts on (a
  // row's own swipe-right, see Section.tsx, calls this same function; this
  // background handler covers empty space so the gesture works the same
  // everywhere rather than only off of items). Computes the target
  // explicitly, like handleItemClick/handleNavigateInto above, instead of
  // calling browser-history back: navigate(-1) only steps up through levels
  // actually *visited* in this tab, so landing on a deep path directly (a
  // fresh page load, a link, an agent-driven navigation) had nowhere
  // reliable to go back to — this always lands exactly one level up from
  // wherever the URL says we are now, or at the graphs list from the graph
  // root. Per-row swipe handlers (useItemSwipe) call stopPropagation, so
  // this background handler only ever sees touches that started on empty
  // space. Also clears the highlight selection — highlighting is meant to
  // be a temporary "point at this" gesture, not a selection that silently
  // follows you around as you navigate away (see the POP-navigation effect
  // below for the literal hardware/browser back button, a separate code
  // path since this is a PUSH, not a POP).
  const handleNavigateBack = () => {
    clearUserHighlights()
    if (!path) {
      navigate('/')
      return
    }
    navigate(buildPath(path.split('.').slice(0, -1).join('.')))
  }
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

  // Handle right-click on an item row — open the Delete/New/Paste menu at the cursor
  const handleItemContextMenu = (e: React.MouseEvent, itemPath: string, canAddSub: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ path: itemPath, x: e.clientX, y: e.clientY, canAddSub })
  }

  // Handle "+" chip click — open the sub-create editor under this parent
  const handleSubCreateStart = (parentPath: string) => {
    setInlineEdit(null)
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
      if (!targetKey) return
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

  // "C" — copies the current selection (highlighted items), reusing the
  // same markdown-outline clipboard format Paste already reads.
  const handleCopySelected = async () => {
    if (!structure || !userHighlights.length) return
    try {
      const forest = buildSelectionForest(structure, userHighlights)
      const text = serializeStructure(forest).trimEnd()
      await navigator.clipboard.writeText(text)
      showNotification(`Copied ${userHighlights.length} item${userHighlights.length > 1 ? 's' : ''}!`)
    } catch (err) {
      showNotification('Failed to copy', 'error')
    }
  }

  // "D" — deletes the current selection, with confirmation (this is now the
  // only way to delete an item; the inline editor's own Delete button was
  // removed in favor of select-then-D). Only the selection's root paths need
  // deleting — any non-root selected path is already inside one of those
  // subtrees. Deletes sequentially (not Promise.all) since deleteItem does a
  // synchronous read-modify-write of the whole graph in localStorage;
  // running them concurrently could race and silently drop a delete.
  const handleDeleteSelected = async () => {
    const count = userHighlights.length
    if (!count) return
    if (!confirm(`Delete ${count} item${count > 1 ? 's' : ''}? This cannot be undone.`)) return
    try {
      for (const rootPath of selectionRoots(userHighlights)) {
        await deleteItem(rootPath, graphName)
      }
      clearUserHighlights()
      setLocalItems(null)
      setLocalOrder(null)
      await queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
      showNotification(`Deleted ${count} item${count > 1 ? 's' : ''}!`)
    } catch (err) {
      showNotification('Failed to delete', 'error')
    }
  }

  // Mobile-only: whichever of edit / sub-create is active,
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
    return null
  })()

  // Builds a `cloneCount`-long array of indices into levelOneKeys for one
  // clone group — cycling through the real list more than once if
  // cloneCount > count (see useCircularScroll.ts's doc comment on why a
  // short list's clone group needs to wrap/repeat to fill the viewport
  // budget, rather than stopping at one pass through the real items).
  // 'before': the top clone, read top-to-bottom, must end with the item
  // immediately preceding real item 1 — i.e. items at "steps back" from
  // index 0, walking further back as cloneCount grows. 'after': the bottom
  // clone must start with the item immediately following the last real
  // item, walking forward.
  const wrappedCloneIndices = (cloneCount: number, count: number, direction: 'before' | 'after'): number[] =>
    count === 0 ? [] : Array.from({ length: cloneCount }, (_, j) =>
      direction === 'before' ? (((j - cloneCount) % count) + count) % count : j % count
    )

  // One item inside a circular-loop boundary clone group — see
  // useCircularScroll.ts. Every interactive callback is a no-op and every
  // "this item is mid-interaction" state prop is forced off (defense in
  // depth on top of the wrapper's pointer-events:none), so a clone can never
  // cause a real side effect; visual-only props (colorIndex, highlights,
  // depth/minimal/showRaw) mirror the real item so it's pixel-identical.
  const renderCloneSection = (key: string, reactKeyPrefix: string, colorIndex: number) => {
    const item = displayItems[key]
    if (!item) return null
    return (
      <Section
        key={`${reactKeyPrefix}${key}`}
        itemKey={key}
        item={item as StructureItem}
        parentPath={path || ''}
        colorIndex={colorIndex % COLORS.length}
        onItemClick={noop}
        onNavigateInto={noop}
        onNavigateBack={noop}
        onEditClick={noop}
        editingPath={null}
        editInline={!isMobile}
        onInlineSave={noop}
        onInlineCancel={noop}
        creatingPath={null}
        onSubCreateStart={noop}
        onSubCreateSave={noop}
        onSubCreateCancel={noop}
        onContextMenu={noop}
        onToggleHighlight={noop}
        userHighlights={userHighlightSet}
        agentHighlights={agentHighlightSet}
        isPending={false}
        draggedPath={null}
        dragOverPath={null}
        dragOverZone={null}
        onItemDragStart={noop}
        onItemDragOver={noop}
        onItemDragEnd={noop}
        onItemDrop={noop}
        dragEnabled={false}
        pendingPaths={pendingItems}
        showContext={viewMode === 'context' && !minimalView}
        minimal={minimalView}
        depth={depth}
        showRaw={depth === 0}
        rawText={depth === 0 ? serializeItem(key, item as StructureItem, 1).trimEnd() : undefined}
      />
    )
  }

  return (
    <>
      {/* Breadcrumb + mini-map — fixed below bottom buttons */}
      {!inlineEdit && !subCreate && (
        <div className="bottom-overlay">
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
          <GraphMinimap structure={structure} currentPath={path} />
        </div>
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
        {/* Copy + Delete for the current selection — only shows once
            something's highlighted (the "+New"/"Paste" default state this
            bar used to have was removed; top-level item creation now goes
            through the agent chat instead). */}
        {userHighlights.length > 0 && (
          <div className="section-wrapper new-paste-wrapper">
            <div className="section">
              <div className="layer1 add-item" onClick={handleCopySelected} title={`Copy ${userHighlights.length} selected item(s)`}>
                <span className="item-title">C</span>
              </div>
              <div className="layer1 add-item danger" onClick={handleDeleteSelected} title={`Delete ${userHighlights.length} selected item(s)`}>
                <span className="item-title">D</span>
              </div>
            </div>
          </div>
        )}
        {/* Sections - rendered in local order for instant drag feedback.
            Wrapped in a persistent container so useCircularScroll can manage
            scrollTop across mode changes without unmounting the real items —
            only the container's CLASS toggles between plain (single item,
            nothing to loop) and circular (2+ items — always on, capped +
            scrollable), never its identity. The two boundary clones only
            mount in circular mode and are fully inert (pointer-events:none +
            aria-hidden, plus their own edit/drag/drop state forced off) so
            no interaction — and no stray "this item is mid-edit" render —
            can ever come from a clone; see
            useCircularScroll.ts for why this is needed at all. */}
        <div
          ref={circularContainerRef}
          className={`circular-scroll-container${circular ? ' circular' : ''}`}
          tabIndex={0}
          role="region"
          aria-label="Items"
        >
          {circular && cloneCount > 0 && (
            <>
            <div ref={topCloneRef} className="circular-clone circular-clone-top" aria-hidden="true" tabIndex={-1}>
              {wrappedCloneIndices(cloneCount, levelOneKeys.length, 'before').map((srcIndex, j) =>
                renderCloneSection(levelOneKeys[srcIndex], `__circular_clone_top__${j}_`, srcIndex)
              )}
            </div>
            {/* Marks the loop seam — scrolling past the last real item lands
                here (blank) before the top clone's first item, rather than
                jumping straight into what would otherwise read as a repeat
                with no warning. Height must match LOOP_SPACER_PX exactly;
                see useCircularScroll.ts's teleport math. */}
            <div className="circular-loop-spacer" style={{ height: LOOP_SPACER_PX }} aria-hidden="true" />
            </>
          )}
          <div ref={realListRef} className="real-items">
            {levelOneKeys.map((key, index) => {
              const item = displayItems[key]
              if (!item) return null
              const itemPath = path ? `${path}.${key}` : key
              const isPending = pendingItems.has(itemPath)
              const canDrag = !isPending && !inlineEdit && !subCreate

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
                    dragEnabled={!inlineEdit && !subCreate}
                    pendingPaths={pendingItems}
                    showContext={viewMode === 'context' && !minimalView}
                    minimal={minimalView}
                    depth={depth}
                    showRaw={depth === 0}
                    rawText={depth === 0 ? serializeItem(key, item as StructureItem, 1).trimEnd() : undefined}
                  />
                </div>
              )
            })}
          </div>
          {circular && cloneCount > 0 && (
            <>
            {/* Symmetric spacer for the other seam — scrolling up past the
                first real item lands here before the bottom clone's last
                item. */}
            <div className="circular-loop-spacer" style={{ height: LOOP_SPACER_PX }} aria-hidden="true" />
            <div ref={bottomCloneRef} className="circular-clone circular-clone-bottom" aria-hidden="true" tabIndex={-1}>
              {wrappedCloneIndices(cloneCount, levelOneKeys.length, 'after').map((srcIndex, j) =>
                renderCloneSection(levelOneKeys[srcIndex], `__circular_clone_bottom__${j}_`, srcIndex)
              )}
            </div>
            </>
          )}
        </div>

        {levelOneKeys.length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {/* Copy + Delete for the current selection — bottom copy, same as the top one. */}
        {userHighlights.length > 0 && (
          <div className="section-wrapper new-paste-wrapper">
            <div className="section">
              <div className="layer1 add-item" onClick={handleCopySelected} title={`Copy ${userHighlights.length} selected item(s)`}>
                <span className="item-title">C</span>
              </div>
              <div className="layer1 add-item danger" onClick={handleDeleteSelected} title={`Delete ${userHighlights.length} selected item(s)`}>
                <span className="item-title">D</span>
              </div>
            </div>
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
