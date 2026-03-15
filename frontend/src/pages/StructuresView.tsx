import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '../context/ThemeContext'
import { createGraph, fetchStructureText } from '../api/client'
import { useGraphs } from '../hooks/useGraph'
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
  const queryClient = useQueryClient()
  const { theme, toggleTheme } = useTheme()
  const { data: graphs = [], isLoading, error } = useGraphs()
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
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopyGraph = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()

    try {
      const text = await fetchStructureText(name)
      await navigator.clipboard.writeText(text)
      showNotification('Copied structure!')
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
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

      {/* Header */}
      <header className="structures-header">
        <h1>Knowledge Graphs</h1>
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
            <span
              className="copy-handle"
              onClick={(e) => handleCopyGraph(e, graph.name)}
              title="Copy structure"
            />
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
