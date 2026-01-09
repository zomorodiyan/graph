import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStructure, useUpdateItem, useDeleteItem, useMoveItem, getItemByPath } from '../hooks/useGraph'
import { useTheme } from '../context/ThemeContext'
import { StructureItem, UpdatePayload } from '../api/client'
import EditModal from '../components/EditModal'
import Notification from '../components/Notification'
import Section from '../components/Section'

// Color assignment based on index
const COLORS = ['green', 'blue', 'purple', 'brown']

function GraphView() {
  const { path } = useParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { data: structure, isLoading, error } = useStructure()
  
  const updateItem = useUpdateItem()
  const deleteItemMutation = useDeleteItem()
  const moveItem = useMoveItem()
  
  const [editingItem, setEditingItem] = useState<{
    path: string
    name: string
    data: StructureItem
  } | null>(null)
  
  const [notification, setNotification] = useState<{
    message: string
    type: 'success' | 'error' | 'syncing'
  } | null>(null)

  // Show notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'syncing' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Get current level items
  const getCurrentItems = () => {
    if (!structure?.structure) return {}
    
    if (!path) {
      // Root level
      return structure.structure
    }
    
    const item = getItemByPath(structure, path)
    if (item?.children) {
      return item.children
    }
    return {}
  }

  // Build breadcrumb
  const getBreadcrumb = () => {
    if (!path) return [{ label: 'Home', path: '/' }]
    
    const parts = path.split('.')
    const crumbs = [{ label: 'Home', path: '/' }]
    
    let currentPath = ''
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}.${part}` : part
      const item = getItemByPath(structure, currentPath)
      crumbs.push({
        label: item?.title || part,
        path: `/${currentPath.replace(/\./g, '/')}`
      })
    }
    
    return crumbs
  }

  // Handle item click - navigate to children
  const handleItemClick = (itemPath: string, hasChildren: boolean) => {
    if (hasChildren) {
      navigate(`/${itemPath.replace(/\./g, '/')}`)
    }
  }

  // Handle edit click
  const handleEditClick = (itemPath: string, name: string, data: StructureItem) => {
    setEditingItem({ path: itemPath, name, data })
  }

  // Handle save
  const handleSave = async (data: UpdatePayload) => {
    if (!editingItem) return
    
    try {
      showNotification('Syncing...', 'syncing')
      await updateItem.mutateAsync({ path: editingItem.path, data })
      setEditingItem(null)
      showNotification('Saved!')
    } catch (err) {
      showNotification('Failed to save', 'error')
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!editingItem) return
    
    try {
      showNotification('Deleting...', 'syncing')
      await deleteItemMutation.mutateAsync(editingItem.path)
      setEditingItem(null)
      showNotification('Deleted!')
    } catch (err) {
      showNotification('Failed to delete', 'error')
    }
  }

  // Handle move
  const handleMove = async (itemPath: string, direction: 'up' | 'down') => {
    try {
      await moveItem.mutateAsync({ path: itemPath, direction })
      showNotification('Moved!')
    } catch (err) {
      showNotification('Failed to move', 'error')
    }
  }

  if (isLoading) {
    return <div className="loading">Loading...</div>
  }

  if (error) {
    return <div className="error">Error loading structure: {(error as Error).message}</div>
  }

  const items = getCurrentItems()
  const breadcrumb = getBreadcrumb()

  return (
    <>
      <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <div className="graph-container">
        {/* Breadcrumb */}
        <nav className="breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.path}>
              {i > 0 && ' / '}
              {i === breadcrumb.length - 1 ? (
                <span>{crumb.label}</span>
              ) : (
                <Link to={crumb.path}>{crumb.label}</Link>
              )}
            </span>
          ))}
        </nav>

        {/* Sections */}
        {Object.entries(items).map(([key, item], index) => (
          <Section
            key={key}
            itemKey={key}
            item={item as StructureItem}
            parentPath={path || ''}
            colorIndex={index % COLORS.length}
            onItemClick={handleItemClick}
            onEditClick={handleEditClick}
            onMoveUp={(p) => handleMove(p, 'up')}
            onMoveDown={(p) => handleMove(p, 'down')}
          />
        ))}

        {Object.keys(items).length === 0 && (
          <div className="loading">No items at this level</div>
        )}
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <EditModal
          name={editingItem.name}
          data={editingItem.data}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditingItem(null)}
          isSaving={updateItem.isPending}
        />
      )}

      {/* Notification */}
      {notification && (
        <Notification message={notification.message} type={notification.type} />
      )}
    </>
  )
}

export default GraphView
