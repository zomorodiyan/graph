import { StructureItem } from '../api/localClient'
import { ValueKind, itemValue } from './tags'

// The budget panel's model (see pages/graph/BudgetPanel.tsx): a page's
// items as spending out of a pool, game-style — a certain number of hours
// (or dollars) to hand out, each item holding some of them.
//
// Values come from value tags ("1.5h", "$50"). An item's own value is what
// it costs. When it has none, it costs whatever its descendants add up to
// (a rolled-up branch). When it has one AND its children carry values too,
// its own value is the budget those children spend from — "allocated" is
// what they've taken of it, and the item still counts as its own value
// toward the level above. The same rule makes the page item itself the pool
// for the page: its own value is what its children share.
export interface BudgetNode {
  path: string
  title: string
  own: number | null
  allocated: number
  total: number
  children: BudgetNode[]
  // Nothing valued here or underneath.
  empty: boolean
}

export function buildBudget(items: Record<string, StructureItem>, parentPath: string, kind: ValueKind): BudgetNode[] {
  return Object.entries(items).map(([key, item]) => {
    const path = parentPath ? `${parentPath}.${key}` : key
    const children = buildBudget(item.children ?? {}, path, kind)
    const own = itemValue(item, kind)
    const allocated = children.reduce((sum, c) => sum + c.total, 0)
    const total = own ?? allocated
    return { path, title: item.title ?? key, own, allocated, total, children, empty: own === null && allocated === 0 }
  })
}

// Whether anything in the tree carries a value of this kind.
export function hasValues(items: Record<string, StructureItem>, kind: ValueKind): boolean {
  return Object.values(items).some(item => itemValue(item, kind) !== null || hasValues(item.children ?? {}, kind))
}

// One token — what the +/- buttons move by: half hours, or a round amount
// of money sized to the pool (or, without one, to what's spent).
export function stepFor(kind: ValueKind, scale: number): number {
  if (kind === 'hours') return 0.5
  if (scale < 50) return 1
  if (scale < 200) return 5
  if (scale < 1000) return 10
  if (scale < 5000) return 50
  return 100
}

// The per-graph budget fields in the graph's metadata (see GraphInfo in
// localClient.ts) — the pool at the root of a graph, where there is no page
// item to carry a value tag.
export const BUDGET_META_KEY = { hours: 'hours_budget', money: 'money_budget' } as const
