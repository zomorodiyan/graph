import { useEffect, useRef, useState } from 'react'
import { StructureItem } from '@api'
import { useMoveItemToParent, useMoveItemToPosition } from '../../hooks/useGraph'
import { useDragGestureFactory } from '../../hooks/useDragGesture'
import { applyLocalMove, applyLocalMoveToPosition, getDropZone, getSiblingOrder } from './treeOps'

interface DragDropOptions {
  graphName?: string
  path: string
  levelOneKeys: string[]
  displayOrder: string[]
  displayItems: Record<string, StructureItem>
  localItems: Record<string, StructureItem> | null
  localOrder: string[] | null
  rawItems: Record<string, StructureItem>
  serverKeys: string[]
  setLocalItems: React.Dispatch<React.SetStateAction<Record<string, StructureItem> | null>>
  setLocalOrder: React.Dispatch<React.SetStateAction<string[] | null>>
  showNotification: (message: string, type?: 'success' | 'error' | 'syncing') => void
}

// Drag-and-drop for GraphView's item tree: desktop mouse (native HTML5 DnD)
// and mobile long-press-to-drag (see useDragGesture.ts), at all three levels
// — reorder before/after a row, or nest into it. Updates GraphView's local
// (optimistic) items/order first, then syncs through the move mutations,
// rolling back to the server state on failure.
export function useGraphDragDrop({
  graphName, path, levelOneKeys, displayOrder, displayItems, localItems, localOrder,
  rawItems, serverKeys, setLocalItems, setLocalOrder, showNotification,
}: DragDropOptions) {
  const moveToPosition = useMoveItemToPosition(graphName)
  const moveToParent = useMoveItemToParent(graphName)

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
  // Which part of the hovered row the drag is over — 'before'/'after' reorder
  // relative to the hovered row, 'nest' makes the dragged item a child of the
  // hovered one. Shared across all three levels; see getDropZone.
  const [dragOverZone, setDragOverZone] = useState<'before' | 'nest' | 'after' | null>(null)

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

  // Recognizes the empty space below the last level-1 bubble as "after the
  // last item" — without this, a drop landing anywhere past the bottom of
  // the whole list had nowhere valid to go, since every other drop target is
  // an actual row. Shared by the mouse dragover/drop pair below and by
  // handleTouchDragMove's own equivalent check.
  const isBelowLastLevelOneItem = (clientY: number): boolean => {
    if (levelOneKeys.length === 0) return false
    const lastKey = levelOneKeys[levelOneKeys.length - 1]
    const lastPath = path ? `${path}.${lastKey}` : lastKey
    const lastRow = document.querySelector<HTMLElement>(`[data-drag-path="${lastPath}"]`)
    return !!lastRow && clientY > lastRow.getBoundingClientRect().bottom
  }

  // Desktop mouse needs an explicit listening ancestor for native HTML5 DnD
  // to even consider a drop possible in that empty space at all — attached
  // to .graph-container below, which wraps the whole item list (and the
  // mobile footer breadcrumb under it). Level-1 rows' own onDragOver doesn't
  // stop propagation (only level-2/3's does), so this also re-fires while
  // hovering an actual row — isBelowLastLevelOneItem's own bounds check is
  // what keeps it a no-op then, leaving that row's own state alone.
  const handleBelowLastItemDragOver = (e: React.DragEvent) => {
    if (!draggedItem || !isBelowLastLevelOneItem(e.clientY)) return
    e.preventDefault()
    setDragOverIndex(levelOneKeys.length - 1)
    setDragOverZone('after')
    setDragOverPath(null)
  }

  const handleBelowLastItemDrop = (e: React.DragEvent) => {
    if (!draggedItem || !isBelowLastLevelOneItem(e.clientY)) return
    e.preventDefault()
    handleDrop(levelOneKeys.length - 1)
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

    // 'after' inserts one position later than 'before' at the same target
    // row — everything below is otherwise oblivious to which zone fired.
    const insertIndex = zone === 'after' ? targetIndex + 1 : targetIndex

    // Already a top-level item — the fast path: reorder within localOrder in
    // place, nothing to move between containers.
    const currentIndex = localOrder?.indexOf(draggedKey) ?? -1
    const isTopLevelDrag = itemToReorder === (path ? `${path}.${draggedKey}` : draggedKey)
    if (isTopLevelDrag) {
      if (currentIndex === -1 || currentIndex === insertIndex) return

      // IMMEDIATELY update local order for instant visual feedback
      setLocalOrder(prevOrder => {
        if (!prevOrder) return prevOrder
        const idx = prevOrder.indexOf(draggedKey)
        if (idx === -1) return prevOrder

        const newOrder = [...prevOrder]
        newOrder.splice(idx, 1)
        // Forward moves need the target shifted back by one to land before
        // the same visual row once the dragged item is gone.
        const adjustedTargetIndex = idx < insertIndex ? insertIndex - 1 : insertIndex
        newOrder.splice(Math.max(0, Math.min(adjustedTargetIndex, newOrder.length)), 0, draggedKey)
        return newOrder
      })

      try {
        await moveToPosition.mutateAsync({ path: itemToReorder, newParentPath: path, targetIndex: insertIndex })
        showNotification('Reordered!')
      } catch (err: any) {
        setLocalOrder(serverKeys)
        const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to reorder'
        showNotification(msg.substring(0, 60), 'error')
      }
      return
    }

    // A nested item dropped in a top-level row's before/after zone — promote
    // it to a top-level item at insertIndex, same move-to-position machinery
    // as the same-parent case above, just crossing into a different (the
    // view's own top-level) container. Needs both localItems (the item moves
    // out of its old nested container) and localOrder (it's now one of the
    // flat top-level keys) kept in sync — applyLocalMoveToPosition only
    // touches the former, so the resolved (possibly deduped) key it returns
    // is used to update the latter directly here.
    const prefix = path ? `${path}.` : ''
    if (!itemToReorder.startsWith(prefix) || !displayItems) return
    const draggedRelative = itemToReorder.slice(prefix.length).split('.')

    const { items: movedItems, key: newKey } = applyLocalMoveToPosition(displayItems, draggedRelative, [], insertIndex)
    setLocalItems(movedItems)
    setLocalOrder(prevOrder => {
      const base = [...(prevOrder ?? serverKeys)]
      base.splice(Math.max(0, Math.min(insertIndex, base.length)), 0, newKey)
      return base
    })

    try {
      await moveToPosition.mutateAsync({ path: itemToReorder, newParentPath: path, targetIndex: insertIndex })
      showNotification('Moved!')
    } catch (err: any) {
      setLocalItems(rawItems)
      setLocalOrder(serverKeys)
      const msg = err?.message?.includes(':') ? err.message.split(':').slice(1).join(':').trim() : 'Failed to move'
      showNotification(msg.substring(0, 60), 'error')
    }
  }

  // Drop handler for level-2/3 items. 'nest' zone: hands off to
  // handleNestDrop (always appends as the target's last child). 'before'/
  // 'after' zones reorder relative to the hovered row — same parent or a
  // different one, crossing parents exactly like 'nest' does but landing at
  // a specific position instead of always last (previously this only
  // reordered within the dragged item's own current parent and silently
  // no-op'd on any other target, even though the before/after indicator lit
  // up there just the same — see the user report this fixed). Guards against
  // dropping into the dragged item's own subtree (itself or a descendant),
  // mirroring handleNestDrop's identical check — before/after now crosses
  // parents too, so that cycle is newly reachable here the same way it
  // already was for 'nest'. Level-1 keeps using handleDrop above (it has no
  // parent to match against — any source can already land at any position
  // there).
  const handleDropAtPath = async (targetPath: string, zone: 'before' | 'nest' | 'after') => {
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
    if (targetPath === itemToReorder || targetPath.startsWith(`${itemToReorder}.`)) return

    const draggedRelative = itemToReorder.slice(prefix.length).split('.')
    const targetRelative = targetPath.slice(prefix.length).split('.')
    const draggedKey = draggedRelative[draggedRelative.length - 1]
    const targetKey = targetRelative[targetRelative.length - 1]
    const parentRelative = targetRelative.slice(0, -1)
    const sameParent = parentRelative.join('.') === draggedRelative.slice(0, -1).join('.')

    const siblingKeys = getSiblingOrder(displayItems, parentRelative)
    const targetIndex = siblingKeys.indexOf(targetKey)
    if (targetIndex === -1) return
    // 'after' inserts one position later than 'before' at the same target row.
    const insertIndex = zone === 'after' ? targetIndex + 1 : targetIndex
    if (sameParent && siblingKeys.indexOf(draggedKey) === insertIndex) return

    const newParentPath = parentRelative.length ? `${prefix}${parentRelative.join('.')}` : path

    // IMMEDIATELY update local state for instant visual feedback
    const { items: movedItems } = applyLocalMoveToPosition(displayItems, draggedRelative, parentRelative, insertIndex)
    setLocalItems(movedItems)
    // Crossing out of the top-level list (a level-2/3 before/after target,
    // dragging a level-1 item) needs localOrder kept in sync too, same as
    // handleNestDrop's matching case — applyLocalMoveToPosition only touches
    // the items tree.
    if (!sameParent && draggedRelative.length === 1) {
      setLocalOrder(prev => prev ? prev.filter(k => k !== draggedRelative[0]) : prev)
    }

    // Then sync to server in background
    try {
      await moveToPosition.mutateAsync({ path: itemToReorder, newParentPath, targetIndex: insertIndex })
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
    { kind: 'level1'; index: number } | { kind: 'nested'; path: string; zone: 'before' | 'nest' | 'after' } | null
  >(null)

  const handleTouchDragMove = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const rowEl = el?.closest('[data-drag-path]') as HTMLElement | null
    if (!rowEl) {
      // Below the last level-1 item, past the bottom of the whole list —
      // touch isn't limited to elements with their own listener the way
      // mouse's native HTML5 DnD is (see handleBelowLastItemDragOver's own
      // comment), so this reaches all the way past the list, footer
      // breadcrumb included, not just .graph-container's own bounds.
      if (isBelowLastLevelOneItem(clientY)) {
        const index = levelOneKeys.length - 1
        touchDropTargetRef.current = { kind: 'level1', index }
        setDragOverIndex(index)
        setDragOverPath(null)
        setDragOverZone('after')
        return
      }
      touchDropTargetRef.current = null
      setDragOverIndex(null)
      setDragOverPath(null)
      setDragOverZone(null)
      return
    }
    const hitPath = rowEl.dataset.dragPath!
    const currentDepth = path ? path.split('.').length : 0
    const relativeDepth = hitPath.split('.').length - currentDepth
    // Level-1's zone is vertical (top/bottom 10% of the WHOLE bubble —
    // rowEl itself, title/note plus all its rendered lvl2/3 children — means
    // before/after, the rest means nest), level-2/3's stays horizontal
    // along their own row — see GraphView's module-level getDropZone (the
    // desktop-mouse equivalent of this) for why.
    const zoneRect = rowEl.getBoundingClientRect()
    let zone: 'before' | 'nest' | 'after'
    if (relativeDepth === 1) {
      const frac = (clientY - zoneRect.top) / zoneRect.height
      zone = frac < 0.1 ? 'before' : frac > 0.9 ? 'after' : 'nest'
    } else {
      const frac = (clientX - zoneRect.left) / zoneRect.width
      zone = frac < 0.3 ? 'before' : frac > 0.7 ? 'after' : 'nest'
    }
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

  return {
    draggedItem, draggedItemRef, dragOverIndex, dragOverPath, setDragOverPath, dragOverZone, setDragOverZone,
    handleDragStart, handleDragOver, handleDragEnd, handleDrop, handleDropAtPath,
    handleBelowLastItemDragOver, handleBelowLastItemDrop, makeDragGestureHandlers,
  }
}
