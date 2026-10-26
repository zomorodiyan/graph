import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Structure } from '@api'
import { MOBILE_QUERY } from '../../hooks/useBottomAnchor'
import ItemResults from '../../components/ItemResults'
import { ChevronDownIcon, SearchIcon } from '../../components/icons'
import {
  FAVORITE_TAG, countTags, sortTags, filterTree, hasAnyTag, matchesText, tagLabel, tagTarget, tagColorIndex,
} from '../../utils/tags'

// The search panel's state, owned by GraphView so an item's tag pill can
// open the panel on that tag. Kept while moving between pages of the same
// graph; reset when the graph changes.
export function useSearchPanel(graphName?: string) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  useEffect(() => {
    setOpen(false)
    setQuery('')
    setTags([])
  }, [graphName])
  // A value tag ($50, 1.5h) pulls in its whole group (money, schedule).
  const addTag = (tag: string) => {
    const t = tagTarget(tag)
    setTags(prev => (prev.includes(t) ? prev : [...prev, t]))
    setOpen(true)
  }
  return { open, setOpen, query, setQuery, tags, setTags, addTag }
}

export type SearchPanelState = ReturnType<typeof useSearchPanel>

// A query starting with a symbol (#work, @sara, $, #today) is about tags.
// "#" and "~" are just markers; "@" and "$" are part of the tags themselves.
const TAG_QUERY_RE = /^[^\p{L}\p{N}\s]/u
const tagMatches = (tag: string, text: string) =>
  tagLabel(tag).toLowerCase().includes(text) || (text.startsWith('$') && tag === '~money')
const pillLabel = (t: string) => (t === FAVORITE_TAG ? '★ favorite' : tagLabel(t))

interface SearchPanelProps {
  panel: SearchPanelState
  graphName: string
  structure?: Structure
  // The page's bottom anchor (see useBottomAnchor) — re-aligned on phones as
  // the results above the input change.
  anchorRef: React.RefObject<HTMLElement>
  onSaved: () => void
}

// Collapsible panel at the bottom of every graph page. Plain text searches
// this graph's items (titles and notes) as you type; a query starting with a
// symbol lists this graph's tags (auto tags included) instead, and picking
// one pulls in every item carrying it — several tags show items with ANY of
// them, and text typed next narrows those down. On phones the input sits at
// the bottom with the results above it (thumb reach); on desktop the input
// comes first.
function SearchPanel({ panel, graphName, structure, anchorRef, onSaved }: SearchPanelProps) {
  const { open, setOpen, query, setQuery, tags, setTags, addTag } = panel
  const inputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const tree = structure?.structure
  const tagCounts = useMemo(() => countTags(tree ? [tree] : []), [tree])
  const allTags = useMemo(() => sortTags(tagCounts), [tagCounts])

  const tagMode = TAG_QUERY_RE.test(query)
  const tagText = (/^[#~]/.test(query) ? query.slice(1) : query).trim().toLowerCase()
  const text = tagMode ? '' : query.trim().toLowerCase()
  const suggestions = allTags.filter(t => !tags.includes(t) && (!tagMode || tagMatches(t, tagText)))
  const showTags = open && (tagMode || (!text && tags.length === 0)) && suggestions.length > 0

  const result = useMemo(() => {
    if (!tree || (tags.length === 0 && !text)) return null
    return filterTree(tree, item => (tags.length === 0 || hasAnyTag(item, tags)) && (!text || matchesText(item, text)), 's')
  }, [tree, tags, text])

  const pickTag = (tag: string) => {
    addTag(tag)
    setQuery('')
  }
  const commitTagQuery = () => {
    const match = allTags.find(t => tagLabel(t).toLowerCase() === tagText) ?? suggestions[0]
    if (match) pickTag(match)
  }
  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag))

  // Phones: keep the input where the thumb is as the results above it grow
  // or shrink — at the bottom bar, or just above the keyboard while typing.
  const tagsKey = tags.join(',')
  useLayoutEffect(() => {
    if (!open || !window.matchMedia?.(MOBILE_QUERY).matches) return
    const input = inputRef.current
    const vv = window.visualViewport
    if (input && vv && document.activeElement === input && vv.height < window.innerHeight - 80) {
      window.scrollBy(0, input.getBoundingClientRect().bottom - (vv.offsetTop + vv.height) + 8)
    } else {
      anchorRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [open, query, tagsKey, result?.count])
  // Desktop: bring the panel into view when it opens or gains a tag (e.g.
  // from a tag pill at the top of a long page).
  useEffect(() => {
    if (open && !window.matchMedia?.(MOBILE_QUERY).matches) barRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, tagsKey])

  return (
    <div className={`search-panel${open ? ' open' : ''}`}>
      <div className="search-panel-bar" ref={barRef}>
        <SearchIcon />
        {tags.map(t => (
          <span key={t} className={`tag-pill tag-${tagColorIndex(t)} search-panel-chip`}>
            {pillLabel(t)}
            <button type="button" className="search-panel-chip-remove" onClick={() => removeTag(t)} title={`Remove ${tagLabel(t)}`}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="search-panel-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (tagMode) commitTagQuery()
              else e.currentTarget.blur()
            } else if (e.key === 'Backspace' && query === '' && tags.length > 0) {
              removeTag(tags[tags.length - 1])
            } else if (e.key === 'Escape') {
              if (query) setQuery('')
              else { setOpen(false); e.currentTarget.blur() }
            }
          }}
          placeholder={tags.length ? 'narrow down, or #tag…' : 'Search, or #tag…'}
          aria-label="Search this graph"
          enterKeyHint={tagMode ? 'done' : 'search'}
        />
        {result && (
          <span className="search-panel-count">
            {result.count} {result.count === 1 ? 'item' : 'items'}
            {result.money > 0 && ` · $${+result.money.toFixed(2)}`}
            {result.hours > 0 && ` · ${+result.hours.toFixed(2)}h`}
          </span>
        )}
        <button
          type="button"
          className="search-panel-toggle"
          onClick={() => setOpen(!open)}
          title={open ? 'Hide search' : 'Show search'}
          aria-label={open ? 'Hide search' : 'Show search'}
          aria-expanded={open}
        >
          <ChevronDownIcon />
        </button>
      </div>

      {showTags && (
        <div className="search-panel-tags">
          {suggestions.map(tag => (
            <button
              key={tag}
              type="button"
              className={`tag-pill tag-${tagColorIndex(tag)} tag-pill-clickable${tag === FAVORITE_TAG ? ' tag-favorite' : ''}`}
              // Keep the input's focus (and the phone keyboard) through the tap.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickTag(tag)}
              title={`Show all items tagged ${tagLabel(tag)}`}
            >
              {pillLabel(tag)} <span className="tag-count">{tagCounts.get(tag)}</span>
            </button>
          ))}
        </div>
      )}

      {open && result && (
        <div className="results">
          <ItemResults
            graphName={graphName}
            structure={structure!}
            items={result.items}
            realPaths={result.realPaths}
            onOpen={() => setOpen(false)}
            onSaved={onSaved}
            onTagClick={pickTag}
          />
          {result.count === 0 && <div className="empty-state">No matches</div>}
        </div>
      )}
    </div>
  )
}

export default SearchPanel
