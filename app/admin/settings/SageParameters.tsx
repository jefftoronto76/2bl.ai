'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
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

type OpenAs = 'new_tab' | 'popup'

interface SageParameter {
  id: string
  tenant_id: string
  key: string
  value: string
  label: string | null
  description: string | null
  cta_label: string | null
  url: string | null
  open_as: OpenAs
  embed_code: string | null
  updated_at: string
}

interface PatchPayload {
  key: string
  label: string
  description: string
  cta_label: string
  url: string
  value: string
  open_as: OpenAs
  embed_code: string | null
}

interface DraftFields {
  label: string
  description: string
  cta_label: string
  url: string
  open_as: OpenAs
  embed_code: string
}

const DESCRIPTION_MAX = 60
const CTA_LABEL_MAX = 20
const NEW_CARD_ID = '__new__'

const OPEN_AS_OPTIONS: { value: OpenAs; label: string }[] = [
  { value: 'new_tab', label: 'New Tab' },
  { value: 'popup', label: 'Inline' },
]

function isOpenAs(value: unknown): value is OpenAs {
  return value === 'new_tab' || value === 'popup'
}

function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
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

function emptyDraft(): DraftFields {
  return { label: '', description: '', cta_label: '', url: '', open_as: 'new_tab', embed_code: '' }
}

function draftFromParameter(p: SageParameter): DraftFields {
  return {
    label: p.label ?? '',
    description: p.description ?? '',
    cta_label: p.cta_label ?? '',
    url: p.url ?? '',
    open_as: p.open_as ?? 'new_tab',
    embed_code: p.embed_code ?? '',
  }
}

