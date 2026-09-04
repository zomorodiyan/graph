import { useRef } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'
import { parseLocalDate, daysUntil } from '../utils/dates'
import InlineItemEditor from './InlineItemEditor'

// Per-item note disclosure triangle (see .context-toggle in App.css) — points
// right when notes are hidden, rotates to point down when shown. Its onClick
// calls the same handler as the page's N button (see GraphView's
// toggleNoteView), so a triangle click and the button are one shared on/off
// state, not a per-item override — every triangle always matches the button.
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
  colorIndex: number
  // Plain click on a level-2/3 title (any device) — "promote this item and
  // its siblings to the top" navigation.
  onItemClick: (path: string) => void
  // Plain click on a level-1 title (desktop only) — "descend into this
  // item's own children" navigation instead, a no-op on a leaf item (same
  // target handleNavigateInto/mobile's swipe-left already use).
  onItemEnter: (path: string) => void
  onEditClick: (path: string, name: string, data: StructureItem) => void
  editingPath?: string | null
  // When false (mobile), an item being edited/added-to stays in place with just
  // a highlight — the form itself renders elsewhere, in a MobileEditSheet — since
  // swapping it in inline is what let the on-screen keyboard cover it. Desktop
  // has no on-screen keyboard, so it keeps the inline swap (default true).
  editInline?: boolean
  onInlineSave?: (path: string, data: UpdatePayload) => void
  onInlineCancel?: () => void
  // Sub-item creation (via the right-click menu or a right-swipe): parentPath
  // currently being created under, and its callbacks
  creatingPath?: string | null
  onSubCreateStart?: (parentPath: string) => void
  onSubCreateSave?: (parentPath: string, data: UpdatePayload) => void
  onSubCreateCancel?: () => void
  // Right-click menu (Delete / New / Paste). canAddSub tells the caller whether
  // this row supports sub-item creation — false for layer3, which has no "+"/
  // paste-sub UI to open (there's no layer4 rendering to swap an editor into).
  onContextMenu?: (e: React.MouseEvent, path: string, canAddSub: boolean) => void
  // Two-way "point at an item" channel with the agent chat (see
  // useHighlights.ts) — desktop: click the row background (not the title,
  // which keeps its own click); mobile: a plain tap (long-press starts a
  // drag instead). userHighlights/agentHighlights are absolute paths, same
  // format as itemPath/childPath/grandPath below.
  onToggleHighlight?: (path: string) => void
  // Mobile long-press-to-drag (see useDragGesture.ts) — built and owned by
  // GraphView (it has the reorder/nest state and functions this ultimately
  // drives), passed down so all three row levels share the same gesture
  // recognizer instead of each Section instance running its own.
  makeDragGestureHandlers?: (itemPath: string, onTap: () => void) => Record<string, unknown>
  userHighlights?: Set<string>
  agentHighlights?: Set<string>
  // Items the agent has proposed deleting (see request_delete_items in
  // agentClient.ts) — a distinct red ring, takes visual precedence over the
  // two highlight rings above when it applies (see highlightClasses).
  agentDeletePending?: Set<string>
  isPending?: boolean
  // Level-2/3 drag reordering — level-1 drag lives in GraphView's own
  // section-wrapper, outside this component. draggedPath/dragOverPath are full
  // paths (unlike level-1's index-based drag state) so a hover target is
  // unambiguous across however many Section instances are on screen.
  draggedPath?: string | null
  dragOverPath?: string | null
  // Which part of the hovered row the drag is over — 'before'/'after'
  // reorder relative to the hovered row, 'nest' makes the dragged item a
  // child of the hovered one (see getDropZone). Only meaningful together
  // with dragOverPath.
  dragOverZone?: 'before' | 'nest' | 'after' | null
  onItemDragStart?: (path: string) => void
  onItemDragOver?: (path: string, zone: 'before' | 'nest' | 'after') => void
  onItemDragEnd?: () => void
  onItemDrop?: (path: string, zone: 'before' | 'nest' | 'after') => void
  dragEnabled?: boolean
  pendingPaths?: Set<string>
  isTimeView?: boolean
  showContext?: boolean
  // Called by a row's note-disclosure triangle — the same handler the page's
  // N button uses (see GraphView's toggleNoteView), so clicking either one
  // flips the one shared showContext state for every row at once.
  onToggleContext?: () => void
  // Long-press on the context toggle: hides date/tags badges too,
  // leaving just the title (showContext is expected to be forced off alongside this)
  minimal?: boolean
  depth?: number
  showRaw?: boolean
  rawText?: string
}

