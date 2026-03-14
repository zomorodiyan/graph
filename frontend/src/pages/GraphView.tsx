import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useLocation, useNavigate, Link, useParams } from 'react-router-dom'
import { useStructure, useUpdateItem, useDeleteItem, useReorderItem, useCreateItem, getItemByPath } from '../hooks/useGraph'
import { useTheme } from '../context/ThemeContext'
import { StructureItem, UpdatePayload, fetchStructureText } from '../api/client'
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
  
  // Browser-like navigation history
  const historyRef = useRef<string[]>([location.pathname])
  const historyIndexRef = useRef<number>(0)
  const isNavigatingRef = useRef<boolean>(false)
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

  // Swipe navigation state
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const SWIPE_THRESHOLD = 100 // minimum distance for swipe
  const SWIPE_VERTICAL_LIMIT = 75 // max vertical movement to still count as horizontal swipe

  // Track navigation history (browser-like back/forward)
  useEffect(() => {
    if (isNavigatingRef.current) {
      // Navigation was triggered by back/forward, don't add to history
      isNavigatingRef.current = false
      return
    }
    
    const currentPath = location.pathname
    const historyIndex = historyIndexRef.current
    const history = historyRef.current
    
    // If navigating normally (not back/forward), add to history
    if (history[historyIndex] !== currentPath) {
      // Truncate forward history when making a new navigation
      historyRef.current = [...history.slice(0, historyIndex + 1), currentPath]
      historyIndexRef.current = historyRef.current.length - 1
    }
  }, [location.pathname])

  // Navigate back in history
  const navigateBack = useCallback(() => {
    if (historyIndexRef.current > 0) {
      isNavigatingRef.current = true
      historyIndexRef.current--
      navigate(historyRef.current[historyIndexRef.current])
    } else {
      // At beginning of history, try to go to parent or structures list
      const base = graphName ? `/g/${graphName}` : ''
      if (!path) {
        if (graphName) navigate('/')
      } else {
        isNavigatingRef.current = true
        const parts = path.split('.')
        const newPath = parts.length === 1 ? (base || '/') : `${base}/${parts.slice(0, -1).join('.').replace(/\./g, '/')}`
        historyRef.current = [...historyRef.current.slice(0, historyIndexRef.current + 1), newPath]
        historyIndexRef.current = historyRef.current.length - 1
        navigate(newPath)
      }
    }
  }, [path, navigate, graphName])

  // Navigate forward in history
  const navigateForward = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isNavigatingRef.current = true
      historyIndexRef.current++
      navigate(historyRef.current[historyIndexRef.current])
    }
  }, [navigate])

  // Swipe gesture handlers
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return

      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY
      const deltaX = touchEndX - touchStartX.current
      const deltaY = Math.abs(touchEndY - touchStartY.current)

      // Check for horizontal swipe with limited vertical movement
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < SWIPE_VERTICAL_LIMIT) {
        if (deltaX > 0) {
          // Swipe right = go back
          navigateBack()
        } else {
          // Swipe left = go forward
          navigateForward()
        }
      }

      touchStartX.current = null
      touchStartY.current = null
    }

    document.addEventListener('touchstart', handleTouchStart)
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [navigateBack, navigateForward])

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
    navigate(buildPath(itemPath))
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

  return (
    <>
      <div className="top-buttons">
        <button className="copy-btn" onClick={async () => {
          try {
            const text = await fetchStructureText(graphName)
            await navigator.clipboard.writeText(text)
            showNotification('Copied to clipboard!')
          } catch (err) {
            showNotification('Failed to copy', 'error')
          }
        }} title="Copy structure to clipboard">
          📋
        </button>
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
