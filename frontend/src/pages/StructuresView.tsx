import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '../context/ThemeContext'
import { createGraph, fetchStructureText, updateGraph, deleteGraph, GraphInfo } from '@api'
import { useGraphs } from '../hooks/useGraph'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useSwipeNavigation } from '../hooks/useSwipeNavigation'
import Notification from '../components/Notification'
import InlineGraphEditor from '../components/InlineGraphEditor'
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
  const { toggleTheme } = useTheme()
  const { data: graphs = [], isLoading, error } = useGraphs()

  const [inlineCreate, setInlineCreate] = useState(false)
  const [inlineEditGraph, setInlineEditGraph] = useState<GraphInfo | null>(null)
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  useModalBackButton(inlineCreate, () => setInlineCreate(false))
  useModalBackButton(Boolean(inlineEditGraph), () => setInlineEditGraph(null))

  // Enable swipe navigation (back/forward)
  useSwipeNavigation()

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const handleGraphClick = (graphName: string) => {
    navigate(`/g/${graphName}`)
  }

  // Generate unique graph name
  const generateUniqueName = () => {
    const existingNames = new Set(graphs.map(g => g.name))
    let baseName = 'new_graph'
    if (!existingNames.has(baseName)) return baseName
    let counter = 2
    while (existingNames.has(`${baseName}_${counter}`)) counter++
    return `${baseName}_${counter}`
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
      const raw = await fetchStructureText(name)
      const lines = raw.split('\n')
      const structureIdx = lines.findIndex(l => l === 'structure')
      const bodyLines = structureIdx >= 0 ? lines.slice(structureIdx + 1) : lines
      const text = bodyLines
        .map(l => {
          const deindented = l.startsWith('  ') ? l.slice(2) : l
          const ctxMatch = deindented.match(/^(\s*)context: (.+)$/)
          if (ctxMatch) {
            const escaped = ctxMatch[2].replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            return `${ctxMatch[1]}"${escaped}"`
          }
          return deindented
        })
        .join('\n')
        .trimEnd()
      await navigator.clipboard.writeText(text)
      showNotification('Copied structure!')
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
    <div className="structures-view">
      {/* Top buttons */}
      <div className="top-buttons">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" />
      </div>

      {/* Header */}
      <header className="structures-header">
        <div className="title-row">
          <h1>Knowledge Graphs</h1>
        </div>
      </header>

      {/* Graphs grid */}
      <div className="graphs-container">
        {/* Add new graph card — or inline create editor */}
        {inlineCreate ? (
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
            <span
              className="paste-handle"
              onClick={(e) => { e.stopPropagation(); handlePasteNewGraph(e) }}
              title="Paste graph from clipboard"
            />
            <div className="add-content">
              <span className="add-icon">+</span>
              <span className="add-text">New Graph</span>
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

          return (
            <div
              key={graph.name}
              className="graph-card"
              onClick={() => handleGraphClick(graph.name)}
            >
              <span
                className="edit-handle"
                onClick={(e) => { e.stopPropagation(); setInlineEditGraph(graph) }}
                title="Edit graph"
              >
                ☰
              </span>
              <h3 className={`graph-name ${colorClass}`}>{graph.display_name}</h3>
              {graph.description && (
                <p className="graph-description">{graph.description}</p>
              )}
              <span
                className="copy-handle"
                onClick={(e) => handleCopyGraph(e, graph.name)}
                title="Copy structure"
              />
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
