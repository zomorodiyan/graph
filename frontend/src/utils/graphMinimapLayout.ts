import { Structure, StructureItem } from '@api'

export const MINIMAP_SIZE = 64
export const MINIMAP_NODE_RADIUS = 1.8
export const MINIMAP_HALO_RADIUS = 3.4
const PADDING = 7

export interface MiniMapPoint {
  path: string
  parentPath: string | null
  onPath: boolean
  isCurrent: boolean
  cx: number
  cy: number
}

export interface MiniMapLayout {
  points: MiniMapPoint[]
  byPath: Map<string, MiniMapPoint>
  hub: { cx: number; cy: number }
}

// Root-to-current-item chain, inclusive of the item itself: "a.b.c" ->
// {"a", "a.b", "a.b.c"}. Empty while viewing the graph's own top-level list
// (no item drilled into yet) — nothing to highlight at that point.
function ancestorPathSet(path: string): Set<string> {
  const set = new Set<string>()
  if (!path) return set
  let cur = ''
  for (const part of path.split('.')) {
    cur = cur ? `${cur}.${part}` : part
    set.add(cur)
  }
  return set
}

interface RawPoint { path: string; parentPath: string | null; depth: number; xFrac: number; onPath: boolean }

// Leaves get sequential slots in left-to-right DFS order, so sibling
// subtrees never interleave; each internal node centers over the mean x of
// its own children (the standard cheap dendrogram layout). xFrac becomes an
// angle below — this is what makes item N sit next to item 1 at the seam,
// same as the level-1 list's own circular scroll.
//
// `offPathDepth` counts consecutive off-path ancestors since the nearest
// on-path node (or the graph root): 0 means "still within the one step
// we're willing to show past a branch point." A branch reset to 0 whenever
// it's actually on-path, so the current path itself is never pruned no
// matter how deep it goes — only branches you're NOT on get cut off one
// level past wherever they split away, rendered as a leaf at that point and
// never visited further (so a pruned branch can't inflate acc.maxDepth
// either, which also keeps the current path from being squeezed toward the
// hub by some irrelevant deep branch elsewhere in the graph).
function walk(
  key: string, item: StructureItem, depth: number, parentPath: string | null,
  onPathSet: Set<string>, acc: { leaf: number; maxDepth: number }, out: RawPoint[],
  offPathDepth: number,
): number {
  const path = parentPath ? `${parentPath}.${key}` : key
  const isOnPath = onPathSet.has(path)
  acc.maxDepth = Math.max(acc.maxDepth, depth)
  const rawChildren = isOnPath || offPathDepth < 1 ? Object.entries(item.children ?? {}) : []
  let xFrac: number
  if (rawChildren.length === 0) {
    xFrac = acc.leaf + 0.5
    acc.leaf += 1
  } else {
    const childOffPathDepth = isOnPath ? 0 : offPathDepth + 1
    xFrac = rawChildren.reduce((sum, [k, c]) => sum + walk(k, c, depth + 1, path, onPathSet, acc, out, childOffPathDepth), 0) / rawChildren.length
  }
  out.push({ path, parentPath, depth, xFrac, onPath: isOnPath })
  return xFrac
}

// Lays out the current graph as a radial dendrogram: the graph itself is a
// virtual hub at the center (not a real item — nothing in the data
// corresponds to it), each ring further out is one level deeper, and a
// node's angle is its left-to-right DFS leaf position swept around the full
// circle. Depth is normalized against the graph's real max depth (not
// per-branch), so shallow items stay near the hub and only a genuinely deep
// branch reaches the rim.
//
// Branches on the current path render in full, however deep they go.
// Everything else renders only one level past wherever it splits off that
// path (see `walk`'s offPathDepth) — the map still shows "there's more
// under every other branch," it just doesn't spend space expanding detail
// you didn't ask to see.
export function buildMiniMapLayout(structure: Structure, currentPath: string): MiniMapLayout {
  const onPathSet = ancestorPathSet(currentPath)
  const acc = { leaf: 0, maxDepth: 0 }
  const raw: RawPoint[] = []
  // structure.structure is a forest (multiple level-1 keys) — walk each with
  // the same shared `acc.leaf` counter so the whole forest lands in one
  // continuous angular sequence around the hub. offPathDepth starts at 0 for
  // every top-level item — the graph root itself is where an off-path
  // top-level branch "splits off," so it still gets its one allowed step.
  for (const [key, item] of Object.entries(structure.structure)) {
    walk(key, item, 0, null, onPathSet, acc, raw, 0)
  }

  const leafCount = Math.max(1, acc.leaf)
  const cx = MINIMAP_SIZE / 2
  const cy = MINIMAP_SIZE / 2
  const R = MINIMAP_SIZE / 2 - PADDING

  const points: MiniMapPoint[] = raw.map(r => {
    const radius = (r.depth + 1) / (acc.maxDepth + 2) * R
    const angle = (r.xFrac / leafCount) * Math.PI * 2 - Math.PI / 2
    return {
      path: r.path,
      parentPath: r.parentPath,
      onPath: r.onPath,
      isCurrent: r.path === currentPath,
      cx: cx + radius * Math.cos(angle),
      cy: cy + radius * Math.sin(angle),
    }
  })

  return { points, byPath: new Map(points.map(p => [p.path, p])), hub: { cx, cy } }
}
