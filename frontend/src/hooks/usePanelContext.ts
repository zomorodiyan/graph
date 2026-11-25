import { useQuery, useQueryClient } from '@tanstack/react-query'

// What the graph page's extra panels (budget, body — see BudgetPanel.tsx /
// BodyPanel.tsx) are showing, as a line or two of text for the agent's
// "current view" context. Kept in the React Query cache, like
// useHighlights.ts, because the panels live under GraphView while the chat
// that reads it is a sibling tree (AgentChat.tsx). Each panel sets its own
// slot while mounted and clears it when it goes away.
export type PanelId = 'budget' | 'body'
const PANEL_IDS: PanelId[] = ['budget', 'body']

function panelKey(graphName: string | undefined, id: PanelId) {
  return ['view-panel', graphName, id] as const
}

export function usePanelContext(graphName: string | undefined, id: PanelId) {
  const queryClient = useQueryClient()
  const { data = '' } = useQuery({
    queryKey: panelKey(graphName, id),
    queryFn: () => '',
    initialData: '',
    staleTime: Infinity,
  })
  const set = (text: string) => {
    queryClient.setQueryData(panelKey(graphName, id), text)
  }
  return [data, set] as const
}

// Every panel's text, joined — empty when none is open.
export function usePanelContexts(graphName: string | undefined): string {
  const texts = PANEL_IDS.map(id => usePanelContext(graphName, id)[0])
  return texts.filter(Boolean).join('\n')
}
