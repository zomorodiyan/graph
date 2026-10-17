import { StructureItem } from '../api/localClient'
import { daysUntil } from './dates'

// The built-in tag behind the star button (see InlineItemEditor and
// GraphView's selection toolbar) — an ordinary tag in storage and in the
// text format ("#favorite"), just rendered as a star and listed first.
export const FAVORITE_TAG = 'favorite'

// Value tags: "$50" is an amount of money, "1.5h" a time estimate. Ordinary
// tags in storage, but grouped under the money/schedule auto tags below
// instead of being listed one by one.
const MONEY_RE = /^\$(\d+(?:\.\d+)?)$/
const HOURS_RE = /^(\d+(?:\.\d+)?)h$/
export function isValueTag(tag: string): boolean {
  return MONEY_RE.test(tag) || HOURS_RE.test(tag)
}

// Person tags: "@sara". Unlike value tags each one is meaningful on its own,
// so they're listed individually too — and also grouped under "people".
export function isPersonTag(tag: string): boolean {
  return tag.startsWith('@')
}

// Auto tags — never stored, derived from each item's date and value tags on
// every render. The "~" can't appear in a user tag (see validateTagsValue),
// so they can't collide with real ones. The date ranges count days from
// today: 3days/7days/30days are nested (each includes the shorter ones),
// long-term is everything later, history everything past.
const AUTO_TAG_LABELS: Record<string, string> = {
  '~today': 'Today',
  '~3days': '3days',
  '~7days': '7days',
  '~30days': '30days',
  '~longterm': 'long-term',
  '~history': 'history',
  '~money': 'money',
  '~schedule': 'schedule',
  '~people': 'people',
}
export const AUTO_TAGS = Object.keys(AUTO_TAG_LABELS)

export function tagLabel(tag: string): string {
  return AUTO_TAG_LABELS[tag] ?? tag
}

// Which tag view a pill opens: a value tag opens its group.
export function tagTarget(tag: string): string {
  return MONEY_RE.test(tag) ? '~money' : HOURS_RE.test(tag) ? '~schedule' : tag
}

function autoTagsFor(item: StructureItem): string[] {
  const out: string[] = []
  if (item.date) {
    const days = daysUntil(item.date)
    if (days < 0) out.push('~history')
    else {
      if (days === 0) out.push('~today')
      if (days <= 2) out.push('~3days')
      if (days <= 6) out.push('~7days')
      if (days <= 29) out.push('~30days')
      else out.push('~longterm')
    }
  }
  if (item.tags?.some(t => MONEY_RE.test(t))) out.push('~money')
  if (item.tags?.some(t => HOURS_RE.test(t))) out.push('~schedule')
  if (item.tags?.some(isPersonTag)) out.push('~people')
  return out
}

// An item's real tags plus whichever auto tags apply to it.
function tagsOf(item: StructureItem): string[] {
  return [...(item.tags ?? []), ...autoTagsFor(item)]
}

// How many items carry each tag (auto tags included), across one or more
// graphs' item trees.
export function countTags(trees: Record<string, StructureItem>[]): Map<string, number> {
  const counts = new Map<string, number>()
  const walk = (items: Record<string, StructureItem>) => {
    for (const item of Object.values(items)) {
      if (item.originalPath) continue
      for (const tag of tagsOf(item)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      if (item.children) walk(item.children)
    }
  }
  trees.forEach(walk)
  return counts
}

// The tags worth listing: favorite first, then the auto tags in their fixed
// order, then people, then the rest — each group by most-used, then
// alphabetically. Value tags are left out — money/schedule stand in for them.
export function sortTags(counts: Map<string, number>): string[] {
  const rank = (tag: string) =>
    tag === FAVORITE_TAG ? -1
      : AUTO_TAGS.includes(tag) ? AUTO_TAGS.indexOf(tag)
      : isPersonTag(tag) ? AUTO_TAGS.length
      : AUTO_TAGS.length + 1
  return [...counts]
    .filter(([tag]) => !isValueTag(tag))
    .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
}

// A graph's tree filtered down to the items carrying ANY of `tags`, keeping
// their connections: each match hangs under its nearest MATCHING ancestor
// (non-matching ones in between are skipped over), so a tag carried by
// every item reproduces the normal tree. The active tags' own pills are
// dropped from each item. Keys are synthetic (siblings here can come from
// different real parents, so real keys could collide) — realPaths maps each
// rendered path back; keyPrefix keeps keys unique when several graphs'
// results render side by side. Also totals the matches' money/hour tags.
export function filterTreeByTags(tree: Record<string, StructureItem>, tags: string[], keyPrefix = 't') {
  const realPaths = new Map<string, string>()
  let count = 0
  let money = 0
  let hours = 0
  const build = (items: Record<string, StructureItem>, realBase: string, viewBase: string) => {
    const out: Record<string, StructureItem> = {}
    for (const [key, item] of Object.entries(items)) {
      if (item.originalPath) continue
      const realPath = realBase ? `${realBase}.${key}` : key
      const itemTags = tagsOf(item)
      if (tags.some(t => itemTags.includes(t))) {
        const viewKey = `${keyPrefix}${count++}`
        const viewPath = viewBase ? `${viewBase}.${viewKey}` : viewKey
        realPaths.set(viewPath, realPath)
        for (const t of item.tags ?? []) {
          const m = t.match(MONEY_RE)
          if (m) money += Number(m[1])
          const h = t.match(HOURS_RE)
          if (h) hours += Number(h[1])
        }
        const shown = (item.tags ?? []).filter(t => !tags.includes(t))
        out[viewKey] = {
          ...item,
          tags: shown.length ? shown : undefined,
          children: item.children ? build(item.children, realPath, viewPath) : {},
        }
      } else if (item.children) {
        Object.assign(out, build(item.children, realPath, viewBase))
      }
    }
    return out
  }
  const items = build(tree, '', '')
  return { items, realPaths, count, money, hours }
}

// URL form of a tag set: /tags/a,b (no tag can contain a comma).
export function tagsPath(tags: string[]): string {
  return `/tags/${tags.map(encodeURIComponent).join(',')}`
}
