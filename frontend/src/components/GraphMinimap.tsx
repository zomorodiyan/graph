import { useMemo } from 'react'
import { Structure } from '@api'
import { buildMiniMapLayout, MINIMAP_WIDTH, MINIMAP_HEIGHT, MINIMAP_NODE_RADIUS } from '../utils/graphMinimapLayout'

interface GraphMinimapProps {
  structure?: Structure
  currentPath: string
}

// Passive schematic of the whole current graph, sitting above the
// breadcrumb (see .bottom-overlay in App.css) — no click/tap handling, no
// hit-testing. Mobile-only via a CSS @media rule on .graph-minimap, not a JS
// isMobile check: there's no behavioral difference between mobile/desktop
// here, only visibility, so it keys off the same viewport-width breakpoint
// the rest of the bottom chrome already uses rather than the unrelated
// touch-capability flag GraphView uses for interaction differences.
export default function GraphMinimap({ structure, currentPath }: GraphMinimapProps) {
  const layout = useMemo(
    () => (structure ? buildMiniMapLayout(structure, currentPath) : null),
    [structure, currentPath],
  )

  if (!layout || layout.points.length === 0) return null

  return (
    <svg
      className="graph-minimap"
      width={MINIMAP_WIDTH}
      height={MINIMAP_HEIGHT}
      viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
      aria-hidden="true"
    >
      {layout.points.map(p => {
        if (!p.parentPath) return null
        const parent = layout.byPath.get(p.parentPath)
        if (!parent) return null
        return (
          <line
            key={`e-${p.path}`}
            className={`minimap-edge${p.onPath ? ' current' : ''}`}
            x1={parent.px} y1={parent.py} x2={p.px} y2={p.py}
          />
        )
      })}
      {layout.points.map(p => (
        <circle
          key={`n-${p.path}`}
          className={`minimap-node${p.onPath ? ' current' : ''}`}
          cx={p.px} cy={p.py} r={MINIMAP_NODE_RADIUS}
        />
      ))}
    </svg>
  )
}
