import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useStructure, useUpdateItem, useDeleteItem, useReorderItem, getItemByPath } from '../hooks/useGraph'
import { useTheme } from '../context/ThemeContext'
import { StructureItem, UpdatePayload } from '../api/client'
import EditModal from '../components/EditModal'
import Notification from '../components/Notification'
import Section from '../components/Section'

// Color assignment based on index
const COLORS = ['green', 'blue', 'purple', 'brown']

function GraphView() {
  const location = useLocation()
  // Convert URL path to dot notation (e.g., /level/work/go_melt -> level.work.go_melt)
  const path = location.pathname === '/' ? '' : location.pathname.slice(1).replace(/\//g, '.')
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { data: structure, isLoading, error, refetch } = useStructure()
  
  const updateItem = useUpdateItem()
  const deleteItemMutation = useDeleteItem()
  const reorderItem = useReorderItem()
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
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

  // Helper to get due category
  const getDueCategory = (dueDate: string): 'over' | 'day' | 'week' | 'month' | null => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)
    
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) return 'over'
    if (diffDays === 0) return 'day'
    if (diffDays <= 7) return 'week'
    if (diffDays <= 30) return 'month'
    return null
  }

  // Collect all items with due dates from the structure
  const collectDueItems = (items: Record<string, StructureItem>, parentPath: string = ''): Array<{path: string, item: StructureItem, title: string}> => {
    const result: Array<{path: string, item: StructureItem, title: string}> = []
    
    for (const [key, item] of Object.entries(items)) {
      const itemPath = parentPath ? `${parentPath}.${key}` : key
      
      if (item.due) {
        result.push({ path: itemPath, item, title: item.title || key })
      }
      
      if (item.children) {
        result.push(...collectDueItems(item.children, itemPath))
      }
    }
    
    return result
  }

  // Build virtual children for time categories
  const getTimeChildren = (category: 'over' | 'day' | 'week' | 'month'): Record<string, StructureItem> => {
    if (!structure?.structure) return {}
    
    const allItems = collectDueItems(structure.structure)
    const filtered = allItems.filter(({ item }) => {
      if (!item.due) return false
      return getDueCategory(item.due) === category
    })
    
    const result: Record<string, StructureItem> = {}
    for (const { path: itemPath, item, title } of filtered) {
      // Use a unique key based on the path
      const key = itemPath.replace(/\./g, '_')
      result[key] = {
        ...item,
        title: title,
        context: `📍 ${itemPath.replace(/\./g, ' › ')}`,
        children: undefined // Don't show nested children in time view
      }
    }
    
    return result
  }

  // Get current level items
  const getCurrentItems = () => {
    if (!structure?.structure) return {}
    
    if (!path) {
      // Root level - enhance time section with counts
      const items = { ...structure.structure }
      
      // If time exists, add counts to its children
      if (items.time?.children) {
        const enhancedTimeChildren: Record<string, StructureItem> = {}
        for (const [key, child] of Object.entries(items.time.children)) {
          const category = key as 'over' | 'day' | 'week' | 'month'
          if (['over', 'day', 'week', 'month'].includes(category)) {
            const dueItems = getTimeChildren(category)
            const count = Object.keys(dueItems).length
            enhancedTimeChildren[key] = {
              ...(child as StructureItem),
              title: `${(child as StructureItem).title || key} (${count})`,
              children: dueItems
            }
          } else {
            enhancedTimeChildren[key] = child as StructureItem
          }
        }
        items.time = { ...items.time, children: enhancedTimeChildren }
      }
      
      return items
    }
    
    // Check if we're viewing "time" - show enhanced time categories
    if (path === 'time') {
      const timeItem = getItemByPath(structure, 'time')
      if (timeItem?.children) {
        const enhancedChildren: Record<string, StructureItem> = {}
        for (const [key, child] of Object.entries(timeItem.children)) {
          const category = key as 'over' | 'day' | 'week' | 'month'
          if (['over', 'day', 'week', 'month'].includes(category)) {
            const dueItems = getTimeChildren(category)
            const count = Object.keys(dueItems).length
            enhancedChildren[key] = {
              ...(child as StructureItem),
              title: `${(child as StructureItem).title || key} (${count})`,
              children: dueItems
            }
          } else {
            enhancedChildren[key] = child as StructureItem
          }
        }
        return enhancedChildren
      }
    }
    
    // Check if we're in a time category (time.over, time.day, time.week, time.month)
    const pathParts = path.split('.')
    if (pathParts[0] === 'time' && pathParts.length === 2) {
      const category = pathParts[1] as 'over' | 'day' | 'week' | 'month'
      if (['over', 'day', 'week', 'month'].includes(category)) {
        // Return the items directly as sections
        return getTimeChildren(category)
      }
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

  // Drag and drop handlers
  const handleDragStart = (itemPath: string) => {
    setDraggedItem(itemPath)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverIndex(null)
  }

  const handleDrop = async (targetIndex: number) => {
    if (!draggedItem) return
    
    const itemToReorder = draggedItem
    setDraggedItem(null)
    setDragOverIndex(null)
    
    try {
      await reorderItem.mutateAsync({ path: itemToReorder, targetIndex })
      showNotification('Reordered!')
    } catch (err) {
      showNotification('Failed to reorder', 'error')
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
          <div
            key={key}
            draggable
            onDragStart={() => handleDragStart(path ? `${path}.${key}` : key)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={() => handleDrop(index)}
            className={`section-wrapper ${draggedItem === (path ? `${path}.${key}` : key) ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
          >
            <Section
              key={key}
              itemKey={key}
              item={item as StructureItem}
              parentPath={path || ''}
              colorIndex={index % COLORS.length}
              onItemClick={handleItemClick}
              onEditClick={handleEditClick}
            />
          </div>
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
