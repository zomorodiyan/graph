import { useQuery, useQueryClient } from '@tanstack/react-query'

// Two-way "point at an item" channel between the user and the agent chat —
// separate from editing (see agentClient.ts's update_item/add_item). Stored
// in the React Query cache (not localStorage — this is ephemeral UI state,
// not graph data) so GraphView/Section and AgentChat, which live in sibling
// component trees, both read and write the same set without prop-drilling
// across the app root. Paths are absolute dot-paths from the graph root —
// the same format Section.tsx already constructs itemPath/childPath/grandPath
// in, and the same format the agent's tools address items by.
function userHighlightsKey(graphName: string | undefined) {
  return ['user-highlights', graphName] as const
}
function agentHighlightsKey(graphName: string | undefined) {
  return ['agent-highlights', graphName] as const
}
// Separate from agentHighlights ("look at this") — items the agent has asked
// to delete but hasn't been confirmed yet (see request_delete_items in
// agentClient.ts). Its own channel so a delete proposal renders with its own
// (red) ring regardless of whatever the agent/user were already pointing at,
// and clears independently once the user confirms or rejects.
function agentDeletePendingKey(graphName: string | undefined) {
  return ['agent-delete-pending', graphName] as const
}

export function useHighlights(graphName: string | undefined) {
  const queryClient = useQueryClient()

  const { data: userHighlights = [] } = useQuery({
    queryKey: userHighlightsKey(graphName),
    queryFn: () => [] as string[],
    initialData: [] as string[],
    staleTime: Infinity,
    enabled: Boolean(graphName),
  })
  const { data: agentHighlights = [] } = useQuery({
    queryKey: agentHighlightsKey(graphName),
    queryFn: () => [] as string[],
    initialData: [] as string[],
    staleTime: Infinity,
    enabled: Boolean(graphName),
  })
  const { data: agentDeletePending = [] } = useQuery({
    queryKey: agentDeletePendingKey(graphName),
    queryFn: () => [] as string[],
    initialData: [] as string[],
    staleTime: Infinity,
    enabled: Boolean(graphName),
  })

  function toggleUserHighlight(path: string) {
    queryClient.setQueryData(userHighlightsKey(graphName), (prev: string[] = []) =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])
  }

  // Used after a bulk action (e.g. deleting the selection) consumes every
  // currently-highlighted path at once — nothing left to individually toggle off.
  function clearUserHighlights() {
    queryClient.setQueryData(userHighlightsKey(graphName), [] as string[])
  }

  // Agent's highlight tool replaces the whole set each call (see
  // agentClient.ts) rather than toggling one at a time — it's describing
  // "here's what I'm pointing at right now", not accumulating a selection.
  function setAgentHighlights(paths: string[]) {
    queryClient.setQueryData(agentHighlightsKey(graphName), paths)
  }

  // Replaces the whole pending-delete set each call, same "here's what I'm
  // pointing at right now" semantics as setAgentHighlights.
  function setAgentDeletePending(paths: string[]) {
    queryClient.setQueryData(agentDeletePendingKey(graphName), paths)
  }
  // User confirmed or rejected — either way the proposal is resolved, so the
  // ring goes away. Confirming also actually deletes the items (GraphView's
  // job); this just clears the marker.
  function clearAgentDeletePending() {
    queryClient.setQueryData(agentDeletePendingKey(graphName), [] as string[])
  }

  return {
    userHighlights, agentHighlights, agentDeletePending,
    toggleUserHighlight, clearUserHighlights, setAgentHighlights,
    setAgentDeletePending, clearAgentDeletePending,
  }
}
