'use client'

// TenantPrompts — Platform Settings section (app/(platform)/platform/settings).
// Full parity with the approved prototype (Platform · Settings → Tenant Prompts): every
// prompt set across every tenant, searchable, grouped by tenant, with the SAME card the
// tenant surface uses — Open in Composer · View compiled · Edit · Delete — plus Add New.
//
// Cards come from the shared <PromptSetViewCard/> so the two surfaces can never drift.
// Create/edit/delete here are CROSS-TENANT (a new set needs a Tenant picker; saves carry
// tenant_id) — backed by PATCH/DELETE /api/platform/prompt-sets (platform-admin gated).
//
// This component owns its single intro line (next to Add New) — the wrapping page Card
// must NOT add a subtitle (that produced the doubled-paragraph bug).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Modal, Select, Skeleton, Stack, Textarea, TextInput, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronRight, IconPlus, IconSearch } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import { CompiledPromptModal } from '@/components/admin/settings/CompiledPromptModal'
import { PromptSetMetaStrip, PromptSetViewCard } from '@/components/admin/settings/PromptSetCard'
import { type PlatformPromptSet, type PromptSetStatus } from '@/lib/promptSet'

interface Tenant {
  id: string
  name: string
}
interface PromptType {
  id: string
  name: string
}
interface DraftFields {
  tenant_id: string | null
  label: string
  description: string
  status: PromptSetStatus
  prompt_type_id: string | null
}

const NEW_CARD_ID = '__new__'

function emptyDraft(): DraftFields {
  return { tenant_id: null, label: '', description: '', status: 'draft', prompt_type_id: null }
}
function draftFromSet(s: PlatformPromptSet): DraftFields {
  return { tenant_id: s.tenant_id, label: s.label, description: s.description ?? '', status: s.status, prompt_type_id: s.prompt_type_id }
}
function errMsg(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return fallback
}

