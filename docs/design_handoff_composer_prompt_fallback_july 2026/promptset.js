// Shared prompt-set UI — used by Platform Settings (Tenant Prompts) and tenant
// Settings (Prompt Sets). Card with badges + compile metadata + stale warning,
// the create/edit modal, the compiled-prompt viewer, and the grouped list.

import {
  React, html, M, Ic, D, useState, useMemo,
  StatusBadge, TintBadge, MetaRow, mono, dim, fmtDate, accentMix,
} from './harness.js'

const tenantName = (tid) => (D.TENANTS.find((t) => t.id === tid) || {}).name || tid

/* ── Compiled-prompt viewer (read-only assembled system prompt) ── */
export function CompiledPromptModal({ set, onClose }) {
  const [copied, setCopied] = useState(false)
  const text = D.MASTER_PROMPT_CONTENT
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })
  }
  return html`
    <${M.Modal} opened=${true} onClose=${onClose} size="lg" radius="md" centered
      title=${html`<${M.Group} gap="sm"><${M.Text} fw=${600}>Compiled prompt<//><${StatusBadge} status=${set.status} /><//>`}>
      <${M.Stack} gap="sm">
        <${M.Group} gap="xs" wrap="wrap">
          <${MetaRow} label="Set">${html`<${M.Text} size="sm" fw=${600}>${set.label}<//>`}<//>
        <//>
        <${M.Group} gap="md" wrap="wrap">
          ${dim(`Tenant ${tenantName(set.tenant_id)}`)}
          ${dim(`v${set.version}`)}
          ${dim(`${set.block_count ?? '—'} blocks`)}
          ${dim(`Compiled master v${set.compiled_master_version ?? '—'}`)}
        <//>
        <${M.Card} withBorder radius="sm" p="md" style=${{ background: 'var(--mantine-color-gray-0)' }}>
          <${M.Text} component="pre" style=${{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12.5, lineHeight: 1.6 }}>${text}<//>
        <//>
        <${M.Group} justify="flex-end" gap="sm">
          <${M.Button} variant="default" leftSection=${html`<${Ic.IconCopy} size=${15} />`} onClick=${copy}>${copied ? 'Copied' : 'Copy'}<//>
          <${M.Button} onClick=${onClose}>Done<//>
        <//>
      <//>
    <//>`
}

/* ── Create / edit modal ── */
const USAGE_OPTIONS = [{ value: 'base', label: 'base' }, { value: 'member', label: 'member' }]

export function PromptSetModal({ mode, set, platform, onClose, onSave }) {
  const [label, setLabel] = useState(set ? set.label : '')
  const [usage, setUsage] = useState(set ? set.usage_type : null)
  const [status, setStatus] = useState(set ? set.status : 'draft')
  const [description, setDescription] = useState(set ? set.description : '')
  const [tenantId, setTenantId] = useState(set ? set.tenant_id : null)
  const [err, setErr] = useState({})
  const showTenantField = platform && mode === 'new'

  const save = () => {
    const next = {}
    if (!label.trim()) next.label = 'Name is required'
    if (showTenantField && !tenantId) next.tenantId = 'Pick a tenant'
    setErr(next)
    if (Object.keys(next).length) return
    onSave({ ...(set || {}), label: label.trim(), usage_type: usage, status, description: description.trim(), ...(showTenantField ? { tenant_id: tenantId } : {}) })
  }

  return html`
    <${M.Modal} opened=${true} onClose=${onClose} size="md" radius="md" centered
      title=${html`<${M.Text} fw=${600}>${mode === 'new' ? 'New prompt set' : 'Edit prompt set'}<//>`}>
      <${M.Stack} gap="md">
        ${showTenantField && html`
          <${M.Select} label="Tenant" description="Which tenant owns this prompt set." placeholder="Select a tenant"
            data=${D.TENANTS.map((t) => ({ value: t.id, label: t.name }))} value=${tenantId} onChange=${setTenantId}
            error=${err.tenantId} searchable required data-autofocus />`}
        <${M.TextInput} label="Name" placeholder="Sage Base" required value=${label}
          error=${err.label} onChange=${(e) => setLabel(e.currentTarget.value)} data-autofocus=${!showTenantField || undefined} />
        <${M.Select} label="Type" placeholder="Select a type" data=${USAGE_OPTIONS} value=${usage}
          onChange=${setUsage} clearable
          description="Where a live set is wired in. Leave empty for an unassigned draft." />
        <${M.Select} label="Status" data=${[{ value: 'live', label: 'Live' }, { value: 'draft', label: 'Draft' }]}
          value=${status} onChange=${(v) => setStatus(v || 'draft')} allowDeselect=${false} />
        <${M.Textarea} label="Description" placeholder="Short summary of what this set is for." autosize minRows=${2} maxRows=${4}
          value=${description} onChange=${(e) => setDescription(e.currentTarget.value)} />
        <${M.Group} justify="flex-end" gap="sm" mt=${4}>
          <${M.Button} variant="subtle" color="gray" onClick=${onClose}>Cancel<//>
          <${M.Button} onClick=${save}>${mode === 'new' ? 'Create' : 'Save changes'}<//>
        <//>
      <//>
    <//>`
}

