import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useStructure, useGraphs, getItemByPath } from '../hooks/useGraph'
import { useBottomAnchor } from '../hooks/useBottomAnchor'
import { useHighlights } from '../hooks/useHighlights'
import { useViewOptions, DEPTHS } from '../hooks/useViewOptions'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { usePageSwipe } from '../hooks/usePageSwipe'
import { useLongPress } from '../hooks/useLongPress'
import { StructureItem, UpdatePayload, pasteItems, serializeItem, serializeStructure, deleteItem } from '@api'
import MobileEditSheet from '../components/MobileEditSheet'
import Notification from '../components/Notification'
import Section from '../components/Section'
import ContextMenu from '../components/ContextMenu'
import TagList from '../components/TagList'
import { FAVORITE_TAG, tagTarget, tagsPath } from '../utils/tags'
import { buildSelectionForest, selectionRoots } from './graph/treeOps'
import { buildBreadcrumb, BreadcrumbNav } from './graph/Breadcrumb'
import { useGraphDragDrop } from './graph/useGraphDragDrop'
import { useItemEdits } from './graph/useItemEdits'
import { SelectionButtons, AgentDeleteButtons } from './graph/SelectionButtons'

// True on touch-primary devices (no on-screen keyboard problem on desktop,
// so only mobile needs the item-stays-in-place + bottom-sheet editing pattern —
// see MobileEditSheet and the "editInline" prop on Section)
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
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
  // Per-item note-visibility overrides (the row-level disclosure triangle,
  // see Section.tsx's context-toggle) — in-memory only, so they reset on
  // reload same as the rest of the view-option state. A triangle click is a
  // genuine per-item toggle; it does NOT touch viewMode.
  const [contextOverrides, setContextOverrides] = useState<Map<string, boolean>>(new Map())
  const toggleContextOverride = (path: string, shown: boolean) => {
    setContextOverrides(prev => {
      const next = new Map(prev)
      next.set(path, shown)
      return next
    })
  }

  // The N button's own displayed on/off state — deliberately NOT just
  // `viewMode === 'context'`. It's a "select-all checkbox": it only updates
  // once every currently-visible noted item (see visibleNotedPaths below)
  // agrees on a single state, and otherwise holds whatever it last showed
  // (see the sync effect below displayItems). Clicking it forces every
  // visible noted item to the opposite of what it's currently showing.
  const [noteButtonActive, setNoteButtonActive] = useState(() => viewMode === 'context')
  const toggleNoteView = () => {
    if (minimalView) { setMinimalView(false); return }
    const next = !noteButtonActive
    setViewMode(next ? 'context' : 'default')
    setContextOverrides(new Map())
    setNoteButtonActive(next)
  }
  const ctxLongPress = useLongPress(
    () => setMinimalView(v => !v),
    toggleNoteView,
  )

  const { data: structure, isLoading, error } = useStructure(graphName)
  // Phone layout opens each page bottom-anchored (see useBottomAnchor).
  const anchorRef = useBottomAnchor<HTMLDivElement>(location.pathname, !isLoading)
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

  // Paths of every noted item actually rendered right now — respects the
  // depth toggle (a level-3 item isn't in this list, and doesn't get a
  // triangle either, when depth is 2), since the N button is meant to
  // reflect "what is actually present" on screen, not the whole subtree.
  const visibleNotedPaths = useMemo(() => {
    const paths: string[] = []
    for (const [k1, item1] of Object.entries(displayItems)) {
      const p1 = path ? `${path}.${k1}` : k1
      if (item1.context) paths.push(p1)
      if (depth >= 2) {
        for (const [k2, item2] of Object.entries(item1.children || {})) {
          const p2 = `${p1}.${k2}`
          if (item2.context) paths.push(p2)
          if (depth >= 3) {
            for (const [k3, item3] of Object.entries(item2.children || {})) {
              const p3 = `${p2}.${k3}`
              if (item3.context) paths.push(p3)
            }
          }
        }
      }
    }
    return paths
  }, [displayItems, path, depth])

  // Keeps noteButtonActive in sync with visibleNotedPaths — but only when
  // they've reached consensus (see its own comment above): if every visible
  // noted item is now shown, the button flips to "on"; if every one is now
  // hidden, it flips to "off"; a mix leaves it exactly as it was, so one
  // stray triangle doesn't yank the button out of the state it's showing.
  useEffect(() => {
    if (minimalView || visibleNotedPaths.length === 0) return
    const states = visibleNotedPaths.map(p => contextOverrides.get(p) ?? (viewMode === 'context'))
    if (states.every(s => s === true)) setNoteButtonActive(true)
    else if (states.every(s => s === false)) setNoteButtonActive(false)
  }, [visibleNotedPaths, contextOverrides, viewMode, minimalView])

  const displayOrder = useMemo(() => localOrder || serverKeys, [localOrder, serverKeys])

  // Level-1 keys actually rendered as items.
  const levelOneKeys = displayOrder

  const {
    draggedItem, draggedItemRef, dragOverIndex, dragOverPath, setDragOverPath, dragOverZone, setDragOverZone,
    handleDragStart, handleDragOver, handleDragEnd, handleDrop, handleDropAtPath,
    handleBelowLastItemDragOver, handleBelowLastItemDrop, makeDragGestureHandlers,
  } = useGraphDragDrop({
    graphName, path, levelOneKeys, displayOrder, displayItems, localItems, localOrder,
    rawItems, serverKeys, setLocalItems, setLocalOrder, showNotification,
  })
  const { applyEdit, createChild, deleteOne, removePathsFromLocal } = useItemEdits({
    graphName, path, rawItems, serverKeys, setLocalItems, setLocalOrder, setPendingItems, showNotification,
  })

  // Helper to build URL paths with optional graph prefix
  const buildPath = (itemPath: string) => {
    const base = graphName ? `/g/${graphName}` : ''
    return itemPath ? `${base}/${itemPath.replace(/\./g, '/')}` : base || '/'
  }

  // Level-2/3 click (any device): navigate into the clicked item's own page
  // (its children/grandchildren become the new 1st/2nd levels), same as
  // handleNavigateInto below. Only a LEAF level-2/3 item (no children) falls
  // back to the parent page instead — "promote to top" — since there's
  // nowhere below it to descend into.
  const handleItemClick = (itemPath: string) => navigateToItem(itemPath)

  const navigateToItem = (realPath: string) => {
    const item = getItemByPath(structure, realPath)
    const hasChildren = !!item?.children && Object.keys(item.children).length > 0
    // Push (not replace) so the hardware/OS back gesture still steps back up
    // through the levels actually visited, like normal browser back — swipe-
    // right (handleNavigateBack below) doesn't rely on this at all, it
    // computes its target from the current URL directly.
    if (hasChildren) {
      navigate(buildPath(realPath))
    } else {
      const parentPath = realPath.split('.').slice(0, -1).join('.')
      navigate(buildPath(parentPath))
    }
  }

  // Tag pills open that tag's cross-graph view (see TagView.tsx).
  const handleTagClick = (tag: string) => navigate(tagsPath([tagTarget(tag)]))

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
    const item = getItemByPath(structure, itemPath)
    if (!item?.children || Object.keys(item.children).length === 0) return
    navigate(buildPath(itemPath))
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
    createChild(parentPath, { ...data, name: data.name })
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
    deleteOne(pathToDelete)
  }

  if (isLoading) {
    return <div className="loading">Loading...</div>
  }

  if (error) {
    return <div className="error">Error loading structure: {(error as Error).message}</div>
  }

  const breadcrumb = buildBreadcrumb(structure, graphs, graphName, path, buildPath)

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
  // Star — toggles the favorite tag on the selection: removes it if every
  // selected item already has it, otherwise adds it to the ones missing it.
  const allSelectedFavorite = userHighlights.length > 0 &&
    userHighlights.every(p => getItemByPath(structure, p)?.tags?.includes(FAVORITE_TAG))
  const handleToggleFavoriteSelected = () => {
    for (const p of userHighlights) {
      const tags = getItemByPath(structure, p)?.tags ?? []
      if (allSelectedFavorite) applyEdit(p, { tags: tags.filter(t => t !== FAVORITE_TAG) })
      else if (!tags.includes(FAVORITE_TAG)) applyEdit(p, { tags: [...tags, FAVORITE_TAG] })
    }
  }
  const selectionProps = {
    selectedCount: userHighlights.length,
    allFavorite: allSelectedFavorite,
    onCopy: handleCopySelected,
    onDelete: handleDeleteSelected,
    onToggleFavorite: handleToggleFavoriteSelected,
    onAddSub: canAddSubToSelected ? () => handleSubCreateStart(singleSelectedPath!) : undefined,
    onPasteSub: canAddSubToSelected ? () => handlePasteSubItem(singleSelectedPath!) : undefined,
  }
  const agentDeleteProps = { count: agentDeletePending.length, onConfirm: handleConfirmAgentDelete, onReject: handleRejectAgentDelete }
  // Mobile-only toolbar rows (hidden at >=32rem via CSS, where the header
  // holds the same buttons) — above and below the item list.
  const renderMobileToolbars = () => (
    <>
      {(userHighlights.length > 0 || canAddSubToSelected) && (
        <div className="selection-toolbar">
          <SelectionButtons
            {...selectionProps}
            onEdit={singleSelectedPath ? () => handleEditClick(singleSelectedPath, '', {} as StructureItem) : undefined}
          />
        </div>
      )}
      {agentDeletePending.length > 0 && (
        <div className="selection-toolbar">
          <AgentDeleteButtons {...agentDeleteProps} />
        </div>
      )}
    </>
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
          <BreadcrumbNav crumbs={breadcrumb} variant="header" levelOneCount={levelOneKeys.length} />
          {/* Hidden below 32rem via CSS — mobile gets these from AgentChat's
              own compose-row copies instead (same shared state either way,
              see useViewOptions.ts). */}
          <div className="graph-header-buttons">
            <SelectionButtons {...selectionProps} />
            <AgentDeleteButtons {...agentDeleteProps} />
            <button
              className={`depth-toggle active${depth === 0 ? ' raw' : ''}`}
              {...depthLongPress}
              title={depth === 0 ? 'Raw view — tap to return, long-press elsewhere for Raw' : `Showing ${depth} levels — tap to cycle, long-press for Raw`}
            >{depth === 0 ? 'R' : depth}</button>
            <button
              className={`ctx-toggle${noteButtonActive ? ' active' : ''}${minimalView ? ' minimal' : ''}`}
              {...ctxLongPress}
              title={minimalView
                ? 'Minimal view — tap to return to normal'
                : `${noteButtonActive ? 'Notes on' : 'Notes off'} — tap to toggle, long-press for minimal view`}
            >N</button>
          </div>
        </div>
      )}

      <div
        className="graph-container"
        ref={pageSwipeRef}
        onDragOver={handleBelowLastItemDragOver}
        onDrop={handleBelowLastItemDrop}
      >
        {/* Items grid — CSS columns for tight packing with no gaps. Locked
            while the mobile sheet is open so a tap/swipe on a background row
            can't land at the same time as a tap inside the sheet — without
            this, tapping a different row while editing could both commit the
            current edit and immediately trigger that row's own action. */}
        <div className={`items-grid${isMobile && mobileSheet ? ' items-grid-locked' : ''}`}>
        {/* Selection and agent-delete toolbars — mobile only (see renderMobileToolbars). */}
        {renderMobileToolbars()}
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
          // Raw view (depth 0) shows the item as plain selectable text — dragging
          // is disabled there so a mouse-drag performs a text selection instead
          // of starting a native HTML5 drag session.
          const canDrag = !isMobile && !isPending && !inlineEdit && !subCreate && depth !== 0

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
              className={`section-wrapper ${draggedItem === itemPath ? 'dragging' : ''} ${dragOverIndex === index && dragOverZone === 'nest' ? 'drag-over-nest' : ''} ${dragOverIndex === index && dragOverZone === 'before' ? 'drag-over-before' : ''} ${dragOverIndex === index && dragOverZone === 'after' ? 'drag-over-after' : ''} ${isPending ? 'pending' : ''}`}
            >
              <Section
                key={key}
                itemKey={key}
                item={item as StructureItem}
                parentPath={path || ''}
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
                contextOverrides={contextOverrides}
                onToggleContext={toggleContextOverride}
                minimal={minimalView}
                depth={depth}
                showRaw={depth === 0}
                rawText={depth === 0 ? serializeItem(key, item as StructureItem, 1).trimEnd() : undefined}
                onTagClick={handleTagClick}
              />
            </div>
          )
        })}
        </div>

        {levelOneKeys.length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {renderMobileToolbars()}
        </div>{/* end items-grid */}
        {/* Mobile-only breadcrumb, at the very end of the item list — see
            the comment on the header copy above. Hidden at >=32rem via CSS
            (.breadcrumb--footer), where the header copy is the only one. */}
        {!inlineEdit && !subCreate && <BreadcrumbNav crumbs={breadcrumb} variant="footer" levelOneCount={levelOneKeys.length} />}
        <div ref={anchorRef} className="reach-anchor" />
        {/* All tags, below the page's own content — on phones just past the
            bottom-anchored view, scrolled into reach on demand. */}
        <TagList />
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
