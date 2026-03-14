import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { GraphInfo, fetchGraphs, createGraph, deleteGraph } from '../api/client'
import { useSwipeNavigation } from '../hooks/useSwipeNavigation'
import Notification from '../components/Notification'
import './StructuresView.css'

// Icons for different graph types (randomly assigned based on name hash)
const GRAPH_ICONS = ['📊', '🎯', '📚', '💼', '🏠', '🌟', '🚀', '💡', '🎨', '🔬']

function getIconForGraph(name: string): string {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return GRAPH_ICONS[hash % GRAPH_ICONS.length]
}

function StructuresView() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [graphs, setGraphs] = useState<GraphInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newGraphName, setNewGraphName] = useState('')
  const [newGraphDescription, setNewGraphDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

  // Enable swipe navigation (back/forward)
  useSwipeNavigation()

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const loadGraphs = async () => {
    try {
      setIsLoading(true)
      const data = await fetchGraphs()
      setGraphs(data)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadGraphs()
  }, [])

  const handleGraphClick = (graphName: string) => {
    navigate(`/g/${graphName}`)
  }

  const handleCreateGraph = async () => {
    if (!newGraphName.trim()) return

    try {
      setIsCreating(true)
      await createGraph(newGraphName, newGraphDescription)
      showNotification(`Created "${newGraphName}"!`)
      setShowCreateModal(false)
      setNewGraphName('')
      setNewGraphDescription('')
      loadGraphs()
    } catch (err) {
      showNotification((err as Error).message, 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteGraph = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return

    try {
      await deleteGraph(name)
      showNotification(`Deleted "${name}"`)
      loadGraphs()
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
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="structures-view">
      {/* Top buttons */}
      <div className="top-buttons">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      {/* Header */}
      <header className="structures-header">
        <h1>Knowledge Graphs</h1>
        <p className="subtitle">Select a graph to explore or create a new one</p>
      </header>

      {/* Graphs grid */}
      <div className="graphs-container">
        {/* Add new graph card */}
        <button 
          className="graph-card add-card"
          onClick={() => setShowCreateModal(true)}
        >
          <div className="add-icon">+</div>
          <span className="add-text">New Graph</span>
        </button>

        {/* Existing graphs */}
        {graphs.map((graph) => (
          <div
            key={graph.name}
            className="graph-card"
            onClick={() => handleGraphClick(graph.name)}
          >
            <div className="graph-icon">{getIconForGraph(graph.name)}</div>
            <h3 className="graph-name">{graph.display_name}</h3>
            {graph.description && (
              <p className="graph-description">{graph.description}</p>
            )}
            <div className="graph-meta">
              <span className="graph-version">v{graph.version}</span>
            </div>
            <button
              className="delete-btn"
              onClick={(e) => handleDeleteGraph(e, graph.name)}
              title="Delete graph"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {graphs.length === 0 && (
        <div className="empty-state">
          <p>No graphs yet. Create your first knowledge graph!</p>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Graph</h2>
            <div className="form-group">
              <label htmlFor="graph-name">Name</label>
              <input
                id="graph-name"
                type="text"
                value={newGraphName}
                onChange={(e) => setNewGraphName(e.target.value)}
                placeholder="e.g., Work, Personal, Projects"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="graph-description">Description (optional)</label>
              <input
                id="graph-description"
                type="text"
                value={newGraphDescription}
                onChange={(e) => setNewGraphDescription(e.target.value)}
                placeholder="What is this graph about?"
              />
            </div>
            <div className="modal-actions">
              <button 
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateGraph}
                disabled={isCreating || !newGraphName.trim()}
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
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
