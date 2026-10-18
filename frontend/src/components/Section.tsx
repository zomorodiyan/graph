import { useRef } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'
import { parseLocalDate, daysUntil } from '../utils/dates'
import { FAVORITE_TAG, tagColorIndex } from '../utils/tags'
import { effectiveDate, describeRepeat } from '../utils/recurrence'
import InlineItemEditor from './InlineItemEditor'
import { CalendarIcon } from './icons'
import { googleCalendarUrl } from '../utils/googleCalendar'

// Per-item note disclosure triangle (see .context-toggle in App.css) — points
// right when the note is hidden, rotates to point down when shown. A genuine
// per-item override (see GraphView's contextOverrides/onToggleContext) — the
// N button doesn't force these, it just reads them: see GraphView's
// noteButtonActive for how the button's own on/off display is derived from
// whatever's actually visible instead of driving it.
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

// Whether a row's note is shown: an explicit per-item override (see
// GraphView's contextOverrides/onToggleContext) wins over the page-wide
// showContext setting — lets one item's note be flipped open/closed without
// forcing every other item to match.
function isContextShown(showContext: boolean, contextOverrides: Map<string, boolean> | undefined, path: string): boolean {
  return contextOverrides?.has(path) ? contextOverrides.get(path)! : showContext
}

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
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
  // Sub-item creation (via the selection toolbar's add-sub button): parentPath
  // currently being created under, and its callbacks
  creatingPath?: string | null
  onSubCreateStart?: (parentPath: string) => void
  onSubCreateSave?: (parentPath: string, data: UpdatePayload) => void
  onSubCreateCancel?: () => void
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
  showContext?: boolean
  // Per-item note visibility overrides (see isContextShown above) and the
  // handler the row's disclosure triangle calls to flip one — both owned by
  // GraphView (in-memory only, so they reset on reload, same as the rest of
  // the view-option state).
  contextOverrides?: Map<string, boolean>
  onToggleContext?: (path: string, shown: boolean) => void
  // Long-press on the context toggle: hides date/tags badges too,
  // leaving just the title (showContext is expected to be forced off alongside this)
  minimal?: boolean
  depth?: number
  showRaw?: boolean
  rawText?: string
  onTagClick?: (tag: string) => void
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
function getDueCategory(dueDate: string | undefined): string | null {
  if (!dueDate) return null
  const diffDays = daysUntil(dueDate)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 7) return 'soon'
  return 'later'
}

