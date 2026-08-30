import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType, Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStructure, useGraphs, useUpdateItem, useDeleteItem, useMoveItemToPosition, useMoveItemToParent, useCreateItem, getItemByPath } from '../hooks/useGraph'
import { useHighlights } from '../hooks/useHighlights'
import { useViewOptions, DEPTHS } from '../hooks/useViewOptions'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { usePageSwipe } from '../hooks/usePageSwipe'
import { useLongPress } from '../hooks/useLongPress'
import { useDragGestureFactory } from '../hooks/useDragGesture'
import { StructureItem, Structure, UpdatePayload, pasteItems, serializeItem, serializeStructure, deleteItem } from '@api'
import MobileEditSheet from '../components/MobileEditSheet'
import Notification from '../components/Notification'
import Section from '../components/Section'
import ContextMenu from '../components/ContextMenu'

// True on touch-primary devices (no on-screen keyboard problem on desktop,
// so only mobile needs the item-stays-in-place + bottom-sheet editing pattern —
// see MobileEditSheet and the "editInline" prop on Section)
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
}

// Color assignment based on index
const COLORS = ['sky', 'indigo', 'fuchsia']

// Copy/Delete-selection icons — plain hand-drawn outlines (no icon package
// in this project), sized to sit inside the same circular buttons as
// depth/note (see .copy-toggle/.delete-toggle in App.css).
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}
// Confirm/reject an agent-proposed deletion (see .confirm-toggle/.reject-toggle in App.css).
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
// Edit the single selected item — mobile-only (see .edit-toggle in App.css):
// long-press now starts a drag instead of opening the editor (see
// useDragGesture.ts), so this button is the replacement path to it there.
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
// Add/paste a sub-item under the single selected item (see .addsub-toggle/.pastesub-toggle in App.css).
function AddSubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function PasteSubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="16" y2="16" />
    </svg>
  )
}

// Small dot row under a breadcrumb crumb — how many siblings it had at that
// level and roughly where among them, without needing a separate mini-map
// widget. Caps at MAX_CRUMB_DOTS so a level with dozens of items still
// renders as a compact strip rather than one dot per sibling; the current
// item's relative position is re-projected onto that capped strip rather
// than shown exactly, since exact position stops being legible past a
// handful of dots anyway. Still renders (one accent dot) even when there
// were no real siblings (siblingCount === 1) — "this level had exactly one
// choice, and it's the one you're on" is worth showing, not collapsing to
// nothing.
const MAX_CRUMB_DOTS = 5
function renderSiblingDots(siblingCount?: number, siblingIndex?: number) {
  if (siblingCount == null || siblingCount < 1 || siblingIndex == null || siblingIndex < 0) return null
  const shown = Math.min(siblingCount, MAX_CRUMB_DOTS)
  const onIndex = Math.round((siblingIndex / Math.max(1, siblingCount - 1)) * (shown - 1))
  return (
    <span className="dot-cluster">
      {Array.from({ length: shown }, (_, k) => (
        <span key={k} className={k === onIndex ? 'on' : undefined} />
      ))}
    </span>
  )
}

interface BreadcrumbCrumb {
  label: string
  path: string
  isRoot?: boolean
  siblingCount?: number
  siblingIndex?: number
}

// Dot row under the LAST breadcrumb crumb (the current item/list) — one dot
// per level-1 item actually in view here. Static (plain gray, no accent) —
// deliberately not tracking/highlighting scroll position; just a count.
function renderViewPositionDots(count: number) {
  if (count <= 1) return null
  return (
    <span className="dot-cluster">
      {Array.from({ length: count }, (_, k) => <span key={k} />)}
    </span>
  )
}

