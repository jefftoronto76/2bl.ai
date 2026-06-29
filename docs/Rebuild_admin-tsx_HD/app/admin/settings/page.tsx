'use client'

// Tenant · Settings — Accordion of Parameters, Prompt Sets, Chat Thresholds, Invite
// Gate, and Appearance. Route: /admin/settings
//
// TODO: replace SAGE_PARAMETERS / CHAT_THRESHOLDS / INVITE_GATE_ENABLED with live
// data and wire each section's save to your endpoints.

import { useState } from 'react'
import {
  Accordion, ActionIcon, Button, Card, Group, NumberInput, Select, Stack, Switch, Text, Textarea, TextInput, Title,
} from '@mantine/core'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { CHAT_THRESHOLDS, INVITE_GATE_ENABLED, OPEN_AS_OPTIONS, SAGE_PARAMETERS } from '@/components/admin/lib/fixtures'
import { notify } from '@/components/admin/lib/primitives'
import { PromptSetList } from '@/components/admin/prompt-sets/PromptSetList'
import { WebsiteAppearance } from '@/components/admin/appearance/Appearance'
import type { SageParameter } from '@/components/admin/lib/types'

type ParamDraft = Omit<SageParameter, 'id' | 'key'> & Partial<Pick<SageParameter, 'id' | 'key'>>

/* ── Parameters ── */
function ParamEditCard({ draft, set, onSave, onCancel, isNew }: { draft: ParamDraft; set: (p: Partial<ParamDraft>) => void; onSave: () => void; onCancel: () => void; isNew?: boolean }) {
  return (
    <Card withBorder radius="md" p="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <Stack gap="sm">
        <Text fw={600} size="sm">{isNew ? 'New parameter' : 'Edit parameter'}</Text>
        <TextInput label="Label" required value={draft.label} onChange={(e) => set({ label: e.currentTarget.value })} placeholder="e.g. Booking link" data-autofocus />
        <TextInput label="Description" value={draft.description} onChange={(e) => set({ description: e.currentTarget.value.slice(0, 60) })} placeholder="Short subtitle shown on the card" description={`${draft.description.length}/60`} />
        <TextInput label="CTA label" value={draft.cta_label} onChange={(e) => set({ cta_label: e.currentTarget.value.slice(0, 20) })} placeholder="e.g. Book a call" description={`${draft.cta_label.length}/20`} />
        <TextInput label="URL" value={draft.url} onChange={(e) => set({ url: e.currentTarget.value })} placeholder="https://cal.com/your-handle" />
        <Select label="Open behavior" data={OPEN_AS_OPTIONS} value={draft.open_as} onChange={(v) => set({ open_as: v as SageParameter['open_as'] })} allowDeselect={false} withinPortal />
        {draft.open_as === 'popup' && (
          <Textarea label="Embed Code" value={draft.embed_code || ''} onChange={(e) => set({ embed_code: e.currentTarget.value })} placeholder="Paste your booking tool's popup snippet here" autosize minRows={3} styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }} />
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={!draft.label.trim()}>Save</Button>
        </Group>
      </Stack>
    </Card>
  )
}

function FieldRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <Group gap="xs" align="baseline" wrap="wrap">
      <Text c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12, minWidth: 72 }}>{label}</Text>
      <Text style={{ fontSize: 14, wordBreak: 'break-all', flex: 1, fontFamily: mono ? 'var(--mantine-font-family-monospace)' : undefined }}>{value && value.length ? value : '—'}</Text>
    </Group>
  )
}

