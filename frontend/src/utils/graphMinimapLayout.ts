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
// Only the current path itself ever expands into children — every other
// node renders as a single point at its own natural position, however deep
// its real subtree actually goes, and is never visited past itself (so it
// can't inflate acc.maxDepth or crowd the map either). At the graph's own
// root view (nothing on path yet), that means every top-level item renders
// as a single point too — just a ring of dots, one per item.
function walk(
  key: string, item: StructureItem, depth: number, parentPath: string | null,
  onPathSet: Set<string>, acc: { leaf: number; maxDepth: number }, out: RawPoint[],
): number {
  const path = parentPath ? `${parentPath}.${key}` : key
  const isOnPath = onPathSet.has(path)
  acc.maxDepth = Math.max(acc.maxDepth, depth)
  const children = isOnPath ? Object.entries(item.children ?? {}) : []
  let xFrac: number
  if (children.length === 0) {
    xFrac = acc.leaf + 0.5
    acc.leaf += 1
  } else {
    xFrac = children.reduce((sum, [k, c]) => sum + walk(k, c, depth + 1, path, onPathSet, acc, out), 0) / children.length
  }
  out.push({ path, parentPath, depth, xFrac, onPath: isOnPath })
  return xFrac
}

// Lays out the current graph as a radial dendrogram: the graph's own root is
// an unrendered center point (not a real item — nothing in the data
// corresponds to it), each ring further out is one level deeper, and a
// node's angle is its left-to-right DFS leaf position swept around the full
// circle. Depth is normalized against the graph's real max depth (not
// per-branch), so shallow items stay close to center and only a genuinely
// deep branch reaches the rim.
export function buildMiniMapLayout(structure: Structure, currentPath: string): MiniMapLayout {
  const onPathSet = ancestorPathSet(currentPath)
  const acc = { leaf: 0, maxDepth: 0 }
  const raw: RawPoint[] = []
  // structure.structure is a forest (multiple level-1 keys) — walk each with
  // the same shared `acc.leaf` counter so the whole forest lands in one
  // continuous angular sequence.
  for (const [key, item] of Object.entries(structure.structure)) {
    walk(key, item, 0, null, onPathSet, acc, raw)
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

  return { points, byPath: new Map(points.map(p => [p.path, p])) }
}
