import { useEffect, useMemo, useRef, useState } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'

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
  const progressRef = useRef<HTMLInputElement>(null)
  const dueRef = useRef<HTMLInputElement>(null)
  const contextRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const didCommitRef = useRef(false)

  const focusAndScroll = (ref: React.RefObject<HTMLInputElement | null>) => {
    requestAnimationFrame(() => {
      if (!ref.current) return
      ref.current.focus()
      ref.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      if (ref.current.type !== 'date') {
        ref.current.select()
      }
    })
  }

  const openDuePicker = () => {
    const input = dueRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
    if (!input) return
    input.focus()
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    } else {
      input.click()
    }
  }

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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return
      const target = event.target as Node | null
      if (!target) return
      if (!rootRef.current.contains(target)) {
        commit()
      }
    }

    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('touchstart', handlePointerDown, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('touchstart', handlePointerDown, true)
    }
  }, [payload, onCancel, onSave])

  return (
    <div ref={rootRef} className="inline-edit" onBlur={handleContainerBlur}>
      <div className="inline-edit-tools">
        <button
          type="button"
          className={`inline-tool ${showContextEditor || context ? 'active' : ''}`}
          onClick={() => {
            setShowContextEditor(true)
            focusAndScroll(contextRef)
          }}
          title="Context"
        >
          Context
        </button>
        <button
          type="button"
          className={`inline-tool ${showProgressEditor || progress ? 'active' : ''}`}
          onClick={() => {
            setShowProgressEditor(true)
            focusAndScroll(progressRef)
          }}
          title="Progress"
        >
          Progress
        </button>
        <button
          type="button"
          className={`inline-tool ${showDueEditor || due ? 'active' : ''}`}
          onClick={() => {
            if (!showDueEditor) {
              setShowDueEditor(true)
              requestAnimationFrame(() => openDuePicker())
            } else {
              openDuePicker()
            }
          }}
          title="Due date"
        >
          Due
        </button>
        {onDelete && (
          <button
            type="button"
            className="inline-tool delete"
            onClick={onDelete}
            title="Delete"
          >
              Delete
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
        autoFocus
      />

      {showProgressEditor && (
        <input
          ref={progressRef}
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
          ref={dueRef}
          className="inline-edit-small"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="due"
        />
      )}

      {showContextEditor && (
        <input
          ref={contextRef}
          className="inline-edit-context-input"
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="context"
        />
      )}
    </div>
  )
}

export default InlineItemEditor
