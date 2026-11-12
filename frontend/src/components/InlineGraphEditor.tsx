import { useEffect, useRef, useState } from 'react'
import { LENGTH_DEFAULTS, LENGTH_LIMITS } from '../api/localClient'

// What the editor hands back on save: the two text fields plus the graph's
// preferred item lengths (undefined = app default, see LENGTH_DEFAULTS).
export interface GraphEditorValues {
  displayName: string
  description: string
  titleLength?: number
  noteLength?: number
}

interface InlineGraphEditorProps {
  displayName: string
  description: string
  titleLength?: number
  noteLength?: number
  onSave: (values: GraphEditorValues) => void
  onCancel: () => void
  onDelete?: () => void
}

// A blank field means "use the default"; anything else is clamped into
// LENGTH_LIMITS so a typo (0, 99999) can't produce a nonsensical target.
function parseLength(raw: string, fallback: number): number | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const n = Math.round(Number(t))
  if (!Number.isFinite(n)) return undefined
  const clamped = Math.min(Math.max(n, LENGTH_LIMITS.min), LENGTH_LIMITS.max)
  return clamped === fallback ? undefined : clamped
}

function InlineGraphEditor({ displayName, description, titleLength, noteLength, onSave, onCancel, onDelete }: InlineGraphEditorProps) {
  const [name, setName] = useState(displayName)
  const [desc, setDesc] = useState(description)
  const [showDesc, setShowDesc] = useState(description !== '')
  const [titleLen, setTitleLen] = useState(titleLength === undefined ? '' : String(titleLength))
  const [noteLen, setNoteLen] = useState(noteLength === undefined ? '' : String(noteLength))
  const [showLengths, setShowLengths] = useState(titleLength !== undefined || noteLength !== undefined)

  const nameRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLInputElement>(null)
  const titleLenRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const didCommitRef = useRef(false)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) commit()
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('touchstart', handlePointerDown, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('touchstart', handlePointerDown, true)
    }
  }, [name, desc, titleLen, noteLen])

  const commit = () => {
    if (didCommitRef.current) return
    didCommitRef.current = true
    if (name.trim()) {
      onSave({
        displayName: name.trim(),
        description: desc.trim(),
        titleLength: parseLength(titleLen, LENGTH_DEFAULTS.title),
        noteLength: parseLength(noteLen, LENGTH_DEFAULTS.note),
      })
    } else {
      onCancel()
    }
  }

  const cancel = () => {
    if (didCommitRef.current) return
    didCommitRef.current = true
    onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  const lengthsSet = titleLen.trim() !== '' || noteLen.trim() !== ''

  return (
    <div ref={rootRef} className="inline-edit graph-inline-edit">
      <div className="inline-edit-tools">
        <button
          type="button"
          className={`inline-tool ${showDesc || desc ? 'active' : ''}`}
          onClick={() => {
            setShowDesc(true)
            requestAnimationFrame(() => descRef.current?.focus())
          }}
        >
          Description
        </button>
        <button
          type="button"
          className={`inline-tool ${showLengths || lengthsSet ? 'active' : ''}`}
          onClick={() => {
            setShowLengths(true)
            requestAnimationFrame(() => titleLenRef.current?.focus())
          }}
          title="Preferred title and note lengths for items in this graph (used by AI agents)"
        >
          Lengths
        </button>
        {onDelete && (
          <button type="button" className="inline-tool delete" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
      <input
        ref={nameRef}
        className="inline-edit-title"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Graph name"
      />
      {showDesc && (
        <input
          ref={descRef}
          className="inline-edit-context-input"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Description"
        />
      )}
      {showLengths && (
        // Soft targets, in characters, that an agent writing into this
        // graph keeps to when it can without losing information.
        <div className="graph-lengths">
          <label className="graph-length-field">
            <span>Title ≤</span>
            <input
              ref={titleLenRef}
              type="number"
              inputMode="numeric"
              min={LENGTH_LIMITS.min}
              max={LENGTH_LIMITS.max}
              value={titleLen}
              onChange={(e) => setTitleLen(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={String(LENGTH_DEFAULTS.title)}
              aria-label="Preferred title length in characters"
            />
          </label>
          <label className="graph-length-field">
            <span>Note ≤</span>
            <input
              type="number"
              inputMode="numeric"
              min={LENGTH_LIMITS.min}
              max={LENGTH_LIMITS.max}
              value={noteLen}
              onChange={(e) => setNoteLen(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={String(LENGTH_DEFAULTS.note)}
              aria-label="Preferred note length in characters"
            />
          </label>
          <span className="graph-length-hint">chars — AI agents aim for these without dropping information</span>
        </div>
      )}
    </div>
  )
}

export default InlineGraphEditor
