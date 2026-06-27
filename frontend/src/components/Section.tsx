import { useRef, useEffect, useState } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'
import InlineItemEditor from './InlineItemEditor'

const L2_COLORS = ['sky', 'sky-purple'] as const
const L3_COLORS = { 'sky': 'royal-blue', 'sky-purple': 'royal-purple' } as const

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
  colorIndex: number
  onItemClick: (path: string, hasChildren: boolean) => void
  onEditClick: (path: string, name: string, data: StructureItem) => void
  editingPath?: string | null
  onInlineSave?: (path: string, data: UpdatePayload) => void
  onInlineCancel?: () => void
  onInlineDelete?: (path: string) => void
  onCopyClick?: (itemKey: string, item: StructureItem) => void
  isPending?: boolean
  isTimeView?: boolean
  showContext?: boolean
  depth?: number
  showRaw?: boolean
  rawText?: string
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
  colorIndex: _colorIndex,
  onItemClick,
  onEditClick,
  editingPath = null,
  onInlineSave,
  onInlineCancel,
  onInlineDelete,
  onCopyClick,
  isPending = false,
  isTimeView = false,
  showContext = true,
  depth = 3,
  showRaw = false,
  rawText,
}: SectionProps) {
  const color = 'pine'
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const hasChildren = !!item.children && Object.keys(item.children).length > 0
  const title = item.title || itemKey

  const sectionRef = useRef<HTMLDivElement>(null)
  const layer1Ref = useRef<HTMLDivElement>(null)
  const [l1Wide, setL1Wide] = useState(false)

  useEffect(() => {
    const measure = () => {
      if (sectionRef.current && layer1Ref.current) {
        // scrollWidth = intrinsic content width, unaffected by flex layout changes.
        // Only observe sectionRef — observing layer1Ref causes a loop because
        // applying section--wide-l1 changes layer1-container's offsetWidth,
        // which would re-fire the observer and oscillate at boundary zoom levels.
        setL1Wide(layer1Ref.current.scrollWidth > sectionRef.current.offsetWidth / 3)
      }
    }
    const observer = new ResizeObserver(measure)
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])
  
  // Don't show edit buttons in time view, when pending, or for non-editable items
  const showEditButton = !isTimeView && !item.nonEditable
  const showLoading = isPending

  // Get child items for layer2
  const children = item.children || {}
  const childEntries = Object.entries(children)

  // Check if any level 2 child has its own children (level 3 items)
  const hasAnyGrandchildren = childEntries.some(
    ([, child]) => !!(child as StructureItem).children && Object.keys((child as StructureItem).children!).length > 0
  )

  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    if (!onCopyClick) return
    onCopyClick(itemKey, item)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (showRaw && rawText !== undefined) {
    return (
      <div className="section" ref={sectionRef}>
        <pre className="section-raw">{rawText}</pre>
        {!isTimeView && onCopyClick && (
          <div className="section-copy-zone" title="Copy to clipboard" onClick={handleCopy}>
            {copied ? <span className="copy-check">✔</span> : <span className="copy-handle" />}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`section${l1Wide ? ' section--wide-l1' : ''}`} ref={sectionRef}>
      <div className="section-body">
      {/* Layer 1 - Main category */}
      <div className="layer1-container" ref={layer1Ref}>
        <div className={`layer1-wrapper color-${color}`} style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {showLoading && <span className="loading-spinner" title="Syncing...">⟳</span>}
          {editingPath === itemPath ? (
            <InlineItemEditor
              itemKey={itemKey}
              item={item}
              onSave={(data) => onInlineSave?.(itemPath, data)}
              onCancel={() => onInlineCancel?.()}
              onDelete={showEditButton ? () => onInlineDelete?.(itemPath) : undefined}
            />
          ) : (
            <>
              {showEditButton && (
                <div
                  className="item-edit-zone"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditClick(itemPath, title, item)
                  }}
                  title="Edit item"
                />
              )}
              <div className={`layer1 color-${color}`}>
                <span className="item-title" onClick={() => onItemClick(itemPath, hasChildren)}>
                  {title}
                </span>
              </div>
            </>
          )}
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
        {showContext && item.context && (
          <div className="item-context">{item.context}</div>
        )}
      </div>

      {/* Layer 2 - Subcategories */}
      {depth >= 2 && <div className={`layer2-section${!hasAnyGrandchildren && childEntries.length > 0 ? ' layer2-flat' : ''}`}>
        {childEntries.map(([childKey, childItem], childIndex) => {
          const childPath = `${itemPath}.${childKey}`
          const childTitle = (childItem as StructureItem).title || childKey
          const childHasChildren = !!(childItem as StructureItem).children
          const grandchildren = (childItem as StructureItem).children || {}
          // Check if this child item is editable
          const childEditable = showEditButton && !(childItem as StructureItem).nonEditable && !(childItem as StructureItem).originalPath
          const l2Color = L2_COLORS[childIndex % 2]
          const l3Color = L3_COLORS[l2Color]
          const childColorClass = `color-${l2Color}`
          const grandColorClass = `color-${l3Color}`

          return (
            <div key={childKey} className="layer2-container">
              <div className="layer2-content">
                <div className={`layer2-wrapper ${childColorClass}`}>
                  {editingPath === childPath ? (
                    <InlineItemEditor
                      itemKey={childKey}
                      item={childItem as StructureItem}
                      onSave={(data) => onInlineSave?.(childPath, data)}
                      onCancel={() => onInlineCancel?.()}
                      onDelete={childEditable ? () => onInlineDelete?.(childPath) : undefined}
                    />
                  ) : (
                    <>
                      {childEditable && (
                        <div
                          className="item-edit-zone"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditClick(childPath, childTitle, childItem as StructureItem)
                          }}
                          title="Edit item"
                        />
                      )}
                      <div className={`layer2 ${childColorClass}`}>
                        <span className="item-title" onClick={() => onItemClick(childPath, childHasChildren)}>
                          {childTitle}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {/* Progress bar for layer2 */}
                {(childItem as StructureItem).progress !== undefined && (
                  <div className="progress-bar">
                    <div
                      className={`progress-fill bg-${l2Color}`}
                      style={{ width: `${(childItem as StructureItem).progress}%` }}
                    />
                  </div>
                )}
                {/* Due date for layer2 */}
                {(childItem as StructureItem).due && (
                  <div className={`item-due due-${getDueCategory((childItem as StructureItem).due)}`}>
                    {formatDueDate((childItem as StructureItem).due!)}
                  </div>
                )}
                {/* Context for layer2 */}
                {showContext && (childItem as StructureItem).context && (
                  <div className="item-context">{(childItem as StructureItem).context}</div>
                )}
              </div>

              {/* Layer 3 - Items */}
              {depth >= 3 && Object.keys(grandchildren).length > 0 && (
                <div className="layer3-container">
                  {Object.entries(grandchildren).map(([grandKey, grandItem]) => {
                    const grandPath = `${childPath}.${grandKey}`
                    const grandTitle = (grandItem as StructureItem).title || grandKey
                    const grandHasChildren = !!(grandItem as StructureItem).children
                    // Check if this grandchild item is editable
                    const grandEditable = showEditButton && !(grandItem as StructureItem).nonEditable && !(grandItem as StructureItem).originalPath

                    return (
                      <div key={grandKey}>
                        <div className={`layer3-wrapper ${grandColorClass}`}>
                          {editingPath === grandPath ? (
                            <InlineItemEditor
                              itemKey={grandKey}
                              item={grandItem as StructureItem}
                              onSave={(data) => onInlineSave?.(grandPath, data)}
                              onCancel={() => onInlineCancel?.()}
                              onDelete={grandEditable ? () => onInlineDelete?.(grandPath) : undefined}
                            />
                          ) : (
                            <>
                              {grandEditable && (
                                <div
                                  className="item-edit-zone"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onEditClick(grandPath, grandTitle, grandItem as StructureItem)
                                  }}
                                  title="Edit item"
                                />
                              )}
                              <div className={`layer3-item ${grandColorClass}`}>
                                <span className="item-title" onClick={() => onItemClick(grandPath, grandHasChildren)}>
                                  {grandTitle}
                                  {(grandItem as StructureItem).progress !== undefined && (
                                    <span style={{ marginLeft: '0.375rem', opacity: 0.6, fontSize: '0.6875rem' }}>
                                      {(grandItem as StructureItem).progress}%
                                    </span>
                                  )}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        {/* Due date for layer3 */}
                        {(grandItem as StructureItem).due && (
                          <div className={`item-due due-${getDueCategory((grandItem as StructureItem).due)}`} style={{ marginLeft: '0.5rem' }}>
                            {formatDueDate((grandItem as StructureItem).due!)}
                          </div>
                        )}
                        {/* Context for layer3 */}
                        {showContext && (grandItem as StructureItem).context && (
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
      </div>}
      </div>
      {/* Copy zone — full-height strip on the right */}
      {!isTimeView && onCopyClick && (
        <div className="section-copy-zone" title="Copy to clipboard" onClick={handleCopy}>
          {copied ? <span className="copy-check">✔</span> : <span className="copy-handle" />}
        </div>
      )}
    </div>
  )
}

export default Section
