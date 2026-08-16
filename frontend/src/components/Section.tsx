import { useRef, type CSSProperties } from 'react'
import { StructureItem, UpdatePayload, getItemDueDate, sumValues, formatValueTotals } from '../api/localClient'
import { parseLocalDate, daysUntil } from '../utils/dates'
import { useLongPressFactory } from '../hooks/useLongPress'
import InlineItemEditor from './InlineItemEditor'

interface SectionProps {
  itemKey: string
  item: StructureItem
  parentPath: string
  colorIndex: number
  onItemClick: (path: string) => void
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
  // which keeps its own click); mobile: a plain tap (long-press still opens
  // the editor). userHighlights/agentHighlights are absolute paths, same
  // format as itemPath/childPath/grandPath below.
  onToggleHighlight?: (path: string) => void
  userHighlights?: Set<string>
  agentHighlights?: Set<string>
  isPending?: boolean
  // Level-2/3 drag reordering — level-1 drag lives in GraphView's own
  // section-wrapper, outside this component. draggedPath/dragOverPath are full
  // paths (unlike level-1's index-based drag state) so a hover target is
  // unambiguous across however many Section instances are on screen.
  draggedPath?: string | null
  dragOverPath?: string | null
  // Which part of the hovered row the drag is over — 'before' reorders,
  // 'nest' makes the dragged item a child of the hovered one (see
  // getDropZone). Only meaningful together with dragOverPath.
  dragOverZone?: 'before' | 'nest' | null
  onItemDragStart?: (path: string) => void
  onItemDragOver?: (path: string, zone: 'before' | 'nest') => void
  onItemDragEnd?: () => void
  onItemDrop?: (path: string, zone: 'before' | 'nest') => void
  dragEnabled?: boolean
  pendingPaths?: Set<string>
  isTimeView?: boolean
  showContext?: boolean
  // Long-press on the context toggle: hides progress/cost/due/delta badges too,
  // leaving just the title (showContext is expected to be forced off alongside this)
  minimal?: boolean
  depth?: number
  showRaw?: boolean
  rawText?: string
}

// Appends the highlight class(es) for a row — both can apply at once (see
// useHighlights.ts and the .user-highlighted/.agent-highlighted CSS, which
// layer as independent box-shadow rings rather than competing outlines).
function highlightClasses(path: string, userHighlights?: Set<string>, agentHighlights?: Set<string>): string {
  return `${userHighlights?.has(path) ? ' user-highlighted' : ''}${agentHighlights?.has(path) ? ' agent-highlighted' : ''}`
}

// Which part of a row a drag is hovering over — mirrors GraphView's own
// getDropZone (level-1 uses that one directly; this is the level-2/3 copy,
// small enough not to be worth threading through props/exports for).
function getDropZone(e: React.DragEvent): 'before' | 'nest' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const relativeY = e.clientY - rect.top
  return relativeY < rect.height * 0.35 ? 'before' : 'nest'
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