function SageParameters() {
  const [params, setParams] = useState<SageParameter[]>(SAGE_PARAMETERS) // TODO: replace with query
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ParamDraft | null>(null)
  const [showNew, setShowNew] = useState(false)
  const set = (patch: Partial<ParamDraft>) => setDraft((d) => ({ ...(d as ParamDraft), ...patch }))
  const startEdit = (p: SageParameter) => { setShowNew(false); setEditingId(p.id); setDraft({ ...p }) }
  const startNew = () => { setEditingId(null); setShowNew(true); setDraft({ label: '', description: '', cta_label: '', url: '', open_as: 'new_tab', embed_code: '' }) }
  const saveEdit = () => {
    if (!draft) return
    setParams((ps) => ps.map((p) => (p.id === editingId ? ({ ...p, ...draft } as SageParameter) : p)))
    setEditingId(null)
    notify({ color: 'green', title: 'Parameter saved', message: draft.label })
  }
  const saveNew = () => {
    if (!draft) return
    setParams((ps) => [{ ...(draft as SageParameter), id: 'p' + Date.now(), key: draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') }, ...ps])
    setShowNew(false)
    notify({ color: 'green', title: 'Parameter added', message: draft.label })
  }
  const del = (p: SageParameter) => { setParams((ps) => ps.filter((x) => x.id !== p.id)); notify({ color: 'green', title: 'Parameter deleted', message: p.label }) }
  return (
    <Stack gap="md" pt={4}>
      <Group justify="flex-end"><Button size="sm" leftSection={<IconPlus size={14} />} onClick={startNew} disabled={showNew}>Add New</Button></Group>
      <Stack gap="sm">
        {showNew && draft && <ParamEditCard draft={draft} set={set} onSave={saveNew} onCancel={() => setShowNew(false)} isNew />}
        {params.map((p) =>
          editingId === p.id && draft ? (
            <ParamEditCard key={p.id} draft={draft} set={set} onSave={saveEdit} onCancel={() => setEditingId(null)} />
          ) : (
            <Card key={p.id} withBorder radius="md" p="md" style={{ background: 'transparent' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={500} style={{ fontSize: 16 }}>{p.label || p.key}</Text>
                    {p.description && <Text c="dimmed" size="sm">{p.description}</Text>}
                  </Stack>
                  <Group gap={2} wrap="nowrap">
                    <ActionIcon variant="subtle" color="gray" onClick={() => startEdit(p)} aria-label="Edit"><IconPencil size={16} /></ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => del(p)} aria-label="Delete"><IconTrash size={16} /></ActionIcon>
                  </Group>
                </Group>
                <Stack gap={4}>
                  <FieldRow label="CTA label" value={p.cta_label} />
                  <FieldRow label="URL" value={p.url} mono />
                  <FieldRow label="Open as" value={p.open_as === 'popup' ? 'Inline' : 'New Tab'} />
                  {p.open_as === 'popup' && <FieldRow label="Embed code" value={p.embed_code ? 'Set' : 'Not set'} />}
                </Stack>
              </Stack>
            </Card>
          ),
        )}
      </Stack>
    </Stack>
  )
}

/* ── Chat Thresholds ── */
function ChatThresholds() {
  const [inProgress, setInProgress] = useState<number | string>(CHAT_THRESHOLDS.in_progress)
  const [active, setActive] = useState<number | string>(CHAT_THRESHOLDS.active)
  const [saving, setSaving] = useState(false)
  const valid = Number(inProgress) > 0 && Number(active) > 0 && Number(inProgress) < Number(active)
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); notify({ color: 'green', title: 'Thresholds saved', message: 'Chat threshold settings updated.' }) }, 500) }
  const reset = () => { setInProgress(300); setActive(86400) }
  return (
    <Card withBorder radius="md" p="md" style={{ background: 'transparent' }} mt={4}>
      <Stack gap="sm">
        <NumberInput label="In-progress idle threshold" description="Seconds idle before a chat moves from In-progress to Active. Default: 300 (5 min)." value={inProgress} onChange={setInProgress} min={1} step={60} disabled={saving} />
        <NumberInput label="Active idle threshold" description="Seconds idle before a chat moves from Active to Abandoned. Default: 86400 (24 hr)." value={active} onChange={setActive} min={1} step={3600} disabled={saving} />
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" size="sm" onClick={reset} disabled={saving}>Reset to defaults</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!valid}>Save</Button>
        </Group>
      </Stack>
    </Card>
  )
}

/* ── Invite Gate ── */
function InviteGate() {
  const [enabled, setEnabled] = useState(INVITE_GATE_ENABLED)
  const [saving, setSaving] = useState(false)
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); notify({ color: 'green', title: 'Gate setting saved', message: `Invite gate is now ${enabled ? 'on' : 'off'}.` }) }, 500) }
  return (
    <Card withBorder radius="md" p="md" style={{ background: 'transparent' }} mt={4}>
      <Stack gap="md">
        <Switch checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} disabled={saving} label="Require an invite to access this chat" description="When enabled, visitors must present an invite link or be an active member to open the chat." />
        <Group justify="flex-end"><Button size="sm" onClick={save} loading={saving}>Save</Button></Group>
      </Stack>
    </Card>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Stack gap={2}>
      <Text fw={600} fz="md">{title}</Text>
      {subtitle && <Text c="dimmed" size="sm">{subtitle}</Text>}
    </Stack>
  )
}

const SECTIONS = [
  { value: 'parameters', title: 'Parameters', sub: 'Values Sage uses in conversation, such as booking links.', render: () => <SageParameters /> },
  { value: 'prompt-sets', title: 'Prompt Sets', sub: 'The prompt sets this tenant runs — label, status, and where each live set is used.', render: () => <PromptSetList scope="sbl" /> },
  { value: 'thresholds', title: 'Chat Thresholds', sub: 'How long Sage waits before moving a session from In-progress → Active → Abandoned.', render: () => <ChatThresholds /> },
  { value: 'invite-gate', title: 'Invite Gate', sub: 'Control whether this chat requires membership or an invite to access.', render: () => <InviteGate /> },
  { value: 'appearance', title: 'Appearance', sub: 'Branding for your public storefront and this admin console.', render: () => <WebsiteAppearance /> },
]

export default function TenantSettingsPage() {
  return (
    <Stack gap="lg" data-screen-label="Admin · Settings">
      <Stack gap={4}>
        <Title order={1} size="h2">Settings</Title>
        <Text c="dimmed">Configuration for the Natural Resource workspace.</Text>
      </Stack>
      <Accordion multiple variant="separated" radius="md" chevronPosition="right">
        {SECTIONS.map((s) => (
          <Accordion.Item key={s.value} value={s.value}>
            <Accordion.Control><SectionHeading title={s.title} subtitle={s.sub} /></Accordion.Control>
            <Accordion.Panel>{s.render()}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  )
}
