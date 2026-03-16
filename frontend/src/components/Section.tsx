import { StructureItem } from '../api/client'

const COLORS = ['green', 'blue', 'purple', 'brown']

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
  colorIndex: number
  onItemClick: (path: string, hasChildren: boolean) => void
  onEditClick: (path: string, name: string, data: StructureItem) => void
  onCopyClick?: (itemKey: string, item: StructureItem) => void
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
  onCopyClick,
  isPending = false,
  isTimeView = false,
}: SectionProps) {
  const color = COLORS[colorIndex]
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const hasChildren = !!item.children && Object.keys(item.children).length > 0
  const title = item.title || itemKey
  
  // Don't show edit buttons in time view, when pending, or for non-editable items
  const showEditButton = !isTimeView && !item.nonEditable
  const showLoading = isPending

  // Get child items for layer2
  const children = item.children || {}
  const childEntries = Object.entries(children)

  return (
    <div className="section">
      {/* Copy button at top-right */}
      {!isTimeView && onCopyClick && (
        <span 
          className="copy-handle" 
          title="Copy to clipboard"
          onClick={(e) => {
            e.stopPropagation()
            onCopyClick(itemKey, item)
          }}
        />
      )}
      {/* Layer 1 - Main category */}
      <div className="layer1-container">
        <div className="layer1-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {showLoading && <span className="loading-spinner" title="Syncing...">⟳</span>}
          <div className={`layer1 color-${color} ${showEditButton ? 'split-button' : ''}`}>
            {showEditButton && (
              <div
                className="split-left"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditClick(itemPath, title, item)
                }}
                title="Edit item"
              />
            )}
            <span className="item-title" onClick={() => !showEditButton && onItemClick(itemPath, hasChildren)}>
              {title}
            </span>
            <div
              className={showEditButton ? "split-right" : "full-click"}
              onClick={() => onItemClick(itemPath, hasChildren)}
              title={showEditButton ? "Open item" : undefined}
            />
          </div>
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
          // Check if this child item is editable
          const childEditable = showEditButton && !(childItem as StructureItem).nonEditable && !(childItem as StructureItem).originalPath

          return (
            <div key={childKey} className="layer2-container">
              <div className="layer2-content">
                <div className="layer2-wrapper">
                  <div className={`layer2 color-${color} ${childEditable ? 'split-button' : ''}`}>
                    {childEditable && (
                      <div
                        className="split-left"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditClick(childPath, childTitle, childItem as StructureItem)
                        }}
                        title="Edit item"
                      />
                    )}
                    <span className="item-title">
                      {childTitle}
                      {(childItem as StructureItem).progress !== undefined && (
                        <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.75rem' }}>
                          {(childItem as StructureItem).progress}%
                        </span>
                      )}
                    </span>
                    <div
                      className={childEditable ? "split-right" : "full-click"}
                      onClick={() => onItemClick(childPath, childHasChildren)}
                      title={childEditable ? "Open item" : undefined}
                    />
                  </div>
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
              </div>

              {/* Layer 3 - Items */}
              {Object.keys(grandchildren).length > 0 && (
                <div className="layer3-container">
                  {Object.entries(grandchildren).map(([grandKey, grandItem]) => {
                    const grandPath = `${childPath}.${grandKey}`
                    const grandTitle = (grandItem as StructureItem).title || grandKey
                    const grandHasChildren = !!(grandItem as StructureItem).children
                    // Check if this grandchild item is editable
                    const grandEditable = showEditButton && !(grandItem as StructureItem).nonEditable && !(grandItem as StructureItem).originalPath

                    return (
                      <div key={grandKey}>
                        <div className="layer3-wrapper">
                          <div className={`layer3-item color-${color} ${grandEditable ? 'split-button' : ''}`}>
                            {grandEditable && (
                              <div
                                className="split-left"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onEditClick(grandPath, grandTitle, grandItem as StructureItem)
                                }}
                                title="Edit item"
                              />
                            )}
                            <span className="item-title">
                              {grandTitle}
                              {(grandItem as StructureItem).progress !== undefined && (
                                <span style={{ marginLeft: '0.375rem', opacity: 0.6, fontSize: '0.6875rem' }}>
                                  {(grandItem as StructureItem).progress}%
                                </span>
                              )}
                            </span>
                            <div
                              className={grandEditable ? "split-right" : "full-click"}
                              onClick={() => onItemClick(grandPath, grandHasChildren)}
                              title={grandEditable ? "Open item" : undefined}
                            />
                          </div>
                        </div>
                        {/* Due date for layer3 */}
                        {(grandItem as StructureItem).due && (
                          <div className={`item-due due-${getDueCategory((grandItem as StructureItem).due)}`} style={{ marginLeft: '0.5rem' }}>
                            {formatDueDate((grandItem as StructureItem).due!)}
                          </div>
                        )}
                        {/* Context for layer3 */}
                        {(grandItem as StructureItem).context && (
                          <div className="item-context" style={{ marginLeft: '0.5rem' }}>
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
