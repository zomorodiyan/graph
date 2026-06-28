import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '../context/ThemeContext'
import { createGraph, fetchStructureText, updateGraph, deleteGraph, GraphInfo } from '@api'
import { useGraphs } from '../hooks/useGraph'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useSwipeNavigation } from '../hooks/useSwipeNavigation'
import { useSyncManager, loadSyncStatus, GraphSyncStatus, SyncAllResult } from '../hooks/useSyncManager'
import Notification from '../components/Notification'
import InlineGraphEditor from '../components/InlineGraphEditor'
import { GRAPH_TEMPLATES, GraphTemplate } from '../data/graphTemplates'
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
  const [showTemplates, setShowTemplates] = useState(false)
  const [inlineEditGraph, setInlineEditGraph] = useState<GraphInfo | null>(null)
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)
  const [showGistConfig, setShowGistConfig] = useState(false)
  const [patInput, setPatInput] = useState('')
  const [copiedGraph, setCopiedGraph] = useState<string | null>(null)
  const [flashDirections, setFlashDirections] = useState<Record<string, string>>({})
  const patInputRef = useRef<HTMLInputElement>(null)

  const { isSyncing, pat, gistId, syncStatuses, configure, syncAll } =
    useSyncManager(queryClient)

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) return
    const statuses = Object.values(syncStatuses)
    const synced = !!pat && statuses.length > 0 && statuses.every(s => !s.error)
    link.href = synced ? '/icon-colored.svg' : '/icon.svg'
  }, [pat, syncStatuses])

  useModalBackButton(inlineCreate, () => setInlineCreate(false))
  useModalBackButton(showTemplates, () => setShowTemplates(false))
  useModalBackButton(Boolean(inlineEditGraph), () => setInlineEditGraph(null))

  // Enable swipe navigation (back/forward)
  useSwipeNavigation()

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), type === 'error' ? 8000 : 3000)
  }

  const handleSyncClick = async () => {
    if (!pat) {
      setPatInput('')
      setShowGistConfig(true)
      setTimeout(() => patInputRef.current?.focus(), 50)
      return
    }
    const { error, pushed, pulled, statuses }: SyncAllResult = await syncAll()
    if (error) {
      showNotification(error, 'error')
    } else if (pushed === 0 && pulled === 0) {
      showNotification('Everything up to date')
    } else {
      const parts = []
      if (pushed) parts.push(`${pushed} pushed`)
      if (pulled) parts.push(`${pulled} pulled`)
      showNotification(`Synced — ${parts.join(', ')}`)
      const flash: Record<string, string> = {}
      for (const [name, s] of Object.entries(statuses) as [string, GraphSyncStatus][]) {
        if (s.direction === 'push' || s.direction === 'pull') flash[name] = s.direction
      }
      if (Object.keys(flash).length > 0) {
        setFlashDirections(flash)
        setTimeout(() => setFlashDirections({}), 5000)
      }
    }
  }

  const handleSaveGistConfig = async () => {
    configure(patInput, '')
    setShowGistConfig(false)
    const { error, pushed, pulled } = await syncAll()
    if (error) {
      showNotification(error, 'error')
    } else if (pushed === 0 && pulled === 0) {
      showNotification('Connected — nothing to sync yet')
    } else {
      const parts = []
      if (pushed) parts.push(`${pushed} pushed`)
      if (pulled) parts.push(`${pulled} pulled`)
      showNotification(`Connected — ${parts.join(', ')}`)
    }
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
      await createGraph(graphName, tpl.description, tpl.structure)
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
    <div className="structures-view">
      {/* Top buttons — hidden while editing a graph or creating a new one */}
      {!inlineEditGraph && !inlineCreate && <div className="top-buttons">
        <div className="sync-area">
          {showGistConfig ? (
            <div className="gist-config-panel">
              <div className="gist-config-guide">
                <p className="gist-guide-title">Connect GitHub Gist for sync</p>
                <ol className="gist-guide-steps">
                  <li>Go to <a href="https://github.com/settings/tokens/new?scopes=gist&description=Knowledge+Graph+Sync" target="_blank" rel="noreferrer">github.com → Settings → Tokens</a></li>
                  <li>Check only <strong>gist</strong> scope, generate &amp; copy the token</li>
                  <li>Paste it below — your graphs sync to a private Gist only you can see</li>
                </ol>
              </div>
              <div className="gist-config-inputs">
                <input
                  ref={patInputRef}
                  type="password"
                  placeholder="Paste GitHub token here"
                  value={patInput}
                  onChange={e => setPatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveGistConfig(); if (e.key === 'Escape') setShowGistConfig(false) }}
                />
                <div className="gist-config-actions">
                  <button className="btn-save-url" onClick={handleSaveGistConfig} disabled={!patInput.trim()}>Connect</button>
                  <button className="btn-cancel-url" onClick={() => setShowGistConfig(false)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <button
                className={`sync-btn${isSyncing ? ' sync-btn--spinning' : ''}${pat ? ' sync-btn--connected' : ''}`}
                onClick={handleSyncClick}
                title={pat ? `Sync with GitHub Gist${gistId ? ` (${gistId.slice(0, 8)}…)` : ''}` : 'Connect GitHub to enable sync'}
                disabled={isSyncing}
              >
                ↻
              </button>
            </>
          )}
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" />
      </div>}

      {/* Header */}
      <header className="structures-header">
        <div className="title-row">
          <h1>Knowledge Graphs</h1>
        </div>
      </header>

      {/* Graphs grid */}
      <div className="graphs-container">
        {/* Add new graph card — inline create editor, sample browser, or the card */}
        {showTemplates ? (
          <div className="template-browser">
            <div className="template-browser-header">
              <span className="template-browser-title">Start from a sample</span>
              <button
                className="template-browser-close"
                onClick={() => setShowTemplates(false)}
                title="Close"
              >✕</button>
            </div>
            <div className="template-grid">
              {GRAPH_TEMPLATES.map(tpl => (
                <button
                  key={tpl.name}
                  className="template-card"
                  onClick={() => handleCreateFromTemplate(tpl)}
                >
                  <span className="template-name">{tpl.displayName}</span>
                  <span className="template-desc">{tpl.description}</span>
                </button>
              ))}
            </div>
          </div>
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

          const syncStatus: GraphSyncStatus | null =
            syncStatuses[graph.name] ?? loadSyncStatus(graph.name)

          const flashDir = flashDirections[graph.name]
          const hasLocalChanges = syncStatus && new Date(graph.modified_at) > new Date(syncStatus.lastSync)
          const badgeSymbol = syncStatus?.error ? '✕'
            : flashDir === 'push' ? '↑'
            : flashDir === 'pull' ? '↓'
            : hasLocalChanges ? '•'
            : syncStatus ? '✓'
            : null
          const badgeClass = syncStatus?.error ? 'error'
            : flashDir ? flashDir
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
                  {badgeSymbol && pat && (
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
