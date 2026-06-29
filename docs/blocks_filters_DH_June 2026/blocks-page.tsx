'use client'

// Prompt Studio · Blocks — block library: token donut, expandable rows, bulk
// enable/disable/delete, collapsible prompt summary, and a REWORKED FILTER SYSTEM.
// Route: /admin/prompt-studio/blocks
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT CHANGED (vs the page currently on main)
//
//  1. ONE prompt set is in view at a time. The header "Current Prompt Set" picker
//     is the single source of which set's blocks the table shows. There is NO
//     multi-select prompt-set filter — the prototype experiment that tried to mix
//     several sets into one table is intentionally NOT ported (it was confusing and
//     the set chips did not scale). Blocks for the selected set are loaded by the
//     data layer (see `loadBlocksForSet` TODO) — switching the picker swaps the set.
//
//  2. The picker is now SEARCHABLE (filter field appears once there are > 6 sets),
//     same hand-built button+popover pattern as MasterPromptPicker.tsx.
//
//  3. The three inline chip groups (type + status + search) are replaced by ONE
//     cohesive filter system, available in three presentations. Pick one by flipping
//     `FILTER_LAYOUT` below:
//        'bar'     — unified search field with inline removable filter tokens + a
//                    "+ Filter" popover. (Recommended default.)
//        'rail'    — faceted left sidebar (Type / Status as count lists). Scales best.
//        'popover' — slim search + a single "Filters" button with an active-count badge.
//
//  4. Added an empty state (with "Clear filters").
//
// TODO: replace BLOCKS with a query scoped to `promptSet`; wire status toggles, bulk
// actions, copy/edit/duplicate/delete, and Compile & Publish to your endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon, Badge, Box, Button, Card, Checkbox, Group, Paper, Stack, Switch, Table, Text, TextInput, Tooltip,
} from '@mantine/core'
import {
  IconCheck, IconChevronRight, IconChevronsDown, IconChevronsUp, IconClipboard, IconCopy,
  IconFilter, IconPencil, IconPlus, IconSearch, IconTrash, IconX,
} from '@tabler/icons-react'
import { BLOCKS, COMPOSER_PROMPT_SETS, MASTER_PROMPT_VERSION, type ComposerPromptSet } from '@/components/admin/lib/fixtures'
import { BLOCK_BADGE, BLOCK_TYPE_LABELS, ORDERED_BLOCK_TYPES, TintBadge, blockTint } from '@/components/admin/lib/badges'
import { notify } from '@/components/admin/lib/primitives'
import { tokensFor } from '@/components/admin/lib/types'
import type { Block, BlockType } from '@/components/admin/lib/types'

// ── Flip this one constant to compare the three filter presentations. ──────────
const FILTER_LAYOUT: 'bar' | 'rail' | 'popover' = 'bar'

const LIMIT = 8000
const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}
const orderPrefix = (o: number) => (o && o > 0 ? String(o).padStart(2, '0') : '')
const TypeBadge = ({ type }: { type: BlockType }) => <TintBadge tint={blockTint(type)}>{BLOCK_TYPE_LABELS[type]}</TintBadge>
const statusTint = (s: 'active' | 'disabled') => (s === 'active' ? BLOCK_BADGE.green : BLOCK_BADGE.gray)

/* close-on-outside-click for the hand-built popovers */
function useOutside(ref: React.RefObject<HTMLElement>, cb: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb() }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [active])
}