// Helper to format date display — today shows "Today", tomorrow "1d", up to "7d", then the date.
function formatDueDate(dueDate: string): string {
  const diffDays = daysUntil(dueDate)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Today'
  if (diffDays <= 7) return `${diffDays}d`
  return parseLocalDate(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Date + tags badges, shared by all three layers — hidden entirely in minimal
// view. With onTagClick, each tag pill is a button that opens that tag's
// cross-graph view (see TagView.tsx); the favorite tag shows as a star.
function DateAndTagBadges({ item, minimal, onTagClick }: { item: StructureItem; minimal: boolean; onTagClick?: (tag: string) => void }) {
  if (minimal) return null
  // A repeating item shows its next occurrence, marked with ↻ (hover for the rule).
  const date = effectiveDate(item)
  const repeat = describeRepeat(item)
  return (
    <>
      {date && (
        <span className={`item-due due-${getDueCategory(date)}`} title={repeat}>
          {formatDueDate(date)}{repeat && ' ↻'}
        </span>
      )}
      {date && (
        <a
          className="cal-add"
          href={googleCalendarUrl(item) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title="Add to Google Calendar"
          aria-label="Add to Google Calendar"
          // Stop pointerdown too, like the tag pills below — mobile rows
          // capture the pointer on pointerdown (long-press gestures).
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarIcon />
        </a>
      )}
      {item.tags && item.tags.length > 0 && (
        <span className="item-tags">
          {item.tags.map(tag => {
            const className = `tag-pill tag-${tagColorIndex(tag)}${tag === FAVORITE_TAG ? ' tag-favorite' : ''}`
            const label = tag === FAVORITE_TAG ? '★' : tag
            return onTagClick ? (
              <button
                key={tag}
                type="button"
                className={`${className} tag-pill-clickable`}
                title={`Show all items tagged ${tag}`}
                // Stop pointerdown too, not just click — mobile rows capture the
                // pointer on pointerdown (see useDragGesture.ts), which would
                // retarget this tap's click to the row and toggle its highlight.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onTagClick(tag) }}
              >
                {label}
              </button>
            ) : (
              <span key={tag} className={className}>{label}</span>
            )
          })}
        </span>
      )}
    </>
  )
}

function Section({
  itemKey,
  item,
  parentPath,
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
  showContext = true,
  contextOverrides,
  onToggleContext,
  minimal = false,
  depth = 3,
  showRaw = false,
  rawText,
  onTagClick,
}: SectionProps) {
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const title = item.title || itemKey
  const itemContextShown = isContextShown(showContext, contextOverrides, itemPath)
  const tagProps = { onTagClick }

  const sectionRef = useRef<HTMLDivElement>(null)

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
  // leaf level-1 item), right-click or Ctrl/Cmd+click toggles highlight
  // (the selection toolbar then acts on it), Shift/Alt+click opens the
  // editor directly.
  const isMobile = !editInline
  // Right-click selects (only where selection exists — elsewhere, like the
  // tag view, the browser's own menu is left alone).
  const selectOnRightClick = (e: React.MouseEvent, path: string) => {
    if (!onToggleHighlight) return
    e.preventDefault()
    onToggleHighlight(path)
  }

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
                {...(!isMobile
                  ? {
                      onContextMenu: (e: React.MouseEvent) => selectOnRightClick(e, itemPath),
                      // Ctrl/Cmd+click anywhere on the row (not just the title
                      // span) toggles highlight — the title's own handler
                      // stops propagation for this case so the toggle doesn't
                      // fire twice when the click lands on the title itself.
                      onClick: (e: React.MouseEvent) => {
                        if (e.ctrlKey || e.metaKey) onToggleHighlight?.(itemPath)
                      },
                    }
                  : {})}
                {...(isMobile
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
                  title={!isMobile ? 'Right-click or Ctrl/Cmd+click to select · Shift/Alt+click to edit' : undefined}
                  onClick={isMobile ? undefined : (e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.stopPropagation()
                      onToggleHighlight?.(itemPath)
                    } else if (e.shiftKey || e.altKey) {
                      onEditClick(itemPath, title, item)
                    } else {
                      onItemEnter(itemPath)
                    }
                  }}
                >
                  {title}
                  <DateAndTagBadges item={item} minimal={minimal} {...tagProps} />
                </span>
                {!minimal && item.context && (
                  <button
                    type="button"
                    className={`context-toggle${itemContextShown ? ' expanded' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleContext?.(itemPath, !itemContextShown) }}
                    title={itemContextShown ? 'Hide note' : 'Show note'}
                  >
                    <ChevronIcon />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {/* Context */}
        {itemContextShown && item.context && (
          <div
            className="item-context"
            onClick={!isMobile ? (e) => {
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
          const childContextShown = isContextShown(showContext, contextOverrides, childPath)
          const grandchildren = (childItem as StructureItem).children || {}
          // Native HTML5 draggable — desktop only, same reason as GraphView.tsx's
          // own canDrag: some mobile browsers translate a long-press-and-move on
          // a draggable="true" element into their own native drag session,
          // which cancels the custom touch-gesture system's pointer tracking
          // mid-drag and leaves the eventual drop finding nothing to move.
          const childCanDrag = !isMobile && dragEnabled && !pendingPaths?.has(childPath)

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
                          {...(!isMobile
                            ? {
                                onContextMenu: (e: React.MouseEvent) => selectOnRightClick(e, childPath),
                                onClick: (e: React.MouseEvent) => {
                                  if (e.ctrlKey || e.metaKey) onToggleHighlight?.(childPath)
                                },
                              }
                            : {})}
                          {...(isMobile
                            ? makeDragGestureHandlers?.(childPath, () => onToggleHighlight?.(childPath))
                            : {})}
                        >
                          <span
                            className="item-title"
                            title={!isMobile ? 'Right-click or Ctrl/Cmd+click to select · Shift/Alt+click to edit' : undefined}
                            onClick={isMobile ? undefined : (e) => {
                              if (e.ctrlKey || e.metaKey) { e.stopPropagation(); onToggleHighlight?.(childPath) }
                              else if (e.shiftKey || e.altKey) onEditClick(childPath, childTitle, childItem as StructureItem)
                              else onItemClick(childPath)
                            }}
                          >
                            {childTitle}
                            <DateAndTagBadges item={childItem as StructureItem} minimal={minimal} {...tagProps} />
                          </span>
                          {!minimal && (childItem as StructureItem).context && (
                            <button
                              type="button"
                              className={`context-toggle${childContextShown ? ' expanded' : ''}`}
                              onClick={(e) => { e.stopPropagation(); onToggleContext?.(childPath, !childContextShown) }}
                              title={childContextShown ? 'Hide note' : 'Show note'}
                            >
                              <ChevronIcon />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Context for layer2 */}
                  {childContextShown && (childItem as StructureItem).context && (
                    <div
                      className="item-context"
                      onClick={!isMobile ? (e) => {
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
                      const grandContextShown = isContextShown(showContext, contextOverrides, grandPath)
                      // Desktop only — see childCanDrag's comment above.
                      const grandCanDrag = !isMobile && dragEnabled && !pendingPaths?.has(grandPath)

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
                                  {...(!isMobile
                                    ? {
                                        onContextMenu: (e: React.MouseEvent) => selectOnRightClick(e, grandPath),
                                        onClick: (e: React.MouseEvent) => {
                                          if (e.ctrlKey || e.metaKey) onToggleHighlight?.(grandPath)
                                        },
                                      }
                                    : {})}
                                  {...(isMobile
                                    ? makeDragGestureHandlers?.(grandPath, () => onToggleHighlight?.(grandPath))
                                    : {})}
                                >
                                  <span
                                    className="item-title"
                                    title={!isMobile ? 'Right-click or Ctrl/Cmd+click to select · Shift/Alt+click to edit' : undefined}
                                    onClick={isMobile ? undefined : (e) => {
                                      if (e.ctrlKey || e.metaKey) { e.stopPropagation(); onToggleHighlight?.(grandPath) }
                                      else if (e.shiftKey || e.altKey) onEditClick(grandPath, grandTitle, grandItem as StructureItem)
                                      else onItemClick(grandPath)
                                    }}
                                  >
                                    {grandTitle}
                                    <DateAndTagBadges item={grandItem as StructureItem} minimal={minimal} {...tagProps} />
                                  </span>
                                  {!minimal && (grandItem as StructureItem).context && (
                                    <button
                                      type="button"
                                      className={`context-toggle${grandContextShown ? ' expanded' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); onToggleContext?.(grandPath, !grandContextShown) }}
                                      title={grandContextShown ? 'Hide note' : 'Show note'}
                                    >
                                      <ChevronIcon />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {/* Context for layer3 */}
                          {grandContextShown && (grandItem as StructureItem).context && (
                            <div
                              className="item-context"
                              style={{ marginLeft: '0.5rem' }}
                              onClick={!isMobile ? (e) => {
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
                        selection toolbar's add-sub button on the layer2 row */}
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
            selection toolbar's add-sub button on the layer1 row */}
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
