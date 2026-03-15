import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, Link, useParams } from 'react-router-dom'
import { useStructure, useUpdateItem, useDeleteItem, useReorderItem, useCreateItem, getItemByPath } from '../hooks/useGraph'
import { useSwipeNavigation } from '../hooks/useSwipeNavigation'
import { useTheme } from '../context/ThemeContext'
import { StructureItem, UpdatePayload } from '../api/client'
import EditModal from '../components/EditModal'
import Notification from '../components/Notification'
import Section from '../components/Section'

// Color assignment based on index
const COLORS = ['green', 'blue', 'purple', 'brown']

function GraphView() {
  const location = useLocation()
  const { graphName } = useParams<{ graphName?: string }>()
  
  // Parse path from URL, handling both /g/{graphName}/... and legacy /... routes
  const getPathFromLocation = () => {
    const pathname = location.pathname
    if (graphName) {
      // Route: /g/{graphName}/path/to/item -> path.to.item
      const prefix = `/g/${graphName}`
      const remaining = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
      return remaining === '' || remaining === '/' ? '' : remaining.slice(1).replace(/\//g, '.')
    } else {
      // Legacy route: /path/to/item -> path.to.item
      return pathname === '/' ? '' : pathname.slice(1).replace(/\//g, '.')
    }
  }
  
  const path = getPathFromLocation()
  const navigate = useNavigate()
  
  // Enable swipe navigation (browser-like back/forward)
  useSwipeNavigation()
  const { theme, toggleTheme } = useTheme()
  const { data: structure, isLoading, error } = useStructure(graphName)
  
  const updateItem = useUpdateItem(graphName)
  const deleteItemMutation = useDeleteItem(graphName)
  const reorderItem = useReorderItem(graphName)
  const createItem = useCreateItem(graphName)
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
  // LOCAL order state - this is what controls the visual display
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  
  // LOCAL items state - for immediate visual updates on edits
  const [localItems, setLocalItems] = useState<Record<string, StructureItem> | null>(null)
  
  // Track items that are being synced (pending) - these show loading and can't be dragged
  const [pendingItems, setPendingItems] = useState<Set<string>>(new Set())
  
  // Modal state - now supports both edit and create modes
  const [modalState, setModalState] = useState<{
    mode: 'edit' | 'create'
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
    
    // Collect from structure, excluding the 'time' section itself
    const structureWithoutTime = { ...structure.structure }
    delete structureWithoutTime.time
    
    const allItems = collectDueItems(structureWithoutTime)
    const filtered = allItems.filter(({ item }) => {
      if (!item.due) return false
      return getDueCategory(item.due) === category
    })
    
    const result: Record<string, StructureItem> = {}
    for (const { path: itemPath, item, title } of filtered) {
      // Use a unique key based on the path
      const key = itemPath.replace(/\./g, '_')
      // Show parent path only (remove the item name itself)
      const pathParts = itemPath.split('.')
      const parentPath = pathParts.slice(0, -1).map(p => p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' › ')
      result[key] = {
        ...item,
        title: title,
        context: parentPath ? `📍 ${parentPath}` : undefined,
        originalPath: itemPath, // Store original path for navigation
        nonEditable: true, // Time items are not editable - they navigate to original
        children: undefined // Don't show nested children in time view
      }
    }
    
    return result
  }

  // Build auto-generated Time section if any items have due dates
  const buildTimeSection = (): StructureItem | null => {
    if (!structure?.structure) return null
    
    // Check if any items have due dates (excluding time section)
    const structureWithoutTime = { ...structure.structure }
    delete structureWithoutTime.time
    
    const allDueItems = collectDueItems(structureWithoutTime)
    if (allDueItems.length === 0) return null
    
    // Build the time section with categories - only include non-empty ones
    const categories = ['over', 'day', 'week', 'month'] as const
    const timeChildren: Record<string, StructureItem> = {}
    
    for (const category of categories) {
      const dueItems = getTimeChildren(category)
      const count = Object.keys(dueItems).length
      // Only include category if it has items
      if (count > 0) {
        const titles = { over: 'Over', day: 'Day', week: 'Week', month: 'Month' }
        timeChildren[category] = {
          title: `${titles[category]} (${count})`,
          nonEditable: true,
          children: dueItems
        }
      }
    }
    
    // Only return Time section if at least one category has items
    if (Object.keys(timeChildren).length === 0) return null
    
    return {
      title: 'Time',
      nonEditable: true,
      children: timeChildren
    }
  }

  // Get current level items
  const getCurrentItems = () => {
    if (!structure?.structure) return {}
    
    if (!path) {
      // Root level - auto-generate time section if any items have due dates
      const items = { ...structure.structure }
      
      // Remove any existing time from structure (it's auto-generated)
      delete items.time
      
      // Auto-generate Time section if there are items with due dates
      const timeSection = buildTimeSection()
      if (timeSection) {
        items.time = timeSection
      }
      
      return items
    }
    
    // Check if we're viewing "time" - show auto-generated time categories
    if (path === 'time') {
      const timeSection = buildTimeSection()
      if (timeSection?.children) {
        return timeSection.children
      }
      return {}
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

  // Get the raw items from structure
  const rawItems = getCurrentItems()
  
  // Server keys - stable reference using JSON string comparison
  const rawItemsKeyString = Object.keys(rawItems).join(',')
  const serverKeys = useMemo(() => Object.keys(rawItems), [rawItemsKeyString])
  
  // Sync local state when PATH changes OR when data first loads (localItems is null)
  // This prevents server response from overwriting our local optimistic updates during edits
  useEffect(() => {
    // Only sync if:
    // 1. localItems is null (initial load or path changed)
    // 2. OR path changed (handled by dependency array)
    if (localItems === null && Object.keys(rawItems).length > 0) {
      setLocalOrder(Object.keys(rawItems))
      setLocalItems(rawItems)
    }
  }, [rawItemsKeyString, localItems])
  
  // Reset local state when path changes (navigating to different view)
  useEffect(() => {
    setLocalOrder(null)
    setLocalItems(null)
  }, [path])
  
  // The display order: use local order if available, otherwise server order
  const displayOrder = localOrder || serverKeys
  
  // The display items: use local items if available, otherwise raw items from server
  const displayItems = localItems || rawItems

  // Helper to build URL paths with optional graph prefix
  const buildPath = (itemPath: string) => {
    const base = graphName ? `/g/${graphName}` : ''
    return itemPath ? `${base}/${itemPath.replace(/\./g, '/')}` : base || '/'
  }

  // Build breadcrumb
  const getBreadcrumb = () => {
    const crumbs = []
    
    // Add "Graphs" link if we're in a specific graph
    if (graphName) {
      crumbs.push({ label: '📊', path: '/', isRoot: true })
      crumbs.push({ label: graphName.replace(/_/g, ' ').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), path: `/g/${graphName}` })
    } else {
      crumbs.push({ label: 'Home', path: '/' })
    }
    
    if (!path) return crumbs
    
    const parts = path.split('.')
    let currentPath = ''
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}.${part}` : part
      const item = getItemByPath(structure, currentPath)
      crumbs.push({
        label: item?.title || part,
        path: buildPath(currentPath)
      })
    }
    
    return crumbs
  }

  // Handle item click - navigate to item page (always, even without children)
  const handleItemClick = (itemPath: string, _hasChildren: boolean) => {
    // For time view items that have an originalPath, navigate there instead
    const currentItems = getCurrentItems()
    
    // Traverse the path to find the item
    const pathParts = itemPath.split('.')
    const basePath = path ? path.split('.') : []
    const relativeParts = pathParts.slice(basePath.length)
    
    let targetItem: StructureItem | undefined = undefined
    let current: Record<string, StructureItem> | undefined = currentItems
    
    for (const part of relativeParts) {
      if (!current) break
      targetItem = current[part]
      current = targetItem?.children
    }
    
    if (targetItem?.originalPath) {
      // Navigate to the original location
      navigate(buildPath(targetItem.originalPath as string))
    } else {
      navigate(buildPath(itemPath))
    }
  }

  // Handle edit click
  const handleEditClick = (itemPath: string, name: string, data: StructureItem) => {
    setModalState({ mode: 'edit', path: itemPath, name, data })
  }

  // Handle add new item click
  const handleAddClick = () => {
    setModalState({
      mode: 'create',
      path: path || '', // Current path is the parent for new item
      name: '',
      data: {} as StructureItem
    })
  }

  // Handle save (edit or create) - uses local state for instant feedback
  const handleSave = (data: UpdatePayload) => {
    if (!modalState) return
    
    const { mode, path: itemPath } = modalState
    
    // Close modal immediately
    setModalState(null)
    
    if (mode === 'create') {
      // IMMEDIATELY update local state for instant visual feedback (like handleDrop)
      if (data.name) {
        // Normalize name the same way the server does
        const normalizedName = data.name.toLowerCase().replace(/ /g, '_')
        
        const newItem: StructureItem = {
          title: data.name,
          ...(typeof data.progress === 'number' && { progress: data.progress }),
          ...(data.context && { context: data.context }),
          ...(data.due && { due: data.due }),
        }
        
        // Use callback pattern to avoid stale closure
        setLocalItems(prev => prev ? { ...prev, [normalizedName]: newItem } : { [normalizedName]: newItem })
        setLocalOrder(prev => prev ? [...prev, normalizedName] : [normalizedName])
        
        // Mark as pending with normalized path
        const newItemPath = itemPath ? `${itemPath}.${normalizedName}` : normalizedName
        setPendingItems(prev => new Set(prev).add(newItemPath))
      
        // Then sync to server in background
        createItem.mutate(
          { parentPath: itemPath, data },
          {
            onSuccess: () => showNotification('Created!'),
            onError: () => {
              showNotification('Failed to create', 'error')
              // On error, remove from local state since it wasn't created
              setLocalItems(prev => {
                if (!prev) return prev
                const newItems = { ...prev }
                delete newItems[normalizedName]
                return newItems
              })
              setLocalOrder(prev => prev ? prev.filter(k => k !== normalizedName) : prev)
            },
            onSettled: () => {
              // Clear pending status - item can now be dragged
              setPendingItems(prev => {
                const next = new Set(prev)
                next.delete(newItemPath)
                return next
              })
            }
          }
        )
      }
    } else {
      // Get the path parts to determine nesting level
      const pathParts = itemPath.split('.')
      const currentPathParts = path ? path.split('.') : []
      
      // Calculate relative path from current view
      // If we're at root and editing "level.work", relativeParts = ["level", "work"]
      // If we're at "level" and editing "level.work", relativeParts = ["work"]
      const relativeParts = pathParts.slice(currentPathParts.length)
      
      const itemKey = relativeParts[relativeParts.length - 1]
      const newName = data.name
      // Normalize name the same way the server does
      const normalizedNewName = newName ? newName.toLowerCase().replace(/ /g, '_') : null
      const isRename = normalizedNewName && normalizedNewName !== itemKey
      
      // IMMEDIATELY update local state for instant visual feedback
      setLocalItems(prev => {
        if (!prev) return prev
        
        // Deep clone to avoid mutation
        const newItems = JSON.parse(JSON.stringify(prev))
        
        // Navigate to the correct item
        let target = newItems
        
        for (let i = 0; i < relativeParts.length - 1; i++) {
          const key = relativeParts[i]
          if (target[key]) {
            // Navigate into children if they exist, otherwise stay at current level
            target = target[key].children || target[key]
          } else {
            return prev // Item not found, don't update
          }
        }
        
        if (!target[itemKey]) return prev // Item not found
        
        const updatedItem = { ...target[itemKey] }
        
        // Update properties
        if (data.progress !== undefined) {
          if (data.progress === '') {
            delete updatedItem.progress
          } else {
            updatedItem.progress = data.progress as number
          }
        }
        if (data.context !== undefined) {
          if (data.context === '') {
            delete updatedItem.context
          } else {
            updatedItem.context = data.context
          }
        }
        if (data.due !== undefined) {
          if (data.due === '') {
            delete updatedItem.due
          } else {
            updatedItem.due = data.due
          }
        }
        
        // Handle name change (rename)
        if (isRename) {
          delete target[itemKey]
          target[normalizedNewName!] = { ...updatedItem, title: newName }
        } else {
          target[itemKey] = updatedItem
        }
        
        return newItems
      })
      
      // Update local order if renaming a top-level item
      if (isRename && relativeParts.length === 1) {
        setLocalOrder(prev => 
          prev ? prev.map(k => k === itemKey ? normalizedNewName! : k) : prev
        )
      }
      
      // Mark as pending
      setPendingItems(prev => new Set(prev).add(itemPath))
      
      // Then sync to server in background
      updateItem.mutate(
        { path: itemPath, data },
        {
          onSuccess: () => showNotification('Saved!'),
          onError: () => showNotification('Failed to save', 'error'),
          onSettled: () => {
            // Clear pending status
            setPendingItems(prev => {
              const next = new Set(prev)
              next.delete(itemPath)
              return next
            })
          }
        }
      )
    }
  }

  // Handle delete - uses local state for instant feedback (like handleDrop)
  const handleDelete = () => {
    if (!modalState || modalState.mode !== 'edit') return
    
    const pathToDelete = modalState.path
    const pathParts = pathToDelete.split('.')
    const currentPathParts = path ? path.split('.') : []
    
    // Calculate relative path from current view
    const relativeParts = pathParts.slice(currentPathParts.length)
    const itemKey = relativeParts[relativeParts.length - 1]
    
    // Close modal immediately
    setModalState(null)
    
    // IMMEDIATELY update local state for instant visual feedback
    setLocalItems(prev => {
      if (!prev) return prev
      
      // Deep clone to avoid mutation
      const newItems = JSON.parse(JSON.stringify(prev))
      
      // Navigate to the parent of the item to delete
      let target = newItems
      for (let i = 0; i < relativeParts.length - 1; i++) {
        const key = relativeParts[i]
        if (target[key]) {
          target = target[key].children || target[key]
        } else {
          return prev // Item not found
        }
      }
      
      if (!target[itemKey]) return prev
      delete target[itemKey]
      return newItems
    })
    
    // Only update local order if deleting a top-level item
    if (relativeParts.length === 1) {
      setLocalOrder(prev => prev ? prev.filter(k => k !== itemKey) : prev)
    }
    
    // Then sync to server in background
    deleteItemMutation.mutate(pathToDelete, {
      onSuccess: () => showNotification('Deleted!'),
      onError: () => showNotification('Failed to delete', 'error'),
    })
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
    const draggedKey = itemToReorder.split('.').pop()!
    
    setDraggedItem(null)
    setDragOverIndex(null)
    
    // Check if dropped in same position - do nothing
    const currentIndex = localOrder?.indexOf(draggedKey) ?? -1
    if (currentIndex === targetIndex || currentIndex === -1) {
      return
    }
    
    // IMMEDIATELY update local order for instant visual feedback
    setLocalOrder(prevOrder => {
      if (!prevOrder) return prevOrder
      const idx = prevOrder.indexOf(draggedKey)
      if (idx === -1) return prevOrder
      
      const newOrder = [...prevOrder]
      newOrder.splice(idx, 1)
      newOrder.splice(targetIndex, 0, draggedKey)
      return newOrder
    })
    
    // Then sync to server in background
    try {
      await reorderItem.mutateAsync({ path: itemToReorder, targetIndex })
      showNotification('Reordered!')
    } catch (err) {
      // Rollback on error - reset to server order
      setLocalOrder(serverKeys)
      showNotification('Failed to reorder', 'error')
    }
  }

  if (isLoading) {
    return <div className="loading">Loading...</div>
  }

  if (error) {
    return <div className="error">Error loading structure: {(error as Error).message}</div>
  }

  const breadcrumb = getBreadcrumb()
  
  // Check if we're in a time view (time itself or time subcategories)
  const isTimeView = path === 'time' || path?.startsWith('time.')

  // Serialize an item and its children to structure.txt format
  const serializeItem = (key: string, item: StructureItem, indent: number = 0): string => {
    const spaces = '  '.repeat(indent)
    let result = `${spaces}${key}\n`
    
    // Add properties
    if (item.progress !== undefined) {
      result += `${spaces}  progress: ${item.progress}\n`
    }
    if (item.context) {
      result += `${spaces}  context: ${item.context}\n`
    }
    if (item.due) {
      result += `${spaces}  due: ${item.due}\n`
    }
    
    // Add children
    if (item.children) {
      for (const [childKey, childItem] of Object.entries(item.children)) {
        result += serializeItem(childKey, childItem as StructureItem, indent + 1)
      }
    }
    
    return result
  }

  const handleCopyItem = async (itemKey: string, item: StructureItem) => {
    try {
      const text = serializeItem(itemKey, item, 0)
      await navigator.clipboard.writeText(text.trimEnd())
      showNotification('Copied!')
    } catch (err) {
      showNotification('Failed to copy', 'error')
    }
  }

  return (
    <>
      <div className="top-buttons">
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>

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

        {/* Sections - rendered in local order for instant drag feedback */}
        {displayOrder.map((key, index) => {
          const item = displayItems[key]
          if (!item) return null
          const itemPath = path ? `${path}.${key}` : key
          const isPending = pendingItems.has(itemPath)
          const canDrag = !isPending && !isTimeView
          
          return (
            <div
              key={key}
              draggable={canDrag}
              onDragStart={canDrag ? () => handleDragStart(itemPath) : undefined}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={() => handleDrop(index)}
              className={`section-wrapper ${draggedItem === itemPath ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''} ${isPending ? 'pending' : ''}`}
            >
              <Section
                key={key}
                itemKey={key}
                item={item as StructureItem}
                parentPath={path || ''}
                colorIndex={index % COLORS.length}
                onItemClick={handleItemClick}
                onEditClick={handleEditClick}
                onCopyClick={handleCopyItem}
                isPending={isPending}
                isTimeView={isTimeView}
              />
            </div>
          )
        })}

        {displayOrder.length === 0 && (
          <div className="empty-state">No items at this level</div>
        )}

        {/* Add New Item Button - hide in time view */}
        {!isTimeView && (
          <button className="add-item-btn" onClick={handleAddClick}>
            + Add New Item
          </button>
        )}
      </div>

      {/* Edit/Create Modal */}
      {modalState && (
        <EditModal
          name={modalState.name}
          data={modalState.data}
          onSave={handleSave}
          onDelete={modalState.mode === 'edit' ? handleDelete : undefined}
          onClose={() => setModalState(null)}
          isSaving={updateItem.isPending || createItem.isPending}
          mode={modalState.mode}
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
