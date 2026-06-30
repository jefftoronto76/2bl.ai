// Tenant Settings screen — shared module (single source of truth).
//
// Imported by BOTH `Tenant Settings.html` (standalone) and `Combined Admin.html`
// (wired inline at /admin/settings). Keep the screen here so the two never drift
// — editing this file updates everywhere Settings appears.
//
// Sections: Parameters · Prompt Sets · Chat Thresholds · Invite Gate · Appearance.
// The Appearance section is the Storefront/Admin branding editor with live previews
// (from ./appearance.js).

import { React, html, M, Ic, D, useState } from './harness.js'
import { PromptSetList } from './promptset.js'
import { WebsiteAppearance } from './appearance.js'

/* ── Parameters ── */
function ParamEditCard({ draft, set, onSave, onCancel, isNew }) {
  return html`
    <${M.Card} withBorder radius="md" p="md" style=${{ background: 'var(--mantine-color-gray-0)' }}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">${isNew ? 'New parameter' : 'Edit parameter'}<//>
        <${M.TextInput} label="Label" required value=${draft.label} onChange=${(e) => set({ label: e.currentTarget.value })} placeholder="e.g. Booking link" data-autofocus />
        <${M.TextInput} label="Description" value=${draft.description} onChange=${(e) => set({ description: e.currentTarget.value.slice(0, 60) })} placeholder="Short subtitle shown on the card" description=${`${draft.description.length}/60`} />
        <${M.TextInput} label="CTA label" value=${draft.cta_label} onChange=${(e) => set({ cta_label: e.currentTarget.value.slice(0, 20) })} placeholder="e.g. Book a call" description=${`${draft.cta_label.length}/20`} />
        <${M.TextInput} label="URL" value=${draft.url} onChange=${(e) => set({ url: e.currentTarget.value })} placeholder="https://cal.com/your-handle" />
        <${M.Select} label="Open behavior" data=${D.OPEN_AS_OPTIONS} value=${draft.open_as} onChange=${(v) => set({ open_as: v })} allowDeselect=${false} withinPortal />
        ${draft.open_as === 'popup' && html`<${M.Textarea} label="Embed Code" value=${draft.embed_code || ''} onChange=${(e) => set({ embed_code: e.currentTarget.value })} placeholder="Paste your booking tool's popup snippet here" autosize minRows=${3} styles=${{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }} />`}
        <${M.Group} justify="flex-end" gap="sm">
          <${M.Button} variant="subtle" color="gray" size="sm" onClick=${onCancel}>Cancel<//>
          <${M.Button} size="sm" onClick=${onSave} disabled=${!draft.label.trim()}>Save<//>
        <//>
      <//>
    <//>`
}
const FieldRow = ({ label, value, mono }) => html`
  <${M.Group} gap="xs" align="baseline" wrap="wrap">
    <${M.Text} c="dimmed" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12, minWidth: 72 }}>${label}<//>
    <${M.Text} style=${{ fontSize: 14, wordBreak: 'break-all', flex: 1, fontFamily: mono ? 'var(--mantine-font-family-monospace)' : undefined }}>${value && value.length ? value : '—'}<//>
  <//>`

