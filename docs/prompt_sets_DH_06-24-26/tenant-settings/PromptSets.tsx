'use client'

// PromptSets — NEW Settings accordion panel (app/admin/settings).
// The tenant's prompt sets: label, description, status (live/draft), and — when
// live — the usage type (where the set is wired in). Mirrors SageParameters.tsx
// exactly in shape (fetch → notifications → view/edit Card split → delete Modal →
// Add New), so it reads as a sibling of the other Settings panels.
//
// Field rules (resolved with the design owner):
//   • version    — READ-ONLY here. Auto-increments on COMPILE (see migration +
//                  api notes). The editor never writes it.
//   • is_master  — READ-ONLY badge. Flagged by the PLATFORM admin on the Platform
//                  Settings → Master Prompt screen (see ../platform-settings).
//   • usage_type — open-ended: base / member / …, and the editor can mint a new
//                  type inline. Only meaningful while status === 'live'.
//   • status     — admin-set. MULTIPLE sets may be live at once (no exclusivity).
//   • id / tenant_id / created_at / updated_at — calculated (UUID + session + DB).

import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Select,
  Skeleton,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'

type PromptSetStatus = 'live' | 'draft'

interface PromptSet {
  id: string
  tenant_id: string
  label: string
  description: string | null
  status: PromptSetStatus
  is_master: boolean
  usage_type: string | null
  version: number
  created_at: string
  updated_at: string
}

// Only the editable fields travel in the draft / PATCH body. Everything else is
// server-owned (tenant_id, version, is_master, timestamps).
interface DraftFields {
  label: string
  description: string
  status: PromptSetStatus
  usage_type: string | null
}

interface PatchPayload {
  id?: string                 // omit to insert
  label: string
  description: string
  status: PromptSetStatus
  usage_type: string | null
}

const NEW_CARD_ID = '__new__'
const NEW_USAGE_SENTINEL = '__new_usage__'

// Seed options; the list is open-ended so the editor offers "＋ New type…".
const USAGE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'base', label: 'base' },
  { value: 'member', label: 'member' },
]

function emptyDraft(): DraftFields {
  return { label: '', description: '', status: 'draft', usage_type: null }
}

function draftFromSet(s: PromptSet): DraftFields {
  return { label: s.label, description: s.description ?? '', status: s.status, usage_type: s.usage_type }
}

function slugifyUsage(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return fallback
}

