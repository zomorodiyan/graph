import { Link } from 'react-router-dom'
import { Structure, GraphInfo } from '@api'
import { getItemByPath } from '../../hooks/useGraph'

export interface BreadcrumbCrumb {
  label: string
  path: string
  isRoot?: boolean
  siblingCount?: number
  siblingIndex?: number
}

// ⛩ / Graph name / item / sub-item … for the current page. `buildPath`
// turns a dot-path into this graph's URL.
export function buildBreadcrumb(
  structure: Structure | undefined,
  graphs: GraphInfo[],
  graphName: string | undefined,
  path: string,
  buildPath: (itemPath: string) => string,
): BreadcrumbCrumb[] {
  const crumbs: BreadcrumbCrumb[] = []

  // Add "Graphs" link if we're in a specific graph
  if (graphName) {
    crumbs.push({ label: '⛩', path: '/', isRoot: true })
    const graphDisplay = graphs.find(g => g.name === graphName)?.display_name
      ?? graphName.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    crumbs.push({ label: graphDisplay, path: `/g/${graphName}` })
  } else {
    crumbs.push({ label: 'Home', path: '/' })
  }

  if (!path) return crumbs

  const parts = path.split('.')
  let currentPath = ''
  // Siblings at each level, attached to the PREVIOUS crumb (one level
  // higher) rather than the crumb it's actually about — e.g. the graph
  // name's dots show where the first path segment sits among the graph's
  // own top-level items, not a (meaningless) sibling count for the graph
  // name itself. This leaves the LAST crumb — the current item — with no
  // sibling dots via this mechanism; it gets renderViewPositionDots
  // instead (see BreadcrumbNav), a different kind of dot row entirely: how
  // many level-1 items are in the CURRENT list.
  let siblingContainer = structure?.structure ?? {}
  for (const part of parts) {
    const siblingKeys = Object.keys(siblingContainer)
    const prev = crumbs[crumbs.length - 1]
    prev.siblingCount = siblingKeys.length
    prev.siblingIndex = siblingKeys.indexOf(part)
    currentPath = currentPath ? `${currentPath}.${part}` : part
    const item = getItemByPath(structure, currentPath)
    crumbs.push({ label: item?.title || part, path: buildPath(currentPath) })
    siblingContainer = item?.children ?? {}
  }

  return crumbs
}

// Small dot row under a breadcrumb crumb — how many siblings it had at that
// level and roughly where among them, without needing a separate mini-map
// widget. Caps at MAX_CRUMB_DOTS so a level with dozens of items still
// renders as a compact strip rather than one dot per sibling; the current
// item's relative position is re-projected onto that capped strip rather
// than shown exactly, since exact position stops being legible past a
// handful of dots anyway. Still renders (one accent dot) even when there
// were no real siblings (siblingCount === 1) — "this level had exactly one
// choice, and it's the one you're on" is worth showing, not collapsing to
// nothing.
const MAX_CRUMB_DOTS = 5
function SiblingDots({ count, index }: { count?: number; index?: number }) {
  if (count == null || count < 1 || index == null || index < 0) return null
  const shown = Math.min(count, MAX_CRUMB_DOTS)
  const onIndex = Math.round((index / Math.max(1, count - 1)) * (shown - 1))
  return (
    <span className="dot-cluster">
      {Array.from({ length: shown }, (_, k) => (
        <span key={k} className={k === onIndex ? 'on' : undefined} />
      ))}
    </span>
  )
}

// Dot row under the LAST breadcrumb crumb (the current item/list) — one dot
// per level-1 item actually in view here. Static (plain gray, no accent) —
// deliberately not tracking/highlighting scroll position; just a count.
function ViewPositionDots({ count }: { count: number }) {
  if (count <= 1) return null
  return (
    <span className="dot-cluster">
      {Array.from({ length: count }, (_, k) => <span key={k} />)}
    </span>
  )
}

// Rendered twice by GraphView — a header copy (>=32rem, top of the page) and
// a footer copy (mobile, end of the item list); each is hidden via CSS at
// the other's breakpoint (.breadcrumb--header/.breadcrumb--footer).
export function BreadcrumbNav({ crumbs, variant, levelOneCount }: { crumbs: BreadcrumbCrumb[]; variant: 'header' | 'footer'; levelOneCount: number }) {
  return (
    <nav className={`breadcrumb breadcrumb--${variant}`}>
      {crumbs.flatMap((crumb, i) => {
        const last = i === crumbs.length - 1
        const els = []
        if (i > 0) els.push(<span key={`${crumb.path}-sep`} className="sep">/</span>)
        els.push(
          <span key={crumb.path} className="crumb-col">
            {last ? <span>{crumb.label}</span> : <Link to={crumb.path}>{crumb.label}</Link>}
            <SiblingDots count={crumb.siblingCount} index={crumb.siblingIndex} />
            {last && <ViewPositionDots count={levelOneCount} />}
          </span>,
        )
        return els
      })}
    </nav>
  )
}
