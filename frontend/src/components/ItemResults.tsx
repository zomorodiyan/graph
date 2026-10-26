import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Structure, StructureItem, UpdatePayload, updateItem } from '@api'
import { getItemByPath } from '../hooks/useGraph'
import { useViewOptions } from '../hooks/useViewOptions'
import { useLongPressFactory } from '../hooks/useLongPress'
import Section from './Section'
import MobileEditSheet from './MobileEditSheet'
import Notification from './Notification'

const isTouchDevice = () => !!window.matchMedia?.('(hover: none) and (pointer: coarse)').matches

interface ItemResultsProps {
  graphName: string
  structure: Structure
  // One graph's filtered items (see filterTree in utils/tags.ts): synthetic
  // keys, with realPaths mapping each rendered path back to the real item.
  items: Record<string, StructureItem>
  realPaths: Map<string, string>
  // After an item is opened (the search panel collapses itself).
  onOpen?: () => void
  // After an edit is saved.
  onSaved?: () => void
  onTagClick?: (tag: string) => void
}

// The search panel's results, rendered through the normal Section component.
// Clicking (tapping) an item opens it in the graph; items can be edited in
// place: Shift/Alt+click on desktop, long-press on touch (in the same bottom
// sheet the graph page uses).
function ItemResults({ graphName, structure, items, realPaths, onOpen, onSaved, onTagClick }: ItemResultsProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { depth, viewMode, minimalView } = useViewOptions()
  const [isMobile] = useState(isTouchDevice)
  const makeLongPressHandlers = useLongPressFactory()

  const [contextOverrides, setContextOverrides] = useState<Map<string, boolean>>(new Map())
  const toggleContextOverride = (path: string, shown: boolean) =>
    setContextOverrides(prev => new Map(prev).set(path, shown))

  // The (synthetic) path of the item being edited.
  const [editing, setEditing] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Same target as a click in the graph itself: into the item if it has
  // children, otherwise its parent page.
  const handleOpen = (viewPath: string) => {
    const realPath = realPaths.get(viewPath)
    if (!realPath) return
    const item = getItemByPath(structure, realPath)
    const target = item?.children && Object.keys(item.children).length > 0
      ? realPath
      : realPath.split('.').slice(0, -1).join('.')
    navigate(`/g/${graphName}${target ? `/${target.replace(/\./g, '/')}` : ''}`)
    onOpen?.()
  }

  const saveEdit = async (viewPath: string, data: UpdatePayload) => {
    setEditing(null)
    const realPath = realPaths.get(viewPath)
    if (!realPath || Object.keys(data).length === 0) return
    try {
      await updateItem(realPath, data, graphName)
      await queryClient.invalidateQueries({ queryKey: ['structure', graphName] })
      onSaved?.()
      notify('Saved!')
    } catch (err) {
      notify((err as Error).message || 'Failed to save', 'error')
    }
  }

  const editingRealPath = editing ? realPaths.get(editing) : undefined
  const editingItem = editingRealPath ? getItemByPath(structure, editingRealPath) : null

  return (
    <>
      {Object.entries(items).map(([key, item]) => (
        <div key={key} className="section-wrapper">
          <Section
            itemKey={key}
            item={item}
            parentPath=""
            onItemClick={handleOpen}
            onItemEnter={handleOpen}
            onEditClick={setEditing}
            editingPath={editing}
            editInline={!isMobile}
            onInlineSave={saveEdit}
            onInlineCancel={() => setEditing(null)}
            makeDragGestureHandlers={(viewPath) => makeLongPressHandlers(() => setEditing(viewPath), () => handleOpen(viewPath))}
            showContext={viewMode === 'context' && !minimalView}
            contextOverrides={contextOverrides}
            onToggleContext={toggleContextOverride}
            minimal={minimalView}
            depth={depth === 0 ? 3 : depth}
            onTagClick={onTagClick}
          />
        </div>
      ))}

      {notification && <Notification message={notification.message} type={notification.type} />}
      {isMobile && editing && editingItem && editingRealPath && (
        <MobileEditSheet
          itemKey={editingRealPath.split('.').pop() ?? ''}
          item={editingItem as StructureItem}
          onSave={(data) => saveEdit(editing, data)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  )
}

export default ItemResults