// Helper to format due date display — today shows "Today", tomorrow "2d", etc.
function formatDueDate(dueDate: string): string {
  const diffDays = daysUntil(dueDate)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Today'
  if (diffDays <= 7) return `${diffDays + 1}d`
  return parseLocalDate(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Helper to parse "X/Y" progress — pct capped at 100 for bar width
function parseProgress(p: string | undefined): { done: number; total: number; pct: number } | null {
  if (p === undefined || p === null) return null
  const m = String(p).match(/^(\d+)\/(\d+)$/)
  if (!m) return null
  const done = Number(m[1]), total = Number(m[2])
  return { done, total, pct: total > 0 ? Math.min((done / total) * 100, 100) : 0 }
}

// Interpolate expected % between the checkpoint pair straddling `today`. Each
// checkpoint is normalized by its OWN embedded total (not the item's current
// total), so old checkpoints stay correct even if the item's total changes later.
// Before the first checkpoint: null (no claim yet). Past the last: held flat.
function getExpectedPct(
  checkpoints: { date: string; progress: string }[] | undefined,
  today: Date = new Date(),
): number | null {
  if (!checkpoints || checkpoints.length < 1) return null
  const points = checkpoints
    .map(cp => ({ date: cp.date, pct: parseProgress(cp.progress)?.pct }))
    .filter((p): p is { date: string; pct: number } => p.pct !== undefined && !isNaN(parseLocalDate(p.date).getTime()))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (points.length < 1) return null

  const t0 = new Date(today); t0.setHours(0, 0, 0, 0)
  const t = t0.getTime()
  if (t < parseLocalDate(points[0].date).getTime()) return null

  for (let i = 0; i < points.length - 1; i++) {
    const d0 = parseLocalDate(points[i].date).getTime()
    const d1 = parseLocalDate(points[i + 1].date).getTime()
    if (t <= d1) {
      const frac = d1 === d0 ? 1 : (t - d0) / (d1 - d0)
      return points[i].pct + frac * (points[i + 1].pct - points[i].pct)
    }
  }
  return points[points.length - 1].pct  // past all checkpoints — hold flat, no extrapolation
}

// Signed delta badge ("+8%"/"−8%") plus which status color to use. Null when
// there's no computable expected value, or actual already matches it exactly.
function formatCheckpointDelta(
  progress: string | undefined,
  checkpoints: { date: string; progress: string }[] | undefined,
): { text: string; varName: '--status-good' | '--status-bad' } | null {
  const pi = parseProgress(progress)
  if (!pi) return null
  const expectedPct = getExpectedPct(checkpoints)
  if (expectedPct === null || Math.round(pi.pct) === Math.round(expectedPct)) return null
  const delta = Math.round(pi.pct - expectedPct)
  if (delta === 0) return null
  return { text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}%`, varName: delta > 0 ? '--status-good' : '--status-bad' }
}

// Progress as a background fill: tint the chip's background up to pct%. When
// checkpoints give a computable "expected by today" value that differs from
// actual, a second gradient layer shows the gap as a good/bad-colored sliver.
function progressFillStyle(
  progress: string | undefined,
  checkpoints: { date: string; progress: string }[] | undefined,
  color: string,
): CSSProperties | undefined {
  const pi = parseProgress(progress)
  if (!pi) return undefined

  const expectedPct = getExpectedPct(checkpoints)
  if (expectedPct === null || pi.pct === expectedPct) {
    return {
      backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 11%, transparent) ${pi.pct}%, transparent ${pi.pct}%)`,
    }
  }

  const lo = Math.min(pi.pct, expectedPct)
  const hi = Math.max(pi.pct, expectedPct)
  const statusVar = pi.pct > expectedPct ? '--status-good' : '--status-bad'
  return {
    backgroundImage: [
      `linear-gradient(90deg, color-mix(in srgb, ${color} 11%, transparent) ${lo}%, transparent ${lo}%)`,
      `linear-gradient(90deg, transparent ${lo}%, color-mix(in srgb, var(${statusVar}) 22%, transparent) ${lo}%, color-mix(in srgb, var(${statusVar}) 22%, transparent) ${hi}%, transparent ${hi}%)`,
    ].join(', '),
  }
}

// Format progress for display: "42%" when total is 100, otherwise raw "3/10"
function formatProgressText(p: string | undefined): string | null {
  if (p === undefined || p === null) return null
  const m = String(p).match(/^(\d+)\/(\d+)$/)
  if (!m) return null
  const [, done, total] = m
  return total === '100' ? `${done}%` : `${done}/${total}`
}