export function TenantPrompts({ onSetsChanged }: { onSetsChanged?: () => void } = {}) {
  const router = useRouter()
  const [sets, setSets] = useState<PlatformPromptSet[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PlatformPromptSet | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showNewCard, setShowNewCard] = useState(false)
  const [viewTarget, setViewTarget] = useState<PlatformPromptSet | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [typeNamesByTenant, setTypeNamesByTenant] = useState<Record<string, Record<string, string>>>({})

  function toggle(tenantId: string) {
    setExpanded((e) => ({ ...e, [tenantId]: !e[tenantId] }))
  }

  // Resolve each set's prompt_type_id to a display name for the collapsed cards —
  // the same per-tenant endpoint the edit modal uses (/api/platform/prompt-types?
  // tenant_id=X), fetched once per distinct tenant present in `sets` rather than
  // per set.
  useEffect(() => {
    const tenantIds = Array.from(new Set(sets.map((s) => s.tenant_id)))
    if (tenantIds.length === 0) {
      setTypeNamesByTenant({})
      return
    }
    let cancelled = false
    Promise.all(
      tenantIds.map((tenantId) =>
        fetch(`/api/platform/prompt-types?tenant_id=${encodeURIComponent(tenantId)}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((types: { id: string; name: string }[]) => [tenantId, types] as const)
          .catch(() => [tenantId, []] as const),
      ),
    ).then((results) => {
      if (cancelled) return
      const next: Record<string, Record<string, string>> = {}
      for (const [tenantId, types] of results) {
        next[tenantId] = Object.fromEntries(types.map((t) => [t.id, t.name]))
      }
      setTypeNamesByTenant(next)
    })
    return () => {
      cancelled = true
    }
  }, [sets])

  const resolveTypeName = useCallback(
    (set: PlatformPromptSet): string | null =>
      set.prompt_type_id ? typeNamesByTenant[set.tenant_id]?.[set.prompt_type_id] ?? null : null,
    [typeNamesByTenant],
  )

  const fetchSets = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/prompt-sets')
      if (!res.ok) {
        notifications.show({ color: 'red', title: 'Failed to load', message: 'Could not load prompt sets.' })
        return
      }
      setSets(await res.json())
    } catch (err) {
      console.error('[TenantPrompts] fetch failed:', err)
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSets()
    fetch('/api/platform/tenants')
      .then((r) => (r.ok ? r.json() : []))
      .then(setTenants)
      .catch(() => {})
  }, [fetchSets])

  function updateDraft(id: string, patch: Partial<DraftFields>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyDraft()), ...patch } }))
  }
  function startEdit(s: PlatformPromptSet) {
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

  function openInComposer(s: PlatformPromptSet) {
    // The Composer reads ?promptSet=<id> on load and preselects it. Cross-tenant deep-links
    // are a safe no-op if the set isn't in the session tenant's list.
    router.push(`/admin/prompt-builder?promptSet=${encodeURIComponent(s.id)}`)
  }

  function validate(d: DraftFields): string | null {
    if (!d.tenant_id) return 'Pick a tenant.'
    if (!d.label.trim()) return 'Label is required.'
    if (d.status === 'live' && !(d.prompt_type_id ?? '').trim()) return 'Pick a prompt type for this live set.'
    return null
  }

  async function handleSave(key: string, existing?: PlatformPromptSet) {
    const draft = drafts[key] ?? emptyDraft()
    const error = validate(draft)
    if (error) {
      notifications.show({ color: 'red', title: 'Invalid input', message: error })
      return
    }
    setSavingId(key)
    try {
      const res = await fetch('/api/platform/prompt-sets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existing?.id,
          tenant_id: draft.tenant_id,
          label: draft.label.trim(),
          description: draft.description.trim(),
          status: draft.status,
          prompt_type_id: draft.prompt_type_id || null,
        }),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        throw new Error(errMsg(body, 'Failed to save prompt set.'))
      }
      const saved: PlatformPromptSet = await res.json()
      setSets((prev) => (existing ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev]))
      existing ? setEditingId(null) : setShowNewCard(false)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      notifications.show({ color: 'green', title: existing ? 'Prompt set saved' : 'Prompt set added', message: `${saved.label} · ${saved.tenant_name}` })
      setExpanded((e) => ({ ...e, [saved.tenant_id]: true }))
      setTimeout(() => document.querySelector(`[data-tenant-group="${saved.tenant_id}"]`)?.scrollIntoView({ block: 'nearest' }), 60)
      onSetsChanged?.() // keep the Master Prompt picker in sync (create + edit)
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
      const res = await fetch(`/api/platform/prompt-sets/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        notifications.show({ color: 'red', title: 'Delete failed', message: errMsg(body, 'Failed to delete.') })
        return
      }
      setSets((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      notifications.show({ color: 'green', title: 'Prompt set deleted', message: `${deleteTarget.label} · ${deleteTarget.tenant_name}` })
      setDeleteTarget(null)
      onSetsChanged?.() // keep the Master Prompt picker in sync (delete)
    } catch (err) {
      console.error('[TenantPrompts] delete failed:', err)
      notifications.show({ color: 'red', title: 'Delete failed', message: 'Could not reach the server.' })
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sets
    return sets.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        s.tenant_name.toLowerCase().includes(q),
    )
  }, [sets, query])

  // Grouped by tenant_id, not tenant_name — two tenants sharing a display
  // name must not merge into one collapsible row.
  const groups = useMemo(() => {
    const byTenant = new Map<string, PlatformPromptSet[]>()
    for (const s of filtered) {
      const list = byTenant.get(s.tenant_id) ?? []
      list.push(s)
      byTenant.set(s.tenant_id, list)
    }
    return [...byTenant.entries()].sort((a, b) =>
      (a[1][0]?.tenant_name ?? '').localeCompare(b[1][0]?.tenant_name ?? ''),
    )
  }, [filtered])

  // Add New and Edit share one Modal (same pattern as the Delete confirm
  // below) — activeKey/activeSet resolve which draft + save target it's
  // currently showing, whichever of the two triggered it.
  const activeKey = showNewCard ? NEW_CARD_ID : editingId
  const activeSet = editingId ? sets.find((s) => s.id === editingId) : undefined

  function closeActiveModal() {
    if (showNewCard) cancelNew()
    else if (editingId) cancelEdit(editingId)
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          Every prompt set in the database, across all tenants — pulled live, grouped by tenant.
        </Text>
        <Button variant="filled" color="green" size="sm" leftSection={<IconPlus size={14} />} onClick={startAddNew} disabled={showNewCard}>
          Add New
        </Button>
      </Group>

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="Search prompt set, description, or tenant…"
        leftSection={<IconSearch size={15} />}
        size="sm"
      />

      {loading ? (
        <Stack gap="sm">
          <Skeleton height={130} radius="md" />
          <Skeleton height={130} radius="md" />
        </Stack>
      ) : groups.length === 0 ? (
        <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          {query ? 'No prompt sets match your search.' : 'No prompt sets in the database yet.'}
        </Text>
      ) : (
        groups.map(([tenantId, list]) => {
          const name = list[0]?.tenant_name ?? tenantId
          // Search force-expands every matching tenant; otherwise fall back
          // to whatever the user last toggled (closed by default).
          const open = query.trim() ? true : !!expanded[tenantId]
          return (
            <Stack key={tenantId} gap={0} data-tenant-group={tenantId}>
              <UnstyledButton
                onClick={() => toggle(tenantId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--mantine-radius-sm)',
                  background: 'var(--mantine-color-gray-0)',
                }}
                aria-expanded={open}
              >
                <Group gap="xs" align="center">
                  <IconChevronRight
                    size={14}
                    style={{
                      color: 'var(--mantine-color-gray-6)',
                      transition: 'transform 150ms',
                      transform: open ? 'rotate(90deg)' : 'none',
                    }}
                  />
                  {/* Raw span, not the Text primitive — it always renders a <p>,
                      which is invalid content inside a <button>. */}
                  <span style={{ fontSize: 'var(--mantine-font-size-sm)', fontWeight: 500, lineHeight: 1.2 }}>
                    {name}
                  </span>
                </Group>
                <span style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-dimmed)' }}>
                  {list.length} {list.length === 1 ? 'set' : 'sets'}
                </span>
              </UnstyledButton>
              {open && (
                <Stack
                  gap="sm"
                  pt="sm"
                  pb="xs"
                  style={{ marginLeft: 10, paddingLeft: 14, borderLeft: '1px solid var(--mantine-color-gray-3)' }}
                >
                  {list.map((set) => (
                    <PromptSetViewCard
                      key={set.id}
                      set={set}
                      typeName={resolveTypeName(set)}
                      onOpenInComposer={() => openInComposer(set)}
                      onView={() => setViewTarget(set)}
                      onEdit={() => startEdit(set)}
                      onDelete={() => setDeleteTarget(set)}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          )
        })
      )}

      {viewTarget && (
        <CompiledPromptModal
          set={viewTarget}
          compiledUrl={`/api/platform/prompt-sets/${encodeURIComponent(viewTarget.id)}/compiled`}
          opened={viewTarget !== null}
          onClose={() => setViewTarget(null)}
        />
      )}

      <Modal opened={deleteTarget !== null} onClose={() => { if (!deleting) setDeleteTarget(null) }} title="Delete prompt set?" centered size="sm">
        <Stack gap="md">
          <Text variant="muted">
            Delete <strong>{deleteTarget?.label}</strong> ({deleteTarget?.tenant_name})? This cannot be undone.
          </Text>
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

      <Modal
        opened={showNewCard || editingId !== null}
        onClose={closeActiveModal}
        title={showNewCard ? 'New prompt set' : 'Edit prompt set'}
        centered
        size="md"
      >
        <EditCardFields
          draft={drafts[activeKey ?? ''] ?? emptyDraft()}
          meta={activeSet}
          tenants={tenants}
          onChange={(patch) => updateDraft(activeKey ?? '', patch)}
          onSave={() => handleSave(activeKey ?? '', activeSet)}
          onCancel={closeActiveModal}
          saving={savingId === activeKey}
          isNew={showNewCard}
        />
      </Modal>
    </Stack>
  )
}

// ── Add New / Edit form fields, rendered inside the shared Modal above
//    (platform: includes a Tenant picker on new) ──────────────────────────
function EditCardFields({
  draft,
  meta,
  tenants,
  onChange,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: DraftFields
  meta?: PlatformPromptSet
  tenants: Tenant[]
  onChange: (patch: Partial<DraftFields>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew?: boolean
}) {
  const [promptTypes, setPromptTypes] = useState<PromptType[]>([])
  const isLive = draft.status === 'live'

  // Prompt types are per-tenant; (re)fetch when the chosen tenant changes.
  useEffect(() => {
    if (!draft.tenant_id) {
      setPromptTypes([])
      return
    }
    let cancelled = false
    fetch(`/api/platform/prompt-types?tenant_id=${encodeURIComponent(draft.tenant_id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PromptType[]) => !cancelled && setPromptTypes(data))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [draft.tenant_id])

  const typeData = [
    ...promptTypes.map((t) => ({ value: t.id, label: t.name })),
    ...(draft.prompt_type_id && !promptTypes.some((t) => t.id === draft.prompt_type_id)
      ? [{ value: draft.prompt_type_id, label: draft.prompt_type_id }]
      : []),
  ]
  const saveDisabled = saving || !draft.tenant_id || !draft.label.trim() || (isLive && !(draft.prompt_type_id ?? '').trim())

  return (
    <Stack gap="sm">
      {isNew ? (
        <Select
          label="Tenant"
          description="Which tenant owns this prompt set."
          placeholder="Select a tenant"
          data={tenants.map((t) => ({ value: t.id, label: t.name }))}
          value={draft.tenant_id}
          onChange={(v) => onChange({ tenant_id: v, prompt_type_id: null })}
          searchable
          required
          size="sm"
          disabled={saving}
        />
      ) : (
        <TextInput label="Tenant" value={meta?.tenant_name ?? ''} readOnly size="sm" description="A set's owning tenant can't be changed." />
      )}

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
      <Select
        label="Type"
        description={isLive ? 'Which prompt type this live set is wired to.' : 'Optional for a draft — set where it’s used when it goes live.'}
        placeholder={draft.tenant_id ? 'Select a prompt type' : 'Pick a tenant first'}
        data={typeData}
        value={draft.prompt_type_id}
        clearable={!isLive}
        onChange={(value) => onChange({ prompt_type_id: value })}
        size="sm"
        required={isLive}
        disabled={saving || !draft.tenant_id}
      />

      <PromptSetMetaStrip set={meta} isNew={isNew} tenantName={meta?.tenant_name} />

      <Group gap="xs" justify="flex-end" wrap="wrap">
        <Button variant="subtle" color="gray" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="filled" color="green" size="sm" onClick={onSave} loading={saving} disabled={saveDisabled}>
          {isNew ? 'Create set' : 'Save'}
        </Button>
      </Group>
    </Stack>
  )
}
