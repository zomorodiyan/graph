import { useEffect, useRef, useState } from 'react'

interface InlineGraphEditorProps {
  displayName: string
  description: string
  onSave: (displayName: string, description: string) => void
  onCancel: () => void
  onDelete?: () => void
}

function InlineGraphEditor({ displayName, description, onSave, onCancel, onDelete }: InlineGraphEditorProps) {
  const [name, setName] = useState(displayName)
  const [desc, setDesc] = useState(description)
  const [showDesc, setShowDesc] = useState(description !== '')

  const nameRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLInputElement>(null)
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
  }, [name, desc])

  const commit = () => {
    if (didCommitRef.current) return
    didCommitRef.current = true
    if (name.trim()) {
      onSave(name.trim(), desc.trim())
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
    </div>
  )
}

export default InlineGraphEditor
