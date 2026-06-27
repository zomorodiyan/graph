import { useState, useEffect } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'

interface EditModalProps {
  name: string
  data: StructureItem
  onSave: (data: UpdatePayload) => void
  onDelete?: () => void
  onClose: () => void
  isSaving: boolean
  mode?: 'edit' | 'create'
}

function EditModal({ name, data, onSave, onDelete, onClose, isSaving, mode = 'edit' }: EditModalProps) {
  const isCreate = mode === 'create'
  const [formName, setFormName] = useState(name)
  const [progress, setProgress] = useState(data.progress?.toString() || '')
  const [context, setContext] = useState(data.context || '')
  const [due, setDue] = useState(data.due || '')

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const payload: UpdatePayload = {}
    
    // For create mode, always include the name
    if (isCreate) {
      payload.name = formName.trim()
    } else if (formName !== name) {
      // For edit mode, only include if changed
      payload.name = formName
    }
    
    if (progress !== (data.progress?.toString() || '')) {
      payload.progress = progress ? parseInt(progress) : ''
    }
    
    if (context !== (data.context || '')) {
      payload.context = context || ''
    }
    
    if (due !== (data.due || '')) {
      payload.due = due || ''
    }
    
    onSave(payload)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal">
        <h2>{isCreate ? 'Add New Item' : 'Edit Item'}</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Item name"
            />
          </div>
          
          <div className="modal-field">
            <label htmlFor="progress">Progress (0-100)</label>
            <input
              id="progress"
              type="number"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              placeholder="0-100"
            />
          </div>
          
          <div className="modal-field">
            <label htmlFor="context">Context</label>
            <textarea
              id="context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Description or notes"
            />
          </div>
          
          <div className="modal-field">
            <label htmlFor="due">Due Date</label>
            <input
              id="due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          
          <div className="modal-actions">
            {!isCreate && onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDelete}
                disabled={isSaving}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || (isCreate && !formName.trim())}
            >
              {isSaving ? 'Saving...' : (isCreate ? 'Create' : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditModal
