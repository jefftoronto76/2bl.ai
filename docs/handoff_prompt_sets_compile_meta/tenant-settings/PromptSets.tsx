'use client'

// PromptSets — Settings accordion panel (app/admin/settings).
//
// ░░ THIS IS THE ENHANCED DROP-IN ░░  Diff vs the shipping file is limited to the
// items below; everything else is byte-for-byte the current component so it reviews
// cleanly. Search "// NEW:" to find every change.
//
//   1. TYPE ON ADD-NEW (was: only when Live)
//      The "Used as" prompt-type Select (and inline ＋ New type…) now renders for
//      DRAFTS too, so a type can be assigned at creation. Still REQUIRED only when
//      Live. `normalizeType` no longer nulls a draft's type — the matching API change
//      (persist prompt_type_id for drafts) is in api/admin.prompt-sets.GET.enriched.md.
//
//   2. COMPILE METADATA ON THE VIEW CARD (all read-only, server-derived)
//      • Blocks            — block_count
//      • Last compiled     — last_compiled_at
//      • Compiled version  — compiled_version (the version stamped by the compiler)
//      • Stale badge + Alert when updated_at > last_compiled_at  (isStale())
//
//   3. VIEW COMPILED PROMPT
//      An eye ActionIcon opens <CompiledPromptModal/> (fetches the authoritative
//      compiled output for the set; does not reassemble blocks client-side).
//
// Shared types/helpers live in @/lib/promptSet (shared/promptSet.ts in this bundle).
// The modal lives in @/components/admin/settings/CompiledPromptModal
// (shared/CompiledPromptModal.tsx in this bundle).

import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
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
import { IconAlertTriangle, IconEye, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { CompiledPromptModal } from '@/components/admin/settings/CompiledPromptModal'
import { type PromptSet, type PromptSetStatus, formatDate, isStale } from '@/lib/promptSet'

interface PromptType {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number | null
}

// Only the editable fields travel in the draft / PATCH body. Everything else is
// server-owned (tenant_id, version, is_composer_prompt, is_default, timestamps,
// and the derived compile metadata).
interface DraftFields {
  label: string
  description: string
  status: PromptSetStatus
  prompt_type_id: string | null
}

interface PatchPayload {
  id?: string // omit to insert
  label: string
  description: string
  status: PromptSetStatus
  prompt_type_id: string | null
}

const NEW_CARD_ID = '__new__'
const NEW_TYPE_SENTINEL = '__new_type__'

function emptyDraft(): DraftFields {
  return { label: '', description: '', status: 'draft', prompt_type_id: null }
}

function draftFromSet(s: PromptSet): DraftFields {
  return { label: s.label, description: s.description ?? '', status: s.status, prompt_type_id: s.prompt_type_id }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error
  }
  return fallback
}

