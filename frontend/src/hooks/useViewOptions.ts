import { useQuery, useQueryClient } from '@tanstack/react-query'

// Depth/note-view state for the currently open graph — global (not per-graph,
// unlike useHighlights.ts), same as it always was: one "active-depth" /
// "active-view-mode" / "active-minimal-view" localStorage value shared across
// every graph. Centralized here (React Query cache, same technique as
// useHighlights.ts) so GraphView.tsx and AgentChat.tsx — sibling component
// trees — can both read and write it without prop-drilling; GraphView still
// owns what these values DO (Section props, context-injection closures),
// AgentChat owns rendering the actual depth/note buttons.
export type Depth = 0 | 2 | 3
export type ViewMode = 'default' | 'context'

const DEPTH_KEY = ['view-depth'] as const
const VIEW_MODE_KEY = ['view-mode'] as const
const MINIMAL_KEY = ['view-minimal'] as const

function readDepth(): Depth {
  try {
    const saved = localStorage.getItem('active-depth')
    if (saved !== null) {
      const parsed = Number(saved)
      if ([0, 2, 3].includes(parsed)) return parsed as Depth
    }
  } catch {}
  return 3
}
function readViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem('active-view-mode')
    if (saved === 'default' || saved === 'context') return saved
  } catch {}
  return 'context'
}
function readMinimalView(): boolean {
  try {
    return localStorage.getItem('active-minimal-view') === 'true'
  } catch {
    return false
  }
}

export function useViewOptions() {
  const queryClient = useQueryClient()

  const { data: depth = 3 } = useQuery({
    queryKey: DEPTH_KEY,
    queryFn: () => readDepth(),
    initialData: readDepth,
    staleTime: Infinity,
  })
  const { data: viewMode = 'context' } = useQuery({
    queryKey: VIEW_MODE_KEY,
    queryFn: () => readViewMode(),
    initialData: readViewMode,
    staleTime: Infinity,
  })
  const { data: minimalView = false } = useQuery({
    queryKey: MINIMAL_KEY,
    queryFn: () => readMinimalView(),
    initialData: readMinimalView,
    staleTime: Infinity,
  })

  function setDepth(next: Depth | ((prev: Depth) => Depth)) {
    queryClient.setQueryData(DEPTH_KEY, (prev: Depth = 3) => {
      const value = typeof next === 'function' ? (next as (p: Depth) => Depth)(prev) : next
      localStorage.setItem('active-depth', String(value))
      return value
    })
  }
  function setViewMode(next: ViewMode | ((prev: ViewMode) => ViewMode)) {
    queryClient.setQueryData(VIEW_MODE_KEY, (prev: ViewMode = 'context') => {
      const value = typeof next === 'function' ? (next as (p: ViewMode) => ViewMode)(prev) : next
      localStorage.setItem('active-view-mode', value)
      return value
    })
  }
  function setMinimalView(next: boolean | ((prev: boolean) => boolean)) {
    queryClient.setQueryData(MINIMAL_KEY, (prev: boolean = false) => {
      const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next
      localStorage.setItem('active-minimal-view', String(value))
      return value
    })
  }

  return { depth, viewMode, minimalView, setDepth, setViewMode, setMinimalView }
}