export function SageParameters() {
  const [parameters, setParameters] = useState<SageParameter[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SageParameter | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)

  const fetchParameters = useCallback(async () => {
    console.log('[SageParameters] fetching parameters')
    try {
      const res = await fetch('/api/admin/sage-parameters')
      if (!res.ok) {
        console.error('[SageParameters] fetch failed:', res.status)
        notifications.show({
          color: 'red',
          title: 'Failed to load parameters',
          message: 'Could not load Sage parameters.',
        })
        return
      }
      const data: SageParameter[] = await res.json()
      console.log('[SageParameters] fetched parameters:', data.length)
      setParameters(data)
    } catch (err) {
      console.error('[SageParameters] fetch request failed:', err)
      notifications.show({
        color: 'red',
        title: 'Network error',
        message: 'Could not reach the server.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchParameters()
  }, [fetchParameters])

  async function patchParameter(payload: PatchPayload): Promise<SageParameter> {
    console.log('[SageParameters] PATCH dispatch:', {
      key: payload.key,
      open_as: payload.open_as,
      has_embed_code: Boolean(payload.embed_code),
    })
    const res = await fetch('/api/admin/sage-parameters', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      const message = extractErrorMessage(body, 'Failed to save parameter.')
      console.error('[SageParameters] PATCH failed:', message)
      throw new Error(message)
    }
    const data: SageParameter = await res.json()
    console.log('[SageParameters] PATCH success:', data.key)
    return data
  }

  function startEdit(param: SageParameter) {
    setEditingId(param.id)
    setDrafts(prev => ({ ...prev, [param.id]: draftFromParameter(param) }))
  }

  function cancelEdit(id: string) {
    setEditingId(current => (current === id ? null : current))
    setDrafts(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function updateDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? emptyDraft()), ...patch },
    }))
  }

  function validateDraft(draft: DraftFields): string | null {
    if (!draft.label.trim()) return 'Label is required.'
    if (draft.description.length > DESCRIPTION_MAX) {
      return `Description must be ${DESCRIPTION_MAX} characters or fewer.`
    }
    if (draft.cta_label.length > CTA_LABEL_MAX) {
      return `CTA label must be ${CTA_LABEL_MAX} characters or fewer.`
    }
    if (draft.open_as === 'popup' && draft.embed_code.trim().length === 0) {
      return 'Embed code is required for inline booking.'
    }
    return null
  }

  function draftToPatchExtras(draft: DraftFields): Pick<PatchPayload, 'open_as' | 'embed_code'> {
    const embedTrimmed = draft.embed_code.trim()
    return {
      open_as: draft.open_as,
      embed_code: draft.open_as === 'popup' && embedTrimmed.length > 0 ? embedTrimmed : null,
    }
  }

  async function handleSaveExisting(param: SageParameter) {
    const draft = drafts[param.id] ?? draftFromParameter(param)
    const validationError = validateDraft(draft)
    if (validationError) {
      notifications.show({ color: 'red', title: 'Invalid input', message: validationError })
      return
    }
    setSavingId(param.id)
    try {
      const saved = await patchParameter({
        key: param.key,
        label: draft.label.trim(),
        description: draft.description,
        cta_label: draft.cta_label,
        url: draft.url.trim(),
        value: param.value ?? '',
        ...draftToPatchExtras(draft),
      })
      setParameters(prev => prev.map(p => (p.key === saved.key ? saved : p)))
      setEditingId(null)
      setDrafts(prev => {
        const next = { ...prev }
        delete next[param.id]
        return next
      })
      notifications.show({
        color: 'green',
        title: 'Parameter saved',
        message: saved.label ?? saved.key,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save parameter.'
      notifications.show({ color: 'red', title: 'Save failed', message })
    } finally {
      setSavingId(null)
    }
  }

  async function handleSaveNew() {
    const draft = drafts[NEW_CARD_ID] ?? emptyDraft()
    const validationError = validateDraft(draft)
    if (validationError) {
      notifications.show({ color: 'red', title: 'Invalid input', message: validationError })
      return
    }
    const key = slugifyKey(draft.label)
    if (!key) {
      notifications.show({
        color: 'red',
        title: 'Invalid label',
        message: 'Label must contain at least one letter or number.',
      })
      return
    }
    if (parameters.some(p => p.key === key)) {
      notifications.show({
        color: 'red',
        title: 'Duplicate key',
        message: 'A parameter with this label already exists.',
      })
      return
    }
    setSavingId(NEW_CARD_ID)
    try {
      const saved = await patchParameter({
        key,
        label: draft.label.trim(),
        description: draft.description,
        cta_label: draft.cta_label,
        url: draft.url.trim(),
        value: '',
        ...draftToPatchExtras(draft),
      })
      setParameters(prev => [saved, ...prev.filter(p => p.key !== saved.key)])
      setShowNewCard(false)
      setDrafts(prev => {
        const next = { ...prev }
        delete next[NEW_CARD_ID]
        return next
      })
      notifications.show({
        color: 'green',
        title: 'Parameter added',
        message: saved.label ?? saved.key,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save parameter.'
      notifications.show({ color: 'red', title: 'Add failed', message })
    } finally {
      setSavingId(null)
    }
  }

  function cancelNew() {
    setShowNewCard(false)
    setDrafts(prev => {
      const next = { ...prev }
      delete next[NEW_CARD_ID]
      return next
    })
  }

  function startAddNew() {
    console.log('[SageParameters] add new card opened')
    setShowNewCard(true)
    setDrafts(prev => ({ ...prev, [NEW_CARD_ID]: emptyDraft() }))
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    console.log('[SageParameters] DELETE dispatch:', deleteTarget.key)
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/admin/sage-parameters/${encodeURIComponent(deleteTarget.key)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const message = extractErrorMessage(body, 'Failed to delete parameter.')
        console.error('[SageParameters] DELETE failed:', message)
        notifications.show({ color: 'red', title: 'Delete failed', message })
        return
      }
      console.log('[SageParameters] DELETE success:', deleteTarget.key)
      setParameters(prev => prev.filter(p => p.key !== deleteTarget.key))
      notifications.show({
        color: 'green',
        title: 'Parameter deleted',
        message: deleteTarget.label ?? deleteTarget.key,
      })
      setDeleteTarget(null)
    } catch (err) {
      console.error('[SageParameters] DELETE request failed:', err)
      notifications.show({
        color: 'red',
        title: 'Delete failed',
        message: 'Could not reach the server.',
      })
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
          <Skeleton height={120} radius="md" />
          <Skeleton height={120} radius="md" />
        </Stack>
      ) : (
        <Stack gap="sm">
          {showNewCard && (
            <ParameterEditCard
              draft={drafts[NEW_CARD_ID] ?? emptyDraft()}
              onChange={patch => updateDraft(NEW_CARD_ID, patch)}
              onSave={handleSaveNew}
              onCancel={cancelNew}
              saving={savingId === NEW_CARD_ID}
              isNew
            />
          )}

          {parameters.length === 0 && !showNewCard ? (
            <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              No parameters saved yet. Click &ldquo;Add New&rdquo; to get started.
            </Text>
          ) : (
            parameters.map(param => {
              const isEditing = editingId === param.id
              if (isEditing) {
                return (
                  <ParameterEditCard
                    key={param.id}
                    draft={drafts[param.id] ?? draftFromParameter(param)}
                    onChange={patch => updateDraft(param.id, patch)}
                    onSave={() => handleSaveExisting(param)}
                    onCancel={() => cancelEdit(param.id)}
                    saving={savingId === param.id}
                  />
                )
              }
              return (
                <ParameterViewCard
                  key={param.id}
                  parameter={param}
                  onEdit={() => startEdit(param)}
                  onDelete={() => setDeleteTarget(param)}
                />
              )
            })
          )}
        </Stack>
      )}

      <Modal
        opened={deleteTarget !== null}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        title="Delete parameter?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text variant="muted">Delete this parameter? This cannot be undone.</Text>
          <Group gap="xs" justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="red"
              size="sm"
              onClick={handleConfirmDelete}
              loading={deleting}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

interface ViewCardProps {
  parameter: SageParameter
  onEdit: () => void
  onDelete: () => void
}

function ParameterViewCard({ parameter, onEdit, onDelete }: ViewCardProps) {
  const openAsLabel =
    OPEN_AS_OPTIONS.find(o => o.value === parameter.open_as)?.label ?? 'New Tab'
  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-md)' }}>
              {parameter.label && parameter.label.length > 0 ? parameter.label : parameter.key}
            </Text>
            {parameter.description && parameter.description.length > 0 && (
              <Text
                variant="muted"
                style={{ fontSize: 'var(--mantine-font-size-sm)' }}
              >
                {parameter.description}
              </Text>
            )}
          </Stack>
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={onEdit}
              aria-label={`Edit ${parameter.label ?? parameter.key}`}
            >
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size="md"
              onClick={onDelete}
              aria-label={`Delete ${parameter.label ?? parameter.key}`}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Group>

        <Stack gap={4}>
          <FieldRow label="CTA label" value={parameter.cta_label} />
          <FieldRow label="URL" value={parameter.url} mono />
          <FieldRow label="Open as" value={openAsLabel} />
          {parameter.open_as === 'popup' && (
            <FieldRow
              label="Embed code"
              value={parameter.embed_code && parameter.embed_code.length > 0 ? 'Set' : 'Not set'}
            />
          )}
        </Stack>
      </Stack>
    </Card>
  )
}

interface FieldRowProps {
  label: string
  value: string | null
  mono?: boolean
}

function FieldRow({ label, value, mono }: FieldRowProps) {
  const display = value && value.length > 0 ? value : '—'
  return (
    <Group gap="xs" wrap="wrap" align="baseline">
      <Text
        variant="muted"
        style={{ fontSize: 'var(--mantine-font-size-xs)', minWidth: 72 }}
      >
        {label}
      </Text>
      <Text
        variant="body"
        style={{
          fontSize: 'var(--mantine-font-size-sm)',
          wordBreak: 'break-all',
          fontFamily: mono ? 'var(--mantine-font-family-monospace)' : undefined,
          flex: 1,
          minWidth: 0,
        }}
      >
        {display}
      </Text>
    </Group>
  )
}

interface EditCardProps {
  draft: DraftFields
  onChange: (patch: Partial<DraftFields>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew?: boolean
}

function ParameterEditCard({ draft, onChange, onSave, onCancel, saving, isNew }: EditCardProps) {
  const descriptionCount = draft.description.length
  const ctaCount = draft.cta_label.length
  return (
    <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
      <Stack gap="sm">
        <Text variant="label" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          {isNew ? 'New parameter' : 'Edit parameter'}
        </Text>
        <TextInput
          label="Label"
          value={draft.label}
          onChange={e => onChange({ label: e.currentTarget.value })}
          placeholder="e.g. Booking link"
          size="sm"
          required
          disabled={saving}
        />
        <TextInput
          label="Description"
          value={draft.description}
          onChange={e => onChange({ description: e.currentTarget.value.slice(0, DESCRIPTION_MAX) })}
          placeholder="Short subtitle shown on the card"
          size="sm"
          maxLength={DESCRIPTION_MAX}
          description={`${descriptionCount}/${DESCRIPTION_MAX}`}
          disabled={saving}
        />
        <TextInput
          label="CTA label"
          value={draft.cta_label}
          onChange={e => onChange({ cta_label: e.currentTarget.value.slice(0, CTA_LABEL_MAX) })}
          placeholder="e.g. Book a call"
          size="sm"
          maxLength={CTA_LABEL_MAX}
          description={`${ctaCount}/${CTA_LABEL_MAX}`}
          disabled={saving}
        />
        <TextInput
          label="URL"
          value={draft.url}
          onChange={e => onChange({ url: e.currentTarget.value })}
          placeholder="https://cal.com/your-handle"
          size="sm"
          type="url"
          disabled={saving}
        />
        <Select
          label="Open behavior"
          data={OPEN_AS_OPTIONS}
          value={draft.open_as}
          onChange={value => {
            const next: OpenAs = isOpenAs(value) ? value : 'new_tab'
            onChange({ open_as: next })
          }}
          size="sm"
          allowDeselect={false}
          disabled={saving}
        />
        {draft.open_as === 'popup' && (
          <Textarea
            label="Embed Code"
            value={draft.embed_code}
            onChange={e => onChange({ embed_code: e.currentTarget.value })}
            placeholder="Paste your booking tool's popup snippet here"
            size="sm"
            autosize
            minRows={3}
            maxRows={10}
            disabled={saving}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
          />
        )}
        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="filled"
            color="green"
            size="sm"
            onClick={onSave}
            loading={saving}
            disabled={draft.label.trim().length === 0}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
