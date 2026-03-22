import { useEffect, useMemo, useRef, useState } from 'react'
import { StructureItem, UpdatePayload } from '../api/client'

interface InlineItemEditorProps {
  itemKey: string
  item: StructureItem
  onSave: (data: UpdatePayload) => void
  onCancel: () => void
  onDelete?: () => void
}

function InlineItemEditor({ itemKey, item, onSave, onCancel, onDelete }: InlineItemEditorProps) {
  const initialName = item.title || itemKey
  const initialProgress = item.progress !== undefined ? String(item.progress) : ''
  const initialDue = item.due || ''
  const initialContext = item.context || ''

  const [name, setName] = useState(initialName)
  const [progress, setProgress] = useState(initialProgress)
  const [due, setDue] = useState(initialDue)
  const [context, setContext] = useState(initialContext)
  const [showProgressEditor, setShowProgressEditor] = useState(initialProgress !== '')
  const [showDueEditor, setShowDueEditor] = useState(initialDue !== '')
  const [showContextEditor, setShowContextEditor] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const didCommitRef = useRef(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
        inputRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })
  }, [])

  const payload = useMemo<UpdatePayload>(() => {
    const next: UpdatePayload = {}

    const trimmed = name.trim()
    if (trimmed && trimmed !== initialName) {
      next.name = trimmed
    }

    if (progress !== initialProgress) {
      if (progress === '') {
        next.progress = ''
      } else {
        const parsed = Number(progress)
        if (!Number.isNaN(parsed)) {
          next.progress = Math.max(0, Math.min(100, parsed))
        }
      }
    }

    if (due !== initialDue) {
      next.due = due || ''
    }

    if (context !== initialContext) {
      next.context = context || ''
    }

    return next
  }, [name, progress, due, context, initialName, initialProgress, initialDue, initialContext])

  const commit = () => {
    if (didCommitRef.current) return
    didCommitRef.current = true

    if (Object.keys(payload).length === 0) {
      onCancel()
      return
    }

    onSave(payload)
  }

  const cancel = () => {
    if (didCommitRef.current) return
    didCommitRef.current = true
    onCancel()
  }

  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const nextFocused = e.relatedTarget as Node | null
    if (nextFocused && e.currentTarget.contains(nextFocused)) return
    commit()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  return (
    <div className="inline-edit" onBlur={handleContainerBlur}>
      <div className="inline-edit-tools">
        <button
          type="button"
          className={`inline-tool ${showProgressEditor || progress ? 'active' : ''}`}
          onClick={() => setShowProgressEditor((prev) => !prev)}
          title="Progress"
        >
          %
        </button>
        <button
          type="button"
          className={`inline-tool ${showDueEditor || due ? 'active' : ''}`}
          onClick={() => setShowDueEditor((prev) => !prev)}
          title="Due date"
        >
          ◷
        </button>
        {onDelete && (
          <button
            type="button"
            className="inline-tool delete"
            onClick={onDelete}
            title="Delete"
          >
            ×
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        className="inline-edit-title"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Item title"
      />

      {showProgressEditor && (
        <input
          className="inline-edit-small"
          type="number"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="progress %"
        />
      )}

      {showDueEditor && (
        <input
          className="inline-edit-small"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="due"
        />
      )}

      {showContextEditor ? (
        <input
          className="inline-edit-context-input"
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="context"
        />
      ) : (
        <button
          type="button"
          className={`inline-context-preview ${context ? '' : 'empty'}`}
          onClick={() => setShowContextEditor(true)}
          title="Edit context"
        >
          {context || 'add context'}
        </button>
      )}
    </div>
  )
}

export default InlineItemEditor
