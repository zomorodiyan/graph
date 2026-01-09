import { StructureItem } from '../api/client'

const COLORS = ['green', 'blue', 'purple', 'brown']

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
  colorIndex: number
  onItemClick: (path: string, hasChildren: boolean) => void
  onEditClick: (path: string, name: string, data: StructureItem) => void
  onMoveUp: (path: string) => void
  onMoveDown: (path: string) => void
}

function Section({
  itemKey,
  item,
  parentPath,
  colorIndex,
  onItemClick,
  onEditClick,
  onMoveUp,
  onMoveDown,
}: SectionProps) {
  const color = COLORS[colorIndex]
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const hasChildren = !!item.children && Object.keys(item.children).length > 0
  const title = item.title || itemKey

  // Get child items for layer2
  const children = item.children || {}
  const childEntries = Object.entries(children)

  return (
    <div className="section">
      {/* Layer 1 - Main category */}
      <div className="layer1-container">
        <div className="layer1-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="order-btn"
            onClick={(e) => { e.stopPropagation(); onMoveUp(itemPath); }}
            title="Move up"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              opacity: 0.6,
              fontSize: '12px'
            }}
          >
            ▲
          </button>
          <div
            className={`layer1 color-${color}`}
            onClick={() => onItemClick(itemPath, hasChildren)}
            onContextMenu={(e) => {
              e.preventDefault()
              onEditClick(itemPath, title, item)
            }}
          >
            {title}
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
              <div
                className={`layer2 color-${color}`}
                onClick={() => onItemClick(childPath, childHasChildren)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onEditClick(childPath, childTitle, childItem as StructureItem)
                }}
              >
                {childTitle}
                {(childItem as StructureItem).progress !== undefined && (
                  <span style={{ marginLeft: '8px', opacity: 0.7, fontSize: '12px' }}>
                    {(childItem as StructureItem).progress}%
                  </span>
                )}
              </div>

              {/* Layer 3 - Items */}
              {Object.keys(grandchildren).length > 0 && (
                <div className="layer3-container">
                  {Object.entries(grandchildren).map(([grandKey, grandItem]) => {
                    const grandPath = `${childPath}.${grandKey}`
                    const grandTitle = (grandItem as StructureItem).title || grandKey
                    const grandHasChildren = !!(grandItem as StructureItem).children

                    return (
                      <div
                        key={grandKey}
                        className={`layer3-item color-${color}`}
                        onClick={() => onItemClick(grandPath, grandHasChildren)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          onEditClick(grandPath, grandTitle, grandItem as StructureItem)
                        }}
                      >
                        {grandTitle}
                        {(grandItem as StructureItem).progress !== undefined && (
                          <span style={{ marginLeft: '6px', opacity: 0.6, fontSize: '11px' }}>
                            {(grandItem as StructureItem).progress}%
                          </span>
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
