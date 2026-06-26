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
  onSelect: (id: string) => void
  /** Create a new Draft v1 set with this label, then select it (page owns POST). */
  onCreate: (label: string) => void
}

// DB status is lowercase ('live' | 'draft'); display it capitalized.
function statusLabel(status: string): string {
  return status.toLowerCase() === 'live' ? 'Live' : 'Draft'
}

export function PromptSetPicker({ sets, activeId, onSelect, onCreate }: PromptSetPickerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false); setName('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const active = sets.find(s => s.id === activeId) ?? sets[0]

  function create() {
    const label = name.trim()
    if (!label) return
    onCreate(label)
    setName(''); setCreating(false); setOpen(false)
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
              <div className={styles.create}>
                <input
                  autoFocus
                  className={styles.createInput}
                  value={name}
                  placeholder="New prompt set name…"
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') create()
                    if (e.key === 'Escape') { setCreating(false); setName('') }
                  }}
                />
                <button type="button" className={styles.createGo} disabled={!name.trim()} onClick={create}>
                  Create
                </button>
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
