'use client'

// Shared prompt-set UI — used by Platform Settings (Tenant Prompts, scope="platform")
// and tenant Settings (Prompt Sets, scope=<tenantId>). Card with badges + compile
// metadata + stale warning, the create/edit modal, the compiled-prompt viewer, and
// the grouped, searchable list with Add New.
//
// TODO: replace the PROMPT_SETS fixture + MASTER_PROMPT_CONTENT with live data and
// wire save/delete to your mutations.

import { useMemo, useState } from 'react'
import {
  ActionIcon, Badge, Button, Card, Group, Modal, Select, Stack, Text, Textarea, TextInput,
} from '@mantine/core'
import {
  IconAlertTriangle, IconCopy, IconEye, IconPencil, IconPlus, IconSearch, IconTrash, IconWand,
} from '@tabler/icons-react'
import {
  MASTER_PROMPT_CONTENT, MASTER_PROMPT_VERSION, PROMPT_SETS, TENANTS,
} from '@/components/admin/lib/fixtures'
import { StatusBadge, TintBadge, usageBadge } from '@/components/admin/lib/badges'
import { Dim, MetaRow, Mono, notify } from '@/components/admin/lib/primitives'
import { fmtDate, psIsStale } from '@/components/admin/lib/types'
import type { PromptSet } from '@/components/admin/lib/types'

const tenantName = (tid: string) => TENANTS.find((t) => t.id === tid)?.name || tid

const USAGE_OPTIONS = [
  { value: 'base', label: 'base' },
  { value: 'member', label: 'member' },
]

/* ── Compiled-prompt viewer (read-only assembled system prompt) ── */
export function CompiledPromptModal({ set, onClose }: { set: PromptSet; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = MASTER_PROMPT_CONTENT // TODO: fetch the compiled prompt for this set
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }
  return (
    <Modal opened onClose={onClose} size="lg" radius="md" centered title={<Group gap="sm"><Text fw={600}>Compiled prompt</Text><StatusBadge status={set.status} /></Group>}>
      <Stack gap="sm">
        <Group gap="xs" wrap="wrap">
          <MetaRow label="Set"><Text size="sm" fw={600}>{set.label}</Text></MetaRow>
        </Group>
        <Group gap="md" wrap="wrap">
          <Dim>{`Tenant ${tenantName(set.tenant_id)}`}</Dim>
          <Dim>{`v${set.version}`}</Dim>
          <Dim>{`${set.block_count ?? '—'} blocks`}</Dim>
          <Dim>{`Compiled master v${set.compiled_master_version ?? '—'}`}</Dim>
        </Group>
        <Card withBorder radius="sm" p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
          <Text component="pre" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12.5, lineHeight: 1.6 }}>{text}</Text>
        </Card>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" leftSection={<IconCopy size={15} />} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/* ── Create / edit modal ── */
