import { useVisualViewportRect } from '../hooks/useVisualViewportRect'
import InlineItemEditor from './InlineItemEditor'
import { StructureItem, UpdatePayload } from '../api/localClient'

interface MobileEditSheetProps {
  itemKey: string
  item: StructureItem
  // Sub-item creation: which parent this new item is landing under, shown as
  // context since the sheet is now visually detached from that parent's row
  // (the parent gets a border highlight in the list instead — see App.css .item-editing)
  parentLabel?: string
  defaultName?: string
  onSave: (data: UpdatePayload) => void
  onCancel: () => void
  onDelete?: () => void
}

// Mobile-only: docks the item editor to the bottom of the viewport, above the
// on-screen keyboard, instead of expanding the item inline in the list. See
// GraphView.tsx for the desktop/mobile split.
//
// The outer div is sized/positioned to exactly match window.visualViewport
// (see useVisualViewportRect) — i.e. the actually-visible area, keyboard
// excluded — and the sheet itself is absolutely pinned to ITS bottom. That
// makes "sits right above the keyboard" true by construction: there's no
// keyboard-height number to compute or get wrong, since the outer div's
// bottom edge already IS the top of the keyboard whenever one is open, and
// the true screen bottom whenever one isn't.
function MobileEditSheet({ itemKey, item, parentLabel, defaultName, onSave, onCancel, onDelete }: MobileEditSheetProps) {
  const { top, height } = useVisualViewportRect()
  const keyboardLikelyOpen = height < window.innerHeight - 80 // rough guess, only used to skip safe-area padding

  return (
    <div className="mobile-edit-sheet-viewport" style={{ top, height }}>
      <div className={`mobile-edit-sheet${keyboardLikelyOpen ? ' keyboard-open' : ''}`}>
        {parentLabel && <div className="mobile-edit-sheet-context">Adding to: {parentLabel}</div>}
        <InlineItemEditor
          itemKey={itemKey}
          item={item}
          defaultName={defaultName}
          onSave={onSave}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

export default MobileEditSheet
