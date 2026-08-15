import { useMemo } from 'react'
import { Structure } from '@api'
import { buildMiniMapLayout, MINIMAP_WIDTH, MINIMAP_NODE_RADIUS, MINIMAP_HALO_RADIUS } from '../utils/graphMinimapLayout'

interface GraphMinimapProps {
  structure?: Structure
  currentPath: string
}

// Passive schematic of the current path as a chain of arcs, sitting above
// the breadcrumb (see .bottom-overlay in App.css) — no click/tap handling,
// no hit-testing. Mobile-only via a CSS @media rule on .graph-minimap, not a
// JS isMobile check: there's no behavioral difference between mobile/desktop
// here, only visibility, so it keys off the same viewport-width breakpoint
// the rest of the bottom chrome already uses rather than the unrelated
// touch-capability flag GraphView uses for interaction differences.
export default function GraphMinimap({ structure, currentPath }: GraphMinimapProps) {
  const layout = useMemo(
    () => (structure ? buildMiniMapLayout(structure, currentPath) : null),
    [structure, currentPath],
  )

  if (!layout || layout.arcs.length === 0) return null

  // The spine's last point is the current item itself, not just an
  // ancestor on the way there — the halo marks that distinction (every
  // spine point already renders in the accent color via `.current`).
  const current = layout.spine[layout.spine.length - 1] ?? null

  return (
    <svg
      className="graph-minimap"
      width={MINIMAP_WIDTH}
      height={layout.height}
      viewBox={`0 0 ${MINIMAP_WIDTH} ${layout.height}`}
      aria-hidden="true"
    >
      {layout.arcs.map((arc, i) => (
        <path key={`g-${i}`} className="minimap-arc-guide" d={arc.guidePath} />
      ))}
      {layout.spine.length > 1 && (
        <polyline className="minimap-spine" points={layout.spine.map(p => `${p.x},${p.y}`).join(' ')} />
      )}
      {layout.arcs.flatMap((arc, ai) =>
        arc.nodes.map((n, ni) => (
          <circle
            key={`n-${ai}-${ni}`}
            className={`minimap-node${n.selected ? ' current' : ''}`}
            cx={n.x} cy={n.y} r={MINIMAP_NODE_RADIUS}
          />
        )),
      )}
      {current && (
        <circle className="minimap-halo" cx={current.x} cy={current.y} r={MINIMAP_HALO_RADIUS} />
      )}
    </svg>
  )
}