function Section({
  itemKey,
  item,
  parentPath,
  colorIndex: _colorIndex,
  onItemClick,
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
  userHighlights,
  agentHighlights,
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
  // swipe-right navigates back up the tree, long-press opens the editor
  // directly, a plain tap toggles highlight (see makeLongPressHandlers
  // below). Desktop is unchanged: click opens the editor (or navigates, for
  // non-editable rows), right-click shows the context menu.
  const isMobile = !editInline
  const makeLongPressHandlers = useLongPressFactory()

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

  const layer1Delta = formatCheckpointDelta(item.progress, item.checkpoints)
  const layer1Value = formatValueTotals(sumValues(item))

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
                className={`layer1${!editInline && (editingPath === itemPath || creatingPath === itemPath) ? ' item-editing' : ''}${highlightClasses(itemPath, userHighlights, agentHighlights)}`}
                style={progressFillStyle(item.progress, item.checkpoints, 'var(--blue-medium)')}
                {...(!isMobile && rowEditable
                  ? { onContextMenu: (e: React.MouseEvent) => onContextMenu?.(e, itemPath, true) }
                  : {})}
                {...(isMobile && rowEditable
                  ? makeLongPressHandlers(() => onEditClick(itemPath, title, item), () => onToggleHighlight?.(itemPath))
                  : {})}
              >
                <span
                  className="item-title"
                  // Mobile: tap toggles this item's highlight (swipe-left
                  // navigates into it, long-press opens its editor — see the
                  // gesture handlers above). Desktop: the title span fills
                  // the row edge-to-edge (flex: 1, no gap — there's no
                  // separate "row background" to give highlight its own
                  // click target), so a plain click keeps its existing job
                  // and Ctrl/Cmd+click toggles highlight instead.
                  title={!isMobile && rowEditable ? 'Ctrl/Cmd+click to highlight' : undefined}
                  onClick={isMobile ? undefined : (e) => {
                    if (rowEditable && (e.ctrlKey || e.metaKey)) {
                      onToggleHighlight?.(itemPath)
                    } else {
                      rowEditable ? onEditClick(itemPath, title, item) : onItemClick(itemPath)
                    }
                  }}
                >
                  {title}
                  {!minimal && formatProgressText(item.progress) && (
                    <span className="item-progress-inline">{formatProgressText(item.progress)}</span>
                  )}
                  {!minimal && layer1Delta && (
                    <span className="item-checkpoint-delta" style={{ color: `var(${layer1Delta.varName})` }}>
                      {layer1Delta.text}
                    </span>
                  )}
                  {!minimal && layer1Value && (
                    <span className="item-cost">{layer1Value}</span>
                  )}
                  {!minimal && getItemDueDate(item) && (
                    <span className={`item-due due-${getDueCategory(getItemDueDate(item))}`}>
                      {formatDueDate(getItemDueDate(item)!)}
                    </span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
        {/* Context */}
        {showContext && item.context && (
          <div className="item-context">{item.context}</div>
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
          const childCanDrag = dragEnabled && childRowEditable && !pendingPaths?.has(childPath)
          const layer2Delta = formatCheckpointDelta((childItem as StructureItem).progress, (childItem as StructureItem).checkpoints)
          const layer2Value = formatValueTotals(sumValues(childItem as StructureItem))

          return (
            <div
              key={childKey}
              className={`layer2-container${draggedPath === childPath ? ' dragging' : ''}${dragOverPath === childPath && dragOverZone === 'before' ? ' drag-over-before' : ''}`}
            >
              <div className="layer2-l3-frame">
                <div className="layer2-content">
                  <div
                    className={`layer2-wrapper${childCanDrag ? ' draggable' : ''}${dragOverPath === childPath && dragOverZone === 'nest' ? ' drag-over-nest' : ''}`}
                    draggable={childCanDrag}
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
                      onItemDragStart?.(childPath)
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onItemDragOver?.(childPath, getDropZone(e)) }}
                    onDragEnd={() => onItemDragEnd?.()}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onItemDrop?.(childPath, dragOverZone === 'nest' ? 'nest' : 'before')
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
                          className={`layer2${!editInline && (editingPath === childPath || creatingPath === childPath) ? ' item-editing' : ''}${highlightClasses(childPath, userHighlights, agentHighlights)}`}
                          style={progressFillStyle((childItem as StructureItem).progress, (childItem as StructureItem).checkpoints, 'currentColor')}
                          {...(!isMobile && childRowEditable
                            ? { onContextMenu: (e: React.MouseEvent) => onContextMenu?.(e, childPath, depth >= 3) }
                            : {})}
                          {...(isMobile && childRowEditable
                            ? makeLongPressHandlers(() => onEditClick(childPath, childTitle, childItem as StructureItem), () => onToggleHighlight?.(childPath))
                            : {})}
                        >
                          <span
                            className="item-title"
                            title={!isMobile && childRowEditable ? 'Ctrl/Cmd+click to highlight' : undefined}
                            onClick={isMobile ? undefined : (e) => {
                              if (childRowEditable && (e.ctrlKey || e.metaKey)) onToggleHighlight?.(childPath)
                              else onItemClick(childPath)
                            }}
                          >
                            {childTitle}
                            {!minimal && formatProgressText((childItem as StructureItem).progress) && (
                              <span className="item-progress-inline">{formatProgressText((childItem as StructureItem).progress)}</span>
                            )}
                            {!minimal && layer2Delta && (
                              <span className="item-checkpoint-delta" style={{ color: `var(${layer2Delta.varName})` }}>
                                {layer2Delta.text}
                              </span>
                            )}
                            {!minimal && layer2Value && (
                              <span className="item-cost">{layer2Value}</span>
                            )}
                            {!minimal && getItemDueDate(childItem as StructureItem) && (
                              <span className={`item-due due-${getDueCategory(getItemDueDate(childItem as StructureItem))}`}>
                                {formatDueDate(getItemDueDate(childItem as StructureItem)!)}
                              </span>
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Context for layer2 */}
                  {showContext && (childItem as StructureItem).context && (
                    <div className="item-context">{(childItem as StructureItem).context}</div>
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
                      const grandCanDrag = dragEnabled && grandRowEditable && !pendingPaths?.has(grandPath)
                      const layer3Delta = formatCheckpointDelta((grandItem as StructureItem).progress, (grandItem as StructureItem).checkpoints)
                      const layer3Value = formatValueTotals(sumValues(grandItem as StructureItem))

                      return (
                        <div
                          key={grandKey}
                          className={`layer3-row${grandCanDrag ? ' draggable' : ''}${draggedPath === grandPath ? ' dragging' : ''}${dragOverPath === grandPath && dragOverZone === 'before' ? ' drag-over-before' : ''}${dragOverPath === grandPath && dragOverZone === 'nest' ? ' drag-over-nest' : ''}`}
                          draggable={grandCanDrag}
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
                            onItemDragStart?.(grandPath)
                          }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onItemDragOver?.(grandPath, getDropZone(e)) }}
                          onDragEnd={() => onItemDragEnd?.()}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onItemDrop?.(grandPath, dragOverZone === 'nest' ? 'nest' : 'before')
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
                                  className={`layer3-item${!editInline && editingPath === grandPath ? ' item-editing' : ''}${highlightClasses(grandPath, userHighlights, agentHighlights)}`}
                                  style={progressFillStyle((grandItem as StructureItem).progress, (grandItem as StructureItem).checkpoints, 'currentColor')}
                                  {...(!isMobile && grandRowEditable
                                    ? { onContextMenu: (e: React.MouseEvent) => onContextMenu?.(e, grandPath, false) }
                                    : {})}
                                  {...(isMobile && grandRowEditable
                                    ? makeLongPressHandlers(() => onEditClick(grandPath, grandTitle, grandItem as StructureItem), () => onToggleHighlight?.(grandPath))
                                    : {})}
                                >
                                  <span
                                    className="item-title"
                                    title={!isMobile && grandRowEditable ? 'Ctrl/Cmd+click to highlight' : undefined}
                                    onClick={isMobile ? undefined : (e) => {
                                      if (grandRowEditable && (e.ctrlKey || e.metaKey)) onToggleHighlight?.(grandPath)
                                      else onItemClick(grandPath)
                                    }}
                                  >
                                    {grandTitle}
                                    {!minimal && formatProgressText((grandItem as StructureItem).progress) && (
                                      <span className="item-progress-inline">
                                        {formatProgressText((grandItem as StructureItem).progress)}
                                      </span>
                                    )}
                                    {!minimal && layer3Delta && (
                                      <span className="item-checkpoint-delta" style={{ color: `var(${layer3Delta.varName})` }}>
                                        {layer3Delta.text}
                                      </span>
                                    )}
                                    {!minimal && layer3Value && (
                                      <span className="item-cost">{layer3Value}</span>
                                    )}
                                    {!minimal && getItemDueDate(grandItem as StructureItem) && (
                                      <span className={`item-due due-${getDueCategory(getItemDueDate(grandItem as StructureItem))}`}>
                                        {formatDueDate(getItemDueDate(grandItem as StructureItem)!)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          {/* Context for layer3 */}
                          {showContext && (grandItem as StructureItem).context && (
                            <div className="item-context" style={{ marginLeft: '0.5rem' }}>
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
