'use client'

// Prompt Studio · Blocks — block library: token donut, type/status filters, token
// bars, expandable rows, bulk enable/disable/delete, and a collapsible prompt summary.
// Route: /admin/prompt-studio/blocks (full-bleed — owns its own scroll + sticky header)
//
// NOTE: the design-time "Tweaks" panel (summary-control variants / animate toggle) was
// a prototyping artifact and is intentionally dropped. The real Hide/Show summary
// control is kept.
//
// TODO: replace BLOCKS / COMPOSER_PROMPT_SETS with live data; wire status toggles,
// bulk actions, copy/edit/duplicate/delete, and Compile & Publish to your endpoints.

import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon, Badge, Box, Button, Card, Checkbox, Group, Paper, Stack, Switch, Table, Text, TextInput, Tooltip,
} from '@mantine/core'
import {
  IconCheck, IconChevronRight, IconChevronsDown, IconChevronsUp, IconClipboard, IconCopy, IconPencil, IconPlus, IconSearch, IconTrash, IconX,
} from '@tabler/icons-react'
import { BLOCKS, COMPOSER_PROMPT_SETS, MASTER_PROMPT_VERSION, type ComposerPromptSet } from '@/components/admin/lib/fixtures'
import { BLOCK_TYPE_LABELS, ORDERED_BLOCK_TYPES, TintBadge, blockTint } from '@/components/admin/lib/badges'
import { notify } from '@/components/admin/lib/primitives'
import { tokensFor } from '@/components/admin/lib/types'
import type { Block, BlockType } from '@/components/admin/lib/types'

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

/* ── Prompt-set selector (custom trigger + dropdown) ── */
function PromptSetSelect({ promptSet, setPromptSet }: { promptSet: string; setPromptSet: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])
  const set = COMPOSER_PROMPT_SETS.find((s) => s.value === promptSet) || COMPOSER_PROMPT_SETS[0]
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
          {COMPOSER_PROMPT_SETS.map((s) => (
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
        </div>
      )}
    </div>
  )
}

/* ── Token-usage donut (over-limit aware) ── */
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
  const [items, setItems] = useState<Block[]>(BLOCKS) // TODO: replace with query
  const [promptSet, setPromptSet] = useState('sage-prod')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | BlockType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [summaryHidden, setSummaryHidden] = useState(false)

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

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleStatus = (id: string, checked: boolean) => setItems((it) => it.map((b) => (b.id === id ? { ...b, status: checked ? 'active' : 'disabled' } : b)))
  const onToggleExpandAll = () => (allExpanded ? setExpanded(new Set()) : setExpanded(new Set(filtered.map((b) => b.id))))
  const onCopy = (b: Block) => { navigator.clipboard?.writeText(b.body); setCopiedId(b.id); setTimeout(() => setCopiedId(null), 2000) }
  const toggleSelAll = () => setSelected((prev) => { const n = new Set(prev); if (filteredSel > 0) filtered.forEach((b) => n.delete(b.id)); else filtered.forEach((b) => n.add(b.id)); return n })

  const summarySet = COMPOSER_PROMPT_SETS.find((s) => s.value === promptSet) || COMPOSER_PROMPT_SETS[0]
  const summaryTokens = activeBlocks.reduce((s, b) => s + tokensFor(b.body), 0)
  const onPublish = () => notify({ color: 'green', title: 'Prompt published', message: `Version ${MASTER_PROMPT_VERSION + 1}` })

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

          <Group gap="md" align="center" wrap="wrap">
            <TextInput
              value={query} onChange={(e) => setQuery(e.currentTarget.value)} placeholder="Search blocks" size="sm" style={{ flex: '0 1 280px' }}
              leftSection={<IconSearch size={14} />}
              rightSection={query ? <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setQuery('')}><IconX size={12} /></ActionIcon> : null}
            />
            <Group gap={6} wrap="wrap">
              <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All</Chip>
              {ORDERED_BLOCK_TYPES.map((t) => (
                <Chip key={t} active={typeFilter === t} color={blockTint(t)} dot={blockTint(t).solid} onClick={() => setTypeFilter(t)}>{BLOCK_TYPE_LABELS[t]}</Chip>
              ))}
            </Group>
            <Group gap={6} wrap="wrap">
              <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</Chip>
              <Chip active={statusFilter === 'active'} color={{ bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' }} onClick={() => setStatusFilter('active')}>Active</Chip>
              <Chip active={statusFilter === 'disabled'} onClick={() => setStatusFilter('disabled')}>Disabled</Chip>
            </Group>
            <div style={{ flex: 1 }} />
            <Group gap="sm" align="center">
              <Text c="dimmed" size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{filtered.length} / {items.length}</Text>
              <Button variant="subtle" color="gray" size="xs" leftSection={allExpanded ? <IconChevronsUp size={14} /> : <IconChevronsDown size={14} />} onClick={onToggleExpandAll}>{allExpanded ? 'Collapse all' : 'Expand all'}</Button>
            </Group>
          </Group>

          {selected.size > 0 && (
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
          )}

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
        </Stack>
      </Box>
    </Box>
  )
}
