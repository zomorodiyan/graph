import { Structure, StructureItem } from '@api'

export const MINIMAP_WIDTH = 64
export const ARC_RADIUS = 11
export const MINIMAP_NODE_RADIUS = 1.8
export const MINIMAP_HALO_RADIUS = 3.4
const TOP_PADDING = 6
const BOTTOM_PADDING = 4
// How far a level can nudge the next arc's center left/right of the one
// above it, scaled by how off-center the selected item was among its own
// siblings (see the loop below) — not a per-step clamp, a ceiling on total
// cumulative drift, so a long path can't walk the chain off the widget.
const LEAN_SCALE = 14
const MAX_LEAN_DRIFT = 10

export interface MiniMapNode {
  key: string
  x: number
  y: number
  /** True for the one item at this level that's either further down the
      current path or (for the last, deepest arc) the current item itself. */
  selected: boolean
}

export interface MiniMapArc {
  /** Faint dashed guide tracing the downward semicircle this level's nodes
      sit on — the nodes alone don't read as "one arc" without it. */
  guidePath: string
  nodes: MiniMapNode[]
}

export interface MiniMapLayout {
  /** Required SVG height — grows with path depth, since arcs chain
      downward at a constant size rather than shrinking to fit a fixed box. */
  height: number
  arcs: MiniMapArc[]
  /** The selected point from every arc, in order — draw as one connected
      line for "the path you actually took," and halo its last point (the
      current item itself, as opposed to an ancestor on the way there). */
  spine: MiniMapNode[]
}

// Forces angles[selectedIndex] to exactly 90° (straight down from the arc's
// own center) and spreads the rest evenly across the remaining portions of
// the downward half-circle (0°..180°) — 0° is the arc's rightmost point,
// 180° its leftmost, so earlier list indices get angles above 90 (toward
// 180, the left) and later indices get angles below 90 (toward 0, the
// right), matching left-to-right reading order. With no selection at all
// (selectedIndex < 0 — the trailing "here's what's below the current item"
// arc, or the root view before anything's chosen), spread everyone the same
// left-to-right way with nothing forced to center.
function arcAngles(n: number, selectedIndex: number): number[] {
  if (n === 1) return [90]
  if (selectedIndex < 0) {
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(180 - (i / (n - 1)) * 180)
    return out
  }
  const angles = new Array(n)
  angles[selectedIndex] = 90
  const leftCount = selectedIndex
  const rightCount = n - 1 - selectedIndex
  for (let i = 0; i < leftCount; i++) angles[i] = 90 + (leftCount - i) * 90 / (leftCount + 1)
  for (let i = 0; i < rightCount; i++) angles[selectedIndex + 1 + i] = 90 - (i + 1) * 90 / (rightCount + 1)
  return angles
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = deg * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Lays out the current path as a chain of downward-opening arcs: level 0 is
// the graph's own top-level items, and each arc after that is the selected
// item's children, centered on that item's own position — so the chain
// grows straight down the widget, one arc per level, always at the same
// radius (no shrinking toward a shared center the way a true polar/sunburst
// layout would). The item that continues the chain always renders at the
// exact bottom-middle of its arc regardless of where it actually falls in
// its parent's child order — that's what makes "arc" a meaningful unit here
// rather than just "a row of dots."
//
// Each new arc leans left or right of straight-down based on where its
// parent item sat among ITS OWN siblings (left-heavy child -> lean left,
// right-heavy -> lean right, true middle child -> no lean) — a real fact
// about the data rather than an arbitrary zigzag, using the very information
// that forcing the selected node to center would otherwise throw away.
//
// The last arc in the chain — the current item's own children, if it has
// any — has no selection at all (nothing to continue to yet), so it renders
// as a plain, unhighlighted row: "here's what's below you," not "here's
// where you're going." Viewing the graph's root with nothing selected is
// the same case at level 0: a single unhighlighted arc of top-level items.
export function buildMiniMapLayout(structure: Structure, currentPath: string): MiniMapLayout {
  const segments = currentPath ? currentPath.split('.') : []
  const arcs: MiniMapArc[] = []
  const spine: MiniMapNode[] = []

  let entries: [string, StructureItem][] = Object.entries(structure.structure)
  let cx = MINIMAP_WIDTH / 2
  let cy = TOP_PADDING
  let maxY = cy

  for (let level = 0; entries.length > 0; level++) {
    const selectedKey = level < segments.length ? segments[level] : null
    const selectedIndex = selectedKey ? entries.findIndex(([key]) => key === selectedKey) : -1

    const angles = arcAngles(entries.length, selectedIndex)
    const nodes: MiniMapNode[] = entries.map(([key], i) => {
      const p = polar(cx, cy, ARC_RADIUS, angles[i])
      return { key, x: p.x, y: p.y, selected: i === selectedIndex }
    })
    arcs.push({
      guidePath: `M ${(cx - ARC_RADIUS).toFixed(2)} ${cy.toFixed(2)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 0 ${(cx + ARC_RADIUS).toFixed(2)} ${cy.toFixed(2)}`,
      nodes,
    })
    maxY = Math.max(maxY, cy + ARC_RADIUS)

    if (selectedIndex < 0) break

    const selectedNode = nodes[selectedIndex]
    spine.push(selectedNode)

    const n = entries.length
    const normalizedPos = n > 1 ? selectedIndex / (n - 1) - 0.5 : 0
    const drift = (cx - MINIMAP_WIDTH / 2) + normalizedPos * LEAN_SCALE
    cx = MINIMAP_WIDTH / 2 + Math.max(-MAX_LEAN_DRIFT, Math.min(MAX_LEAN_DRIFT, drift))
    cy = selectedNode.y

    entries = Object.entries(entries[selectedIndex][1].children ?? {})
  }

  return { height: maxY + BOTTOM_PADDING, arcs, spine }
}