function SageParameters({ notify }) {
  const [params, setParams] = useState(D.SAGE_PARAMETERS)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const startEdit = (p) => { setShowNew(false); setEditingId(p.id); setDraft({ ...p }) }
  const startNew = () => { setEditingId(null); setShowNew(true); setDraft({ label: '', description: '', cta_label: '', url: '', open_as: 'new_tab', embed_code: '' }) }
  const saveEdit = () => { setParams((ps) => ps.map((p) => (p.id === editingId ? { ...draft } : p))); setEditingId(null); notify({ color: 'green', title: 'Parameter saved', message: draft.label }) }
  const saveNew = () => { setParams((ps) => [{ ...draft, id: 'p' + Date.now(), key: draft.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') }, ...ps]); setShowNew(false); notify({ color: 'green', title: 'Parameter added', message: draft.label }) }
  const del = (p) => { setParams((ps) => ps.filter((x) => x.id !== p.id)); notify({ color: 'green', title: 'Parameter deleted', message: p.label }) }
  return html`
    <${M.Stack} gap="md" pt=${4}>
      <${M.Group} justify="flex-end"><${M.Button} size="sm" leftSection=${html`<${Ic.IconPlus} size=${14} />`} onClick=${startNew} disabled=${showNew}>Add New<//><//>
      <${M.Stack} gap="sm">
        ${showNew && html`<${ParamEditCard} draft=${draft} set=${set} onSave=${saveNew} onCancel=${() => setShowNew(false)} isNew=${true} />`}
        ${params.map((p) => editingId === p.id
          ? html`<${ParamEditCard} key=${p.id} draft=${draft} set=${set} onSave=${saveEdit} onCancel=${() => setEditingId(null)} />`
          : html`<${M.Card} key=${p.id} withBorder radius="md" p="md" style=${{ background: 'transparent' }}>
              <${M.Stack} gap="sm">
                <${M.Group} justify="space-between" align="flex-start" wrap="nowrap">
                  <${M.Stack} gap=${2} style=${{ minWidth: 0 }}>
                    <${M.Text} fw=${500} style=${{ fontSize: 16 }}>${p.label || p.key}<//>
                    ${p.description && html`<${M.Text} c="dimmed" size="sm">${p.description}<//>`}
                  <//>
                  <${M.Group} gap=${2} wrap="nowrap">
                    <${M.ActionIcon} variant="subtle" color="gray" onClick=${() => startEdit(p)} aria-label="Edit"><${Ic.IconPencil} size=${16} /><//>
                    <${M.ActionIcon} variant="subtle" color="red" onClick=${() => del(p)} aria-label="Delete"><${Ic.IconTrash} size=${16} /><//>
                  <//>
                <//>
                <${M.Stack} gap=${4}>
                  <${FieldRow} label="CTA label" value=${p.cta_label} />
                  <${FieldRow} label="URL" value=${p.url} mono=${true} />
                  <${FieldRow} label="Open as" value=${p.open_as === 'popup' ? 'Inline' : 'New Tab'} />
                  ${p.open_as === 'popup' && html`<${FieldRow} label="Embed code" value=${p.embed_code ? 'Set' : 'Not set'} />`}
                <//>
              <//>
            <//>`)}
      <//>
    <//>`
}

/* ── Chat Thresholds ── */
function ChatThresholds({ notify }) {
  const [inProgress, setInProgress] = useState(D.CHAT_THRESHOLDS.in_progress)
  const [active, setActive] = useState(D.CHAT_THRESHOLDS.active)
  const [saving, setSaving] = useState(false)
  const valid = inProgress > 0 && active > 0 && inProgress < active
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); notify({ color: 'green', title: 'Thresholds saved', message: 'Chat threshold settings updated.' }) }, 500) }
  const reset = () => { setInProgress(300); setActive(86400) }
  return html`
    <${M.Card} withBorder radius="md" p="md" style=${{ background: 'transparent' }} mt=${4}>
      <${M.Stack} gap="sm">
        <${M.NumberInput} label="In-progress idle threshold" description="Seconds idle before a chat moves from In-progress to Active. Default: 300 (5 min)." value=${inProgress} onChange=${setInProgress} min=${1} step=${60} disabled=${saving} />
        <${M.NumberInput} label="Active idle threshold" description="Seconds idle before a chat moves from Active to Abandoned. Default: 86400 (24 hr)." value=${active} onChange=${setActive} min=${1} step=${3600} disabled=${saving} />
        <${M.Group} justify="flex-end" gap="sm">
          <${M.Button} variant="subtle" color="gray" size="sm" onClick=${reset} disabled=${saving}>Reset to defaults<//>
          <${M.Button} size="sm" onClick=${save} loading=${saving} disabled=${!valid}>Save<//>
        <//>
      <//>
    <//>`
}

/* ── Invite Gate ── */
function InviteGate({ notify }) {
  const [enabled, setEnabled] = useState(D.INVITE_GATE_ENABLED)
  const [saving, setSaving] = useState(false)
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); notify({ color: 'green', title: 'Gate setting saved', message: `Invite gate is now ${enabled ? 'on' : 'off'}.` }) }, 500) }
  return html`
    <${M.Card} withBorder radius="md" p="md" style=${{ background: 'transparent' }} mt=${4}>
      <${M.Stack} gap="md">
        <${M.Switch} checked=${enabled} onChange=${(e) => setEnabled(e.currentTarget.checked)} disabled=${saving}
          label="Require an invite to access this chat" description="When enabled, visitors must present an invite link or be an active member to open the chat." />
        <${M.Group} justify="flex-end"><${M.Button} size="sm" onClick=${save} loading=${saving}>Save<//><//>
      <//>
    <//>`
}

const SectionHeading = ({ title, subtitle }) => html`
  <${M.Stack} gap=${2}>
    <${M.Text} fw=${600} fz="md">${title}<//>
    ${subtitle && html`<${M.Text} c="dimmed" size="sm">${subtitle}<//>`}
  <//>`

const SECTIONS = [
  { value: 'parameters', title: 'Parameters', sub: 'Values Sage uses in conversation, such as booking links.', render: (notify) => html`<${SageParameters} notify=${notify} />` },
  { value: 'prompt-sets', title: 'Prompt Sets', sub: 'The prompt sets this tenant runs — label, status, and where each live set is used.', render: (notify) => html`<${PromptSetList} scope="sbl" notify=${notify} />` },
  { value: 'thresholds', title: 'Chat Thresholds', sub: 'How long Sage waits before moving a session from In-progress → Active → Abandoned.', render: (notify) => html`<${ChatThresholds} notify=${notify} />` },
  { value: 'invite-gate', title: 'Invite Gate', sub: 'Control whether this chat requires membership or an invite to access.', render: (notify) => html`<${InviteGate} notify=${notify} />` },
  { value: 'appearance', title: 'Appearance', sub: 'Branding for your public storefront and this admin console.', render: (notify) => html`<${WebsiteAppearance} notify=${notify} />` },
]

export function Settings({ notify }) {
  return html`
    <${M.Stack} gap="lg" data-screen-label="Admin · Settings">
      <${M.Stack} gap=${4}>
        <${M.Title} order=${1} size="h2">Settings<//>
        <${M.Text} c="dimmed">Configuration for the Natural Resource workspace.<//>
      <//>
      <${M.Accordion} multiple variant="separated" radius="md" chevronPosition="right">
        ${SECTIONS.map((s) => html`
          <${M.Accordion.Item} key=${s.value} value=${s.value}>
            <${M.Accordion.Control}><${SectionHeading} title=${s.title} subtitle=${s.sub} /><//>
            <${M.Accordion.Panel}>${s.render(notify)}<//>
          <//>`)}
      <//>
    <//>`
}