export function PromptSets() {
  const [sets, setSets] = useState<PromptSet[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PromptSet | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)

  const fetchSets = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/prompt-sets')
      if (!res.ok) {
        notifications.show({ color: 'red', title: 'Failed to load prompt sets', message: 'Could not load prompt sets.' })
        return
      }
      const data: PromptSet[] = await res.json()
      setSets(data)
    } catch (err) {
      console.error('[PromptSets] fetch failed:', err)
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSets() }, [fetchSets])

  // Upsert: PATCH with an id updates; without an id inserts. The server resolves
  // tenant_id from the session and ignores any client-sent version/is_master/dates.
  async function patchSet(payload: PatchPayload): Promise<PromptSet> {
    const res = await fetch('/api/admin/prompt-sets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      throw new Error(extractErrorMessage(body, 'Failed to save prompt set.'))
    }
    return res.json()
  }

  function startEdit(s: PromptSet) {
    setShowNewCard(false)
    setEditingId(s.id)
    setDrafts(prev => ({ ...prev, [s.id]: draftFromSet(s) }))
  }

  function cancelEdit(id: string) {
    setEditingId(current => (current === id ? null : current))
    setDrafts(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function updateDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? emptyDraft()), ...patch } }))
  }

  function validateDraft(d: DraftFields): string | null {
    if (!d.label.trim()) return 'Label is required.'
    if (d.status === 'live' && !(d.usage_type ?? '').trim()) return 'Pick where this live set is used.'
    return null
  }

  // A draft set's usage_type is only persisted while live, and normalized to a slug.
  function normalizeUsage(d: DraftFields): string | null {
    if (d.status !== 'live') return null
    return slugifyUsage(d.usage_type ?? '') || null
  }

  async function handleSave(id: string, existing?: PromptSet) {
    const draftKey = existing ? existing.id : NEW_CARD_ID
    const draft = drafts[draftKey] ?? emptyDraft()
    const error = validateDraft(draft)
    if (error) {
      notifications.show({ color: 'red', title: 'Invalid input', message: error })
      return
    }
    setSavingId(draftKey)
    try {
      const saved = await patchSet({
        id: existing?.id,
        label: draft.label.trim(),
        description: draft.description.trim(),
        status: draft.status,
        usage_type: normalizeUsage(draft),
      })
      setSets(prev => existing ? prev.map(s => (s.id === saved.id ? saved : s)) : [saved, ...prev])
      if (existing) setEditingId(null); else setShowNewCard(false)
      setDrafts(prev => { const next = { ...prev }; delete next[draftKey]; return next })
      notifications.show({ color: 'green', title: existing ? 'Prompt set saved' : 'Prompt set added', message: saved.label })
    } catch (err) {
      notifications.show({ color: 'red', title: 'Save failed', message: err instanceof Error ? err.message : 'Failed to save.' })
    } finally {
      setSavingId(null)
    }
  }

  function startAddNew() {
    setEditingId(null)
    setShowNewCard(true)
    setDrafts(prev => ({ ...prev, [NEW_CARD_ID]: emptyDraft() }))
  }

  function cancelNew() {
    setShowNewCard(false)
    setDrafts(prev => { const next = { ...prev }; delete next[NEW_CARD_ID]; return next })
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/prompt-sets/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        notifications.show({ color: 'red', title: 'Delete failed', message: extractErrorMessage(body, 'Failed to delete.') })
        return
      }
      setSets(prev => prev.filter(s => s.id !== deleteTarget.id))
      notifications.show({ color: 'green', title: 'Prompt set deleted', message: deleteTarget.label })
      setDeleteTarget(null)
    } catch (err) {
      console.error('[PromptSets] delete failed:', err)
      notifications.show({ color: 'red', title: 'Delete failed', message: 'Could not reach the server.' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button variant="filled" color="green" size="sm" leftSection={<IconPlus size={14} />} onClick={startAddNew} disabled={showNewCard}>
          Add New
        </Button>
      </Group>

      {loading ? (
        <Stack gap="sm">
          <Skeleton height={150} radius="md" />
          <Skeleton height={150} radius="md" />
        </Stack>
      ) : (
        <Stack gap="sm">
          {showNewCard && (
            <PromptSetEditCard
              draft={drafts[NEW_CARD_ID] ?? emptyDraft()}
              onChange={patch => updateDraft(NEW_CARD_ID, patch)}
              onSave={() => handleSave(NEW_CARD_ID)}
              onCancel={cancelNew}
              saving={savingId === NEW_CARD_ID}
              isNew
            />
          )}

          {sets.length === 0 && !showNewCard ? (
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              No prompt sets yet. Click &ldquo;Add New&rdquo; to get started.
            </Text>
          ) : (
            sets.map(set => editingId === set.id ? (
              <PromptSetEditCard
                key={set.id}
                draft={drafts[set.id] ?? draftFromSet(set)}
                meta={set}
                onChange={patch => updateDraft(set.id, patch)}
                onSave={() => handleSave(set.id, set)}
                onCancel={() => cancelEdit(set.id)}
                saving={savingId === set.id}
              />
            ) : (
              <PromptSetViewCard key={set.id} set={set} onEdit={() => startEdit(set)} onDelete={() => setDeleteTarget(set)} />
            ))
          )}
        </Stack>
      )}

      <Modal opened={deleteTarget !== null} onClose={() => { if (!deleting) setDeleteTarget(null) }} title="Delete prompt set?" centered size="sm">
        <Stack gap="md">
          <Text variant="muted">Delete this prompt set? This cannot be undone.</Text>
          <Group gap="xs" justify="flex-end">
            <Button variant="subtle" color="gray" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="filled" color="red" size="sm" onClick={handleConfirmDelete} loading={deleting}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

// ── Status / Master / usage badges ─────────────────────────────────────────────
function StatusBadge({ status }: { status: PromptSetStatus }) {
  return status === 'live'
    ? <Badge color="green" variant="light" radius="sm">Live</Badge>
    : <Badge color="yellow" variant="light" radius="sm">Draft</Badge>
}

function PromptSetBadges({ set }: { set: PromptSet }) {
  return (
    <Group gap={6} wrap="wrap">
      <StatusBadge status={set.status} />
      {set.is_master && <Badge color="green" variant="filled" radius="sm">Master</Badge>}
      {set.status === 'live' && set.usage_type && <Badge color="gray" variant="light" radius="sm">{set.usage_type}</Badge>}
    </Group>
  )
}

// ── Read-only / calculated strip ───────────────────────────────────────────────
function MetaStrip({ set, isNew }: { set?: PromptSet; isNew?: boolean }) {
  const dim = (s: string) => <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{s}</Text>
  const mono = (s: string) => (
    <Text variant="body" style={{ fontSize: 'var(--mantine-font-size-sm)', fontFamily: 'var(--mantine-font-family-monospace)', wordBreak: 'break-all' }}>{s}</Text>
  )
  return (
    <Card withBorder radius="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Stack gap={6}>
        <MetaRow label="Version" value={
          <Group gap={6} wrap="wrap" align="baseline">
            {mono(`v${set?.version ?? 1}`)}{dim('· auto-increments on compile')}
          </Group>
        } />
        <MetaRow label="Master" value={set?.is_master ? <Badge color="green" variant="filled" radius="sm">Master</Badge> : dim('—')} />
        <MetaRow label="ID" value={isNew ? dim('generated on save') : mono(set?.id ?? '')} />
        <MetaRow label="Tenant ID" value={isNew ? dim('from session') : mono(set?.tenant_id ?? '')} />
        <MetaRow label="Created" value={isNew ? dim('on save') : <Text variant="body" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{set ? formatDate(set.created_at) : '—'}</Text>} />
        <MetaRow label="Updated" value={isNew ? dim('on save') : <Text variant="body" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{set ? formatDate(set.updated_at) : '—'}</Text>} />
      </Stack>
    </Card>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="wrap" align="baseline">
      <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', minWidth: 76 }}>{label}</Text>
      <div style={{ flex: 1, minWidth: 0 }}>{value}</div>
    </Group>
  )
}

// ── View card ──────────────────────────────────────────────────────────────────
function PromptSetViewCard({ set, onEdit, onDelete }: { set: PromptSet; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
          <Group gap="sm" align="center" wrap="wrap" style={{ minWidth: 0 }}>
            <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-md)' }}>{set.label}</Text>
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', fontFamily: 'var(--mantine-font-family-monospace)' }}>v{set.version}</Text>
            <PromptSetBadges set={set} />
          </Group>
          <Group gap={4} wrap="nowrap">
            <ActionIcon variant="subtle" color="gray" size="md" onClick={onEdit} aria-label={`Edit ${set.label}`}><IconPencil size={16} /></ActionIcon>
            <ActionIcon variant="subtle" color="red" size="md" onClick={onDelete} aria-label={`Delete ${set.label}`}><IconTrash size={16} /></ActionIcon>
          </Group>
        </Group>
        {set.description && <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{set.description}</Text>}
        <MetaStrip set={set} />
      </Stack>
    </Card>
  )
}

// ── Edit / new card ────────────────────────────────────────────────────────────
interface EditCardProps {
  draft: DraftFields
  meta?: PromptSet
  onChange: (patch: Partial<DraftFields>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew?: boolean
}

function PromptSetEditCard({ draft, meta, onChange, onSave, onCancel, saving, isNew }: EditCardProps) {
  const [creatingType, setCreatingType] = useState(false)
  const isLive = draft.status === 'live'

  // Surface any already-saved custom usage type so it shows as selected.
  const usageData = [
    ...USAGE_TYPE_OPTIONS,
    ...(draft.usage_type && !USAGE_TYPE_OPTIONS.some(o => o.value === draft.usage_type)
      ? [{ value: draft.usage_type, label: draft.usage_type }] : []),
    { value: NEW_USAGE_SENTINEL, label: '＋ New type…' },
  ]

  const saveDisabled = saving || draft.label.trim().length === 0 || (isLive && !(draft.usage_type ?? '').trim())

  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="sm">
        <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{isNew ? 'New prompt set' : 'Edit prompt set'}</Text>

        <TextInput label="Label" value={draft.label} onChange={e => onChange({ label: e.currentTarget.value })} placeholder="e.g. Sage Base" size="sm" required disabled={saving} />
        <Textarea label="Description" value={draft.description} onChange={e => onChange({ description: e.currentTarget.value })} placeholder="What this set is for…" size="sm" autosize minRows={2} maxRows={6} disabled={saving} />
        <Select
          label="Status"
          description="Set by the admin. Multiple sets can be live."
          data={[{ value: 'live', label: 'Live' }, { value: 'draft', label: 'Draft' }]}
          value={draft.status}
          onChange={value => onChange({ status: value === 'live' ? 'live' : 'draft' })}
          size="sm"
          allowDeselect={false}
          disabled={saving}
        />

        {isLive && (creatingType ? (
          <TextInput
            label="New usage type"
            value={draft.usage_type ?? ''}
            onChange={e => onChange({ usage_type: e.currentTarget.value })}
            placeholder="e.g. trial"
            description="Where this live set is wired in."
            size="sm"
            required
            disabled={saving}
            rightSectionWidth={64}
            rightSection={<Button variant="subtle" color="gray" size="compact-xs" onClick={() => { setCreatingType(false); onChange({ usage_type: null }) }}>Cancel</Button>}
          />
        ) : (
          <Select
            label="Used as"
            description="Where this live set is wired in."
            placeholder="Select a usage type"
            data={usageData}
            value={draft.usage_type}
            onChange={value => {
              if (value === NEW_USAGE_SENTINEL) { setCreatingType(true); onChange({ usage_type: '' }) }
              else onChange({ usage_type: value })
            }}
            size="sm"
            disabled={saving}
          />
        ))}

        <MetaStrip set={meta} isNew={isNew} />

        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Button variant="subtle" color="gray" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="filled" color="green" size="sm" onClick={onSave} loading={saving} disabled={saveDisabled}>{isNew ? 'Create set' : 'Save'}</Button>
        </Group>
      </Stack>
    </Card>
  )
}