// Local-items counterpart to applyOptimisticMoveToPosition in useGraph.ts —
// walks a local items snapshot by path relative to the current view instead
// of the full structure. Combines the old reorderLocalItems (same-parent
// position) and applyLocalMove (cross-parent, append-only) into one general
// move-to-position operation, since a "before"-zone drop now always means
// "insert before this item's own list", whichever parent that is — a plain
// reorder is just the case where newParentRelativeParts happens to name the
// dragged item's current parent. Returns the resolved key alongside the new
// items snapshot (deduped against the target list when it crosses parents,
// same as the server) so callers that also track a separate order array
// (level-1's localOrder) can stay in sync without re-deriving the dedupe
// themselves.
function applyLocalMoveToPosition(
  items: Record<string, StructureItem>,
  itemRelativeParts: string[],
  newParentRelativeParts: string[],
  targetIndex: number,
): { items: Record<string, StructureItem>; key: string } {
  const newItems = JSON.parse(JSON.stringify(items))
  const itemKey = itemRelativeParts[itemRelativeParts.length - 1]

  let oldContainer: Record<string, StructureItem> = newItems
  for (let i = 0; i < itemRelativeParts.length - 1; i++) {
    const key = itemRelativeParts[i]
    if (!oldContainer[key]) return { items, key: itemKey }
    oldContainer = (oldContainer[key].children || {}) as Record<string, StructureItem>
  }
  const item = oldContainer[itemKey]
  if (!item) return { items, key: itemKey }

  let newContainer: Record<string, StructureItem> = newItems
  for (const key of newParentRelativeParts) {
    if (!newContainer[key]) return { items, key: itemKey }
    if (!newContainer[key].children) newContainer[key].children = {}
    newContainer = newContainer[key].children as Record<string, StructureItem>
  }

  const sameParent = newContainer === oldContainer
  const oldIndex = Object.keys(oldContainer).indexOf(itemKey)
  delete oldContainer[itemKey]

  let newKey = itemKey
  if (!sameParent) {
    let n = 2
    while (newKey in newContainer) newKey = `${itemKey}_${n++}`
  }

  // See applyOptimisticMoveToPosition's matching comment: same-parent moves
  // need the target index shifted back by one once the dragged item is
  // removed from ahead of it; cross-parent moves don't, since the dragged
  // item was never part of the target list to begin with.
  const adjustedTargetIndex = sameParent && oldIndex !== -1 && oldIndex < targetIndex ? targetIndex - 1 : targetIndex
  const orderedKeys = Object.keys(newContainer)
  const safeIndex = Math.max(0, Math.min(adjustedTargetIndex, orderedKeys.length))
  orderedKeys.splice(safeIndex, 0, newKey)

  const rebuilt: Record<string, StructureItem> = {}
  for (const k of orderedKeys) rebuilt[k] = k === newKey ? item : newContainer[k]
  Object.keys(newContainer).forEach(k => delete newContainer[k])
  Object.assign(newContainer, rebuilt)

  return { items: newItems, key: newKey }
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

// Which part of a row a drag is hovering over — the top half means "reorder
// to before this item", the bottom half means "nest as a child of this item"
// (drag-to-nest, matches dropping "on top of" an item). A 35% top band used
// to leave most of the row triggering nest, making plain reordering hard to
// hit reliably.
function getDropZone(e: React.DragEvent): 'before' | 'nest' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const relativeY = e.clientY - rect.top
  return relativeY < rect.height * 0.5 ? 'before' : 'nest'
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
  // Depth / note-view state — shared with AgentChat.tsx's mobile compose bar
  // via the same query-cache-backed hook (see useViewOptions.ts). GraphView
  // owns what these values DRIVE (Section props, context-injection closures
  // below) and, at >=32rem, its own copy of the buttons themselves too (see
  // depthLongPress/ctxLongPress and the header JSX below) — mobile keeps
  // getting them from AgentChat instead.
  const { depth, viewMode, minimalView, setDepth, setViewMode, setMinimalView } = useViewOptions()
  const depthLongPress = useLongPress(
    () => setDepth(0),
    () => setDepth(d => {
      const idx = (DEPTHS as readonly number[]).indexOf(d)
      return DEPTHS[(idx + 1) % DEPTHS.length]
    }),
  )
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
  const { userHighlights, agentHighlights, agentDeletePending, toggleUserHighlight, clearUserHighlights, clearAgentDeletePending } = useHighlights(graphName)
  const userHighlightSet = useMemo(() => new Set(userHighlights), [userHighlights])
  const agentHighlightSet = useMemo(() => new Set(agentHighlights), [agentHighlights])
  const agentDeletePendingSet = useMemo(() => new Set(agentDeletePending), [agentDeletePending])

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
  const moveToPosition = useMoveItemToPosition(graphName)
  const moveToParent = useMoveItemToParent(graphName)
  const createItem = useCreateItem(graphName)

  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  // Always-current mirror of draggedItem for usePageSwipe's native touch
  // listeners below — those are attached once (not re-subscribed every
  // render), so they need a ref to read live drag state rather than the
  // draggedItem closure from whichever render attached them.
  const draggedItemRef = useRef<string | null>(null)
  draggedItemRef.current = draggedItem
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // Drag-over target for level-2/3 drags, tracked by path (unlike dragOverIndex,
  // which is a level-1-only list position) — see handleDropAtPath.
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  // Which part of the hovered row the drag is over — 'before' reorders (the
  // original behavior), 'nest' makes the dragged item a child of the hovered
  // one. Shared across all three levels; see getDropZone.
  const [dragOverZone, setDragOverZone] = useState<'before' | 'nest' | null>(null)

  // Safety net: the pulsating "insert here" line (.drag-over-before in
  // index.css) is driven by dragOverIndex/dragOverPath/dragOverZone, which
  // are meant to always clear via handleDragEnd/handleTouchDragCancel/
  // handleDrop*/handleDropAtPath — but a drag can be abandoned in ways that
  // skip all of those: HTML5's dragend isn't guaranteed to fire if a drop
  // lands outside the browser window/tab, and a touch gesture can be
  // swallowed by an OS-level interruption (a notification pull-down, an app
  // switch) with no pointerup/pointercancel ever reaching the page. Starts
  // once when a drag begins (deps: [draggedItem] only — NOT dragOverIndex/
  // dragOverPath/dragOverZone) and force-clears everything if it's still
  // running 30s later. Deliberately an absolute cap from drag-start, not a
  // "reset on activity" timer: a touch held still over the same spot (no
  // further pointermove) fires no further updates to those values at all,
  // so a reset-on-change version of this fired mid-drag on any drag held
  // steady for a moment — draggedItem going null out from under a still-
  // active gesture, silently killing the eventual drop. 30s comfortably
  // covers even a slow, deliberate real drag while still guaranteeing the
  // indicator can't linger forever after a genuinely abandoned one.
  useEffect(() => {
    if (!draggedItem) return
    const timer = setTimeout(() => {
      setDraggedItem(null)
      setDragOverIndex(null)
      setDragOverPath(null)
      setDragOverZone(null)
    }, 30000)
    return () => clearTimeout(timer)
  }, [draggedItem])

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

  // Helper to build URL paths with optional graph prefix
  const buildPath = (itemPath: string) => {
    const base = graphName ? `/g/${graphName}` : ''
    return itemPath ? `${base}/${itemPath.replace(/\./g, '/')}` : base || '/'
  }

  // Build breadcrumb
  const getBreadcrumb = (): BreadcrumbCrumb[] => {
    const crumbs: BreadcrumbCrumb[] = []

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
    // Siblings at each level, attached to the PREVIOUS crumb (one level
    // higher) rather than the crumb it's actually about — e.g. the graph
    // name's dots show where the first path segment sits among the graph's
    // own top-level items, not a (meaningless) sibling count for the graph
    // name itself. This leaves the LAST crumb — the current item — with no
    // sibling dots via this mechanism; it gets renderViewPositionDots
    // instead (see the breadcrumb JSX below), a different kind of dot row
    // entirely: how many level-1 items are in the CURRENT list, with live
    // scroll position instead of tree position.
    let siblingContainer = structure?.structure ?? {}
    for (const part of parts) {
      const siblingKeys = Object.keys(siblingContainer)
      const prev = crumbs[crumbs.length - 1]
      prev.siblingCount = siblingKeys.length
      prev.siblingIndex = siblingKeys.indexOf(part)
      currentPath = currentPath ? `${currentPath}.${part}` : part
      const item = getItemByPath(structure, currentPath)
      crumbs.push({ label: item?.title || part, path: buildPath(currentPath) })
      siblingContainer = item?.children ?? {}
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

  // Level-2/3 click (any device) and level-1 items that opt out of editing
  // (see Section.tsx's rowEditable): navigate to the item's PARENT page, so
  // the clicked item shows up as a 1st-level item alongside its siblings
  // (with its own children/grandchildren now visible as the 2nd/3rd levels
  // below it) — a "promote to top" navigation, not "descend into it" (see
  // handleNavigateInto below for that one, which level-1's own click uses
  // instead).
  const handleItemClick = (itemPath: string) => {
    const realPath = resolveRealPath(itemPath)
    const parentPath = realPath.split('.').slice(0, -1).join('.')
    // Push (not replace) so the hardware/OS back gesture still steps back up
    // through the levels actually visited, like normal browser back — swipe-
    // right (handleNavigateBack below) doesn't rely on this at all, it
    // computes its target from the current URL directly.
    navigate(buildPath(parentPath))
  }

  // Navigate straight into a level-1 item's own children, making them the
  // new level-1 list — level-1 items have no "go to parent" navigation
  // today because their own parent IS the current page (handleItemClick's
  // trick would just reload the same page), so this is the one that both
  // mobile's swipe-left (anywhere on the page at that item's height, via
  // usePageSwipe below) and desktop's plain click on a level-1 title (see
  // Section.tsx's onItemEnter) use to descend a level. No-ops on a leaf item
  // (no children) — there's nowhere to go, so it's better ignored than
  // navigating to an empty page.
  const handleNavigateInto = (itemPath: string) => {
    const realPath = resolveRealPath(itemPath)
    const item = getItemByPath(structure, realPath)
    if (!item?.children || Object.keys(item.children).length === 0) return
    navigate(buildPath(realPath))
  }

  // Swipe-right always means "go up the tree" — one level shallower, and
  // eventually out to the graphs list — regardless of where on the page it
  // starts (see usePageSwipe: one page-level gesture, not a per-item one,
  // so this fires the same whether the finger started on a real row or
  // empty background space). Computes the target
  // explicitly, like handleItemClick/handleNavigateInto above, instead of
  // calling browser-history back: navigate(-1) only steps up through levels
  // actually *visited* in this tab, so landing on a deep path directly (a
  // fresh page load, a link, an agent-driven navigation) had nowhere
  // reliable to go back to — this always lands exactly one level up from
  // wherever the URL says we are now, or at the graphs list from the graph
  // root. Also clears the highlight selection — highlighting is meant to be
  // a temporary "point at this" gesture, not a selection that silently
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
  // Suppressed for the duration of a long-press drag (see draggedItemRef
  // above) — without this, the same finger motion that repositions a
  // dragged item can also read as a horizontal swipe, firing an unwanted
  // navigation right as (or after) the drop lands.
  const { ref: pageSwipeRef } = usePageSwipe(handleNavigateInto, handleNavigateBack, () => draggedItemRef.current !== null)

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
      ...(data.date && { date: data.date }),
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
        if (data.date !== undefined) {
          if (data.date === '') {
            delete updatedItem.date
          } else {
            updatedItem.date = data.date
          }
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

    // Already a top-level item — the fast path: reorder within localOrder in
    // place, nothing to move between containers.
    const currentIndex = localOrder?.indexOf(draggedKey) ?? -1
    const isTopLevelDrag = itemToReorder === (path ? `${path}.${draggedKey}` : draggedKey)
    if (isTopLevelDrag) {
      if (currentIndex === -1 || currentIndex === targetIndex) return

      // IMMEDIATELY update local order for instant visual feedback
      setLocalOrder(prevOrder => {
        if (!prevOrder) return prevOrder
        const idx = prevOrder.indexOf(draggedKey)
        if (idx === -1) return prevOrder

        const newOrder = [...prevOrder]
        newOrder.splice(idx, 1)
        // Forward moves need the target shifted back by one to land before
        // the same visual row once the dragged item is gone.
        const adjustedTargetIndex = idx < targetIndex ? targetIndex - 1 : targetIndex
        newOrder.splice(Math.max(0, Math.min(adjustedTargetIndex, newOrder.length)), 0, draggedKey)
        return newOrder
      })

      try {
        await moveToPosition.mutateAsync({ path: itemToReorder, newParentPath: path, targetIndex })
        showNotification('Reordered!')
      } catch (err: any) {
        setLocalOrder(serverKeys)
        const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to reorder'
        showNotification(msg.substring(0, 60), 'error')
      }
      return
    }

    // A nested item dropped in a top-level row's "before" zone — promote it
    // to a top-level item at targetIndex, same move-to-position machinery as
    // the same-parent case above, just crossing into a different (the view's
    // own top-level) container. Needs both localItems (the item moves out of
    // its old nested container) and localOrder (it's now one of the flat
    // top-level keys) kept in sync — applyLocalMoveToPosition only touches
    // the former, so the resolved (possibly deduped) key it returns is used
    // to update the latter directly here.
    const prefix = path ? `${path}.` : ''
    if (!itemToReorder.startsWith(prefix) || !displayItems) return
    const draggedRelative = itemToReorder.slice(prefix.length).split('.')

    const { items: movedItems, key: newKey } = applyLocalMoveToPosition(displayItems, draggedRelative, [], targetIndex)
    setLocalItems(movedItems)
    setLocalOrder(prevOrder => {
      const base = [...(prevOrder ?? serverKeys)]
      base.splice(Math.max(0, Math.min(targetIndex, base.length)), 0, newKey)
      return base
    })

    try {
      await moveToPosition.mutateAsync({ path: itemToReorder, newParentPath: path, targetIndex })
      showNotification('Moved!')
    } catch (err: any) {
      setLocalItems(rawItems)
      setLocalOrder(serverKeys)
      const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to move'
      showNotification(msg.substring(0, 60), 'error')
    }
  }

  // Drop handler for level-2/3 items. 'nest' zone: hands off to
  // handleNestDrop (always appends as the target's last child — this is how
  // an item crosses into a different parent, actions 2/3 in the drag model
  // above). 'before' zone only reorders within the dragged item's OWN
  // current parent (actions 4/5) — a cross-parent "before" drop no-ops
  // rather than reparenting-and-positioning, keeping the two gestures'
  // meanings distinct: nest to move between parents, before to reorder in
  // place. Level-1 keeps using handleDrop above (it has no parent to match
  // against — any source can land at any position there).
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
    if (!itemToReorder.startsWith(prefix) || !targetPath.startsWith(prefix) || !displayItems) return

    const draggedRelative = itemToReorder.slice(prefix.length).split('.')
    const targetRelative = targetPath.slice(prefix.length).split('.')
    const draggedKey = draggedRelative[draggedRelative.length - 1]
    const targetKey = targetRelative[targetRelative.length - 1]
    const parentRelative = targetRelative.slice(0, -1)
    if (parentRelative.join('.') !== draggedRelative.slice(0, -1).join('.')) return

    const siblingKeys = getSiblingOrder(displayItems, parentRelative)
    const targetIndex = siblingKeys.indexOf(targetKey)
    if (targetIndex === -1 || siblingKeys.indexOf(draggedKey) === targetIndex) return

    const newParentPath = parentRelative.length ? `${prefix}${parentRelative.join('.')}` : path

    // IMMEDIATELY update local state for instant visual feedback
    const { items: movedItems } = applyLocalMoveToPosition(displayItems, draggedRelative, parentRelative, targetIndex)
    setLocalItems(movedItems)

    // Then sync to server in background
    try {
      await moveToPosition.mutateAsync({ path: itemToReorder, newParentPath, targetIndex })
      showNotification('Moved!')
    } catch (err: any) {
      // Rollback on error - reset to server state
      setLocalItems(rawItems)
      setLocalOrder(serverKeys)
      const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to move'
      showNotification(msg.substring(0, 60), 'error')
    }
  }

  // Touch drag-gesture orchestration (mobile long-press-to-drag — see
  // useDragGesture.ts). Native HTML5 drag events never fire from touch at
  // all, so this hit-tests the DOM directly on each move (via
  // data-drag-path, set on the same three row wrappers the native
  // draggable/onDragStart attributes already live on) and dispatches to the
  // exact same handleDrop/handleDropAtPath/handleNestDrop desktop's mouse
  // drag already uses. The resolved target is tracked in a ref, not just
  // the dragOver* state (which still gets set too, for the existing visual
  // feedback classes) — so onDrop always reads the up-to-date value
  // synchronously, without waiting on a state update to flush.
  const touchDropTargetRef = useRef<
    { kind: 'level1'; index: number } | { kind: 'nested'; path: string; zone: 'before' | 'nest' } | null
  >(null)

  const handleTouchDragMove = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const rowEl = el?.closest('[data-drag-path]') as HTMLElement | null
    if (!rowEl) {
      touchDropTargetRef.current = null
      setDragOverIndex(null)
      setDragOverPath(null)
      setDragOverZone(null)
      return
    }
    const hitPath = rowEl.dataset.dragPath!
    const rect = rowEl.getBoundingClientRect()
    const currentDepth = path ? path.split('.').length : 0
    const relativeDepth = hitPath.split('.').length - currentDepth
    // Level-3 rows have no nest target of their own (mirrors Section.tsx's
    // desktop onDragOver, which always passes 'before' for a layer3 row) —
    // without this, the bottom half of a small layer3 chip read as a
    // (silently accepted, invisible) nest onto a fellow layer3 item instead
    // of a reorder, since layer3 itself has nothing to render a nested child
    // under.
    const zone: 'before' | 'nest' = relativeDepth >= 3 || (clientY - rect.top) < rect.height * 0.5 ? 'before' : 'nest'
    if (relativeDepth === 1) {
      const index = levelOneKeys.indexOf(hitPath.split('.').pop()!)
      touchDropTargetRef.current = index === -1 ? null : { kind: 'level1', index }
      setDragOverIndex(index === -1 ? null : index)
      setDragOverPath(null)
    } else {
      touchDropTargetRef.current = { kind: 'nested', path: hitPath, zone }
      setDragOverPath(hitPath)
      setDragOverIndex(null)
    }
    setDragOverZone(zone)
  }

  const handleTouchDrop = () => {
    const target = touchDropTargetRef.current
    touchDropTargetRef.current = null
    if (!target) {
      handleDragEnd()
      return
    }
    if (target.kind === 'level1') handleDrop(target.index)
    else handleDropAtPath(target.path, target.zone)
  }

  const handleTouchDragCancel = () => {
    touchDropTargetRef.current = null
    handleDragEnd()
  }

  const makeDragGestureHandlers = useDragGestureFactory({
    onDragStart: handleDragStart,
    onDragMove: handleTouchDragMove,
    onDrop: handleTouchDrop,
    onCancel: handleTouchDragCancel,
  })

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
  // Immediately removes the given absolute paths from local state — the
  // bulk-delete counterpart to handleDelete's single-path version above,
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

  const handleDeleteSelected = async () => {
    const count = userHighlights.length
    if (!count) return
    if (!confirm(`Delete ${count} item${count > 1 ? 's' : ''}? This cannot be undone.`)) return
    try {
      const roots = selectionRoots(userHighlights)
      for (const rootPath of roots) {
        await deleteItem(rootPath, graphName)
      }
      removePathsFromLocal(roots)
      clearUserHighlights()
      queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
      showNotification(`Deleted ${count} item${count > 1 ? 's' : ''}!`)
    } catch (err) {
      showNotification('Failed to delete', 'error')
    }
  }

  // Confirm/reject an agent-proposed deletion (see request_delete_items in
  // agentClient.ts) — the button click itself is the confirmation, no
  // separate browser confirm() dialog. Same root-paths-only + sequential
  // delete approach as handleDeleteSelected above.
  const handleConfirmAgentDelete = async () => {
    const count = agentDeletePending.length
    if (!count) return
    try {
      const roots = selectionRoots(agentDeletePending)
      for (const rootPath of roots) {
        await deleteItem(rootPath, graphName)
      }
      removePathsFromLocal(roots)
      clearAgentDeletePending()
      queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
      showNotification(`Deleted ${count} item${count > 1 ? 's' : ''}!`)
    } catch (err) {
      showNotification('Failed to delete', 'error')
    }
  }
  const handleRejectAgentDelete = () => {
    clearAgentDeletePending()
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

  // Add-sub/Paste-sub-item toolbar buttons — only meaningful with exactly one
  // item selected, and only when that item has room for a sub-item: same
  // depth rule the right-click menu's canAddSub uses (layer1 always, layer2
  // only when the view shows 3 levels, layer3 never — no layer4 to render).
  const singleSelectedPath = userHighlights.length === 1 ? userHighlights[0] : null
  const canAddSubToSelected = (() => {
    if (!singleSelectedPath) return false
    const currentDepth = path ? path.split('.').length : 0
    const relativeDepth = singleSelectedPath.split('.').length - currentDepth
    if (relativeDepth === 1) return true
    if (relativeDepth === 2) return depth >= 3
    return false
  })()

  // Mobile-only selection toolbar — copy/delete, edit, add-sub/paste-sub all
  // together in one row (they used to be three separate .selection-toolbar
  // divs, each its own row since they're block-level siblings). Edit is
  // mobile-only: long-press on a row now starts a drag instead of opening
  // the editor (see useDragGesture.ts), so this button is the replacement
  // path to it, shown whenever exactly one item is selected regardless of
  // canAddSubToSelected (unlike add-sub/paste-sub, editing works on a
  // layer3 item too).
  const renderSelectionToolbar = () => (
    (userHighlights.length > 0 || canAddSubToSelected) && (
      <div className="selection-toolbar">
        {userHighlights.length > 0 && (
          <>
            <button className="copy-toggle" onClick={handleCopySelected} title={`Copy ${userHighlights.length} selected item(s)`}>
              <CopyIcon />
            </button>
            <button className="delete-toggle" onClick={handleDeleteSelected} title={`Delete ${userHighlights.length} selected item(s)`}>
              <TrashIcon />
            </button>
          </>
        )}
        {singleSelectedPath && (
          <button className="edit-toggle" onClick={() => handleEditClick(singleSelectedPath, '', {} as StructureItem)} title="Edit this item">
            <EditIcon />
          </button>
        )}
        {canAddSubToSelected && (
          <>
            <button className="addsub-toggle" onClick={() => handleSubCreateStart(singleSelectedPath!)} title="Add a sub-item here">
              <AddSubIcon />
            </button>
            <button className="pastesub-toggle" onClick={() => handlePasteSubItem(singleSelectedPath!)} title="Paste as sub-item(s) here">
              <PasteSubIcon />
            </button>
          </>
        )}
      </div>
    )
  )

  // Shared between the desktop header copy (top of the page, in-flow) and
  // the mobile copy (end of the item list, in-flow — see the
  // .breadcrumb--footer render below) — each is just hidden via CSS at the
  // other's breakpoint (.breadcrumb--header/.breadcrumb--footer in App.css),
  // rather than one shared fixed-position element pinned over the content.
  const renderBreadcrumbNav = (variant: 'header' | 'footer') => (
    <nav className={`breadcrumb breadcrumb--${variant}`}>
      {breadcrumb.flatMap((crumb, i) => {
        const els = []
        if (i > 0) els.push(<span key={`${crumb.path}-sep`} className="sep">/</span>)
        els.push(
          <span key={crumb.path} className="crumb-col">
            {i === breadcrumb.length - 1 ? (
              <span>{crumb.label}</span>
            ) : (
              <Link to={crumb.path}>{crumb.label}</Link>
            )}
            {renderSiblingDots(crumb.siblingCount, crumb.siblingIndex)}
            {i === breadcrumb.length - 1 && renderViewPositionDots(levelOneKeys.length)}
          </span>,
        )
        return els
      })}
    </nav>
  )

  return (
    <>
      {/* Breadcrumb — an in-flow header above the item list at >=32rem
          (alongside this view's own depth/note buttons); on mobile that
          copy is hidden and a second copy renders at the end of the item
          list instead (see below), so it scrolls away with the content
          instead of staying permanently pinned on screen. */}
      {!inlineEdit && !subCreate && (
        <div className="graph-header">
          {renderBreadcrumbNav('header')}
          {/* Hidden below 32rem via CSS — mobile gets these from AgentChat's
              own compose-row copies instead (same shared state either way,
              see useViewOptions.ts). */}
          <div className="graph-header-buttons">
            {/* Copy/delete-selection — only present while something's
                highlighted (see the matching .selection-toolbar copy below,
                mobile's version of the same two actions). */}
            {userHighlights.length > 0 && (
              <>
                <button className="copy-toggle" onClick={handleCopySelected} title={`Copy ${userHighlights.length} selected item(s)`}>
                  <CopyIcon />
                </button>
                <button className="delete-toggle" onClick={handleDeleteSelected} title={`Delete ${userHighlights.length} selected item(s)`}>
                  <TrashIcon />
                </button>
              </>
            )}
            {/* Add/paste a sub-item under the single selected item — only
                when exactly one item is selected and it has room for one
                (see canAddSubToSelected above). */}
            {canAddSubToSelected && (
              <>
                <button className="addsub-toggle" onClick={() => handleSubCreateStart(singleSelectedPath!)} title="Add a sub-item here">
                  <AddSubIcon />
                </button>
                <button className="pastesub-toggle" onClick={() => handlePasteSubItem(singleSelectedPath!)} title="Paste as sub-item(s) here">
                  <PasteSubIcon />
                </button>
              </>
            )}
            {/* Confirm/reject an agent-proposed deletion (see the matching
                .pending-delete-toolbar copy below for mobile) — independent
                of the user's own selection above, both can show at once. */}
            {agentDeletePending.length > 0 && (
              <>
                <button className="confirm-toggle" onClick={handleConfirmAgentDelete} title={`Confirm deleting ${agentDeletePending.length} item(s) the agent proposed`}>
                  <CheckIcon />
                </button>
                <button className="reject-toggle" onClick={handleRejectAgentDelete} title="Reject — keep these items">
                  <XIcon />
                </button>
              </>
            )}
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
                : `${viewMode === 'context' ? 'Note on' : 'Note off'} — tap to toggle, long-press for minimal view`}
            >N</button>
          </div>
        </div>
      )}

      <div
        className="graph-container"
        ref={pageSwipeRef}
      >
        {/* Items grid — CSS columns for tight packing with no gaps. Locked
            while the mobile sheet is open so a tap/swipe on a background row
            can't land at the same time as a tap inside the sheet — without
            this, tapping a different row while editing could both commit the
            current edit and immediately trigger that row's own action. */}
        <div className={`items-grid${isMobile && mobileSheet ? ' items-grid-locked' : ''}`}>
        {/* Copy/delete/edit/add-sub/paste-sub for the current selection —
            only shows once something's highlighted (the "+New"/"Paste"
            default state this bar used to have was removed; top-level item
            creation now goes through the agent chat instead). Mobile-only —
            hidden at >=32rem via CSS, where copy/delete live in
            .graph-header-buttons instead, next to depth/note (see above);
            edit has no desktop equivalent here since desktop already has
            Shift/Alt+click and the right-click menu for that. */}
        {renderSelectionToolbar()}
        {/* Confirm/reject an agent-proposed deletion — mobile-only version of
            the header's copy above. */}
        {agentDeletePending.length > 0 && (
          <div className="selection-toolbar">
            <button className="confirm-toggle" onClick={handleConfirmAgentDelete} title={`Confirm deleting ${agentDeletePending.length} item(s) the agent proposed`}>
              <CheckIcon />
            </button>
            <button className="reject-toggle" onClick={handleRejectAgentDelete} title="Reject — keep these items">
              <XIcon />
            </button>
          </div>
        )}
        {/* Sections - rendered in local order for instant drag feedback. */}
        <div role="region" aria-label="Items" tabIndex={0}>
        {levelOneKeys.map((key, index) => {
          const item = displayItems[key]
          if (!item) return null
          const itemPath = path ? `${path}.${key}` : key
          const isPending = pendingItems.has(itemPath)
          // Native HTML5 draggable — desktop only. Some mobile browsers
          // translate a long-press-and-move on a draggable="true" element
          // into their OWN native drag session, competing with the custom
          // touch-gesture system below (useDragGestureFactory) — the two
          // fire independently, and the native session's dragstart firing
          // mid-gesture cancels the custom one's pointer tracking, so the
          // drop always finds draggedItem already cleared to null and
          // no-ops.
          const canDrag = !isMobile && !isPending && !inlineEdit && !subCreate

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
                // Some browsers (Firefox) require dataTransfer to carry data
                // for the drag to complete reliably, even for same-page drags.
                e.dataTransfer.setData('text/plain', itemPath)
                handleDragStart(itemPath)
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={() => handleDrop(index)}
              data-drag-path={itemPath}
              className={`section-wrapper ${draggedItem === itemPath ? 'dragging' : ''} ${dragOverIndex === index && dragOverZone === 'nest' ? 'drag-over-nest' : ''} ${dragOverIndex === index && dragOverZone !== 'nest' ? 'drag-over' : ''} ${isPending ? 'pending' : ''}`}
            >
              <Section
                key={key}
                itemKey={key}
                item={item as StructureItem}
                parentPath={path || ''}
                colorIndex={index % COLORS.length}
                onItemClick={handleItemClick}
                onItemEnter={handleNavigateInto}
                onEditClick={handleEditClick}
                makeDragGestureHandlers={makeDragGestureHandlers}
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
                agentDeletePending={agentDeletePendingSet}
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

        {levelOneKeys.length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {/* Copy/delete/edit/add-sub/paste-sub — bottom copy, same as the top one. */}
        {renderSelectionToolbar()}
        {agentDeletePending.length > 0 && (
          <div className="selection-toolbar">
            <button className="confirm-toggle" onClick={handleConfirmAgentDelete} title={`Confirm deleting ${agentDeletePending.length} item(s) the agent proposed`}>
              <CheckIcon />
            </button>
            <button className="reject-toggle" onClick={handleRejectAgentDelete} title="Reject — keep these items">
              <XIcon />
            </button>
          </div>
        )}
        </div>{/* end items-grid */}
        {/* Mobile-only breadcrumb, at the very end of the item list — see
            the comment on the header copy above. Hidden at >=32rem via CSS
            (.breadcrumb--footer), where the header copy is the only one. */}
        {!inlineEdit && !subCreate && renderBreadcrumbNav('footer')}
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