export function PromptSets() {
  const [sets, setSets] = useState<PromptSet[]>([])
  const [promptTypes, setPromptTypes] = useState<PromptType[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PromptSet | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)
  const [viewTarget, setViewTarget] = useState<PromptSet | null>(null) // NEW: compiled-prompt viewer

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

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/prompt-types')
      if (!res.ok) return
      const data: PromptType[] = await res.json()
      setPromptTypes(data)
    } catch (err) {
      console.error('[PromptSets] prompt-types fetch failed:', err)
    }
  }, [])

  useEffect(() => {
    fetchSets()
    fetchTypes()
  }, [fetchSets, fetchTypes])

  const typeNameById = useCallback(
    (id: string | null): string | null => {
      if (!id) return null
      return promptTypes.find((t) => t.id === id)?.name ?? id
    },
    [promptTypes],
  )

  // Upsert: PATCH with an id updates; without an id inserts. The server resolves
  // tenant_id from the session and ignores any client-sent version/is_composer_prompt/is_default/dates/compile-meta.
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

  // Mint a new prompt type inline; appends it to the local list and returns it.
  async function createPromptType(name: string): Promise<PromptType> {
    const res = await fetch('/api/admin/prompt-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      throw new Error(extractErrorMessage(body, 'Failed to create prompt type.'))
    }
    const created: PromptType = await res.json()
    setPromptTypes((prev) =>
      prev.some((t) => t.id === created.id) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
    )
    return created
  }

  function startEdit(s: PromptSet) {
    setShowNewCard(false)
    setEditingId(s.id)
    setDrafts((prev) => ({ ...prev, [s.id]: draftFromSet(s) }))
  }

  function cancelEdit(id: string) {
    setEditingId((current) => (current === id ? null : current))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function updateDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyDraft()), ...patch } }))
  }

  function validateDraft(d: DraftFields): string | null {
    if (!d.label.trim()) return 'Label is required.'
    if (d.status === 'live' && !(d.prompt_type_id ?? '').trim()) return 'Pick a prompt type for this live set.'
    return null
  }

  // NEW: a set's prompt_type_id is now persisted for drafts too (was: nulled unless live),
  // so a type can be chosen at creation. Required validation for Live is unchanged.
  function normalizeType(d: DraftFields): string | null {
    return d.prompt_type_id || null
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
        prompt_type_id: normalizeType(draft),
      })
      setSets((prev) => (existing ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev]))
      if (existing) setEditingId(null)
      else setShowNewCard(false)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[draftKey]
        return next
      })
      notifications.show({
        color: 'green',
        title: existing ? 'Prompt set saved' : 'Prompt set added',
        message: saved.label,
      })
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Failed to save.',
      })
    } finally {
      setSavingId(null)
    }
  }

  function startAddNew() {
    setEditingId(null)
    setShowNewCard(true)
    setDrafts((prev) => ({ ...prev, [NEW_CARD_ID]: emptyDraft() }))
  }

  function cancelNew() {
    setShowNewCard(false)
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[NEW_CARD_ID]
      return next
    })
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
      setSets((prev) => prev.filter((s) => s.id !== deleteTarget.id))
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
        <Button
          variant="filled"
          color="green"
          size="sm"
          leftSection={<IconPlus size={14} />}
          onClick={startAddNew}
          disabled={showNewCard}
        >
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
              promptTypes={promptTypes}
              onChange={(patch) => updateDraft(NEW_CARD_ID, patch)}
              onCreateType={createPromptType}
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
            sets.map((set) =>
              editingId === set.id ? (
                <PromptSetEditCard
                  key={set.id}
                  draft={drafts[set.id] ?? draftFromSet(set)}
                  meta={set}
                  promptTypes={promptTypes}
                  onChange={(patch) => updateDraft(set.id, patch)}
                  onCreateType={createPromptType}
                  onSave={() => handleSave(set.id, set)}
                  onCancel={() => cancelEdit(set.id)}
                  saving={savingId === set.id}
                />
              ) : (
                <PromptSetViewCard
                  key={set.id}
                  set={set}
                  typeName={typeNameById(set.prompt_type_id)}
                  onView={() => setViewTarget(set)} // NEW
                  onEdit={() => startEdit(set)}
                  onDelete={() => setDeleteTarget(set)}
                />
              ),
            )
          )}
        </Stack>
      )}

      {/* NEW: view compiled prompt */}
      {viewTarget && (
        <CompiledPromptModal
          set={viewTarget}
          compiledUrl={`/api/admin/prompt-sets/${encodeURIComponent(viewTarget.id)}/compiled`}
          opened={viewTarget !== null}
          onClose={() => setViewTarget(null)}
        />
      )}

      <Modal
        opened={deleteTarget !== null}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        title="Delete prompt set?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text variant="muted">Delete this prompt set? This cannot be undone.</Text>
          <Group gap="xs" justify="flex-end">
            <Button variant="subtle" color="gray" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="filled" color="red" size="sm" onClick={handleConfirmDelete} loading={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

// ── Status / Composer / type / stale badges ─────────────────────────────────────
function StatusBadge({ status }: { status: PromptSetStatus }) {
  return status === 'live' ? (
    <Badge color="green" variant="light" radius="sm">
      Live
    </Badge>
  ) : (
    <Badge color="yellow" variant="light" radius="sm">
      Draft
    </Badge>
  )
}

function PromptSetBadges({ set, typeName }: { set: PromptSet; typeName: string | null }) {
  return (
    <Group gap={6} wrap="wrap">
      <StatusBadge status={set.status} />
      {set.is_composer_prompt && (
        <Badge color="green" variant="filled" radius="sm">
          Composer
        </Badge>
      )}
      {/* NEW: type chip now shows whenever a type is assigned (was: only when Live) */}
      {typeName && (
        <Badge color="gray" variant="light" radius="sm">
          {typeName}
        </Badge>
      )}
      {/* NEW: stale flag */}
      {isStale(set) && (
        <Badge color="yellow" variant="filled" radius="sm" leftSection={<IconAlertTriangle size={11} />}>
          Stale
        </Badge>
      )}
    </Group>
  )
}

// ── Read-only / calculated strip ───────────────────────────────────────────────
function MetaStrip({ set, isNew }: { set?: PromptSet; isNew?: boolean }) {
  const dim = (s: string) => (
    <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
      {s}
    </Text>
  )
  const body = (s: string) => (
    <Text variant="body" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
      {s}
    </Text>
  )
  const mono = (s: string) => (
    <Text
      variant="body"
      style={{
        fontSize: 'var(--mantine-font-size-sm)',
        fontFamily: 'var(--mantine-font-family-monospace)',
        wordBreak: 'break-all',
      }}
    >
      {s}
    </Text>
  )
  return (
    <Card withBorder radius="sm" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
      <Stack gap={6}>
        <MetaRow
          label="Version"
          value={
            <Group gap={6} wrap="wrap" align="baseline">
              {mono(`v${set?.version ?? 1}`)}
              {dim('· auto-increments on compile')}
            </Group>
          }
        />
        <MetaRow
          label="Composer"
          value={
            set?.is_composer_prompt ? (
              <Badge color="green" variant="filled" radius="sm">
                Composer
              </Badge>
            ) : (
              dim('—')
            )
          }
        />
        {/* NEW: compile metadata (read-only, derived server-side) */}
        <MetaRow label="Blocks" value={isNew ? dim('on compile') : body(String(set?.block_count ?? 0))} />
        <MetaRow
          label="Last compiled"
          value={isNew ? dim('on compile') : set?.last_compiled_at ? body(formatDate(set.last_compiled_at)) : dim('Never compiled')}
        />
        <MetaRow
          label="Compiled version"
          value={
            isNew ? (
              dim('on compile')
            ) : set?.compiled_version != null ? (
              <Group gap={6} wrap="wrap" align="baseline">
                {mono(`v${set.compiled_version}`)}
                {set && isStale(set) ? dim('· out of date') : null}
              </Group>
            ) : (
              dim('—')
            )
          }
        />
        <MetaRow label="ID" value={isNew ? dim('generated on save') : mono(set?.id ?? '')} />
        <MetaRow label="Tenant ID" value={isNew ? dim('from session') : mono(set?.tenant_id ?? '')} />
        <MetaRow label="Created" value={isNew ? dim('on save') : body(set ? formatDate(set.created_at) : '—')} />
        <MetaRow label="Updated" value={isNew ? dim('on save') : body(set ? formatDate(set.updated_at) : '—')} />
      </Stack>
    </Card>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="wrap" align="baseline">
      <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)', minWidth: 96 }}>
        {label}
      </Text>
      <div style={{ flex: 1, minWidth: 0 }}>{value}</div>
    </Group>
  )
}