/* ── Prompt-set selector — single select, now searchable (drives the table) ── */
function PromptSetSelect({ promptSet, setPromptSet }: { promptSet: string; setPromptSet: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setOpen(false), open)
  useEffect(() => { if (!open) setQ('') }, [open])
  const set = COMPOSER_PROMPT_SETS.find((s) => s.value === promptSet) || COMPOSER_PROMPT_SETS[0]
  const showSearch = COMPOSER_PROMPT_SETS.length > 6
  const matches = COMPOSER_PROMPT_SETS.filter((s) => !q.trim() || s.label.toLowerCase().includes(q.trim().toLowerCase()))
  const Pill = ({ status }: { status: ComposerPromptSet['status'] }) => <Badge size="sm" radius="sm" variant="light" color={status === 'Live' ? 'green' : 'yellow'}>{status}</Badge>
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 280 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 38, padding: '0 9px 0 13px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--mantine-color-text)' }}>{set.label}</span>
        <Pill status={set.status} />
        <IconChevronRight size={15} style={{ marginLeft: 'auto', color: 'var(--mantine-color-gray-6)', transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', boxShadow: 'var(--mantine-shadow-md)', padding: 4 }}>
          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 6px 8px', marginBottom: 4, borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
              <IconSearch size={14} style={{ color: 'var(--mantine-color-gray-5)' }} />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Find a prompt set"
                style={{ flex: '1 1 auto', minWidth: 0, height: 30, border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--mantine-color-text)', outline: 'none' }}
              />
            </div>
          )}
          {matches.map((s) => (
            <button
              key={s.value} type="button" role="option" aria-selected={s.value === promptSet} onClick={() => { setPromptSet(s.value); setOpen(false) }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 'var(--mantine-radius-sm)', padding: '8px 10px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--mantine-color-text)' }}
            >
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: 'var(--mantine-color-gray-5)' }}>v{s.version}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Pill status={s.status} />
                <span style={{ width: 14, color: 'var(--mantine-color-brand-6)' }}>{s.value === promptSet ? <IconCheck size={14} /> : null}</span>
              </span>
            </button>
          ))}
          {matches.length === 0 && <Text c="dimmed" size="sm" ta="center" py="sm">No prompt sets match.</Text>}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ Filter system (3 presentations) ═══════════════════════ */

interface FilterState {
  query: string; setQuery: (v: string) => void
  typeFilter: 'all' | BlockType; setTypeFilter: (v: 'all' | BlockType) => void
  statusFilter: 'all' | 'active' | 'disabled'; setStatusFilter: (v: 'all' | 'active' | 'disabled') => void
}
type TypeCounts = Partial<Record<BlockType, number>>
interface StatusCounts { active: number; disabled: number }

