import { CopyIcon, TrashIcon, StarIcon, EditIcon, AddSubIcon, PasteSubIcon, CheckIcon, XIcon } from '../../components/icons'

interface SelectionButtonsProps {
  selectedCount: number
  allFavorite: boolean
  onCopy: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  // Only when exactly one item is selected.
  onEdit?: () => void
  // Only when exactly one item is selected and it has room for a sub-item.
  onAddSub?: () => void
  onPasteSub?: () => void
}

// Buttons acting on the user's current selection (highlighted items) —
// GraphView shows them in its header at >=32rem and in the mobile
// .selection-toolbar rows otherwise.
export function SelectionButtons({ selectedCount, allFavorite, onCopy, onDelete, onToggleFavorite, onEdit, onAddSub, onPasteSub }: SelectionButtonsProps) {
  return (
    <>
      {selectedCount > 0 && (
        <>
          <button className="copy-toggle" onClick={onCopy} title={`Copy ${selectedCount} selected item(s)`}>
            <CopyIcon />
          </button>
          <button className="delete-toggle" onClick={onDelete} title={`Delete ${selectedCount} selected item(s)`}>
            <TrashIcon />
          </button>
          <button
            className={`favorite-toggle${allFavorite ? ' active' : ''}`}
            onClick={onToggleFavorite}
            title={allFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <StarIcon filled={allFavorite} />
          </button>
        </>
      )}
      {onEdit && (
        <button className="edit-toggle" onClick={onEdit} title="Edit this item">
          <EditIcon />
        </button>
      )}
      {onAddSub && (
        <button className="addsub-toggle" onClick={onAddSub} title="Add a sub-item here">
          <AddSubIcon />
        </button>
      )}
      {onPasteSub && (
        <button className="pastesub-toggle" onClick={onPasteSub} title="Paste as sub-item(s) here">
          <PasteSubIcon />
        </button>
      )}
    </>
  )
}

// Confirm/reject an agent-proposed deletion (see request_delete_items in
// agentClient.ts) — independent of the user's own selection.
export function AgentDeleteButtons({ count, onConfirm, onReject }: { count: number; onConfirm: () => void; onReject: () => void }) {
  if (count === 0) return null
  return (
    <>
      <button className="confirm-toggle" onClick={onConfirm} title={`Confirm deleting ${count} item(s) the agent proposed`}>
        <CheckIcon />
      </button>
      <button className="reject-toggle" onClick={onReject} title="Reject — keep these items">
        <XIcon />
      </button>
    </>
  )
}
