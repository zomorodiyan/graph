import type { StructureItem } from '../api/localClient'

// Turns what's on screen into something that can be read aloud and still
// pictured: every visible item gets a short spoken label — top level a, b,
// c; their children a1, a2, b1; grandchildren a1.1, a1.2 — and the script
// first lists the top level, then goes into each item that has children
// ("Under a, Plan the trip: a1, Book flights. a2, Hotel."). Follows the
// view's own settings: depth (2 or 3 levels) and whether notes are shown.
// The labels also go to the agent in voice mode, so "add one under b2"
// means something (see AgentChat.tsx).

export interface ReadLabel { label: string; path: string; title: string }

export interface ReadView { script: string; labels: ReadLabel[] }

function letter(i: number): string {
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(97 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function spokenDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

function itemLine(label: string, item: StructureItem, notes: boolean): string {
  let line = `${label}, ${item.title ?? ''}`
  if (item.date) line += `, ${spokenDate(item.date)}`
  line += '.'
  if (notes && item.context) line += ` Note: ${item.context.replace(/\s+/g, ' ').trim()}.`
  return line
}

export function buildReadView(
  items: Record<string, StructureItem>,
  parentPath: string,
  depth: number,
  notes: boolean,
): ReadView {
  const levels = depth === 0 ? 3 : depth
  const labels: ReadLabel[] = []
  const top = Object.entries(items)
  if (!top.length) return { script: 'Nothing here yet.', labels }

  const pathOf = (parent: string, key: string) => (parent ? `${parent}.${key}` : key)
  const sentences: string[] = [`${top.length === 1 ? 'One item' : `${top.length} items`} here.`]

  // Level 1
  const level1 = top.map(([key, item], i) => {
    const label = letter(i)
    const path = pathOf(parentPath, key)
    labels.push({ label, path, title: item.title ?? '' })
    sentences.push(itemLine(label, item, notes))
    return { label, path, item }
  })

  // Level 2
  if (levels >= 2) {
    const level2: { label: string; path: string; item: StructureItem }[] = []
    for (const parent of level1) {
      const kids = Object.entries(parent.item.children ?? {})
      if (!kids.length) continue
      const lines = kids.map(([key, child], i) => {
        const label = `${parent.label}${i + 1}`
        const path = pathOf(parent.path, key)
        labels.push({ label, path, title: child.title ?? '' })
        level2.push({ label, path, item: child })
        return itemLine(label, child, notes)
      })
      sentences.push(`Under ${parent.label}, ${parent.item.title ?? ''}: ${lines.join(' ')}`)
    }

    // Level 3
    if (levels >= 3) {
      for (const parent of level2) {
        const kids = Object.entries(parent.item.children ?? {})
        if (!kids.length) continue
        const lines = kids.map(([key, child], i) => {
          const label = `${parent.label}.${i + 1}`
          const path = pathOf(parent.path, key)
          labels.push({ label, path, title: child.title ?? '' })
          return itemLine(label, child, notes)
        })
        sentences.push(`Under ${parent.label}, ${parent.item.title ?? ''}: ${lines.join(' ')}`)
      }
    }
  }

  return { script: sentences.join(' '), labels }
}

// The graphs list, read the same way (one level).
export function buildReadGraphs(graphs: { name: string; display_name: string }[]): ReadView {
  if (!graphs.length) return { script: 'No graphs yet.', labels: [] }
  const labels = graphs.map((g, i) => ({ label: letter(i), path: g.name, title: g.display_name }))
  const script = `${graphs.length === 1 ? 'One graph' : `${graphs.length} graphs`}. ${labels.map(l => `${l.label}, ${l.title}.`).join(' ')}`
  return { script, labels }
}

// For the agent's system prompt in voice mode.
export function labelsForAgent(labels: ReadLabel[]): string {
  if (!labels.length) return ''
  return `Spoken labels for what is on screen right now — the user may refer to items by these (e.g. "b2"); each maps to a real path:\n${labels.map(l => `- ${l.label} = ${l.title} ⟨${l.path}⟩`).join('\n')}`
}