interface PromptSetModalProps {
  mode: 'new' | 'edit'
  set?: PromptSet
  onClose: () => void
  onSave: (s: Partial<PromptSet>) => void
}
export function PromptSetModal({ mode, set, onClose, onSave }: PromptSetModalProps) {
  const [label, setLabel] = useState(set ? set.label : '')
  const [usage, setUsage] = useState<string | null>(set ? set.usage_type : null)
  const [status, setStatus] = useState<string>(set ? set.status : 'draft')
  const [description, setDescription] = useState(set ? set.description : '')
  const [err, setErr] = useState<{ label?: string }>({})

  const save = () => {
    const next: typeof err = {}
    if (!label.trim()) next.label = 'Name is required'
    setErr(next)
    if (Object.keys(next).length) return
    onSave({ ...(set || {}), label: label.trim(), usage_type: usage, status: status as PromptSet['status'], description: description.trim() })
  }

  return (
    <Modal opened onClose={onClose} size="md" radius="md" centered title={<Text fw={600}>{mode === 'new' ? 'New prompt set' : 'Edit prompt set'}</Text>}>
      <Stack gap="md">
        <TextInput label="Name" placeholder="Sage Base" required value={label} error={err.label} onChange={(e) => setLabel(e.currentTarget.value)} data-autofocus />
        <Select label="Type" placeholder="Select a type" data={USAGE_OPTIONS} value={usage} onChange={setUsage} clearable description="Where a live set is wired in. Leave empty for an unassigned draft." />
        <Select label="Status" data={[{ value: 'live', label: 'Live' }, { value: 'draft', label: 'Draft' }]} value={status} onChange={(v) => setStatus(v || 'draft')} allowDeselect={false} />
        <Textarea label="Description" placeholder="Short summary of what this set is for." autosize minRows={2} maxRows={4} value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
        <Group justify="flex-end" gap="sm" mt={4}>
          <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{mode === 'new' ? 'Create' : 'Save changes'}</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

/* ── Prompt-set card ── */
interface PromptSetCardProps {
  set: PromptSet
  showTenant: boolean
  onOpenInComposer: () => void
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}
export function PromptSetCard({ set, showTenant, onOpenInComposer, onView, onEdit, onDelete }: PromptSetCardProps) {
  const stale = psIsStale(set)
  const behind = set.compiled_master_version != null && set.compiled_master_version < MASTER_PROMPT_VERSION
  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
          <Group gap="sm" align="center" wrap="wrap" style={{ minWidth: 0 }}>
            <Text fw={500} style={{ fontSize: 'var(--mantine-font-size-md)' }}>{set.label}</Text>
            <Text c="dimmed" style={{ fontSize: 'var(--mantine-font-size-xs)', fontFamily: 'var(--mantine-font-family-monospace)' }}>v{set.version}</Text>
            <StatusBadge status={set.status} />
            {set.is_master && <Badge size="sm" radius="sm" variant="filled" color="green">Master</Badge>}
            {set.usage_type && <TintBadge tint={usageBadge(set.usage_type)}>{set.usage_type}</TintBadge>}
            {stale && <Badge size="sm" radius="sm" variant="light" color="orange">Stale</Badge>}
          </Group>
          <Group gap={8} align="center" wrap="nowrap">
            <Button variant="default" size="compact-sm" color="green" leftSection={<IconWand size={14} />} onClick={onOpenInComposer}>Open in Composer</Button>
            <Group gap={2} wrap="nowrap">
              <ActionIcon variant="subtle" color="gray" size="md" aria-label="View compiled prompt" onClick={onView}><IconEye size={16} /></ActionIcon>
              <ActionIcon variant="subtle" color="gray" size="md" aria-label="Edit" onClick={onEdit}><IconPencil size={16} /></ActionIcon>
              <ActionIcon variant="subtle" color="red" size="md" aria-label="Delete" onClick={onDelete}><IconTrash size={16} /></ActionIcon>
            </Group>
          </Group>
        </Group>
        {set.description && <Text c="dimmed" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{set.description}</Text>}
        {stale && (
          <Group gap={7} align="center" wrap="nowrap" style={{ padding: '8px 11px', borderRadius: 'var(--mantine-radius-sm)', background: 'rgba(245,159,0,0.10)', border: '1px solid rgba(245,159,0,0.28)' }}>
            <IconAlertTriangle size={14} style={{ color: '#b07c0c', flex: '0 0 auto' }} />
            <Text style={{ fontSize: 13, color: '#b07c0c' }}>Edited since last compile — recompile to apply changes.</Text>
          </Group>
        )}
        <Card withBorder radius="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Stack gap={6}>
            {showTenant && <MetaRow label="Tenant"><Text fw={600} style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{tenantName(set.tenant_id)}</Text></MetaRow>}
            <MetaRow label="Version"><Group gap={6} align="baseline"><Mono>{`v${set.version}`}</Mono><Dim>· auto-increments on compile</Dim></Group></MetaRow>
            {set.is_master && <MetaRow label="Master"><Badge size="sm" radius="sm" variant="filled" color="green">Master</Badge></MetaRow>}
            <MetaRow label="Blocks"><Text style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{set.block_count != null ? set.block_count : '—'}</Text></MetaRow>
            <MetaRow label="Last compiled">{set.last_compiled_at ? <Text style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{fmtDate(set.last_compiled_at)}</Text> : <Dim>Never compiled</Dim>}</MetaRow>
            <MetaRow label="Compiled master">
              {set.compiled_master_version != null
                ? <Group gap={6} align="baseline"><Mono>{`v${set.compiled_master_version}`}</Mono>{behind ? <Dim>{`· now v${MASTER_PROMPT_VERSION}`}</Dim> : null}</Group>
                : <Dim>—</Dim>}
            </MetaRow>
            <MetaRow label="ID"><Mono>{set.id}</Mono></MetaRow>
            <MetaRow label="Created"><Text style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{fmtDate(set.created_at)}</Text></MetaRow>
          </Stack>
        </Card>
      </Stack>
    </Card>
  )
}

/* ── Grouped, searchable list with Add New ──
   scope: 'platform' → all tenants grouped; or a tenant id → just that tenant. ── */
export function PromptSetList({ scope }: { scope: 'platform' | string }) {
  const [sets, setSets] = useState<PromptSet[]>(PROMPT_SETS) // TODO: replace with query
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<{ mode: 'new' | 'edit'; set?: PromptSet } | null>(null)
  const [viewing, setViewing] = useState<PromptSet | null>(null)
  const [confirm, setConfirm] = useState<PromptSet | null>(null)

  const platform = scope === 'platform'
  const scoped = useMemo(() => (platform ? sets : sets.filter((s) => s.tenant_id === scope)), [sets, scope, platform])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((s) =>
      s.label.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      tenantName(s.tenant_id).toLowerCase().includes(q))
  }, [scoped, query])

  const groups = useMemo(() => {
    const byTenant = new Map<string, PromptSet[]>()
    for (const s of filtered) {
      const arr = byTenant.get(s.tenant_id) || []
      arr.push(s)
      byTenant.set(s.tenant_id, arr)
    }
    return TENANTS.filter((t) => byTenant.has(t.id)).map((t) => ({ tenant: t, sets: byTenant.get(t.id)! }))
  }, [filtered])

  const openInComposer = () => { window.location.href = '/admin/prompt-builder' }
  const save = (s: Partial<PromptSet>) => {
    setSets((prev) => {
      const exists = s.id != null && prev.some((x) => x.id === s.id)
      if (exists) return prev.map((x) => (x.id === s.id ? { ...x, ...s } as PromptSet : x))
      const created: PromptSet = {
        id: `new-${Date.now()}`, tenant_id: platform ? 'sbl' : scope, is_master: false, version: 1,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_compiled_at: null,
        compiled_master_version: null, block_count: 0, label: '', description: '', status: 'draft', usage_type: null,
        ...s,
      }
      return [...prev, created]
    })
    notify({ color: 'green', title: modal?.mode === 'new' ? 'Prompt set created' : 'Prompt set updated', message: s.label || '' })
    setModal(null)
  }
  const doDelete = (s: PromptSet) => {
    setSets((prev) => prev.filter((x) => x.id !== s.id))
    notify({ color: 'green', title: 'Prompt set deleted', message: s.label })
    setConfirm(null)
  }

  return (
    <Stack gap="md" pt={4}>
      <Group justify="space-between" align="center" wrap="wrap">
        <Text c="dimmed" size="sm">
          {platform
            ? 'Every prompt set in the database, across all tenants — pulled live, grouped by tenant.'
            : 'Prompt sets owned by this tenant. Compiled and served to its Composer.'}
        </Text>
        <Button color="green" size="sm" leftSection={<IconPlus size={14} />} onClick={() => setModal({ mode: 'new' })}>Add New</Button>
      </Group>
      <TextInput
        value={query} onChange={(e) => setQuery(e.currentTarget.value)} size="sm"
        placeholder={platform ? 'Search prompt set, description, or tenant…' : 'Search prompt set or description…'}
        leftSection={<IconSearch size={15} />}
      />
      {groups.length === 0 ? (
        <Card withBorder radius="md" p="xl" style={{ background: 'transparent' }}>
          <Stack gap={4} align="center">
            <Text fw={500}>No prompt sets{query ? ' match your search' : ' yet'}.</Text>
            {!query && <Text c="dimmed" size="sm">Create one to get started.</Text>}
          </Stack>
        </Card>
      ) : (
        groups.map(({ tenant, sets: tSets }) => (
          <Stack key={tenant.id} gap="xs">
            {platform && (
              <Group justify="space-between" align="baseline">
                <Text fw={500} style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{tenant.name}</Text>
                <Text c="dimmed" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>{tSets.length} set{tSets.length === 1 ? '' : 's'}</Text>
              </Group>
            )}
            {tSets.map((s) => (
              <PromptSetCard
                key={s.id} set={s} showTenant={platform}
                onOpenInComposer={openInComposer} onView={() => setViewing(s)}
                onEdit={() => setModal({ mode: 'edit', set: s })} onDelete={() => setConfirm(s)}
              />
            ))}
          </Stack>
        ))
      )}
      {modal && <PromptSetModal mode={modal.mode} set={modal.set} onClose={() => setModal(null)} onSave={save} />}
      {viewing && <CompiledPromptModal set={viewing} onClose={() => setViewing(null)} />}
      {confirm && (
        <Modal opened onClose={() => setConfirm(null)} size="sm" radius="md" centered title={<Text fw={600}>Delete prompt set?</Text>}>
          <Stack gap="md">
            <Text size="sm">This permanently removes <b>{confirm.label}</b>. This cannot be undone.</Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" color="gray" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button color="red" onClick={() => doDelete(confirm)}>Delete</Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  )
}
