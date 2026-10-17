import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Structure } from '@api'
import { useAllStructures, getItemByPath } from '../hooks/useGraph'
import { useViewOptions } from '../hooks/useViewOptions'
import Section, { tagColorIndex } from '../components/Section'
import { FAVORITE_TAG, countTags, sortTags, filterTreeByTags, tagLabel, tagTarget, tagsPath } from '../utils/tags'

// /tags/a,b — every item carrying ANY of the active tags, across all graphs,
// grouped by graph. Each group is that graph's tree filtered to the tags
// (see filterTreeByTags), rendered read-only through the normal Section
// component. Clicking an item opens it in its graph (browser back returns
// here); clicking a tag pill on an item adds that tag to the filter.
function TagView() {
  const { tags: tagsParam = '' } = useParams()
  const activeTags = useMemo(() => tagsParam.split(',').filter(Boolean), [tagsParam])
  const navigate = useNavigate()
  const { graphs, isLoading } = useAllStructures()
  const { depth, viewMode, minimalView } = useViewOptions()

  const [contextOverrides, setContextOverrides] = useState<Map<string, boolean>>(new Map())
  const toggleContextOverride = (path: string, shown: boolean) =>
    setContextOverrides(prev => new Map(prev).set(path, shown))

  const [draft, setDraft] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const tagCounts = useMemo(() => countTags(graphs.map(g => g.structure.structure)), [graphs])
  const allTags = useMemo(() => sortTags(tagCounts), [tagCounts])
  const groups = useMemo(
    () => graphs
      .map(({ graph, structure }, i) => ({ graph, structure, ...filterTreeByTags(structure.structure, activeTags, `g${i}t`) }))
      .filter(g => g.count > 0),
    [graphs, activeTags],
  )
  const total = groups.reduce((n, g) => n + g.count, 0)
  const money = groups.reduce((n, g) => n + g.money, 0)
  const hours = groups.reduce((n, g) => n + g.hours, 0)

  // Replace (not push) so back still leaves the tag view in one step.
  const setTags = (next: string[]) =>
    next.length ? navigate(tagsPath(next), { replace: true }) : navigate('/')
  const addTag = (tag: string) => {
    const t = tagTarget(tag)
    if (!activeTags.includes(t)) setTags([...activeTags, t])
  }
  const removeTag = (tag: string) => setTags(activeTags.filter(t => t !== tag))

  // Same target as a click in the graph itself: into the item if it has
  // children, otherwise its parent page.
  const openItem = (graphName: string, structure: Structure, realPath: string) => {
    const item = getItemByPath(structure, realPath)
    const target = item?.children && Object.keys(item.children).length > 0
      ? realPath
      : realPath.split('.').slice(0, -1).join('.')
    navigate(`/g/${graphName}${target ? `/${target.replace(/\./g, '/')}` : ''}`)
  }

  const query = draft.trim().replace(/^#/, '').toLowerCase()
  const suggestions = allTags.filter(t => !activeTags.includes(t) && tagLabel(t).toLowerCase().includes(query))
  const commitDraft = () => {
    const match = allTags.find(t => tagLabel(t).toLowerCase() === query) ?? suggestions[0]
    if (query && match) addTag(match)
    setDraft('')
  }
  const pillLabel = (t: string) => (t === FAVORITE_TAG ? '★ favorite' : tagLabel(t))

  return (
    <div className="graph-container">
      <div className="items-grid">
        <div className="tag-view">
          <div className="tag-view-header">
            {activeTags.map(t => (
              <span key={t} className={`tag-pill tag-${tagColorIndex(t)} tag-view-chip`}>
                {pillLabel(t)}
                <button type="button" className="tag-view-chip-remove" onClick={() => removeTag(t)} title={`Remove ${tagLabel(t)}`}>×</button>
              </span>
            ))}
            <input
              ref={inputRef}
              className="tag-view-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => { setInputFocused(false); setDraft('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitDraft(); e.currentTarget.blur() }
                else if (e.key === 'Backspace' && draft === '' && activeTags.length > 1) removeTag(activeTags[activeTags.length - 1])
                else if (e.key === 'Escape') e.currentTarget.blur()
              }}
              placeholder="add tag…"
              aria-label="Add tag"
            />
            <span className="tag-view-count">
              {total} {total === 1 ? 'item' : 'items'}
              {money > 0 && ` · $${+money.toFixed(2)}`}
              {hours > 0 && ` · ${+hours.toFixed(2)}h`}
            </span>
            <button type="button" className="tag-view-close" onClick={() => navigate('/')} title="Back to graphs">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {inputFocused && suggestions.length > 0 && (
            <div className="tag-view-suggestions">
              {suggestions.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`tag-pill tag-${tagColorIndex(t)} tag-pill-clickable`}
                  // Keep the input focused through the click (blur would
                  // otherwise unmount this list before the click lands),
                  // then drop focus so the list closes once the tag is added.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { addTag(t); inputRef.current?.blur() }}
                >
                  {pillLabel(t)} <span className="tag-view-suggestion-count">{tagCounts.get(t)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {groups.map(({ graph, structure, items, realPaths }) => {
          const handleClick = (viewPath: string) => {
            const realPath = realPaths.get(viewPath)
            if (realPath) openItem(graph.name, structure, realPath)
          }
          return (
            <div key={graph.name} className="tag-view-group">
              <Link to={`/g/${graph.name}`} className="tag-view-graph">{graph.display_name}</Link>
              {Object.entries(items).map(([key, item]) => (
                <div key={key} className="section-wrapper">
                  <Section
                    itemKey={key}
                    item={item}
                    parentPath=""
                    onItemClick={handleClick}
                    onItemEnter={handleClick}
                    onEditClick={() => {}}
                    isTimeView
                    showContext={viewMode === 'context' && !minimalView}
                    contextOverrides={contextOverrides}
                    onToggleContext={toggleContextOverride}
                    minimal={minimalView}
                    depth={depth === 0 ? 3 : depth}
                    onTagClick={addTag}
                  />
                </div>
              ))}
            </div>
          )
        })}
        {!isLoading && groups.length === 0 && (
          <div className="empty-state">No items with {activeTags.length > 1 ? 'these tags' : 'this tag'}</div>
        )}
      </div>
    </div>
  )
}

export default TagView