// ── View card ──────────────────────────────────────────────────────────────────
function PromptSetViewCard({
  set,
  typeName,
  onView,
  onEdit,
  onDelete,
}: {
  set: PromptSet
  typeName: string | null
  onView: () => void // NEW
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
          <Group gap="sm" align="center" wrap="wrap" style={{ minWidth: 0 }}>
            <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-md)' }}>
              {set.label}
            </Text>
            <Text
              variant="muted"
              style={{ fontSize: 'var(--mantine-font-size-xs)', fontFamily: 'var(--mantine-font-family-monospace)' }}
            >
              v{set.version}
            </Text>
            <PromptSetBadges set={set} typeName={typeName} />
          </Group>
          <Group gap={4} wrap="nowrap">
            {/* NEW: view compiled prompt */}
            <ActionIcon variant="subtle" color="gray" size="md" onClick={onView} aria-label={`View compiled prompt for ${set.label}`}>
              <IconEye size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" size="md" onClick={onEdit} aria-label={`Edit ${set.label}`}>
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon variant="subtle" color="red" size="md" onClick={onDelete} aria-label={`Delete ${set.label}`}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Group>
        {set.description && (
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
            {set.description}
          </Text>
        )}
        {/* NEW: stale warning */}
        {isStale(set) && (
          <Alert color="yellow" variant="light" radius="sm" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              Edited since last compile — recompile to apply changes.
            </Text>
          </Alert>
        )}
        <MetaStrip set={set} />
      </Stack>
    </Card>
  )
}

// ── Edit / new card ────────────────────────────────────────────────────────────
interface EditCardProps {
  draft: DraftFields
  meta?: PromptSet
  promptTypes: PromptType[]
  onChange: (patch: Partial<DraftFields>) => void
  onCreateType: (name: string) => Promise<PromptType>
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew?: boolean
}