// Appends the highlight class(es) for a row — user/agent highlights can both
// apply at once (see useHighlights.ts and the .user-highlighted/.agent-highlighted
// CSS, which layer as independent box-shadow rings rather than competing
// outlines). agent-delete-pending is deliberately higher-specificity in CSS
// so it visually wins outright over either — a proposed deletion is an alert
// state, not just another "look here" ring.
function highlightClasses(path: string, userHighlights?: Set<string>, agentHighlights?: Set<string>, agentDeletePending?: Set<string>): string {
  return `${userHighlights?.has(path) ? ' user-highlighted' : ''}${agentHighlights?.has(path) ? ' agent-highlighted' : ''}${agentDeletePending?.has(path) ? ' agent-delete-pending' : ''}`
}

// Which part of a row a drag is hovering over — mirrors GraphView's own
// getDropZone (level-1 uses that one directly; this is the level-2/3 copy,
// small enough not to be worth threading through props/exports for). Left
// 30% reorders before this row, right 30% reorders after it, the middle 40%
// nests — side zones so this reads naturally along these rows' own
// left-to-right flow (see .layer2-section/.layer3-container's flex-wrap).
function getDropZone(e: React.DragEvent): 'before' | 'nest' | 'after' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const frac = (e.clientX - rect.left) / rect.width
  if (frac < 0.3) return 'before'
  if (frac > 0.7) return 'after'
  return 'nest'
}

// Helper to calculate due date category for CSS class
export function getDueCategory(dueDate: string | undefined): string | null {
  if (!dueDate) return null
  const diffDays = daysUntil(dueDate)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 7) return 'soon'
  return 'later'
}

