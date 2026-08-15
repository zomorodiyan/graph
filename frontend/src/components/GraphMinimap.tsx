import { useMemo } from 'react'
import { Structure } from '@api'
import { buildMiniMapLayout, MINIMAP_SIZE, MINIMAP_NODE_RADIUS, MINIMAP_HALO_RADIUS } from '../utils/graphMinimapLayout'

interface GraphMinimapProps {
  structure?: Structure
  currentPath: string
}

// Passive radial schematic of the whole current graph, sitting beside the
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

  const current = layout.points.find(p => p.isCurrent)

  return (
    <svg
      className="graph-minimap"
      width={MINIMAP_SIZE}
      height={MINIMAP_SIZE}
      viewBox={`0 0 ${MINIMAP_SIZE} ${MINIMAP_SIZE}`}
      aria-hidden="true"
    >
      {layout.points.map(p => {
        // Depth-0 items have no real parent — they connect to the hub instead.
        const from = p.parentPath ? layout.byPath.get(p.parentPath) : layout.hub
        if (!from) return null
        return (
          <line
            key={`e-${p.path}`}
            className={`minimap-edge${p.onPath ? ' current' : ''}`}
            x1={from.cx} y1={from.cy} x2={p.cx} y2={p.cy}
          />
        )
      })}
      <circle className="minimap-hub" cx={layout.hub.cx} cy={layout.hub.cy} r={MINIMAP_NODE_RADIUS} />
      {layout.points.map(p => (
        <circle
          key={`n-${p.path}`}
          className={`minimap-node${p.onPath ? ' current' : ''}`}
          cx={p.cx} cy={p.cy} r={MINIMAP_NODE_RADIUS}
        />
      ))}
      {current && (
        <circle className="minimap-halo" cx={current.cx} cy={current.cy} r={MINIMAP_HALO_RADIUS} />
      )}
    </svg>
  )
}