function PromptSetEditCard({
  draft,
  meta,
  promptTypes,
  onChange,
  onCreateType,
  onSave,
  onCancel,
  saving,
  isNew,
}: EditCardProps) {
  const [creatingType, setCreatingType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [creatingTypeBusy, setCreatingTypeBusy] = useState(false)
  const isLive = draft.status === 'live'

  // Surface the currently-selected type even if it isn't in the list yet.
  const typeData = [
    ...promptTypes.map((t) => ({ value: t.id, label: t.name })),
    ...(draft.prompt_type_id && !promptTypes.some((t) => t.id === draft.prompt_type_id)
      ? [{ value: draft.prompt_type_id, label: draft.prompt_type_id }]
      : []),
    { value: NEW_TYPE_SENTINEL, label: '＋ New type…' },
  ]

  async function handleCreateType() {
    const name = newTypeName.trim()
    if (!name) return
    setCreatingTypeBusy(true)
    try {
      const created = await onCreateType(name)
      onChange({ prompt_type_id: created.id })
      setCreatingType(false)
      setNewTypeName('')
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not create type',
        message: err instanceof Error ? err.message : 'Failed to create prompt type.',
      })
    } finally {
      setCreatingTypeBusy(false)
    }
  }

  const saveDisabled =
    saving || creatingType || draft.label.trim().length === 0 || (isLive && !(draft.prompt_type_id ?? '').trim())

  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="sm">
        <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          {isNew ? 'New prompt set' : 'Edit prompt set'}
        </Text>

        <TextInput
          label="Label"
          value={draft.label}
          onChange={(e) => onChange({ label: e.currentTarget.value })}
          placeholder="e.g. Sage Base"
          size="sm"
          required
          disabled={saving}
        />
        <Textarea
          label="Description"
          value={draft.description}
          onChange={(e) => onChange({ description: e.currentTarget.value })}
          placeholder="What this set is for…"
          size="sm"
          autosize
          minRows={2}
          maxRows={6}
          disabled={saving}
        />
        <Select
          label="Status"
          description="Set by the admin. Multiple sets can be live."
          data={[
            { value: 'live', label: 'Live' },
            { value: 'draft', label: 'Draft' },
          ]}
          value={draft.status}
          onChange={(value) => onChange({ status: value === 'live' ? 'live' : 'draft' })}
          size="sm"
          allowDeselect={false}
          disabled={saving}
        />

        {/* NEW: the Type control renders for drafts too (was wrapped in `isLive && …`).
            Required only when Live; optional otherwise. */}
        {creatingType ? (
          <TextInput
            label="New prompt type"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreateType()
              }
              if (e.key === 'Escape') {
                setCreatingType(false)
                setNewTypeName('')
              }
            }}
            placeholder="e.g. Onboarding"
            description="Creates a new prompt type for this tenant."
            size="sm"
            required={isLive}
            disabled={creatingTypeBusy}
            rightSectionWidth={120}
            rightSection={
              <Group gap={4} wrap="nowrap">
                <Button
                  variant="subtle"
                  color="gray"
                  size="compact-xs"
                  onClick={() => {
                    setCreatingType(false)
                    setNewTypeName('')
                  }}
                  disabled={creatingTypeBusy}
                >
                  Cancel
                </Button>
                <Button
                  variant="light"
                  color="green"
                  size="compact-xs"
                  onClick={handleCreateType}
                  loading={creatingTypeBusy}
                  disabled={!newTypeName.trim()}
                >
                  Create
                </Button>
              </Group>
            }
          />
        ) : (
          <Select
            label="Type"
            description={isLive ? 'Which prompt type this live set is wired to.' : 'Optional for a draft — set where it’s used when it goes live.'}
            placeholder="Select a prompt type"
            data={typeData}
            value={draft.prompt_type_id}
            clearable={!isLive}
            onChange={(value) => {
              if (value === NEW_TYPE_SENTINEL) {
                setCreatingType(true)
                setNewTypeName('')
              } else {
                onChange({ prompt_type_id: value })
              }
            }}
            size="sm"
            required={isLive}
            disabled={saving}
          />
        )}

        <MetaStrip set={meta} isNew={isNew} />

        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Button variant="subtle" color="gray" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="filled" color="green" size="sm" onClick={onSave} loading={saving} disabled={saveDisabled}>
            {isNew ? 'Create set' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