/* Removable token for an active Type/Status filter (bar + popover). */
function FilterToken({ tint, label, onClear }: { tint: { bg: string; fg: string; solid: string }; label: string; onClear: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 4px 0 9px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', border: `1px solid ${tint.fg}3d`, background: tint.bg, color: tint.fg, flex: '0 0 auto' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: tint.solid }} />
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label} filter`} style={{ display: 'grid', placeItems: 'center', width: 17, height: 17, border: 'none', background: 'transparent', borderRadius: 999, color: 'currentColor', opacity: 0.7, cursor: 'pointer' }}><IconX size={11} /></button>
    </span>
  )
}

/* Shared search field (rail + popover layouts). */
function SearchField({ f, placeholder = 'Search blocks' }: { f: FilterState; placeholder?: string }) {
  return (
    <TextInput
      value={f.query} onChange={(e) => f.setQuery(e.currentTarget.value)} placeholder={placeholder} size="sm" style={{ flex: '1 1 280px' }}
      leftSection={<IconSearch size={14} />}
      rightSection={f.query ? <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => f.setQuery('')}><IconX size={12} /></ActionIcon> : null}
    />
  )
}

/* Result count + expand-all — same on every layout. */
function ResultMeta({ filteredCount, totalCount, allExpanded, onToggleExpand }: { filteredCount: number; totalCount: number; allExpanded: boolean; onToggleExpand: () => void }) {
  return (
    <Group gap="sm" align="center">
      <Text c="dimmed" size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{filteredCount} / {totalCount}</Text>
      <Button variant="subtle" color="gray" size="xs" leftSection={allExpanded ? <IconChevronsUp size={14} /> : <IconChevronsDown size={14} />} onClick={onToggleExpand}>{allExpanded ? 'Collapse all' : 'Expand all'}</Button>
    </Group>
  )
}

/* dropdown menu primitives, shared by bar's "+ Filter" popover */
function MenuItem({ active, dot, sdot, label, count, onClick }: { active: boolean; dot?: string; sdot?: 'active' | 'disabled'; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }} onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', border: 'none', borderRadius: 'var(--mantine-radius-sm)', padding: '7px 8px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', background: active ? 'rgba(45,106,79,0.07)' : 'transparent', color: active ? '#2d6a4f' : 'var(--mantine-color-text)' }}
    >
      {dot && <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flex: '0 0 auto' }} />}
      {sdot && <span style={{ width: 9, height: 9, borderRadius: 999, background: sdot === 'active' ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-4)', flex: '0 0 auto' }} />}
      <span style={{ flex: '1 1 auto' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: active ? '#2d6a4f' : 'var(--mantine-color-dimmed)' }}>{count}</span>
      {active && <IconCheck size={13} style={{ color: '#2d6a4f' }} />}
    </button>
  )
}

/* ── Layout A: unified filter bar ── */
function FilterBar({ f, typeCounts, statusCounts }: { f: FilterState; typeCounts: TypeCounts; statusCounts: StatusCounts }) {
  const [pop, setPop] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setPop(false), pop)
  const hasFilter = f.typeFilter !== 'all' || f.statusFilter !== 'all'
  return (
    <div style={{ flex: '1 1 420px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '6px 6px 6px 13px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', background: '#fff', flexWrap: 'wrap' }}>
        <IconSearch size={15} style={{ color: 'var(--mantine-color-gray-5)', flex: '0 0 auto' }} />
        {f.typeFilter !== 'all' && <FilterToken tint={blockTint(f.typeFilter)} label={BLOCK_TYPE_LABELS[f.typeFilter]} onClear={() => f.setTypeFilter('all')} />}
        {f.statusFilter !== 'all' && <FilterToken tint={statusTint(f.statusFilter)} label={f.statusFilter === 'active' ? 'Active' : 'Disabled'} onClear={() => f.setStatusFilter('all')} />}
        <input
          value={f.query} onChange={(e) => f.setQuery(e.currentTarget.value)} placeholder={hasFilter ? 'Search…' : 'Search blocks by title or content'}
          style={{ flex: '1 1 160px', minWidth: 110, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, height: 28, fontFamily: 'inherit', color: 'var(--mantine-color-text)' }}
        />
        {f.query && <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => f.setQuery('')}><IconX size={13} /></ActionIcon>}
        <div ref={ref} style={{ position: 'relative', marginLeft: 'auto', flex: '0 0 auto' }}>
          <button type="button" onClick={() => setPop((o) => !o)} aria-expanded={pop} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 999, background: pop ? 'var(--mantine-color-gray-1)' : '#fff', color: 'var(--mantine-color-gray-7)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            <IconPlus size={14} /> Filter
          </button>
          {pop && (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 30, minWidth: 236, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', boxShadow: 'var(--mantine-shadow-md)', padding: 6 }}>
              <Text tt="uppercase" size="xs" c="dimmed" fw={600} px={8} py={4} style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}>Type</Text>
              {ORDERED_BLOCK_TYPES.map((t) => (
                <MenuItem key={t} active={f.typeFilter === t} dot={blockTint(t).solid} label={BLOCK_TYPE_LABELS[t]} count={typeCounts[t] || 0} onClick={() => { f.setTypeFilter(f.typeFilter === t ? 'all' : t); setPop(false) }} />
              ))}
              <Box mt={4} pt={6} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                <Text tt="uppercase" size="xs" c="dimmed" fw={600} px={8} py={4} style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}>Status</Text>
                {(['active', 'disabled'] as const).map((s) => (
                  <MenuItem key={s} active={f.statusFilter === s} sdot={s} label={s === 'active' ? 'Active' : 'Disabled'} count={statusCounts[s] || 0} onClick={() => { f.setStatusFilter(f.statusFilter === s ? 'all' : s); setPop(false) }} />
                ))}
              </Box>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Layout B: faceted rail ── */
function FilterRail({ f, typeCounts, statusCounts, total }: { f: FilterState; typeCounts: TypeCounts; statusCounts: StatusCounts; total: number }) {
  const Opt = ({ on, dot, sdot, name, count, onClick }: { on: boolean; dot?: string; sdot?: 'active' | 'disabled'; name: string; count: number; onClick: () => void }) => (
    <button
      type="button" onClick={onClick}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent' }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', border: 'none', borderRadius: 'var(--mantine-radius-sm)', padding: 8, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', background: on ? 'rgba(45,106,79,0.09)' : 'transparent', color: on ? '#2d6a4f' : 'var(--mantine-color-gray-7)', fontWeight: on ? 600 : 400 }}
    >
      {dot && <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flex: '0 0 auto' }} />}
      {sdot && <span style={{ width: 9, height: 9, borderRadius: 999, background: sdot === 'active' ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-4)', flex: '0 0 auto' }} />}
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>{name}</span>
      <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: on ? '#2d6a4f' : 'var(--mantine-color-dimmed)' }}>{count}</span>
    </button>
  )
  const Label = ({ children }: { children: React.ReactNode }) => <Text tt="uppercase" size="xs" c="dimmed" fw={600} px={8} pb={6} style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}>{children}</Text>
  return (
    <Box style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Label>Type</Label>
        <Opt on={f.typeFilter === 'all'} name="All types" count={total} onClick={() => f.setTypeFilter('all')} />
        {ORDERED_BLOCK_TYPES.map((t) => (
          <Opt key={t} on={f.typeFilter === t} dot={blockTint(t).solid} name={BLOCK_TYPE_LABELS[t]} count={typeCounts[t] || 0} onClick={() => f.setTypeFilter(f.typeFilter === t ? 'all' : t)} />
        ))}
      </div>
      <div>
        <Label>Status</Label>
        <Opt on={f.statusFilter === 'all'} name="All" count={total} onClick={() => f.setStatusFilter('all')} />
        <Opt on={f.statusFilter === 'active'} sdot="active" name="Active" count={statusCounts.active} onClick={() => f.setStatusFilter(f.statusFilter === 'active' ? 'all' : 'active')} />
        <Opt on={f.statusFilter === 'disabled'} sdot="disabled" name="Disabled" count={statusCounts.disabled} onClick={() => f.setStatusFilter(f.statusFilter === 'disabled' ? 'all' : 'disabled')} />
      </div>
    </Box>
  )
}

/* ── Layout C: slim toolbar + Filters popover ── */
function FilterPopover({ f, typeCounts, statusCounts }: { f: FilterState; typeCounts: TypeCounts; statusCounts: StatusCounts }) {
  const [pop, setPop] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, () => setPop(false), pop)
  const active = (f.typeFilter !== 'all' ? 1 : 0) + (f.statusFilter !== 'all' ? 1 : 0)
  return (
    <Group gap="sm" align="center" wrap="wrap" style={{ flex: '1 1 auto' }}>
      <SearchField f={f} />
      <div ref={ref} style={{ position: 'relative' }}>
        <button type="button" onClick={() => setPop((o) => !o)} aria-expanded={pop} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', border: `1px solid ${active ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-3)'}`, borderRadius: 'var(--mantine-radius-sm)', background: pop ? 'var(--mantine-color-gray-1)' : '#fff', color: active ? '#2d6a4f' : 'var(--mantine-color-gray-7)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
          <IconFilter size={14} /> Filters
          {active > 0 && <span style={{ display: 'inline-grid', placeItems: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--mantine-color-brand-6)', color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'var(--mantine-font-family-monospace)' }}>{active}</span>}
        </button>
        {pop && (
          <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 30, width: 330, maxWidth: '90vw', background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', boxShadow: 'var(--mantine-shadow-md)', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Text tt="uppercase" size="xs" c="dimmed" fw={600} mb={8} style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}>Type</Text>
              <Group gap={6} wrap="wrap">
                <Chip active={f.typeFilter === 'all'} onClick={() => f.setTypeFilter('all')}>All</Chip>
                {ORDERED_BLOCK_TYPES.map((t) => (
                  <Chip key={t} active={f.typeFilter === t} color={blockTint(t)} dot={blockTint(t).solid} onClick={() => f.setTypeFilter(t)}>{BLOCK_TYPE_LABELS[t]} <CountSpan n={typeCounts[t] || 0} /></Chip>
                ))}
              </Group>
            </div>
            <div>
              <Text tt="uppercase" size="xs" c="dimmed" fw={600} mb={8} style={{ letterSpacing: '0.12em', fontFamily: 'var(--mantine-font-family-monospace)' }}>Status</Text>
              <Group gap={6} wrap="wrap">
                <Chip active={f.statusFilter === 'all'} onClick={() => f.setStatusFilter('all')}>All</Chip>
                <Chip active={f.statusFilter === 'active'} color={{ bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' }} onClick={() => f.setStatusFilter('active')}>Active <CountSpan n={statusCounts.active} /></Chip>
                <Chip active={f.statusFilter === 'disabled'} onClick={() => f.setStatusFilter('disabled')}>Disabled <CountSpan n={statusCounts.disabled} /></Chip>
              </Group>
            </div>
            {active > 0 && <Button variant="subtle" color="gray" size="xs" w="fit-content" px={0} onClick={() => { f.setTypeFilter('all'); f.setStatusFilter('all') }}>Clear all filters</Button>}
          </div>
        )}
      </div>
      {f.typeFilter !== 'all' && <FilterToken tint={blockTint(f.typeFilter)} label={BLOCK_TYPE_LABELS[f.typeFilter]} onClear={() => f.setTypeFilter('all')} />}
      {f.statusFilter !== 'all' && <FilterToken tint={statusTint(f.statusFilter)} label={f.statusFilter === 'active' ? 'Active' : 'Disabled'} onClear={() => f.setStatusFilter('all')} />}
    </Group>
  )
}
const CountSpan = ({ n }: { n: number }) => <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10.5, opacity: 0.7, marginLeft: 2 }}>{n}</span>

/* ── Token-usage donut (over-limit aware) — unchanged ── */
function TokenDonut({ byType, total, limit }: { byType: Record<BlockType, number>; total: number; limit: number }) {
  const [hover, setHover] = useState<BlockType | null>(null)
  const size = 200, sw = 28, r = (size - sw) / 2, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2
  const over = total > limit
  let offset = 0
  const segs = ORDERED_BLOCK_TYPES.map((t) => {
    const len = total > 0 ? (byType[t] / total) * C : 0
    const seg = { t, len, off: offset, color: blockTint(t).solid }
    offset += len
    return seg
  })
  const hv = hover ? { label: BLOCK_TYPE_LABELS[hover], tokens: byType[hover], pct: total > 0 ? Math.round((byType[hover] / total) * 100) : 0, color: blockTint(hover).solid } : null
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} of ${limit} tokens used`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--mantine-color-gray-2)" strokeWidth={sw} />
      {total > 0 && segs.map((s) => (
        <circle key={s.t} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={-s.off} transform={`rotate(-90 ${cx} ${cy})`} opacity={hover && hover !== s.t ? 0.28 : 1} onMouseEnter={() => setHover(s.t)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer', transition: 'opacity 130ms ease' }} />
      ))}
      {hv ? (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: 'Manrope', fontSize: 15, fontWeight: 600, fill: hv.color }}>{hv.label}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontFamily: 'DM Mono', fontSize: 13, fill: 'var(--mantine-color-text)' }}>{hv.tokens.toLocaleString()}</text>
          <text x={cx} y={cy + 33} textAnchor="middle" style={{ fontFamily: 'DM Mono', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>{hv.pct}% of prompt</text>
        </>
      ) : (
        <>
          <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: 'DM Mono', fontSize: 26, fontWeight: 500, fill: over ? 'var(--mantine-color-red-7)' : 'var(--mantine-color-text)' }}>{total.toLocaleString()}</text>
          <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontFamily: 'DM Mono', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>/ {limit.toLocaleString()} tokens</text>
        </>
      )}
    </svg>
  )
}

function Overview({ blocks, promptSet, onPublish }: { blocks: Block[]; promptSet: string; onPublish: () => void }) {
  const byType: Record<BlockType, number> = { identity: 0, knowledge: 0, guardrail: 0, process: 0, escalation: 0 }
  for (const b of blocks) byType[b.type] += tokensFor(b.body)
  const total = ORDERED_BLOCK_TYPES.reduce((s, t) => s + byType[t], 0)
  const set = COMPOSER_PROMPT_SETS.find((s) => s.value === promptSet) || COMPOSER_PROMPT_SETS[0]
  const lastUpdated = blocks.length ? blocks.reduce((a, b) => (a > b.updated_at ? a : b.updated_at), blocks[0].updated_at) : null
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--mantine-spacing-md)' }}>
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap="md" justify="space-between" style={{ height: '100%' }}>
          <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 'var(--mantine-spacing-xs)', rowGap: 10 }}>
            <Text c="dimmed" size="sm">Status</Text><div><Badge size="sm" radius="sm" variant="light" color={set.status === 'Live' ? 'green' : 'yellow'}>{set.status}</Badge></div>
            <Text c="dimmed" size="sm">Live version</Text><Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>v{set.version}</Text>
            <Text c="dimmed" size="sm">Active blocks</Text><Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{blocks.length}</Text>
            <Text c="dimmed" size="sm">Last updated</Text><Text size="sm">{lastUpdated ? relTime(lastUpdated) : '—'}</Text>
          </Box>
          <Group gap="sm">
            <Button variant="default" leftSection={<IconPlus size={14} />} onClick={() => notify({ color: 'green', title: 'New block', message: 'Composer would open.' })}>New block</Button>
            <Button onClick={onPublish}>Compile &amp; Publish</Button>
          </Group>
        </Stack>
      </Card>
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap={4} align="center" justify="center" style={{ height: '100%' }}>
          <TokenDonut byType={byType} total={total} limit={LIMIT} />
          <Text c="dimmed" size="xs">Hover a segment for its breakdown</Text>
        </Stack>
      </Card>
    </Box>
  )
}

function ExpandPanel({ block }: { block: Block }) {
  const lines = block.body.split('\n')
  const preview = lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n…' : '')
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--mantine-spacing-lg)', padding: 'var(--mantine-spacing-md)', background: 'var(--mantine-color-gray-0)' }}>
      <Stack gap="sm">
        <Text tt="uppercase" fw={600} size="xs" c="dimmed" style={{ letterSpacing: '0.08em' }}>Block content</Text>
        <Text component="pre" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12.5, lineHeight: 1.6 }}>{preview}</Text>
        <Button variant="default" size="xs" w="fit-content" leftSection={<IconPencil size={14} />} onClick={() => notify({ color: 'green', title: 'Edit block', message: block.title })}>Edit</Button>
      </Stack>
      <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--mantine-spacing-md)', alignContent: 'start' }}>
        <div><Text c="dimmed" size="xs">Tokens</Text><Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{tokensFor(block.body).toLocaleString()}</Text></div>
        <div><Text c="dimmed" size="xs">Author</Text><Text size="sm">{block.author || '—'}</Text></div>
        <div><Text c="dimmed" size="xs">Updated</Text><Text size="sm">{relTime(block.updated_at)}</Text></div>
        <div><Text c="dimmed" size="xs">Order</Text><Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{block.order && block.order > 0 ? block.order : '—'}</Text></div>
      </Box>
    </Box>
  )
}

interface RowProps {
  block: Block; selected: boolean; expanded: boolean; maxTok: number; copied: boolean
  onSel: (id: string) => void; onToggleStatus: (id: string, checked: boolean) => void
  onToggleExpand: (id: string) => void; onCopy: (b: Block) => void
}
function Row({ block, selected, expanded, maxTok, copied, onSel, onToggleStatus, onToggleExpand, onCopy }: RowProps) {
  const tok = tokensFor(block.body)
  const barPct = maxTok > 0 ? (tok / maxTok) * 100 : 0
  return (
    <>
      <Table.Tr>
        <Table.Td><Checkbox size="xs" checked={selected} onChange={() => onSel(block.id)} aria-label="Select" /></Table.Td>
        <Table.Td><ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onToggleExpand(block.id)} aria-label="Expand"><IconChevronRight size={14} style={{ transition: 'transform 150ms', transform: expanded ? 'rotate(90deg)' : 'none' }} /></ActionIcon></Table.Td>
        <Table.Td>
          <Group gap={6} align="baseline">
            {orderPrefix(block.order) && <Text span c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 }}>{orderPrefix(block.order)}</Text>}
            <Text fw={500} size="sm">{block.title}</Text>
          </Group>
          <Text c="dimmed" size="xs">Updated {relTime(block.updated_at)}</Text>
        </Table.Td>
        <Table.Td><TypeBadge type={block.type} /></Table.Td>
        <Table.Td>
          <Group gap={8} wrap="nowrap" align="center">
            <Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)', minWidth: 42 }}>{tok.toLocaleString()}</Text>
            <div style={{ width: 70, height: 5, borderRadius: 3, background: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', background: blockTint(block.type).solid }} />
            </div>
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={8} wrap="nowrap" align="center">
            <Switch size="sm" checked={block.status === 'active'} onChange={(e) => onToggleStatus(block.id, e.currentTarget.checked)} />
            <Text size="sm" c={block.status === 'active' ? undefined : 'dimmed'}>{block.status === 'active' ? 'Active' : 'Disabled'}</Text>
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={2} wrap="nowrap">
            <Tooltip label={copied ? 'Copied!' : 'Copy body'}><ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={() => onCopy(block)} aria-label="Copy">{copied ? <IconCheck size={16} /> : <IconClipboard size={16} />}</ActionIcon></Tooltip>
            <Tooltip label="Edit"><ActionIcon variant="subtle" color="gray" onClick={() => notify({ color: 'green', title: 'Edit block', message: block.title })} aria-label="Edit"><IconPencil size={16} /></ActionIcon></Tooltip>
            <Tooltip label="Duplicate"><ActionIcon variant="subtle" color="gray" aria-label="Duplicate"><IconCopy size={16} /></ActionIcon></Tooltip>
            <Tooltip label="Delete"><ActionIcon variant="subtle" color="red" aria-label="Delete"><IconTrash size={16} /></ActionIcon></Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
      {expanded && <Table.Tr><Table.Td colSpan={7} p={0}><ExpandPanel block={block} /></Table.Td></Table.Tr>}
    </>
  )
}

/* Filter chip (kept for the popover layout). */
function Chip({ active, color, dot, children, onClick }: { active: boolean; color?: { bg: string; fg: string }; dot?: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        border: '1px solid ' + (active ? 'transparent' : 'var(--mantine-color-gray-3)'),
        background: active ? (color ? color.bg : 'var(--mantine-color-gray-2)') : 'transparent',
        color: active ? (color ? color.fg : 'var(--mantine-color-gray-8)') : 'var(--mantine-color-gray-7)',
        fontWeight: active ? 600 : 400,
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />}
      {children}
    </button>
  )
}

export default function BlocksPage() {
  const [promptSet, setPromptSet] = useState('sage-prod')

  // Blocks for the SELECTED prompt set only. The header picker is the single
  // source of truth — switching it loads a different set's blocks.
  // TODO: replace BLOCKS with `loadBlocksForSet(promptSet)` (server query / SWR).
  //       e.g. useEffect(() => { loadBlocksForSet(promptSet).then(setItems) }, [promptSet])
  const [items, setItems] = useState<Block[]>(BLOCKS)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | BlockType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [summaryHidden, setSummaryHidden] = useState(false)

  // Reset transient filters whenever the set in view changes.
  useEffect(() => { setTypeFilter('all'); setStatusFilter('all'); setQuery(''); setSelected(new Set()); setExpanded(new Set()) }, [promptSet])

  const activeBlocks = items.filter((b) => b.status === 'active')
  const filtered = items.filter((b) => {
    if (typeFilter !== 'all' && b.type !== typeFilter) return false
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (query.trim()) { const q = query.trim().toLowerCase(); if (!`${b.title} ${b.body}`.toLowerCase().includes(q)) return false }
    return true
  })
  const maxTok = filtered.length ? Math.max(0, ...filtered.map((b) => tokensFor(b.body))) : 0
  const allExpanded = filtered.length > 0 && filtered.every((b) => expanded.has(b.id))
  const filteredSel = filtered.filter((b) => selected.has(b.id)).length
  const allSel = filtered.length > 0 && filteredSel === filtered.length
  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || query.trim().length > 0

  // Facet counts (scoped to the set in view, before type/status filtering).
  const typeCounts: TypeCounts = {}
  for (const b of items) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1
  const statusCounts: StatusCounts = { active: 0, disabled: 0 }
  for (const b of items) statusCounts[b.status] += 1

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleStatus = (id: string, checked: boolean) => setItems((it) => it.map((b) => (b.id === id ? { ...b, status: checked ? 'active' : 'disabled' } : b)))
  const onToggleExpandAll = () => (allExpanded ? setExpanded(new Set()) : setExpanded(new Set(filtered.map((b) => b.id))))
  const onCopy = (b: Block) => { navigator.clipboard?.writeText(b.body); setCopiedId(b.id); setTimeout(() => setCopiedId(null), 2000) }
  const toggleSelAll = () => setSelected((prev) => { const n = new Set(prev); if (filteredSel > 0) filtered.forEach((b) => n.delete(b.id)); else filtered.forEach((b) => n.add(b.id)); return n })

  const summarySet = COMPOSER_PROMPT_SETS.find((s) => s.value === promptSet) || COMPOSER_PROMPT_SETS[0]
  const summaryTokens = activeBlocks.reduce((s, b) => s + tokensFor(b.body), 0)
  const onPublish = () => notify({ color: 'green', title: 'Prompt published', message: `Version ${MASTER_PROMPT_VERSION + 1}` })

  const f: FilterState = { query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter }
  const meta = <ResultMeta filteredCount={filtered.length} totalCount={items.length} allExpanded={allExpanded} onToggleExpand={onToggleExpandAll} />

  const bulkBar = selected.size > 0 ? (
    <Paper withBorder radius="md" p="xs" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text fw={500} size="sm" pl={8}>{selected.size} selected</Text>
        <Group gap={6}>
          <Button size="xs" variant="default" onClick={() => { setItems((it) => it.map((b) => (selected.has(b.id) ? { ...b, status: 'active' } : b))); setSelected(new Set()) }}>Enable</Button>
          <Button size="xs" variant="default" onClick={() => { setItems((it) => it.map((b) => (selected.has(b.id) ? { ...b, status: 'disabled' } : b))); setSelected(new Set()) }}>Disable</Button>
          <Button size="xs" variant="default" color="red" onClick={() => { setItems((it) => it.filter((b) => !selected.has(b.id))); setSelected(new Set()) }}>Delete</Button>
          <ActionIcon variant="subtle" color="gray" onClick={() => setSelected(new Set())} aria-label="Clear"><IconX size={15} /></ActionIcon>
        </Group>
      </Group>
    </Paper>
  ) : null

  const tableBody = filtered.length === 0 ? (
    <Paper withBorder radius="md" p="xl" style={{ borderStyle: 'dashed', background: 'var(--mantine-color-gray-0)' }}>
      <Stack align="center" gap={7} py="lg">
        <Text fw={600} size="sm">No blocks to show</Text>
        <Text c="dimmed" size="sm">{items.length === 0 ? `“${summarySet.label}” has no blocks yet.` : 'No blocks in this set match your filters.'}</Text>
        {hasFilters && items.length > 0 && <Button variant="subtle" color="gray" size="xs" onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setQuery('') }}>Clear filters</Button>}
      </Stack>
    </Paper>
  ) : (
    <Card withBorder radius="md" p={0} style={{ background: 'transparent', overflow: 'hidden' }}>
      <Table verticalSpacing="sm" horizontalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 40 }}><Checkbox size="xs" checked={allSel} indeterminate={filteredSel > 0 && !allSel} onChange={toggleSelAll} aria-label="Select all" /></Table.Th>
            <Table.Th style={{ width: 28 }} />
            <Table.Th>Title</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Tokens</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filtered.map((b) => (
            <Row key={b.id} block={b} selected={selected.has(b.id)} expanded={expanded.has(b.id)} maxTok={maxTok} copied={copiedId === b.id} onSel={toggleSel} onToggleStatus={toggleStatus} onToggleExpand={toggleExpand} onCopy={onCopy} />
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  )

  return (
    <Box data-screen-label="Prompt Studio · Blocks">
      <Group justify="space-between" align="center" px="xl" py="md" wrap="wrap" gap="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', background: '#fff', position: 'sticky', top: 0, zIndex: 20 }}>
        <Group gap="sm" align="center">
          <Text c="dimmed" size="xs" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>Current Prompt Set</Text>
          <PromptSetSelect promptSet={promptSet} setPromptSet={setPromptSet} />
        </Group>
      </Group>

      <Box p="xl">
        <Stack gap="lg">
          {!summaryHidden && (
            <Group justify="flex-end"><Button variant="subtle" color="gray" size="xs" leftSection={<IconChevronsUp size={14} />} onClick={() => setSummaryHidden(true)}>Hide summary</Button></Group>
          )}
          {summaryHidden ? (
            <Paper withBorder radius="md" p="sm" style={{ background: 'var(--mantine-color-gray-0)' }}>
              <Group justify="space-between" wrap="wrap" gap="sm">
                <Group gap="lg" wrap="wrap">
                  <Text fw={600} size="sm">Prompt summary</Text>
                  <Group gap={6}><span style={{ width: 8, height: 8, borderRadius: 999, background: summarySet.status === 'Live' ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-yellow-6)' }} /><Text size="sm" c="dimmed">{summarySet.status}</Text></Group>
                  <Text size="sm" c="dimmed"><b>{activeBlocks.length}</b> active blocks</Text>
                  <Text size="sm" c="dimmed"><b>{summaryTokens.toLocaleString()}</b> tokens</Text>
                </Group>
                <Button variant="subtle" color="gray" size="xs" leftSection={<IconChevronsDown size={14} />} onClick={() => setSummaryHidden(false)}>Show summary</Button>
              </Group>
            </Paper>
          ) : (
            <Overview blocks={activeBlocks} promptSet={promptSet} onPublish={onPublish} />
          )}

          {/* ── Filter region — one of three presentations ── */}
          {FILTER_LAYOUT === 'rail' ? (
            <Box style={{ display: 'grid', gridTemplateColumns: '208px minmax(0, 1fr)', gap: 'var(--mantine-spacing-xl)', alignItems: 'start' }}>
              <FilterRail f={f} typeCounts={typeCounts} statusCounts={statusCounts} total={items.length} />
              <Stack gap="lg" style={{ minWidth: 0 }}>
                <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                  <SearchField f={f} placeholder="Search blocks in this set" />
                  {meta}
                </Group>
                {bulkBar}
                {tableBody}
              </Stack>
            </Box>
          ) : (
            <>
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                {FILTER_LAYOUT === 'popover'
                  ? <FilterPopover f={f} typeCounts={typeCounts} statusCounts={statusCounts} />
                  : <FilterBar f={f} typeCounts={typeCounts} statusCounts={statusCounts} />}
                {meta}
              </Group>
              {bulkBar}
              {tableBody}
            </>
          )}
        </Stack>
      </Box>
    </Box>
  )
}
