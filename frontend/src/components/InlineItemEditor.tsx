import { useEffect, useMemo, useRef, useState } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'

interface InlineItemEditorProps {
  itemKey: string
  item: StructureItem
  onSave: (data: UpdatePayload) => void
  onCancel: () => void
  // Create mode: prefill the title (preselected so typing replaces it);
  // committing without edits saves an item with this name
  defaultName?: string
}

function InlineItemEditor({ itemKey, item, onSave, onCancel, defaultName }: InlineItemEditorProps) {
  const initialName = item.title || itemKey
  const initialContext = item.context || ''
  const initialDate = item.date || ''
  const initialTags = item.tags ?? []

  const [name, setName] = useState(defaultName ?? initialName)
  const [context, setContext] = useState(initialContext)
  const [date, setDate] = useState(initialDate)
  const [tags, setTags] = useState(initialTags)
  const [tagDraft, setTagDraft] = useState('')
  const [showDateEditor, setShowDateEditor] = useState(initialDate !== '')
  const [showTagsEditor, setShowTagsEditor] = useState(initialTags.length > 0)
  const [showContextEditor, setShowContextEditor] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const tagDraftRef = useRef<HTMLInputElement>(null)
  const contextRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const didCommitRef = useRef(false)

  // Focus only — no manual scrollIntoView. The browser already scrolls a
  // focused input above the mobile keyboard on its own; driving scroll
  // ourselves on top of that fights the native behavior and is what made
  // the page jump around on every tap.
  const focusAndScroll = (ref: React.RefObject<HTMLInputElement | null>) => {
    requestAnimationFrame(() => {
      if (!ref.current) return
      ref.current.focus()
      if (ref.current.type !== 'date') {
        ref.current.select()
      }
    })
  }

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '').replace(/\s+/g, '-')
    if (!t || tags.includes(t)) { setTagDraft(''); return }
    setTags(ts => [...ts, t])
    setTagDraft('')
  }
  const removeTag = (idx: number) => setTags(ts => ts.filter((_, i) => i !== idx))

  const payload = useMemo<UpdatePayload>(() => {
    const next: UpdatePayload = {}

    const trimmed = name.trim()
    if (trimmed && trimmed !== initialName) {
      next.name = trimmed
    }

    const currentDate = showDateEditor ? date : ''
    if (currentDate !== initialDate) {
      next.date = currentDate
    }

    if (context !== initialContext) {
      next.context = context || ''
    }

    const currentTags = showTagsEditor ? tags : []
    if (JSON.stringify(currentTags) !== JSON.stringify(initialTags)) {
      next.tags = currentTags
    }

    return next
  }, [name, date, showDateEditor, context, tags, showTagsEditor,
      initialName, initialDate, initialContext, initialTags])

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

  // Enter/comma adds the tag instead of committing the whole editor —
  // handleKeyDown's Enter=commit doesn't apply here.
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
      removeTag(tags.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  // Preselect the default name so typing immediately replaces it
  useEffect(() => {
    if (defaultName) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          title="Note"
        >
          Note
        </button>
        <button
          type="button"
          className={`inline-tool ${showDateEditor || date ? 'active' : ''}`}
          onClick={() => {
            setShowDateEditor(true)
            focusAndScroll(dateRef)
          }}
          title="Date"
        >
          Date
        </button>
        <button
          type="button"
          className={`inline-tool ${showTagsEditor || tags.length > 0 ? 'active' : ''}`}
          onClick={() => {
            setShowTagsEditor(true)
            focusAndScroll(tagDraftRef)
          }}
          title="Tags"
        >
          Tags
        </button>
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

      {showDateEditor && (
        <div className="inline-edit-fields-row">
          <input
            ref={dateRef}
            type="date"
            className="inline-edit-small"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {showTagsEditor && (
        <div className="inline-edit-tags">
          {tags.map((tag, i) => (
            <div className="tag-chip" key={i}>
              <span>{tag}</span>
              <button
                type="button"
                className="tag-chip-remove"
                onClick={() => removeTag(i)}
                title="Remove tag"
              >
                ×
              </button>
            </div>
          ))}
          <input
            ref={tagDraftRef}
            className="tag-draft-input"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder="add tag…"
          />
        </div>
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