/* ── A set is stale when edited after its last compile ── */
const isStale = D.psIsStale

/* ── Prompt-set card ── */
export function PromptSetCard({ set, showTenant, onOpenInComposer, onView, onEdit, onDelete }) {
  const stale = isStale(set)
  const behind = set.compiled_master_version != null && set.compiled_master_version < D.MASTER_PROMPT_VERSION
  return html`
    <${M.Card} withBorder radius="md" p="md" style=${{ backgroundColor: 'transparent' }}>
      <${M.Stack} gap="xs">
        <${M.Group} justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
          <${M.Group} gap="sm" align="center" wrap="wrap" style=${{ minWidth: 0 }}>
            <${M.Text} fw=${500} style=${{ fontSize: 'var(--mantine-font-size-md)' }}>${set.label}<//>
            <${M.Text} c="dimmed" style=${{ fontSize: 'var(--mantine-font-size-xs)', fontFamily: 'var(--mantine-font-family-monospace)' }}>v${set.version}<//>
            <${StatusBadge} status=${set.status} />
            ${set.is_master && html`<${M.Badge} size="sm" radius="sm" variant="filled" color="green">Composer Prompt<//>`}
            ${set.usage_type && html`<${TintBadge} tint=${D.usageBadge(set.usage_type)}>${set.usage_type}<//>`}
            ${stale && html`<${M.Badge} size="sm" radius="sm" variant="light" color="orange">Stale<//>`}
          <//>
          <${M.Group} gap=${8} align="center" wrap="nowrap">
            <${M.Button} variant="default" size="compact-sm" color="green"
              leftSection=${html`<${Ic.IconWand} size=${14} />`} onClick=${onOpenInComposer}>Open in Composer<//>
            <${M.Group} gap=${2} wrap="nowrap">
              <${M.ActionIcon} variant="subtle" color="gray" size="md" aria-label="View compiled prompt" onClick=${onView}><${Ic.IconEye} size=${16} /><//>
              <${M.ActionIcon} variant="subtle" color="gray" size="md" aria-label="Edit" onClick=${onEdit}><${Ic.IconPencil} size=${16} /><//>
              <${M.ActionIcon} variant="subtle" color="red" size="md" aria-label="Delete" onClick=${onDelete}><${Ic.IconTrash} size=${16} /><//>
            <//>
          <//>
        <//>
        ${set.description && html`<${M.Text} c="dimmed" style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${set.description}<//>`}
        ${stale && html`
          <${M.Group} gap=${7} align="center" wrap="nowrap"
            style=${{ padding: '8px 11px', borderRadius: 'var(--mantine-radius-sm)', background: 'rgba(245,159,0,0.10)', border: '1px solid rgba(245,159,0,0.28)' }}>
            <${Ic.IconAlertTriangle} size=${14} style=${{ color: '#b07c0c', flex: '0 0 auto' }} />
            <${M.Text} style=${{ fontSize: 13, color: '#b07c0c' }}>Edited since last compile — recompile to apply changes.<//>
          <//>`}
        <${M.Card} withBorder radius="sm" p="sm" style=${{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <${M.Stack} gap=${6}>
            ${showTenant && html`<${MetaRow} label="Tenant">${html`<${M.Text} fw=${600} style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${tenantName(set.tenant_id)}<//>`}<//>`}
            <${MetaRow} label="Version">${html`<${M.Group} gap=${6} align="baseline">${mono(`v${set.version}`)}${dim('· auto-increments on compile')}<//>`}<//>
            ${set.is_master && html`<${MetaRow} label="Composer Prompt">${html`<${M.Badge} size="sm" radius="sm" variant="filled" color="green">Composer Prompt<//>`}<//>`}
            <${MetaRow} label="Blocks">${html`<${M.Text} style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${set.block_count != null ? set.block_count : '—'}<//>`}<//>
            <${MetaRow} label="Last compiled">${set.last_compiled_at ? html`<${M.Text} style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${fmtDate(set.last_compiled_at)}<//>` : dim('Never compiled')}<//>
            <${MetaRow} label="Compiled master">${
              set.compiled_master_version != null
                ? html`<${M.Group} gap=${6} align="baseline">${mono(`v${set.compiled_master_version}`)}${behind ? dim(`· now v${D.MASTER_PROMPT_VERSION}`) : null}<//>`
                : dim('—')}<//>
            <${MetaRow} label="ID">${mono(set.id)}<//>
            <${MetaRow} label="Created">${html`<${M.Text} style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${fmtDate(set.created_at)}<//>`}<//>
          <//>
        <//>
      <//>
    <//>`
}

/* ── Grouped, searchable list with Add New ──
   scope: 'platform' → all tenants grouped; or a tenant id → just that tenant. ── */
export function PromptSetList({ scope, notify }) {
  const [sets, setSets] = useState(D.PROMPT_SETS)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)   // {mode,set}
  const [viewing, setViewing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [expanded, setExpanded] = useState({})
  const toggle = (tid) => setExpanded((e) => ({ ...e, [tid]: !e[tid] }))

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

  // Group by tenant (preserve TENANTS order).
  const groups = useMemo(() => {
    const byTenant = new Map()
    for (const s of filtered) {
      const arr = byTenant.get(s.tenant_id) || []
      arr.push(s); byTenant.set(s.tenant_id, arr)
    }
    return D.TENANTS.filter((t) => byTenant.has(t.id)).map((t) => ({ tenant: t, sets: byTenant.get(t.id) }))
  }, [filtered])

  const openInComposer = (s) => { window.location.href = 'Composer.html' }
  const save = (s) => {
    let createdTenantId = null
    setSets((prev) => {
      const exists = prev.some((x) => x.id === s.id)
      if (exists) return prev.map((x) => (x.id === s.id ? s : x))
      createdTenantId = platform ? s.tenant_id : scope
      const created = { id: `new-${Date.now()}`, tenant_id: createdTenantId, is_master: false, version: 1,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_compiled_at: null,
        compiled_master_version: null, block_count: 0, ...s }
      return [...prev, created]
    })
    notify && notify({ color: 'green', title: modal?.mode === 'new' ? 'Prompt set created' : 'Prompt set updated', message: s.label })
    setModal(null)
    if (createdTenantId) {
      setExpanded((e) => ({ ...e, [createdTenantId]: true }))
      setTimeout(() => {
        document.querySelector(`[data-tenant-group="${createdTenantId}"]`)?.scrollIntoView({ block: 'nearest' })
      }, 60)
    }
  }
  const doDelete = (s) => { setSets((prev) => prev.filter((x) => x.id !== s.id)); notify && notify({ color: 'green', title: 'Prompt set deleted', message: s.label }); setConfirm(null) }

  return html`
    <${M.Stack} gap="md" pt=${4}>
      <${M.Group} justify="space-between" align="center" wrap="wrap">
        <${M.Text} c="dimmed" size="sm">
          ${platform ? 'Every prompt set in the database, across all tenants — pulled live, grouped by tenant.'
                     : 'Prompt sets owned by this tenant. Compiled and served to its Composer.'}
        <//>
        <${M.Button} color="green" size="sm" leftSection=${html`<${Ic.IconPlus} size=${14} />`} onClick=${() => setModal({ mode: 'new' })}>Add New<//>
      <//>
      <${M.TextInput} value=${query} onChange=${(e) => setQuery(e.currentTarget.value)} size="sm"
        placeholder=${platform ? 'Search prompt set, description, or tenant…' : 'Search prompt set or description…'}
        leftSection=${html`<${Ic.IconSearch} size=${15} />`} />
      ${groups.length === 0
        ? html`<${M.Card} withBorder radius="md" p="xl" style=${{ background: 'transparent' }}>
            <${M.Stack} gap=${4} align="center">
              <${M.Text} fw=${500}>No prompt sets${query ? ' match your search' : ' yet'}.<//>
              ${!query && html`<${M.Text} c="dimmed" size="sm">Create one to get started.<//>`}
            <//>
          <//>`
        : platform
        ? groups.map(({ tenant, sets }) => {
            const open = query.trim() ? true : !!expanded[tenant.id]
            return html`
            <${M.Stack} key=${tenant.id} gap=${0} data-tenant-group=${tenant.id}>
              <${M.UnstyledButton} onClick=${() => toggle(tenant.id)}
                style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  padding: '10px 12px', borderRadius: 'var(--mantine-radius-sm)', background: 'var(--mantine-color-gray-0)' }}>
                <${M.Group} gap="xs" align="center">
                  <${Ic.IconChevronRight} size=${14} style=${{ color: 'var(--mantine-color-gray-6)', transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }} />
                  <${M.Text} fw=${500} style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${tenant.name}<//>
                <//>
                <${M.Text} c="dimmed" style=${{ fontSize: 'var(--mantine-font-size-xs)' }}>${sets.length} set${sets.length === 1 ? '' : 's'}<//>
              <//>
              ${open && html`
                <${M.Stack} gap="sm" pt="sm" pb="xs" style=${{ marginLeft: 10, paddingLeft: 14, borderLeft: '1px solid var(--mantine-color-gray-3)' }}>
                  ${sets.map((s) => html`<${PromptSetCard} key=${s.id} set=${s} showTenant=${false}
                    onOpenInComposer=${() => openInComposer(s)} onView=${() => setViewing(s)}
                    onEdit=${() => setModal({ mode: 'edit', set: s })} onDelete=${() => setConfirm(s)} />`)}
                <//>`}
            <//>`
          })
        : groups.map(({ tenant, sets }) => html`
          <${M.Stack} key=${tenant.id} gap="xs">
            ${sets.map((s) => html`<${PromptSetCard} key=${s.id} set=${s} showTenant=${false}
              onOpenInComposer=${() => openInComposer(s)} onView=${() => setViewing(s)}
              onEdit=${() => setModal({ mode: 'edit', set: s })} onDelete=${() => setConfirm(s)} />`)}
          <//>`)}
      ${modal && html`<${PromptSetModal} mode=${modal.mode} set=${modal.set} platform=${platform} onClose=${() => setModal(null)} onSave=${save} />`}
      ${viewing && html`<${CompiledPromptModal} set=${viewing} onClose=${() => setViewing(null)} />`}
      ${confirm && html`
        <${M.Modal} opened=${true} onClose=${() => setConfirm(null)} size="sm" radius="md" centered title=${html`<${M.Text} fw=${600}>Delete prompt set?<//>`}>
          <${M.Stack} gap="md">
            <${M.Text} size="sm">This permanently removes <b>${confirm.label}</b>. This cannot be undone.<//>
            <${M.Group} justify="flex-end" gap="sm">
              <${M.Button} variant="subtle" color="gray" onClick=${() => setConfirm(null)}>Cancel<//>
              <${M.Button} color="red" onClick=${() => doDelete(confirm)}>Delete<//>
            <//>
          <//>
        <//>`}
    <//>`
}
