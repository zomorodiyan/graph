import { StructureItem } from '../api/client'

const COLORS = ['green', 'blue', 'purple', 'brown']

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
  colorIndex: number
  onItemClick: (path: string, hasChildren: boolean) => void
  onEditClick: (path: string, name: string, data: StructureItem) => void
  isPending?: boolean  // Item is being synced
  isTimeView?: boolean // Items in time view can't be edited (they're virtual)
}

// Helper to calculate due date category
function getDueCategory(dueDate: string | undefined): string | null {
  if (!dueDate) return null
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  
  const diffTime = due.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 7) return 'soon'
  return 'later'
}

// Helper to format due date display
function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  
  const diffTime = due.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `${diffDays}d`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Section({
  itemKey,
  item,
  parentPath,
  colorIndex,
  onItemClick,
  onEditClick,
  isPending = false,
  isTimeView = false,
}: SectionProps) {
  const color = COLORS[colorIndex]
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const hasChildren = !!item.children && Object.keys(item.children).length > 0
  const title = item.title || itemKey
  
  // Don't show edit buttons in time view or when pending
  const showEditButton = !isTimeView
  const showLoading = isPending

  // Get child items for layer2
  const children = item.children || {}
  const childEntries = Object.entries(children)

  return (
    <div className="section">
      {/* Layer 1 - Main category */}
      <div className="layer1-container">
        <div className="layer1-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!isTimeView && <span className="drag-handle" title="Drag to reorder">⠿</span>}
          <div
            className={`layer1 color-${color}`}
            onClick={() => onItemClick(itemPath, hasChildren)}
          >
            {title}
          </div>
          {showLoading ? (
            <span className="loading-spinner" title="Syncing...">⟳</span>
          ) : showEditButton ? (
            <button
              className="edit-btn"
              onClick={(e) => {
                e.stopPropagation()
                onEditClick(itemPath, title, item)
              }}
              title="Edit item"
            >
              🖊️
            </button>
          ) : null}
        </div>
        {/* Progress bar */}
        {item.progress !== undefined && (
          <div className="progress-bar">
            <div
              className={`progress-fill bg-${color}`}
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
        {/* Due date */}
        {item.due && (
          <div className={`item-due due-${getDueCategory(item.due)}`}>
            {formatDueDate(item.due)}
          </div>
        )}
        {/* Context */}
        {item.context && (
          <div className="item-context">{item.context}</div>
        )}
      </div>

      {/* Layer 2 - Subcategories */}
      <div className="layer2-section">
        {childEntries.map(([childKey, childItem]) => {
          const childPath = `${itemPath}.${childKey}`
          const childTitle = (childItem as StructureItem).title || childKey
          const childHasChildren = !!(childItem as StructureItem).children
          const grandchildren = (childItem as StructureItem).children || {}

          return (
            <div key={childKey} className="layer2-container">
              <div className="layer2-wrapper">
                <div
                  className={`layer2 color-${color}`}
                  onClick={() => onItemClick(childPath, childHasChildren)}
                >
                  {childTitle}
                  {(childItem as StructureItem).progress !== undefined && (
                    <span style={{ marginLeft: '8px', opacity: 0.7, fontSize: '12px' }}>
                      {(childItem as StructureItem).progress}%
                    </span>
                  )}
                </div>
                {showEditButton && (
                  <button
                    className="edit-btn edit-btn-small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditClick(childPath, childTitle, childItem as StructureItem)
                    }}
                    title="Edit item"
                  >
                    🖊️
                  </button>
                )}
              </div>
              {/* Due date for layer2 */}
              {(childItem as StructureItem).due && (
                <div className={`item-due due-${getDueCategory((childItem as StructureItem).due)}`}>
                  {formatDueDate((childItem as StructureItem).due!)}
                </div>
              )}
              {/* Context for layer2 */}
              {(childItem as StructureItem).context && (
                <div className="item-context">{(childItem as StructureItem).context}</div>
              )}

              {/* Layer 3 - Items */}
              {Object.keys(grandchildren).length > 0 && (
                <div className="layer3-container">
                  {Object.entries(grandchildren).map(([grandKey, grandItem]) => {
                    const grandPath = `${childPath}.${grandKey}`
                    const grandTitle = (grandItem as StructureItem).title || grandKey
                    const grandHasChildren = !!(grandItem as StructureItem).children

                    return (
                      <div key={grandKey}>
                        <div className="layer3-wrapper">
                          <div
                            className={`layer3-item color-${color}`}
                            onClick={() => onItemClick(grandPath, grandHasChildren)}
                          >
                            {grandTitle}
                            {(grandItem as StructureItem).progress !== undefined && (
                              <span style={{ marginLeft: '6px', opacity: 0.6, fontSize: '11px' }}>
                                {(grandItem as StructureItem).progress}%
                              </span>
                            )}
                          </div>
                          {showEditButton && (
                            <button
                              className="edit-btn edit-btn-tiny"
                              onClick={(e) => {
                                e.stopPropagation()
                                onEditClick(grandPath, grandTitle, grandItem as StructureItem)
                              }}
                              title="Edit item"
                            >
                              🖊️
                            </button>
                          )}
                        </div>
                        {/* Due date for layer3 */}
                        {(grandItem as StructureItem).due && (
                          <div className={`item-due due-${getDueCategory((grandItem as StructureItem).due)}`} style={{ marginLeft: '8px' }}>
                            {formatDueDate((grandItem as StructureItem).due!)}
                          </div>
                        )}
                        {/* Context for layer3 */}
                        {(grandItem as StructureItem).context && (
                          <div className="item-context" style={{ marginLeft: '8px' }}>
                            {(grandItem as StructureItem).context}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Section
