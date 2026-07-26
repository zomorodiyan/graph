import { useRef, useState, type CSSProperties } from 'react'
import { StructureItem, UpdatePayload, getItemDueDate, formatCost } from '../api/localClient'
import { parseLocalDate, daysUntil } from '../utils/dates'
import { useItemSwipe } from '../hooks/useItemSwipe'
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
  onInlineDelete?: (path: string) => void
  onCopyClick?: (itemKey: string, item: StructureItem) => void
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
  isPending?: boolean
  isTimeView?: boolean
  showContext?: boolean
  depth?: number
  showRaw?: boolean
  rawText?: string
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
  onInlineDelete,
  onCopyClick,
  creatingPath = null,
  onSubCreateStart,
  onSubCreateSave,
  onSubCreateCancel,
  onContextMenu,
  isPending = false,
  isTimeView = false,
  showContext = true,
  depth = 3,
  showRaw = false,
  rawText,
}: SectionProps) {
  const itemPath = parentPath ? `${parentPath}.${itemKey}` : itemKey
  const title = item.title || itemKey

  const sectionRef = useRef<HTMLDivElement>(null)

  // Editable unless it's a virtual time-view item or explicitly non-editable —
  // gates the right-click menu, swipe gestures, and the Delete button inside the editor.
  const rowEditable = !isTimeView && !item.nonEditable
  const showLoading = isPending
  // Left swipe = edit, right swipe = add sub-item (mirrors the right-click menu).
  const makeSwipeHandlers = useItemSwipe()

  // Get child items for layer2
  const children = item.children || {}
  const childEntries = Object.entries(children)

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

  const layer1Delta = formatCheckpointDelta(item.progress, item.checkpoints)

  return (
    <div className="section" ref={sectionRef}>
      <div className="section-body">
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
              onDelete={rowEditable ? () => onInlineDelete?.(itemPath) : undefined}
            />
          ) : (
            <>
              <div
                className={`layer1${!editInline && (editingPath === itemPath || creatingPath === itemPath) ? ' item-editing' : ''}`}
                style={progressFillStyle(item.progress, item.checkpoints, 'var(--blue-medium)')}
                onContextMenu={rowEditable ? (e) => onContextMenu?.(e, itemPath, true) : undefined}
                {...(rowEditable
                  ? makeSwipeHandlers(
                      () => onEditClick(itemPath, title, item),
                      () => onSubCreateStart?.(itemPath),
                    )
                  : {})}
              >
                <span className="item-title" onClick={() => onItemClick(itemPath)}>
                  {title}
                  {formatProgressText(item.progress) && (
                    <span className="item-progress-inline">{formatProgressText(item.progress)}</span>
                  )}
                  {layer1Delta && (
                    <span className="item-checkpoint-delta" style={{ color: `var(${layer1Delta.varName})` }}>
                      {layer1Delta.text}
                    </span>
                  )}
                  {formatCost(item.cost) && (
                    <span className="item-cost">{formatCost(item.cost)}</span>
                  )}
                  {getItemDueDate(item) && (
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
          const layer2Delta = formatCheckpointDelta((childItem as StructureItem).progress, (childItem as StructureItem).checkpoints)

          return (
            <div key={childKey} className="layer2-container">
              <div className="layer2-l3-frame">
                <div className="layer2-content">
                  <div className="layer2-wrapper">
                    {editingPath === childPath && editInline ? (
                      <InlineItemEditor
                        itemKey={childKey}
                        item={childItem as StructureItem}
                        onSave={(data) => onInlineSave?.(childPath, data)}
                        onCancel={() => onInlineCancel?.()}
                        onDelete={childRowEditable ? () => onInlineDelete?.(childPath) : undefined}
                      />
                    ) : (
                      <>
                        <div
                          className={`layer2${!editInline && (editingPath === childPath || creatingPath === childPath) ? ' item-editing' : ''}`}
                          style={progressFillStyle((childItem as StructureItem).progress, (childItem as StructureItem).checkpoints, 'currentColor')}
                          onContextMenu={childRowEditable ? (e) => onContextMenu?.(e, childPath, depth >= 3) : undefined}
                          {...(childRowEditable
                            ? makeSwipeHandlers(
                                () => onEditClick(childPath, childTitle, childItem as StructureItem),
                                () => { if (depth >= 3) onSubCreateStart?.(childPath) },
                              )
                            : {})}
                        >
                          <span className="item-title" onClick={() => onItemClick(childPath)}>
                            {childTitle}
                            {formatProgressText((childItem as StructureItem).progress) && (
                              <span className="item-progress-inline">{formatProgressText((childItem as StructureItem).progress)}</span>
                            )}
                            {layer2Delta && (
                              <span className="item-checkpoint-delta" style={{ color: `var(${layer2Delta.varName})` }}>
                                {layer2Delta.text}
                              </span>
                            )}
                            {formatCost((childItem as StructureItem).cost) && (
                              <span className="item-cost">{formatCost((childItem as StructureItem).cost)}</span>
                            )}
                            {getItemDueDate(childItem as StructureItem) && (
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
                      const layer3Delta = formatCheckpointDelta((grandItem as StructureItem).progress, (grandItem as StructureItem).checkpoints)

                      return (
                        <div key={grandKey}>
                          <div className="layer3-wrapper">
                            {editingPath === grandPath && editInline ? (
                              <InlineItemEditor
                                itemKey={grandKey}
                                item={grandItem as StructureItem}
                                onSave={(data) => onInlineSave?.(grandPath, data)}
                                onCancel={() => onInlineCancel?.()}
                                onDelete={grandRowEditable ? () => onInlineDelete?.(grandPath) : undefined}
                              />
                            ) : (
                              <>
                                <div
                                  className={`layer3-item${!editInline && editingPath === grandPath ? ' item-editing' : ''}`}
                                  style={progressFillStyle((grandItem as StructureItem).progress, (grandItem as StructureItem).checkpoints, 'currentColor')}
                                  onContextMenu={grandRowEditable ? (e) => onContextMenu?.(e, grandPath, false) : undefined}
                                  {...(grandRowEditable
                                    ? makeSwipeHandlers(
                                        () => onEditClick(grandPath, grandTitle, grandItem as StructureItem),
                                        () => {},
                                      )
                                    : {})}
                                >
                                  <span className="item-title" onClick={() => onItemClick(grandPath)}>
                                    {grandTitle}
                                    {formatProgressText((grandItem as StructureItem).progress) && (
                                      <span className="item-progress-inline">
                                        {formatProgressText((grandItem as StructureItem).progress)}
                                      </span>
                                    )}
                                    {layer3Delta && (
                                      <span className="item-checkpoint-delta" style={{ color: `var(${layer3Delta.varName})` }}>
                                        {layer3Delta.text}
                                      </span>
                                    )}
                                    {formatCost((grandItem as StructureItem).cost) && (
                                      <span className="item-cost">{formatCost((grandItem as StructureItem).cost)}</span>
                                    )}
                                    {getItemDueDate(grandItem as StructureItem) && (
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
                          onDelete={() => onSubCreateCancel?.()}
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
                    onDelete={() => onSubCreateCancel?.()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
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
