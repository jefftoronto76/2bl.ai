'use client'

// PromptSets — Settings accordion panel (app/admin/settings).
//
// Mirrors SageParameters.tsx (fetch → notifications → view/edit Card split → delete
// Modal → Add New). Cards render via the SHARED <PromptSetViewCard/> so this surface
// and Platform → Tenant Prompts stay identical.
//
// What's NEW vs the original shipping file (search "// NEW:"):
//   1. Type on Add-New — the Type ("Used as") control renders for DRAFTS too (was Live-
//      only); still required only when Live. `normalizeType` keeps a draft's type. The
//      matching API change is in api/admin/prompt-sets/route.GET-PATCH.md.
//   2. Compile metadata + stale flag on the card (block_count / last_compiled_at /
//      compiled_version + isStale) — all in the shared card.
//   3. View compiled prompt — eye → <CompiledPromptModal/>.
//   4. Open in Composer — jumps to the Composer with this set preselected.
//
// Shared bits: @/lib/promptSet, @/components/admin/settings/PromptSetCard,
// @/components/admin/settings/CompiledPromptModal.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Group, Modal, Select, Skeleton, Stack, Textarea, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { CompiledPromptModal } from '@/components/admin/settings/CompiledPromptModal'
import { PromptSetMetaStrip, PromptSetViewCard } from '@/components/admin/settings/PromptSetCard'
import { type PromptSet, type PromptSetStatus } from '@/lib/promptSet'

interface PromptType {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number | null
}

interface DraftFields {
  label: string
  description: string
  status: PromptSetStatus
  prompt_type_id: string | null
}

interface PatchPayload {
  id?: string
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
  if (typeof body === 'object' && body && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return fallback
}

export function PromptSets() {
  const router = useRouter()
  const [sets, setSets] = useState<PromptSet[]>([])
  const [promptTypes, setPromptTypes] = useState<PromptType[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PromptSet | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)
  const [viewTarget, setViewTarget] = useState<PromptSet | null>(null)

  const fetchSets = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/prompt-sets')
      if (!res.ok) {
        notifications.show({ color: 'red', title: 'Failed to load prompt sets', message: 'Could not load prompt sets.' })
        return
      }
      setSets(await res.json())
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
      setPromptTypes(await res.json())
    } catch (err) {
      console.error('[PromptSets] prompt-types fetch failed:', err)
    }
  }, [])

  useEffect(() => {
    fetchSets()
    fetchTypes()
  }, [fetchSets, fetchTypes])

  const typeNameById = useCallback(
    (id: string | null): string | null => (id ? promptTypes.find((t) => t.id === id)?.name ?? id : null),
    [promptTypes],
  )

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
    setEditingId((cur) => (cur === id ? null : cur))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }
  function updateDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyDraft()), ...patch } }))
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

  // NEW: jump to the Composer with this set preselected (it reads ?promptSet=<id>).
  function openInComposer(s: PromptSet) {
    router.push(`/admin/prompt-builder?promptSet=${encodeURIComponent(s.id)}`)
  }

  function validateDraft(d: DraftFields): string | null {
    if (!d.label.trim()) return 'Label is required.'
    if (d.status === 'live' && !(d.prompt_type_id ?? '').trim()) return 'Pick a prompt type for this live set.'
    return null
  }

  // NEW: keep a draft's type too (was nulled unless live). Live still requires one.
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
      existing ? setEditingId(null) : setShowNewCard(false)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[draftKey]
        return next
      })
      notifications.show({ color: 'green', title: existing ? 'Prompt set saved' : 'Prompt set added', message: saved.label })
    } catch (err) {
      notifications.show({ color: 'red', title: 'Save failed', message: err instanceof Error ? err.message : 'Failed to save.' })
    } finally {
      setSavingId(null)
    }
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
                  onOpenInComposer={() => openInComposer(set)}
                  onView={() => setViewTarget(set)}
                  onEdit={() => startEdit(set)}
                  onDelete={() => setDeleteTarget(set)}
                />
              ),
            )
          )}
        </Stack>
      )}

      {viewTarget && (
        <CompiledPromptModal
          set={viewTarget}
          compiledUrl={`/api/admin/prompt-sets/${encodeURIComponent(viewTarget.id)}/compiled`}
          opened={viewTarget !== null}
          onClose={() => setViewTarget(null)}
        />
      )}

      <Modal opened={deleteTarget !== null} onClose={() => { if (!deleting) setDeleteTarget(null) }} title="Delete prompt set?" centered size="sm">
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

function PromptSetEditCard({ draft, meta, promptTypes, onChange, onCreateType, onSave, onCancel, saving, isNew }: EditCardProps) {
  const [creatingType, setCreatingType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [creatingTypeBusy, setCreatingTypeBusy] = useState(false)
  const isLive = draft.status === 'live'

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
      notifications.show({ color: 'red', title: 'Could not create type', message: err instanceof Error ? err.message : 'Failed to create prompt type.' })
    } finally {
      setCreatingTypeBusy(false)
    }
  }

  const saveDisabled = saving || creatingType || draft.label.trim().length === 0 || (isLive && !(draft.prompt_type_id ?? '').trim())

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

        {/* NEW: Type renders for drafts too; required only when Live. */}
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
                <Button variant="subtle" color="gray" size="compact-xs" onClick={() => { setCreatingType(false); setNewTypeName('') }} disabled={creatingTypeBusy}>
                  Cancel
                </Button>
                <Button variant="light" color="green" size="compact-xs" onClick={handleCreateType} loading={creatingTypeBusy} disabled={!newTypeName.trim()}>
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

        <PromptSetMetaStrip set={meta} isNew={isNew} />

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
