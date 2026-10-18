import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStructure } from '../hooks/useGraph'
import { FAVORITE_TAG, countTags, sortTags, tagLabel, tagsPath, tagColorIndex } from '../utils/tags'

// The tags used in one graph, with that graph's counts — shown at the bottom
// of its pages. Favorite first, then the auto tags (Today … history, money,
// schedule, people, routine — see utils/tags.ts), then the rest; a tag only
// appears while some item in this graph has it. Each opens its tag view.
function TagList({ graphName }: { graphName: string }) {
  const navigate = useNavigate()
  const { data: structure } = useStructure(graphName)
  const tagCounts = useMemo(() => countTags(structure ? [structure.structure] : []), [structure])
  const tags = sortTags(tagCounts)
  if (tags.length === 0) return null

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
