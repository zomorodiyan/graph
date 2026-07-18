import { useEffect, useMemo, useRef, useState } from 'react'
import { StructureItem, UpdatePayload } from '../api/localClient'

interface InlineItemEditorProps {
  itemKey: string
  item: StructureItem
  onSave: (data: UpdatePayload) => void
  onCancel: () => void
  onDelete?: () => void
  // Create mode: prefill the title (preselected so typing replaces it);
  // committing without edits saves an item with this name
  defaultName?: string
}

function InlineItemEditor({ itemKey, item, onSave, onCancel, onDelete, defaultName }: InlineItemEditorProps) {
  const initialName = item.title || itemKey
  const initialDue = item.due || ''
  const initialContext = item.context || ''

  // Parse initial progress into done/total strings
  const { initDone, initTotal, initialProgressStr } = (() => {
    const p = item.progress
    if (p === undefined || p === null || p === '') return { initDone: '', initTotal: '', initialProgressStr: '' }
    const s = String(p)
    const m = s.match(/^(\d+)\/(\d+)$/)
    if (m) return { initDone: m[1], initTotal: m[2], initialProgressStr: s }
    const n = Number(s)
    if (!isNaN(n)) return { initDone: String(n), initTotal: '100', initialProgressStr: `${n}/100` }
    return { initDone: '', initTotal: '', initialProgressStr: '' }
  })()

  // Parse initial checkpoints into {date, done} pairs for chip display — total is
  // never edited per-checkpoint, it always tracks the live progress total instead
  const initCheckpoints = (() => {
    const cps = item.checkpoints
    if (!Array.isArray(cps)) return []
    return cps.map(cp => {
      const m = typeof cp.progress === 'string' ? cp.progress.match(/^(\d+)\/(\d+)$/) : null
      return { date: cp.date ?? '', done: m ? m[1] : '' }
    })
  })()

  const [name, setName] = useState(defaultName ?? initialName)
  const [progressDone, setProgressDone] = useState(initDone)
  const [progressTotal, setProgressTotal] = useState(initTotal)
  const [due, setDue] = useState(initialDue)
  const [context, setContext] = useState(initialContext)
  const [checkpoints, setCheckpoints] = useState(initCheckpoints)
  const [showProgressEditor, setShowProgressEditor] = useState(initialProgressStr !== '')
  const [showDueEditor, setShowDueEditor] = useState(initialDue !== '')
  const [showContextEditor, setShowContextEditor] = useState(false)
  const [showCheckpointsEditor, setShowCheckpointsEditor] = useState(initCheckpoints.length > 0)

  const inputRef = useRef<HTMLInputElement>(null)
  const progressDoneRef = useRef<HTMLInputElement>(null)
  const progressTotalRef = useRef<HTMLInputElement>(null)
  const dueRef = useRef<HTMLInputElement>(null)
  const contextRef = useRef<HTMLInputElement>(null)
  const checkpointDateRefs = useRef<(HTMLInputElement | null)[]>([])
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

  const addCheckpoint = () => setCheckpoints(cps => [...cps, { date: '', done: '' }])
  const removeCheckpoint = (idx: number) => setCheckpoints(cps => cps.filter((_, i) => i !== idx))
  const updateCheckpoint = (idx: number, field: 'date' | 'done', value: string) =>
    setCheckpoints(cps => cps.map((cp, i) => i === idx ? { ...cp, [field]: value } : cp))

  // Focus the date field of a freshly-added blank checkpoint
  useEffect(() => {
    const idx = checkpoints.length - 1
    if (idx >= 0 && checkpoints[idx].date === '' && checkpoints[idx].done === '') {
      requestAnimationFrame(() => checkpointDateRefs.current[idx]?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoints.length])

  const payload = useMemo<UpdatePayload>(() => {
    const next: UpdatePayload = {}

    const trimmed = name.trim()
    if (trimmed && trimmed !== initialName) {
      next.name = trimmed
    }

    const currentProgressStr = progressDone !== '' && progressTotal !== ''
      ? `${progressDone}/${progressTotal}` : ''
    if (currentProgressStr !== initialProgressStr) {
      next.progress = currentProgressStr || ''
    }

    if (due !== initialDue) {
      next.due = due || ''
    }

    if (context !== initialContext) {
      next.context = context || ''
    }

    // Checkpoints only make sense while progress is shown; if the editor's closed
    // (or progress got cleared), fall back to "unchanged from the original item"
    const finalCheckpoints = showCheckpointsEditor && progressDone && progressTotal
      ? checkpoints
          .filter(cp => cp.date && cp.done !== '')
          .map(cp => ({ date: cp.date, progress: `${cp.done}/${progressTotal}` }))
          .sort((a, b) => a.date.localeCompare(b.date))
      : (item.checkpoints ?? [])
    const initialCheckpoints = item.checkpoints ?? []
    if (JSON.stringify(finalCheckpoints) !== JSON.stringify(initialCheckpoints)) {
      next.checkpoints = finalCheckpoints
    }
    // Clearing progress makes any checkpoints meaningless — clear them too
    if (next.progress === '' && finalCheckpoints.length > 0) {
      next.checkpoints = []
    }

    return next
  }, [name, progressDone, progressTotal, due, context, checkpoints, showCheckpointsEditor,
      initialName, initialProgressStr, initialDue, initialContext, item.checkpoints])

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
          title="Context"
        >
          Context
        </button>
        <button
          type="button"
          className={`inline-tool ${showProgressEditor || progressDone || progressTotal ? 'active' : ''}`}
          onClick={() => {
            if (!showProgressEditor) {
              setProgressDone(d => d || '0')
              setProgressTotal(t => t || '100')
            }
            setShowProgressEditor(true)
            focusAndScroll(progressDoneRef)
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
        {showProgressEditor && progressDone && progressTotal && (
          <button
            type="button"
            className={`inline-tool ${showCheckpointsEditor || checkpoints.length > 0 ? 'active' : ''}`}
            onClick={() => setShowCheckpointsEditor(true)}
            title="Checkpoints"
          >
            Checkpoints
          </button>
        )}
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

      {(showProgressEditor || showDueEditor) && (
        <div className="inline-edit-fields-row">
          {showProgressEditor && (
            <div className="inline-edit-progress">
              <input
                ref={progressDoneRef}
                className="inline-edit-small"
                type="number"
                min={0}
                value={progressDone}
                onChange={(e) => setProgressDone(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="done"
              />
              <span className="progress-sep">/</span>
              <input
                ref={progressTotalRef}
                className="inline-edit-small"
                type="number"
                min={1}
                value={progressTotal}
                onChange={(e) => setProgressTotal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="total"
              />
            </div>
          )}
          {showDueEditor && (
            <input
              ref={dueRef}
              className="inline-edit-small inline-edit-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="due"
            />
          )}
        </div>
      )}

      {showCheckpointsEditor && progressDone && progressTotal && (
        <div className="inline-edit-checkpoints">
          {checkpoints.map((cp, i) => (
            <div className="checkpoint-chip" key={i}>
              <input
                ref={el => { checkpointDateRefs.current[i] = el }}
                type="date"
                className="inline-edit-small"
                value={cp.date}
                onChange={(e) => updateCheckpoint(i, 'date', e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <input
                type="number"
                min={0}
                className="inline-edit-small"
                value={cp.done}
                onChange={(e) => updateCheckpoint(i, 'done', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="done"
              />
              <button
                type="button"
                className="checkpoint-remove"
                onClick={() => removeCheckpoint(i)}
                title="Remove checkpoint"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="checkpoint-chip checkpoint-add"
            title="Add checkpoint"
            onClick={addCheckpoint}
          >
            +
          </button>
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
