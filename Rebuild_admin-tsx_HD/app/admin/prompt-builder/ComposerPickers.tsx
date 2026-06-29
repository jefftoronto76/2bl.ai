'use client'

// Composer · pickers + draft card — the topbar prompt-set picker (with inline create),
// the collapsible block-metadata fields, and the "block ready" draft card.

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconCheck, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { PROMPT_SET_USAGE_TYPES } from '@/components/admin/lib/fixtures'

export interface ComposerSet { value: string; label: string; version: number; status: 'Live' | 'Draft'; usage_type?: string | null; description?: string }

export const COMPOSER_TYPES = [
  { value: 'identity', label: 'Identity & Voice' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'guardrail', label: 'Guardrail' },
  { value: 'process', label: 'Process' },
  { value: 'escalation', label: 'Escalation' },
]

const StatusPill = ({ status }: { status: 'Live' | 'Draft' }) => <Badge size="sm" radius="sm" variant="light" color={status === 'Live' ? 'green' : 'yellow'}>{status}</Badge>

interface PromptSetPickerProps {
  sets: ComposerSet[]
  value: string
  setValue: (v: string) => void
  onCreate: (name: string, type: string, desc: string) => void
}
export function PromptSetPicker({ sets, value, setValue, onCreate }: PromptSetPickerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [desc, setDesc] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const reset = () => { setCreating(false); setName(''); setType(''); setDesc('') }
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); reset() } }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [open])
  const set = sets.find((s) => s.value === value) || sets[0]
  const create = () => { const nm = name.trim(); if (!nm) return; onCreate(nm, type, desc.trim()); reset(); setOpen(false) }
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 230 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 36, padding: '0 9px 0 12px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--mantine-color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{set.label}</span>
        <StatusPill status={set.status} />
        <IconChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--mantine-color-gray-6)', transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 280, zIndex: 40, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', boxShadow: 'var(--mantine-shadow-md)', padding: 4 }}>
          {sets.map((s) => (
            <button
              key={s.value} type="button" onClick={() => { setValue(s.value); setOpen(false) }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 'var(--mantine-radius-sm)', padding: '8px 10px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--mantine-color-text)' }}
            >
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: 'var(--mantine-color-gray-5)' }}>v{s.version}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}><StatusPill status={s.status} /><span style={{ width: 14, color: 'var(--mantine-color-brand-6)' }}>{s.value === value ? <IconCheck size={14} /> : null}</span></span>
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--mantine-color-gray-2)', margin: '4px 0' }} />
          {creating ? (
            <div style={{ padding: 8 }}>
              <Stack gap="xs">
                <TextInput size="xs" label="Name" autoFocus value={name} placeholder="e.g. Sage Base" onChange={(e) => setName(e.currentTarget.value)} />
                <Select size="xs" label="Type" data={[{ value: '', label: 'No type yet' }, ...PROMPT_SET_USAGE_TYPES]} value={type} onChange={(v) => setType(v || '')} withinPortal />
                <Textarea size="xs" label="Description" value={desc} placeholder="What this set is for…" autosize minRows={2} onChange={(e) => setDesc(e.currentTarget.value)} />
                <Group justify="flex-end" gap="xs">
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={reset}>Cancel</Button>
                  <Button size="compact-xs" disabled={!name.trim()} onClick={create}>Create</Button>
                </Group>
              </Stack>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 'var(--mantine-radius-sm)', padding: '8px 10px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--mantine-color-brand-7)', fontWeight: 500 }}>
              <IconPlus size={14} />New prompt set…
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface MetadataSectionProps {
  type: string
  setType: (v: string) => void
  blockName: string
  setBlockName: (v: string) => void
}
export function MetadataSection({ type, setType, blockName, setBlockName }: MetadataSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <Stack gap={6}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--mantine-color-dimmed)', width: 'fit-content' }}>
        Block metadata <IconChevronRight size={13} style={{ transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {open && (
        <Group gap="sm" grow align="flex-end">
          <Select size="xs" label="Type" placeholder="Select a type…" data={COMPOSER_TYPES} value={type || null} onChange={(v) => setType(v || '')} withinPortal />
          <TextInput size="xs" label="Block name" value={blockName} onChange={(e) => setBlockName(e.currentTarget.value)} placeholder="e.g. Off-limit topics…" />
        </Group>
      )}
    </Stack>
  )
}

export interface Draft { title: string; content: string; suggestedType?: string; suggestedTopic?: string }

interface DraftCardProps {
  draft: Draft
  index: number
  count: number
  onSave: (i: number) => void
  onRemove: (i: number) => void
}
export function DraftCard({ draft, index, count, onSave, onRemove }: DraftCardProps) {
  const [type, setType] = useState(draft.suggestedType || '')
  const [topic, setTopic] = useState(draft.suggestedTopic || '')
  const [name, setName] = useState(draft.title || '')
  return (
    <Card withBorder radius="md" p="md" style={{ background: 'var(--mantine-color-gray-0)', maxWidth: 620, margin: '0 auto', width: '100%' }}>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text tt="uppercase" fw={600} size="xs" c="dimmed" style={{ letterSpacing: '0.06em' }}>Block ready{count > 1 ? ` (${index + 1} of ${count})` : ''}</Text>
        </Group>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{draft.content}</Text>
        <SimpleGrid cols={3} spacing="xs">
          <Select size="xs" label="Type" placeholder="Type…" data={COMPOSER_TYPES} value={type || null} onChange={(v) => setType(v || '')} withinPortal />
          <TextInput size="xs" label="Topic" value={topic} onChange={(e) => setTopic(e.currentTarget.value)} placeholder="Topic" />
          <TextInput size="xs" label="Block name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Name" />
        </SimpleGrid>
        <Group gap="sm">
          <Button size="xs" onClick={() => onSave(index)} disabled={!type || !name.trim()}>Check &amp; Save</Button>
          <Button size="xs" variant="subtle" color="gray" onClick={() => onSave(index)} disabled={!type || !name.trim()}>Save anyway</Button>
          <Button size="xs" variant="subtle" color="red" onClick={() => onRemove(index)}>Discard</Button>
        </Group>
      </Stack>
    </Card>
  )
}
