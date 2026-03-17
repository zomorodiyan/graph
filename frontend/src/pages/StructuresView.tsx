import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '../context/ThemeContext'
import { createGraph, fetchStructureText, updateGraph, deleteGraph, GraphInfo } from '../api/client'
import { useGraphs } from '../hooks/useGraph'
import { useModalBackButton } from '../hooks/useModalBackButton'
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
  
  // Edit modal state
  const [editingGraph, setEditingGraph] = useState<GraphInfo | null>(null)
  const [editIcon, setEditIcon] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useModalBackButton(showCreateModal, () => setShowCreateModal(false))
  useModalBackButton(Boolean(editingGraph), () => setEditingGraph(null))

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
    while (existingNames.has(`${baseName}_${counter}`)) {
      counter++
    }
    return `${baseName}_${counter}`
  }

  const handleCreateGraph = async () => {
    const trimmedName = newGraphName.trim()
    const trimmedDescription = newGraphDescription.trim()
    const createGuide = !trimmedName && !trimmedDescription
    const graphName = createGuide ? 'guide' : (trimmedName || generateUniqueName())

    try {
      setIsCreating(true)
      await createGraph(graphName, trimmedDescription)
      showNotification(`Created "${graphName}"!`)
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

  const handleEditClick = (e: React.MouseEvent, graph: GraphInfo) => {
    e.stopPropagation()
    setEditingGraph(graph)
    setEditIcon(graph.icon || getIconForGraph(graph.name))
    setEditDisplayName(graph.display_name)
    setEditDescription(graph.description || '')
  }

  const handleSaveEdit = async () => {
    if (!editingGraph) return

    try {
      setIsSaving(true)
      await updateGraph(editingGraph.name, {
        display_name: editDisplayName,
        description: editDescription,
        icon: editIcon,
      })
      showNotification('Graph updated!')
      setEditingGraph(null)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteGraph = async () => {
    if (!editingGraph) return
    
    if (!confirm(`Delete "${editingGraph.display_name}"? This cannot be undone.`)) {
      return
    }

    try {
      setIsSaving(true)
      await deleteGraph(editingGraph.name)
      showNotification('Graph deleted!')
      setEditingGraph(null)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    } finally {
      setIsSaving(false)
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
      setIsCreating(true)
      const graphName = generateUniqueName()
      await createGraph(graphName, '', text)
      showNotification(`Created "${graphName}" from clipboard!`)
      queryClient.invalidateQueries({ queryKey: ['graphs'] })
    } catch (err) {
      showNotification((err as Error).message, 'error')
    } finally {
      setIsCreating(false)
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
        <div 
          className="graph-card add-card"
          onClick={() => setShowCreateModal(true)}
        >
          <span
            className="paste-handle"
            onClick={(e) => { e.stopPropagation(); handlePasteNewGraph(e); }}
            title="Paste graph from clipboard"
          >
            <span className="paste-handle-text">paste</span>
          </span>
          <div className="add-icon">+</div>
          <span className="add-text">New Graph</span>
        </div>

        {/* Existing graphs */}
        {graphs.map((graph) => (
          <div
            key={graph.name}
            className="graph-card"
            onClick={() => handleGraphClick(graph.name)}
          >
            <span 
              className="edit-handle"
              onClick={(e) => handleEditClick(e, graph)}
              title="Edit graph"
            >
              ☰
            </span>
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
        <div className="modal-overlay" onClick={() => {
          setShowCreateModal(false)
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Graph</h2>
            <div className="form-group">
              <label htmlFor="graph-name">Name</label>
              <input
                id="graph-name"
                type="text"
                value={newGraphName}
                onChange={(e) => setNewGraphName(e.target.value)}
                placeholder="Leave empty to create guide"
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
                onClick={() => {
                  setShowCreateModal(false)
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateGraph}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : (!newGraphName.trim() && !newGraphDescription.trim() ? 'Guide' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingGraph && (
        <div className="modal-overlay" onClick={() => setEditingGraph(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Graph</h2>
            <div className="form-group">
              <label htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Graph name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-description">Description</label>
              <input
                id="edit-description"
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What is this graph about?"
              />
            </div>
            <div className="modal-actions">
              <button 
                className="btn-danger"
                onClick={handleDeleteGraph}
                disabled={isSaving}
              >
                Delete
              </button>
              <div style={{ flex: 1 }} />
              <button 
                className="btn-secondary"
                onClick={() => setEditingGraph(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveEdit}
                disabled={isSaving || !editDisplayName.trim()}
              >
                {isSaving ? 'Saving...' : 'Save'}
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