// Helper to format date display — today shows "Today", tomorrow "2d", etc.
export function formatDueDate(dueDate: string): string {
  const diffDays = daysUntil(dueDate)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Today'
  if (diffDays <= 7) return `${diffDays + 1}d`
  return parseLocalDate(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Stable hash → one of 6 fixed tag palette slots (see .tag-0..5 in App.css) —
// same tag text always lands on the same color, independent of item/render order.
const TAG_PALETTE_SIZE = 6
function tagColorIndex(tag: string): number {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return hash % TAG_PALETTE_SIZE
}

// Date + tags badges, shared by all three layers — hidden entirely in minimal view.
function DateAndTagBadges({ item, minimal }: { item: StructureItem; minimal: boolean }) {
  if (minimal) return null
  return (
    <>
      {item.date && (
        <span className={`item-due due-${getDueCategory(item.date)}`}>{formatDueDate(item.date)}</span>
      )}
      {item.tags && item.tags.length > 0 && (
        <span className="item-tags">
          {item.tags.map(tag => (
            <span key={tag} className={`tag-pill tag-${tagColorIndex(tag)}`}>{tag}</span>
          ))}
        </span>
      )}
    </>
  )
}

function Section({
  itemKey,
  item,
  parentPath,
  colorIndex: _colorIndex,
  onItemClick,
  onItemEnter,
  onEditClick,
  editingPath = null,
  editInline = true,
  onInlineSave,
  onInlineCancel,
  creatingPath = null,
  onSubCreateStart,
  onSubCreateSave,
  onSubCreateCancel,
  onContextMenu,
  onToggleHighlight,
  makeDragGestureHandlers,
  userHighlights,
  agentHighlights,
  agentDeletePending,
  isPending = false,
  draggedPath = null,
  dragOverPath = null,
  dragOverZone = null,
  onItemDragStart,
  onItemDragOver,
  onItemDragEnd,
  onItemDrop,
  dragEnabled = false,
  pendingPaths,
  isTimeView = false,
  showContext = true,
  onToggleContext,
  minimal = false,
  depth = 3,
  showRaw = false,
  rawText,
}: SectionProps) {
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const title = item.title || itemKey

  const sectionRef = useRef<HTMLDivElement>(null)

  // Editable unless it's a virtual time-view item or explicitly non-editable —
  // gates long-press/right-click, swipe-right, and the Delete button inside the editor.
  const rowEditable = !isTimeView && !item.nonEditable
  const showLoading = isPending
  // Mobile gesture vocabulary: swipe-left anywhere on the page navigates
  // into whichever item is at that height (see GraphView's usePageSwipe),
  // swipe-right navigates back up the tree, long-press starts a drag (see
  // makeDragGestureHandlers, passed down from GraphView since it owns the
  // reorder/nest state and functions), a plain tap toggles highlight, and
  // editing moves to the selection toolbar's Edit button instead (long-press
  // can't mean both "open the editor" and "start a drag"). Desktop: plain
  // click navigates (into a level-1 item's own children via onItemEnter, or
  // promoting a level-2/3 item to the top via onItemClick — a no-op on a
  // leaf level-1 item), Ctrl/Cmd+click toggles highlight, Shift/Alt+click
  // opens the editor directly, right-click shows the context menu.
  const isMobile = !editInline

  // Get child items for layer2
  const children = item.children || {}
  const childEntries = Object.entries(children)

  if (showRaw && rawText !== undefined) {
    return (
      <div className="section" ref={sectionRef}>
        <pre className="section-raw" data-item-path={itemPath}>{rawText}</pre>
      </div>
    )
  }

  return (
    <div className="section" ref={sectionRef}>
      <div
        data-item-path={itemPath}
        className="section-body"
      >
      {/* Layer 1 - Main category */}
      <div className="layer1-container">
        <div className="layer1-wrapper" style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {showLoading && <span className="loading-spinner" title="Syncing...">⟳</span>}
          {editingPath === itemPath && editInline ? (
            <InlineItemEditor
              itemKey={itemKey}
              item={item}
              onSave={(data) => onInlineSave?.(itemPath, data)}
              onCancel={() => onInlineCancel?.()}
            />
          ) : (
            <>
              <div
                className={`layer1${!editInline && (editingPath === itemPath || creatingPath === itemPath) ? ' item-editing' : ''}${highlightClasses(itemPath, userHighlights, agentHighlights, agentDeletePending)}`}
                {...(!isMobile && rowEditable
                  ? {
                      onContextMenu: (e: React.MouseEvent) => onContextMenu?.(e, itemPath, true),
                      // Ctrl/Cmd+click anywhere on the row (not just the title
                      // span) toggles highlight — the title's own handler
                      // stops propagation for this case so the toggle doesn't
                      // fire twice when the click lands on the title itself.
                      onClick: (e: React.MouseEvent) => {
                        if (e.ctrlKey || e.metaKey) onToggleHighlight?.(itemPath)
                      },
                    }
                  : {})}
                {...(isMobile && rowEditable
                  ? makeDragGestureHandlers?.(itemPath, () => onToggleHighlight?.(itemPath))
                  : {})}
              >
                <span
                  className="item-title"
                  // Mobile: tap toggles this item's highlight (swipe-left
                  // navigates into it, long-press opens its editor — see the
                  // gesture handlers above). Desktop: plain click navigates
                  // into this item's own children (onItemEnter — a no-op on
                  // a leaf item), Ctrl/Cmd+click toggles highlight, Shift/
                  // Alt+click opens the editor directly.
                  title={!isMobile && rowEditable ? 'Ctrl/Cmd+click to select · Shift/Alt+click to edit' : undefined}
                  onClick={isMobile ? undefined : (e) => {
                    if (rowEditable && (e.ctrlKey || e.metaKey)) {
                      e.stopPropagation()
                      onToggleHighlight?.(itemPath)
                    } else if (rowEditable && (e.shiftKey || e.altKey)) {
                      onEditClick(itemPath, title, item)
                    } else {
                      onItemEnter(itemPath)
                    }
                  }}
                >
                  {title}
                  <DateAndTagBadges item={item} minimal={minimal} />
                </span>
                {!minimal && item.context && (
                  <button
                    type="button"
                    className={`context-toggle${showContext ? ' expanded' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleContext?.() }}
                    title={showContext ? 'Hide notes' : 'Show notes'}
                  >
                    <ChevronIcon />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {/* Context */}
        {showContext && item.context && (
          <div
            className="item-context"
            onClick={!isMobile && rowEditable ? (e) => {
              if (e.ctrlKey || e.metaKey) onToggleHighlight?.(itemPath)
            } : undefined}
          >
            {item.context}
          </div>
        )}
      </div>

      {/* Layer 2 - Subcategories */}
      {depth >= 2 && <div className="layer2-section">
        {childEntries.map(([childKey, childItem]) => {
          const childPath = `${itemPath}.${childKey}`
          const childTitle = (childItem as StructureItem).title || childKey
          const grandchildren = (childItem as StructureItem).children || {}
          // Check if this child item is editable
          const childRowEditable = rowEditable && !(childItem as StructureItem).nonEditable && !(childItem as StructureItem).originalPath
          // Native HTML5 draggable — desktop only, same reason as GraphView.tsx's
          // own canDrag: some mobile browsers translate a long-press-and-move on
          // a draggable="true" element into their own native drag session,
          // which cancels the custom touch-gesture system's pointer tracking
          // mid-drag and leaves the eventual drop finding nothing to move.
          const childCanDrag = !isMobile && dragEnabled && childRowEditable && !pendingPaths?.has(childPath)

          return (
            <div
              key={childKey}
              className={`layer2-container${draggedPath === childPath ? ' dragging' : ''}${dragOverPath === childPath && dragOverZone === 'before' ? ' drag-over-before' : ''}${dragOverPath === childPath && dragOverZone === 'after' ? ' drag-over-after' : ''}`}
            >
              <div className="layer2-l3-frame">
                <div className="layer2-content">
                  <div
                    className={`layer2-wrapper${childCanDrag ? ' draggable' : ''}${dragOverPath === childPath && dragOverZone === 'nest' ? ' drag-over-nest' : ''}`}
                    draggable={childCanDrag}
                    data-drag-path={childPath}
                    onDragStart={(e) => {
                      // Only allow drag from background, not from text or interactive elements
                      const target = e.target as HTMLElement
                      if (
                        target.classList.contains('item-title') ||
                        target.tagName === 'BUTTON' ||
                        target.tagName === 'A' ||
                        target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA'
                      ) {
                        e.preventDefault()
                        return
                      }
                      e.stopPropagation()
                      e.dataTransfer.setData('text/plain', childPath)
                      onItemDragStart?.(childPath)
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onItemDragOver?.(childPath, getDropZone(e)) }}
                    onDragEnd={() => onItemDragEnd?.()}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onItemDrop?.(childPath, dragOverZone ?? 'before')
                    }}
                  >
                    {editingPath === childPath && editInline ? (
                      <InlineItemEditor
                        itemKey={childKey}
                        item={childItem as StructureItem}
                        onSave={(data) => onInlineSave?.(childPath, data)}
                        onCancel={() => onInlineCancel?.()}
                      />
                    ) : (
                      <>
                        <div
                          className={`layer2${!editInline && (editingPath === childPath || creatingPath === childPath) ? ' item-editing' : ''}${highlightClasses(childPath, userHighlights, agentHighlights, agentDeletePending)}`}
                          {...(!isMobile && childRowEditable
                            ? {
                                onContextMenu: (e: React.MouseEvent) => onContextMenu?.(e, childPath, depth >= 3),
                                onClick: (e: React.MouseEvent) => {
                                  if (e.ctrlKey || e.metaKey) onToggleHighlight?.(childPath)
                                },
                              }
                            : {})}
                          {...(isMobile && childRowEditable
                            ? makeDragGestureHandlers?.(childPath, () => onToggleHighlight?.(childPath))
                            : {})}
                        >
                          <span
                            className="item-title"
                            title={!isMobile && childRowEditable ? 'Ctrl/Cmd+click to select · Shift/Alt+click to edit' : undefined}
                            onClick={isMobile ? undefined : (e) => {
                              if (childRowEditable && (e.ctrlKey || e.metaKey)) { e.stopPropagation(); onToggleHighlight?.(childPath) }
                              else if (childRowEditable && (e.shiftKey || e.altKey)) onEditClick(childPath, childTitle, childItem as StructureItem)
                              else onItemClick(childPath)
                            }}
                          >
                            {childTitle}
                            <DateAndTagBadges item={childItem as StructureItem} minimal={minimal} />
                          </span>
                          {!minimal && (childItem as StructureItem).context && (
                            <button
                              type="button"
                              className={`context-toggle${showContext ? ' expanded' : ''}`}
                              onClick={(e) => { e.stopPropagation(); onToggleContext?.() }}
                              title={showContext ? 'Hide notes' : 'Show notes'}
                            >
                              <ChevronIcon />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Context for layer2 */}
                  {showContext && (childItem as StructureItem).context && (
                    <div
                      className="item-context"
                      onClick={!isMobile && childRowEditable ? (e) => {
                        if (e.ctrlKey || e.metaKey) onToggleHighlight?.(childPath)
                      } : undefined}
                    >
                      {(childItem as StructureItem).context}
                    </div>
                  )}
                </div>

                {/* Layer 3 - Items */}
                {depth >= 3 && (Object.keys(grandchildren).length > 0 || (creatingPath === childPath && editInline)) && (
                  <div className="layer3-container">
                    {Object.entries(grandchildren).map(([grandKey, grandItem]) => {
                      const grandPath = `${childPath}.${grandKey}`
                      const grandTitle = (grandItem as StructureItem).title || grandKey
                      // Check if this grandchild item is editable
                      const grandRowEditable = rowEditable && !(grandItem as StructureItem).nonEditable && !(grandItem as StructureItem).originalPath
                      // Desktop only — see childCanDrag's comment above.
                      const grandCanDrag = !isMobile && dragEnabled && grandRowEditable && !pendingPaths?.has(grandPath)

                      return (
                        <div
                          key={grandKey}
                          className={`layer3-row${grandCanDrag ? ' draggable' : ''}${draggedPath === grandPath ? ' dragging' : ''}${dragOverPath === grandPath && dragOverZone === 'before' ? ' drag-over-before' : ''}${dragOverPath === grandPath && dragOverZone === 'nest' ? ' drag-over-nest' : ''}${dragOverPath === grandPath && dragOverZone === 'after' ? ' drag-over-after' : ''}`}
                          draggable={grandCanDrag}
                          data-drag-path={grandPath}
                          onDragStart={(e) => {
                            // Only allow drag from background, not from text or interactive elements
                            const target = e.target as HTMLElement
                            if (
                              target.classList.contains('item-title') ||
                              target.tagName === 'BUTTON' ||
                              target.tagName === 'A' ||
                              target.tagName === 'INPUT' ||
                              target.tagName === 'TEXTAREA'
                            ) {
                              e.preventDefault()
                              return
                            }
                            e.stopPropagation()
                            e.dataTransfer.setData('text/plain', grandPath)
                            onItemDragStart?.(grandPath)
                          }}
                          // Same before/nest/after split as layer2 — nesting onto a
                          // layer3 item makes the dragged item ITS child,
                          // one level deeper than layer3 itself renders. That
                          // nested item is still reachable, the same way any
                          // layer3 item's own children are: click the layer3
                          // item to promote it (and what's now nested under
                          // it) to the top of a new view (see onItemClick).
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onItemDragOver?.(grandPath, getDropZone(e)) }}
                          onDragEnd={() => onItemDragEnd?.()}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onItemDrop?.(grandPath, dragOverZone ?? 'before')
                          }}
                        >
                          <div className="layer3-wrapper">
                            {editingPath === grandPath && editInline ? (
                              <InlineItemEditor
                                itemKey={grandKey}
                                item={grandItem as StructureItem}
                                onSave={(data) => onInlineSave?.(grandPath, data)}
                                onCancel={() => onInlineCancel?.()}
                              />
                            ) : (
                              <>
                                <div
                                  className={`layer3-item${!editInline && editingPath === grandPath ? ' item-editing' : ''}${highlightClasses(grandPath, userHighlights, agentHighlights, agentDeletePending)}`}
                                  {...(!isMobile && grandRowEditable
                                    ? {
                                        onContextMenu: (e: React.MouseEvent) => onContextMenu?.(e, grandPath, false),
                                        onClick: (e: React.MouseEvent) => {
                                          if (e.ctrlKey || e.metaKey) onToggleHighlight?.(grandPath)
                                        },
                                      }
                                    : {})}
                                  {...(isMobile && grandRowEditable
                                    ? makeDragGestureHandlers?.(grandPath, () => onToggleHighlight?.(grandPath))
                                    : {})}
                                >
                                  <span
                                    className="item-title"
                                    title={!isMobile && grandRowEditable ? 'Ctrl/Cmd+click to select · Shift/Alt+click to edit' : undefined}
                                    onClick={isMobile ? undefined : (e) => {
                                      if (grandRowEditable && (e.ctrlKey || e.metaKey)) { e.stopPropagation(); onToggleHighlight?.(grandPath) }
                                      else if (grandRowEditable && (e.shiftKey || e.altKey)) onEditClick(grandPath, grandTitle, grandItem as StructureItem)
                                      else onItemClick(grandPath)
                                    }}
                                  >
                                    {grandTitle}
                                    <DateAndTagBadges item={grandItem as StructureItem} minimal={minimal} />
                                  </span>
                                  {!minimal && (grandItem as StructureItem).context && (
                                    <button
                                      type="button"
                                      className={`context-toggle${showContext ? ' expanded' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); onToggleContext?.() }}
                                      title={showContext ? 'Hide notes' : 'Show notes'}
                                    >
                                      <ChevronIcon />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {/* Context for layer3 */}
                          {showContext && (grandItem as StructureItem).context && (
                            <div
                              className="item-context"
                              style={{ marginLeft: '0.5rem' }}
                              onClick={!isMobile && grandRowEditable ? (e) => {
                                if (e.ctrlKey || e.metaKey) onToggleHighlight?.(grandPath)
                              } : undefined}
                            >
                              {(grandItem as StructureItem).context}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {/* Inline create editor for a new layer3 sub-item, opened via the
                        right-click menu or a right-swipe on the layer2 row */}
                    {onSubCreateStart && creatingPath === childPath && editInline && (
                      <div className="layer3-wrapper">
                        <InlineItemEditor
                          itemKey=""
                          item={{} as StructureItem}
                          defaultName="new item"
                          onSave={(data) => onSubCreateSave?.(childPath, data)}
                          onCancel={() => onSubCreateCancel?.()}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {/* Inline create editor for a new layer2 sub-item, opened via the
            right-click menu or a right-swipe on the layer1 row */}
        {onSubCreateStart && creatingPath === itemPath && editInline && (
          <div className="layer2-container add-sub-container">
            <div className="layer2-l3-frame">
              <div className="layer2-content">
                <div className="layer2-wrapper">
                  <InlineItemEditor
                    itemKey=""
                    item={{} as StructureItem}
                    defaultName="new item"
                    onSave={(data) => onSubCreateSave?.(itemPath, data)}
                    onCancel={() => onSubCreateCancel?.()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>}
      </div>
    </div>
  )
}

export default Section
