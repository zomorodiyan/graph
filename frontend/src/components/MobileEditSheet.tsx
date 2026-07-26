import { useKeyboardInset } from '../hooks/useKeyboardInset'
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
// on-screen keyboard (tracked live via useKeyboardInset), instead of expanding
// the item inline in the list. See GraphView.tsx for the desktop/mobile split.
function MobileEditSheet({ itemKey, item, parentLabel, defaultName, onSave, onCancel, onDelete }: MobileEditSheetProps) {
  const keyboardInset = useKeyboardInset()

  return (
    <div className="mobile-edit-sheet" style={{ bottom: keyboardInset }}>
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
  )
}

export default MobileEditSheet
