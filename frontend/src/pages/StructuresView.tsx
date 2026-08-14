import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useColorScheme } from '../context/ColorSchemeContext'
import { createGraph, fetchStructureText, updateGraph, deleteGraph, GraphInfo } from '@api'
import { useGraphs } from '../hooks/useGraph'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { loadSyncStatus } from '../hooks/useSyncManager'
import { getPAT } from '../api/gistClient'
import Notification from '../components/Notification'
import InlineGraphEditor from '../components/InlineGraphEditor'
import { GRAPH_TEMPLATES, GraphTemplate, resolveTemplateDates } from '../data/graphTemplates'
import './StructuresView.css'

// Icons for different graph types (randomly assigned based on name hash)
const GRAPH_ICONS = ['📊', '🎯', '📚', '💼', '🏠', '🌟', '🚀', '💡', '🎨', '🔬']

function getIconForGraph(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return GRAPH_ICONS[hash % GRAPH_ICONS.length]
}

function StructuresView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toggleColorScheme } = useColorScheme()
  const { data: graphs = [], isLoading, error } = useGraphs()

  const [inlineCreate, setInlineCreate] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [inlineEditGraph, setInlineEditGraph] = useState<GraphInfo | null>(null)
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)
  const [copiedGraph, setCopiedGraph] = useState<string | null>(null)

  useModalBackButton(inlineCreate, () => setInlineCreate(false))
  useModalBackButton(showTemplates, () => setShowTemplates(false))
  useModalBackButton(Boolean(inlineEditGraph), () => setInlineEditGraph(null))

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), type === 'error' ? 8000 : 3000)
  }

  const handleGraphClick = (graphName: string) => {
    navigate(`/g/${graphName}`)
  }

  // Generate unique graph name from a base (defaults to "new_graph")
  const generateUniqueName = (baseName = 'new_graph') => {
    const existingNames = new Set(graphs.map(g => g.name))
    if (!existingNames.has(baseName)) return baseName
    let counter = 2
    while (existingNames.has(`${baseName}_${counter}`)) counter++
    return `${baseName}_${counter}`
  }

  // Create a graph from one of the built-in sample templates
  const handleCreateFromTemplate = async (tpl: GraphTemplate) => {
    const graphName = generateUniqueName(tpl.name)
    try {
      await createGraph(graphName, tpl.description, resolveTemplateDates(tpl.structure))
      await updateGraph(graphName, { display_name: tpl.displayName })
      showNotification(`Created "${tpl.displayName}"!`)
      setShowTemplates(false)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    }
  }

  const handleCreateGraph = async (displayName: string, description: string) => {
    const graphName = displayName
      ? displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '') || generateUniqueName()
      : generateUniqueName()
    try {
      await createGraph(graphName, description)
      showNotification(`Created "${graphName}"!`)
      setInlineCreate(false)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    }
  }

  const handleCopyGraph = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    try {
      // serializeStructure output is already the canonical clipboard format
      const text = (await fetchStructureText(name)).trimEnd()
      await navigator.clipboard.writeText(text)
      setCopiedGraph(name)
      setTimeout(() => setCopiedGraph(null), 2000)
    } catch (err) {
      showNotification((err as Error).message, 'error')
    }
  }

  const handleSaveEdit = async (graph: GraphInfo, displayName: string, description: string) => {
    try {
      await updateGraph(graph.name, {
        display_name: displayName,
        description,
        icon: graph.icon || getIconForGraph(graph.name),
      })
      showNotification('Graph updated!')
      setInlineEditGraph(null)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    }
  }

  const handleDeleteGraph = async (graph: GraphInfo) => {
    if (!confirm(`Delete "${graph.display_name}"? This cannot be undone.`)) return
    try {
      await deleteGraph(graph.name)
      showNotification('Graph deleted!')
      setInlineEditGraph(null)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    }
  }

  // Create graph from clipboard
  const handlePasteNewGraph = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        showNotification('Clipboard is empty', 'error')
        return
      }
      const graphName = generateUniqueName()
      await createGraph(graphName, '', text)
      showNotification(`Created "${graphName}" from clipboard!`)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="structures-view">
        <div className="loading">Loading graphs...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="structures-view">
        <div className="error">Error: {(error as Error).message}</div>
      </div>
    )
  }

  return (
    <div className="structures-view" onClick={showTemplates ? () => setShowTemplates(false) : undefined}>
      {/* Header */}
      <header className="structures-header">
        <div className="title-row">
          <h1 onClick={toggleColorScheme} style={{ cursor: 'pointer', userSelect: 'none' }}>Knowledge Graphs</h1>
        </div>
      </header>

      {/* Graphs grid */}
      <div className="graphs-container">
        {/* Add new graph card — inline create editor, sample cards, or the add card */}
        {showTemplates ? (
          <>
            <div className="graph-card sample-header" onClick={e => e.stopPropagation()}>
              <div className="card-content">
                <h3 className="graph-name">Start from a sample</h3>
              </div>
            </div>
            {GRAPH_TEMPLATES.map((tpl, index) => {
              const COLORS = ['green', 'blue', 'purple', 'brown']
              const color = COLORS[index % COLORS.length]
              const colorClass = index % 2 === 0 ? `color-${color}-alt` : `color-${color}`
              return (
                <div
                  key={tpl.name}
                  className="graph-card"
                  onClick={(e) => { e.stopPropagation(); handleCreateFromTemplate(tpl) }}
                >
                  <div className="card-content">
                    <h3 className={`graph-name ${colorClass}`}>{tpl.displayName}</h3>
                    {tpl.description && <p className="graph-description">{tpl.description}</p>}
                  </div>
                </div>
              )
            })}
          </>
        ) : inlineCreate ? (
          <div className="graph-card graph-card--editing">
            <InlineGraphEditor
              displayName=""
              description=""
              onSave={handleCreateGraph}
              onCancel={() => setInlineCreate(false)}
            />
          </div>
        ) : (
          <div
            className="graph-card add-card"
            onClick={() => setInlineCreate(true)}
          >
            <div
              className="card-edit-zone"
              onClick={(e) => { e.stopPropagation(); setShowTemplates(true) }}
              title="Browse sample graphs"
            >
              <span className="zone-icon zone-icon--templates" />
            </div>
            <div className="add-content">
              <span className="add-icon">+</span>
              <span className="add-text">New Graph</span>
            </div>
            <div
              className="card-action-zone"
              onClick={(e) => { e.stopPropagation(); handlePasteNewGraph(e) }}
              title="Paste graph from clipboard"
            >
              <span className="zone-icon zone-icon--paste" />
            </div>
          </div>
        )}

        {/* Existing graphs */}
        {graphs.map((graph, index) => {
          const COLORS = ['green', 'blue', 'purple', 'brown']
          const color = COLORS[index % COLORS.length]
          const colorClass = index % 2 === 0 ? `color-${color}-alt` : `color-${color}`

          if (inlineEditGraph?.name === graph.name) {
            return (
              <div key={graph.name} className="graph-card graph-card--editing">
                <InlineGraphEditor
                  displayName={graph.display_name}
                  description={graph.description || ''}
                  onSave={(displayName, description) => handleSaveEdit(graph, displayName, description)}
                  onCancel={() => setInlineEditGraph(null)}
                  onDelete={() => handleDeleteGraph(graph)}
                />
              </div>
            )
          }

          // Read straight from localStorage rather than through useSyncManager
          // (the sync button — and the only call to that hook — now lives in
          // AgentChat.tsx; see its own comment). A sync there invalidates the
          // ['graphs'] query, which re-renders this component and re-reads
          // fresh values here, so badges still stay current.
          const syncStatus = loadSyncStatus(graph.name)
          const hasLocalChanges = syncStatus && new Date(graph.modified_at) > new Date(syncStatus.lastSync)
          const badgeSymbol = syncStatus?.error ? '✕'
            : hasLocalChanges ? '•'
            : syncStatus ? '✓'
            : null
          const badgeClass = syncStatus?.error ? 'error'
            : hasLocalChanges ? 'pending'
            : 'none'

          return (
            <div
              key={graph.name}
              className="graph-card"
              onClick={() => handleGraphClick(graph.name)}
            >
              <div
                className="card-edit-zone"
                onClick={(e) => { e.stopPropagation(); setInlineEditGraph(graph) }}
                title="Edit graph"
              >
                <span className="zone-icon zone-icon--edit" />
              </div>
              <div className="card-content">
                <h3 className={`graph-name ${colorClass}`}>
                  {badgeSymbol && getPAT() && (
                    <span
                      className={`sync-badge sync-badge--${badgeClass}`}
                      title={syncStatus?.error ?? (syncStatus ? `Last sync: ${new Date(syncStatus.lastSync).toLocaleString()}` : '')}
                    >{badgeSymbol}</span>
                  )}
                  {graph.display_name}
                </h3>
                {graph.description && (
                  <p className="graph-description">{graph.description}</p>
                )}
              </div>
              <div
                className="card-action-zone"
                onClick={(e) => handleCopyGraph(e, graph.name)}
                title="Copy graph"
              >
                {copiedGraph === graph.name ? <span className="copy-check">✔</span> : <span className="copy-handle" />}
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      {graphs.length === 0 && (
        <div className="empty-state">
          <p>No graphs yet. Create your first knowledge graph!</p>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <Notification message={notification.message} type={notification.type} />
      )}
    </div>
  )
}

export default StructuresView
