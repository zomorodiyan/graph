import { Structure, StructureItem } from '@api'

export const MINIMAP_WIDTH = 110
export const MINIMAP_HEIGHT = 56
export const MINIMAP_NODE_RADIUS = 1.6
const PADDING = 6

export interface MiniMapPoint {
  path: string
  parentPath: string | null
  onPath: boolean
  px: number
  py: number
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
// its own children (the standard cheap dendrogram layout). This is what
// makes the diagram compress rather than truncate as item count grows: x
// spacing per leaf is always usableWidth / totalLeafCount.
function walk(
  key: string, item: StructureItem, depth: number, parentPath: string | null,
  onPathSet: Set<string>, acc: { leaf: number; maxDepth: number }, out: RawPoint[],
): number {
  const path = parentPath ? `${parentPath}.${key}` : key
  acc.maxDepth = Math.max(acc.maxDepth, depth)
  const children = Object.entries(item.children ?? {})
  let xFrac: number
  if (children.length === 0) {
    xFrac = acc.leaf + 0.5
    acc.leaf += 1
  } else {
    xFrac = children.reduce((sum, [k, c]) => sum + walk(k, c, depth + 1, path, onPathSet, acc, out), 0) / children.length
  }
  out.push({ path, parentPath, depth, xFrac, onPath: onPathSet.has(path) })
  return xFrac
}

// Lays out the WHOLE current graph (every level-1 item and all descendants,
// no depth cap) into a fixed MINIMAP_WIDTH x MINIMAP_HEIGHT box, with the
// root-to-current ancestor chain flagged via `onPath`. Spacing is never
// truncated, only compressed — a hundred-item graph draws denser, not
// smaller/cropped, than a ten-item one.
export function buildMiniMapLayout(structure: Structure, currentPath: string): MiniMapLayout {
  const onPathSet = ancestorPathSet(currentPath)
  const acc = { leaf: 0, maxDepth: 0 }
  const raw: RawPoint[] = []
  // structure.structure is a forest (multiple level-1 keys) — walk each with
  // the same shared `acc.leaf` counter so the whole forest lands in one
  // continuous left-to-right leaf sequence.
  for (const [key, item] of Object.entries(structure.structure)) {
    walk(key, item, 0, null, onPathSet, acc, raw)
  }

  const leafCount = Math.max(1, acc.leaf)
  const usableW = MINIMAP_WIDTH - PADDING * 2
  const usableH = MINIMAP_HEIGHT - PADDING * 2

  const points: MiniMapPoint[] = raw.map(r => ({
    path: r.path,
    parentPath: r.parentPath,
    onPath: r.onPath,
    px: PADDING + (r.xFrac / leafCount) * usableW,
    py: acc.maxDepth === 0 ? MINIMAP_HEIGHT / 2 : PADDING + (r.depth / acc.maxDepth) * usableH,
  }))

  return { points, byPath: new Map(points.map(p => [p.path, p])) }
}
