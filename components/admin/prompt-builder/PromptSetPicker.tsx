'use client'

// PromptSetPicker — NEW. The Composer top-bar control that says which prompt set a
// saved block will land in, and lets you create a new set inline. Presentational
// only: the list, the active id, selection, and create are all driven by page.tsx
// (which owns the prompt-set fetch + the save payload's `prompt_set_id`).
// See handover §4.
//
// This is the SAME control the Blocks header already ships (`PromptSetSelect`).
// If that component is exported, prefer importing it and adding the inline-create
// affordance via a prop rather than maintaining two copies — kept standalone here
// so the package reads on its own.

import { useEffect, useRef, useState } from 'react'
import type { PromptSet } from './types'
import styles from './PromptSetPicker.module.css'

interface PromptSetPickerProps {
  sets: PromptSet[]
  activeId: string
  promptTypes: { id: string; name: string }[]
  onSelect: (id: string) => void
  /** Create a new Draft v1 set (label + optional type + description), then select it (page owns POST). */
  onCreate: (input: { label: string; promptTypeId: string | null; description: string }) => void
}

// DB status is lowercase ('live' | 'draft' | 'retired'); display it capitalized.
function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'live': return 'Live'
    case 'retired': return 'Retired'
    default: return 'Draft'
  }
}

export function PromptSetPicker({ sets, activeId, promptTypes, onSelect, onCreate }: PromptSetPickerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('') // '' = "No type yet"
  const [desc, setDesc] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  function resetCreate() { setCreating(false); setName(''); setTypeId(''); setDesc('') }

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); resetCreate()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = sets.find(s => s.id === activeId) ?? sets[0]

  function create() {
    const label = name.trim()
    if (!label) return
    onCreate({ label, promptTypeId: typeId || null, description: desc })
    resetCreate(); setOpen(false)
  }

  if (!active) return null

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Building in</span>
      <div className={styles.select} ref={ref}>
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span className={styles.name}>{active.label}</span>
          <span className={`${styles.badge} ${active.status?.toLowerCase() === 'live' ? styles.live : styles.draft}`}>
            {statusLabel(active.status)}
          </span>
          <ChevronRight className={`${styles.caret} ${open ? styles.caretOpen : ''}`} />
        </button>

        {open && (
          <div className={styles.menu} role="listbox">
            {sets.map(s => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === activeId}
                className={`${styles.item} ${s.id === activeId ? styles.on : ''}`}
                onClick={() => { onSelect(s.id); setOpen(false) }}
              >
                <span className={styles.itemName}>{s.label}</span>
                <span className={styles.itemMeta}>v{s.version}</span>
                <span className={`${styles.badge} ${s.status?.toLowerCase() === 'live' ? styles.live : styles.draft}`}>
                  {statusLabel(s.status)}
                </span>
                <span className={styles.itemCheck}>{s.id === activeId ? <Check /> : null}</span>
              </button>
            ))}

            <div className={styles.sep} />

            {creating ? (
              <div className={styles.createForm}>
                <label className={styles.cfLabel}>Name</label>
                <input
                  autoFocus
                  className={styles.cfInput}
                  value={name}
                  placeholder="e.g. Sage Base"
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') resetCreate() }}
                />

                <label className={styles.cfLabel}>Type</label>
                <select className={styles.cfSelect} value={typeId} onChange={e => setTypeId(e.target.value)}>
                  <option value="">No type yet</option>
                  {promptTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>

                <label className={styles.cfLabel}>Description</label>
                <textarea
                  className={styles.cfTextarea}
                  rows={2}
                  value={desc}
                  placeholder="What this set is for…"
                  onChange={e => setDesc(e.target.value)}
                />

                <div className={styles.cfActions}>
                  <button type="button" className={styles.cfCancel} onClick={resetCreate}>Cancel</button>
                  <button type="button" className={styles.createGo} disabled={!name.trim()} onClick={create}>Create</button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.newItem} onClick={() => setCreating(true)}>
                <Plus /> New prompt set…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline icons ──────────────────────────────────────────────────────────────
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
function Plus() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}
