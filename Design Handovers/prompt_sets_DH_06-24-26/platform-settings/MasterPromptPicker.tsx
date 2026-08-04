'use client'

// MasterPromptPicker — NEW. The cross-tenant prompt-set dropdown on the Platform
// Settings page. It marks one prompt set as the platform master. Presentational
// only: `options`, `selectedId` (the PENDING pick), `masterId` (what's currently
// live), and `onSelect` are all driven by page.tsx, which owns the fetch + the
// Save call. See handover §3/§4.
//
// This is the SAME control as the Composer's `PromptSetPicker` (same `ps-*`/`mp-*`
// trigger + dropdown + Live/Draft badge), with two deltas for the cross-tenant
// context: each option carries a tenant name, and the menu has a search box
// because the list spans every tenant. If `PromptSetPicker` is exported and
// flexible, prefer extending it with optional `tenantName` per option + a
// `searchable` prop rather than forking — kept standalone here so the package
// reads on its own.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MasterPromptOption } from './types'
import styles from './MasterPromptPicker.module.css'

interface MasterPromptPickerProps {
  options: MasterPromptOption[]
  /** The pending selection (defaults to the current master on load). */
  selectedId: string | null
  /** The prompt set that is currently live as master — gets the double-check + "Master" badge. */
  masterId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

export function MasterPromptPicker({ options, selectedId, masterId, onSelect, disabled }: MasterPromptPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = options.find(o => o.id === selectedId) ?? null

  // Filter on label OR tenant — the list spans every tenant so this can be long.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q) || o.tenantName.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className={`${styles.select}`} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <span className={styles.trigLabel}>
            <span className={styles.name}>{selected.label}</span>
            <span className={styles.dot} aria-hidden>·</span>
            <span className={styles.tenant}>{selected.tenantName}</span>
            <StatusBadge status={selected.status} />
          </span>
        ) : (
          <span className={styles.placeholder}>Select a prompt set…</span>
        )}
        <ChevronRight className={`${styles.caret} ${open ? styles.caretOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.menu} role="listbox">
          <div className={styles.search}>
            <SearchIcon />
            <input
              autoFocus
              value={query}
              placeholder="Search prompt set or tenant…"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
            />
          </div>
          <div className={styles.list}>
            {filtered.length === 0 ? (
              <div className={styles.noMatch}>No matching prompt sets</div>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === selectedId}
                className={`${styles.item} ${o.id === selectedId ? styles.on : ''}`}
                onClick={() => { onSelect(o.id); setOpen(false); setQuery('') }}
              >
                <span className={styles.itemName}>{o.label}</span>
                <span className={styles.sep} aria-hidden>·</span>
                <span className={styles.itemTenant}>{o.tenantName}</span>
                {o.version != null && <span className={styles.itemVersion}>v{o.version}</span>}
                <StatusBadge status={o.status} />
                {o.id === masterId && <span className={styles.masterBadge}>Master</span>}
                <span className={`${styles.itemCheck} ${o.id === masterId ? styles.checkMaster : ''}`}>
                  {o.id === masterId ? <DoubleCheck /> : (o.id === selectedId ? <Check /> : null)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'Live' | 'Draft' }) {
  return (
    <span className={`${styles.badge} ${status === 'Live' ? styles.live : styles.draft}`}>{status}</span>
  )
}

// ── Inline icons (match the Composer's PromptSetPicker glyphs) ──────────────────
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
// Double-check marks the LIVE master, distinct from the single check on the pending pick.
function DoubleCheck() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 13l4 4L13 7" /><path d="M9 17L19.5 6" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
  )
}
