import { BODY_MUSCLES, BODY_VIEWBOX } from '../data/bodyFront'
import { BODY_PARTS, BodyPart, FULL_BODY, partAnchor } from '../utils/body'

// The anatomy figure (see data/bodyFront.ts): each part's muscles in one
// group — tinted when the part has items, solid when it's selected — and a
// small label where an empty part is. Standing, or turned on its back with
// the head to the left for the wide layout (see BodyPanel.tsx). Tapping a
// part with items selects it.

interface BodyFigureProps {
  // Ids of the parts with items, and the selected one.
  present: Set<string>
  selected: string | null
  lying: boolean
  onPartClick: (part: BodyPart) => void
}

function BodyFigure({ present, selected, lying, onPartClick }: BodyFigureProps) {
  const [vx, vy, vw, vh] = BODY_VIEWBOX
  const parts = BODY_PARTS.filter(p => p.id !== FULL_BODY)
  // Whole-body items light the whole figure.
  const has = (p: BodyPart) => present.has(p.id) || present.has(FULL_BODY)
  const sel = (p: BodyPart) => selected === p.id || selected === FULL_BODY

  const groups = parts.map(part => (
    <g
      key={part.id}
      data-part={part.id}
      className={`${has(part) ? 'has' : ''}${sel(part) ? ' sel' : ''}`}
      role={has(part) ? 'button' : undefined}
      tabIndex={has(part) ? 0 : undefined}
      aria-label={part.label}
      onClick={() => onPartClick(part)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPartClick(part) } }}
    >
      <title>{part.label}</title>
      {part.muscles.flatMap(slug => (BODY_MUSCLES[slug]?.paths ?? []).map((d, i) => <path key={`${slug}${i}`} d={d} className="mus" />))}
    </g>
  ))
  const labels = parts.filter(p => !has(p)).map(p => {
    const [x, y] = partAnchor(p, lying)
    return <text key={p.id} x={x} y={y} className="body-plabel">{p.label}</text>
  })

  if (!lying) {
    return (
      <svg className="body-figure standing" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Body">
        {groups}
        {labels}
      </svg>
    )
  }
  // A quarter turn to the left: (x, y) -> (y - vy, vx + vw - x), the same
  // mapping utils/body.ts's toLying uses for the anchors.
  return (
    <svg className="body-figure lying" viewBox={`0 0 ${vh} ${vw}`} role="img" aria-label="Body, lying down">
      <g transform={`translate(${-vy} ${vx + vw}) rotate(-90)`}>{groups}</g>
      {labels}
    </svg>
  )
}

export default BodyFigure
