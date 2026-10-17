import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllStructures } from '../hooks/useGraph'
import { FAVORITE_TAG, countTags, sortTags, tagLabel, tagsPath, tagColorIndex } from '../utils/tags'

// Every tag across all graphs, each opening its cross-graph view
// (TagView.tsx) — shown at the bottom of graph pages. Favorite is always
// listed first, even before any item uses it, so it's one tap away; the auto
// tags (Today … history, money, schedule, people, routine — see
// utils/tags.ts) follow, each only while some item has it.
function TagList() {
  const navigate = useNavigate()
  const { graphs } = useAllStructures()
  const tagCounts = useMemo(() => {
    const counts = countTags(graphs.map(g => g.structure.structure))
    if (!counts.has(FAVORITE_TAG)) counts.set(FAVORITE_TAG, 0)
    return counts
  }, [graphs])
  const tags = sortTags(tagCounts)

  return (
    <div className="tags-list">
      {tags.map(tag => (
        <button
          key={tag}
          type="button"
          className={`tag-pill tag-${tagColorIndex(tag)} tag-pill-clickable${tag === FAVORITE_TAG ? ' tag-favorite' : ''}`}
          onClick={() => navigate(tagsPath([tag]))}
          title={`Show all items tagged ${tagLabel(tag)}`}
        >
          {tag === FAVORITE_TAG ? '★ favorite' : tagLabel(tag)} <span className="tag-count">{tagCounts.get(tag)}</span>
        </button>
      ))}
    </div>
  )
}

export default TagList
