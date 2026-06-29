'use client'

// System-prompt picker — custom bordered trigger + searchable styled dropdown
// (matches the design exactly; not a Mantine <Select>). Presentational: options,
// selection, masterId, and onSelect are owned by the page.
// Mirrors components/admin .../MasterPromptPicker.tsx.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@mantine/core'
import { IconCheck, IconChevronRight, IconSearch } from '@tabler/icons-react'
import { StatusBadge } from '@/components/admin/lib/badges'
import { accentMix } from '@/components/admin/theme/mantine-theme'
import type { MasterPromptOption } from '@/components/admin/lib/types'

interface SystemPromptPickerProps {
  options: MasterPromptOption[]
  selectedId: string | null
  masterId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

export function SystemPromptPicker({ options, selectedId, masterId, onSelect, disabled }: SystemPromptPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = options.find((o) => o.id === selectedId) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.tenantName.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 340, maxWidth: 460 }}>
      <button
        type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', height: 40,
          padding: '0 9px 0 14px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)',
          background: disabled ? 'var(--mantine-color-gray-0)' : '#fff', color: 'var(--mantine-color-text)', fontSize: 14,
          fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {selected ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</span>
            <span style={{ color: 'var(--mantine-color-gray-4)' }}>·</span>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontWeight: 500, whiteSpace: 'nowrap' }}>{selected.tenantName}</span>
            <StatusBadge status={selected.status} />
          </span>
        ) : (
          <span style={{ color: 'var(--mantine-color-gray-5)', fontWeight: 500 }}>Select a prompt set…</span>
        )}
        <IconChevronRight size={15} style={{ color: 'var(--mantine-color-gray-6)', flex: '0 0 auto', transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', boxShadow: 'var(--mantine-shadow-md)', padding: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 8px', color: 'var(--mantine-color-gray-5)' }}>
            <IconSearch size={15} />
            <input
              autoFocus value={query} placeholder="Search prompt set or tenant…"
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
              style={{ flex: '1 1 auto', minWidth: 0, height: 32, padding: '0 10px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', fontFamily: 'inherit', fontSize: 13, color: 'var(--mantine-color-text)', outline: 'none' }}
            />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 10px', fontSize: 13, color: 'var(--mantine-color-dimmed)', textAlign: 'center' }}>No matching prompt sets</div>
            ) : (
              filtered.map((o) => {
                const sel = o.id === selectedId
                const sys = o.id === masterId
                return (
                  <button
                    key={o.id} type="button" role="option" aria-selected={sel}
                    onClick={() => { onSelect(o.id); setOpen(false); setQuery('') }}
                    onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = sel ? accentMix(8) : 'transparent' }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', background: sel ? accentMix(8) : 'transparent', borderRadius: 'var(--mantine-radius-sm)', padding: '9px 10px', fontSize: 13.5, color: 'var(--mantine-color-text)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{o.label}</span>
                    <span style={{ color: 'var(--mantine-color-gray-4)' }}>·</span>
                    <span style={{ color: 'var(--mantine-color-dimmed)', whiteSpace: 'nowrap' }}>{o.tenantName}</span>
                    <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: 'var(--mantine-color-gray-5)' }}>v{o.version}</span>
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={o.status} />
                      {sys && <Badge size="sm" radius="sm" variant="filled" color="green">System</Badge>}
                      <span style={{ display: 'inline-flex', width: 14, color: 'var(--mantine-color-brand-6)' }}>{sel ? <IconCheck size={14} /> : null}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
