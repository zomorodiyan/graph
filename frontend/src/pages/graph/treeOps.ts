// Pure helpers for GraphView's local (optimistic) item tree, selection and
// drag-drop zones — no React, no state; GraphView and useGraphDragDrop call
// these from their setState updaters and event handlers.
import { StructureItem, Structure } from '@api'
import { getItemByPath } from '../../hooks/useGraph'

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
export function applyLocalMoveToPosition(
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
// walking .children the same way the local edits in useItemEdits do.
export function getSiblingOrder(items: Record<string, StructureItem>, parentRelativeParts: string[]): string[] {
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
export function selectionRoots(paths: string[]): string[] {
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
export function buildSelectionForest(structure: Structure, selectedPaths: string[]): Record<string, StructureItem> {
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

// Which part of a level-1 BUBBLE a drag is hovering over — measured against
// the WHOLE .section-wrapper (title, note, and all its rendered lvl2/3
// children), not just the title. A lvl2/3 row's own onDragOver stops
// propagation before this ever runs (see Section.tsx), so this only fires
// when the drop isn't on top of any specific sub/subsub item — i.e.,
// somewhere on this bubble's own background. Top 10% means "reorder to
// before this bubble", bottom 10% means "reorder to after this bubble", the
// remaining 80% (most of a bubble with any real content) means "nest as this
// bubble's own child". Measuring only the title/note's own narrow rect used
// to make nesting under a content-heavy level-1 item nearly unreachable —
// almost the entire bubble is its rendered lvl2/3 content, which is exactly
// where nesting needs to be reachable, so this uses the bubble's full height
// instead. Level-2/3's own before/nest/after split stays horizontal (see
// Section.tsx's copy of this function) — only level-1's whole-bubble
// fallback is vertical, since "top of the bubble"/"bottom of the bubble"
// maps directly to its position in the level-1 list, the same way a
// level-2/3 row's own left/right maps to its position along that row's
// left-to-right flow.
export function getDropZone(e: React.DragEvent): 'before' | 'nest' | 'after' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const frac = (e.clientY - rect.top) / rect.height
  if (frac < 0.1) return 'before'
  if (frac > 0.9) return 'after'
  return 'nest'
}

// Local-items counterpart to applyOptimisticMove in useGraph.ts — removes the
// item from its old parent's children (relative to the current view) and
// appends it as the last child of the new parent, deduping the key the same
// way moveItemToParent does server-side.
export function applyLocalMove(
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
