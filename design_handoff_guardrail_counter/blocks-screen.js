// Blocks screen (app/admin/prompt-studio/blocks) — Mantine, for the Combined Admin shell.
// New filter system (blocks_filters_DH_June 2026): one prompt set in view at a time
// (header picker is the source of truth), a searchable picker, and Type/Status/search
// unified into ONE filter region offered three ways — Bar (default) / Rail / Popover.
// Reuses the existing Mantine Row / Overview / Donut; adds per-set scoping + empty state.

import { React, html, M, Ic, D, useState, useRef, useEffect, TintBadge } from './harness.js'

const LIMIT = 8000
const relTime = (iso) => { const d = (Date.now() - new Date(iso).getTime()) / 1000; if (d < 60) return 'just now'; if (d < 3600) return `${Math.floor(d / 60)}m ago`; if (d < 86400) return `${Math.floor(d / 3600)}h ago`; return `${Math.floor(d / 86400)}d ago` }
const orderPrefix = (o) => (o && o > 0 ? String(o).padStart(2, '0') : '')
const blockTint = (type) => { const c = D.BLOCK_BADGE[D.BLOCK_TYPE_COLORS[type]]; return { bg: c.bg, fg: c.fg, solid: c.solid } }
const statusTint = (s) => s === 'active'
  ? { bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f', solid: '#2d6a4f' }
  : { bg: 'rgba(73,80,87,0.09)', fg: '#495057', solid: '#adb5bd' }
const TypeBadge = ({ type }) => html`<${TintBadge} tint=${blockTint(type)}>${D.BLOCK_TYPE_LABELS[type]}<//>`

// ── Guardrail counter — active guardrails vs. best-practice ceiling (5) ──
const GUARDRAIL_LIMIT = 5
const guardrailToneFor = (n) => (n > GUARDRAIL_LIMIT ? 'error' : n === GUARDRAIL_LIMIT ? 'warning' : 'neutral')
const GR_META = {
  neutral: { color: 'gray', hint: null },
  warning: { color: 'yellow', hint: 'At the recommended limit' },
  error: { color: 'red', hint: 'Reduce to improve reliability' },
}
function GuardrailMeter({ count, showHint = true }) {
  const tone = guardrailToneFor(count)
  const { color, hint } = GR_META[tone]
  const Icon = tone === 'error' ? Ic.IconAlertTriangle : Ic.IconShieldHalf
  return html`
    <${M.Group} gap="xs" align="center" wrap="nowrap">
      <${M.Badge} color=${color} variant="light" radius="xl" size="lg"
        leftSection=${html`<${Icon} size=${13} style=${{ display: 'block' }} />`}
        styles=${{ root: { textTransform: 'none', fontWeight: 600 } }}>
        Guardrails <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontWeight: 500 }}>${count} / ${GUARDRAIL_LIMIT}</span>
      <//>
      ${showHint && hint && html`<${M.Text} size="xs" c=${tone === 'error' ? 'red.7' : 'dimmed'}>${hint}<//>`}
    <//>`
}

// Prompt sets — many, so the picker is searchable (> 6 → search field).
const PROMPT_SETS = [
  { value: 'sage-prod', label: 'Sage — Production', version: 7, status: 'Live' },
  { value: 'sage-staging', label: 'Sage — Staging', version: 8, status: 'Draft' },
  { value: 'discovery', label: 'Discovery Bot', version: 3, status: 'Live' },
  { value: 'onboarding', label: 'Onboarding Concierge', version: 4, status: 'Live' },
  { value: 'billing', label: 'Billing Support', version: 2, status: 'Draft' },
  { value: 'returns', label: 'Returns & Refunds', version: 5, status: 'Live' },
  { value: 'enterprise', label: 'Enterprise Desk', version: 1, status: 'Draft' },
  { value: 'escalations', label: 'Escalation Triage', version: 6, status: 'Live' },
  { value: 'spanish', label: 'Sage — Español', version: 2, status: 'Draft' },
  { value: 'sandbox', label: 'Sandbox / QA', version: 9, status: 'Draft' },
]

// Block → prompt set scoping. No prompt_set on the fixture, so assign deterministically:
// the live "Sage — Production" set holds the bulk; a couple of others get a few so
// switching the picker visibly swaps the table; the rest are empty (shows the empty state).
const SET_ASSIGNMENT = { b1: 'sage-prod', b2: 'sage-prod', b3: 'sage-prod', b4: 'sage-prod', b5: 'sage-prod', b6: 'sage-prod', b7: 'sage-staging', b8: 'sage-staging', b9: 'discovery' }
const withSet = (b) => ({ ...b, prompt_set: b.prompt_set || SET_ASSIGNMENT[b.id] || 'sage-prod' })

function useOutside(ref, cb, active) {
  useEffect(() => {
    if (!active) return
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) cb() }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [active])
}

/* ── Header — Current Prompt Set picker (searchable) ── */
function PromptSetSelect({ promptSet, setPromptSet }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  useEffect(() => { if (!open) setQ('') }, [open])
  const set = PROMPT_SETS.find((s) => s.value === promptSet) || PROMPT_SETS[0]
  const showSearch = PROMPT_SETS.length > 6
  const matches = PROMPT_SETS.filter((s) => !q.trim() || s.label.toLowerCase().includes(q.trim().toLowerCase()))
  const Pill = ({ status }) => html`<${M.Badge} size="sm" radius="sm" variant="light" color=${status === 'Live' ? 'green' : 'yellow'}>${status}<//>`
  return html`
    <div ref=${ref} style=${{ position: 'relative', minWidth: 280 }}>
      <button type="button" onClick=${() => setOpen((o) => !o)} aria-expanded=${open} aria-haspopup="listbox"
        style=${{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 38, padding: '0 9px 0 13px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style=${{ fontWeight: 600, fontSize: 14, color: 'var(--mantine-color-text)' }}>${set.label}</span>
        <${Pill} status=${set.status} />
        <${Ic.IconChevronRight} size=${15} style=${{ marginLeft: 'auto', color: 'var(--mantine-color-gray-6)', transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      ${open && html`
        <div role="listbox" style=${{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', boxShadow: 'var(--mantine-shadow-md)', padding: 4 }}>
          ${showSearch && html`
            <div style=${{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px 8px', margin: '0 0 4px', borderBottom: '1px solid var(--mantine-color-gray-2)', color: 'var(--mantine-color-gray-5)' }}>
              <${Ic.IconSearch} size=${14} />
              <input autoFocus value=${q} placeholder="Find a prompt set" onChange=${(e) => setQ(e.target.value)}
                style=${{ flex: 1, minWidth: 0, height: 30, border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', padding: '0 10px', fontFamily: 'inherit', fontSize: 13, color: 'var(--mantine-color-text)', outline: 'none' }} />
            </div>`}
          ${matches.map((s) => html`
            <button key=${s.value} type="button" role="option" aria-selected=${s.value === promptSet} onClick=${() => { setPromptSet(s.value); setOpen(false) }}
              onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }} onMouseLeave=${(e) => { e.currentTarget.style.background = 'transparent' }}
              style=${{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 'var(--mantine-radius-sm)', padding: '8px 10px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--mantine-color-text)' }}>
              <span style=${{ fontWeight: 500 }}>${s.label}</span>
              <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: 'var(--mantine-color-gray-5)' }}>v${s.version}</span>
              <span style=${{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <${Pill} status=${s.status} />
                <span style=${{ width: 14, color: 'var(--mantine-color-brand-6)' }}>${s.value === promptSet ? html`<${Ic.IconCheck} size=${14} />` : null}</span>
              </span>
            </button>`)}
          ${matches.length === 0 && html`<div style=${{ padding: '12px 10px', fontSize: 13, color: 'var(--mantine-color-dimmed)', textAlign: 'center' }}>No prompt sets match.</div>`}
        </div>`}
    </div>`
}

/* ── Removable active-filter token ── */
const FilterToken = ({ tint, label, onClear }) => html`
  <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 5px 0 9px', borderRadius: 999, fontSize: 12.5, background: tint.bg, color: tint.fg, border: `1px solid ${tint.fg}3d`, flex: '0 0 auto' }}>
    <span style=${{ width: 7, height: 7, borderRadius: 999, background: tint.solid || tint.fg, flex: '0 0 auto' }} />
    ${label}
    <button onClick=${onClear} aria-label=${`Remove ${label} filter`} style=${{ display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 1, borderRadius: 999 }}><${Ic.IconX} size=${11} /></button>
  </span>`

/* ── Type/Status option rows shared by the Bar popover ── */
function FilterMenuGroups({ q, typeCounts, statusCounts, onPick }) {
  const Row = ({ on, dot, sdot, name, count, onClick }) => html`
    <button type="button" onClick=${onClick}
      onMouseEnter=${(e) => { e.currentTarget.style.background = 'var(--mantine-color-gray-1)' }} onMouseLeave=${(e) => { e.currentTarget.style.background = 'transparent' }}
      style=${{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderRadius: 'var(--mantine-radius-sm)', padding: '7px 9px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--mantine-color-text)' }}>
      ${dot && html`<span style=${{ width: 8, height: 8, borderRadius: 999, background: dot, flex: '0 0 auto' }} />`}
      ${sdot && html`<span style=${{ width: 8, height: 8, borderRadius: 999, background: sdot, flex: '0 0 auto' }} />`}
      <span style=${{ flex: 1 }}>${name}</span>
      <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: 'var(--mantine-color-gray-5)' }}>${count}</span>
      ${on && html`<${Ic.IconCheck} size=${13} style=${{ color: 'var(--mantine-color-brand-6)' }} />`}
    </button>`
  const label = (t) => html`<div style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mantine-color-gray-5)', padding: '6px 9px 3px' }}>${t}</div>`
  return html`
    <${React.Fragment}>
      <div>
        ${label('Type')}
        ${D.ORDERED_BLOCK_TYPES.map((t) => html`<${Row} key=${t} on=${q.typeFilter === t} dot=${blockTint(t).solid} name=${D.BLOCK_TYPE_LABELS[t]} count=${typeCounts[t] || 0} onClick=${() => { q.setTypeFilter(q.typeFilter === t ? 'all' : t); onPick && onPick() }} />`)}
      </div>
      <div style=${{ marginTop: 4, borderTop: '1px solid var(--mantine-color-gray-2)', paddingTop: 2 }}>
        ${label('Status')}
        ${['active', 'disabled'].map((s) => html`<${Row} key=${s} on=${q.statusFilter === s} sdot=${statusTint(s).solid} name=${s === 'active' ? 'Active' : 'Disabled'} count=${statusCounts[s] || 0} onClick=${() => { q.setStatusFilter(q.statusFilter === s ? 'all' : s); onPick && onPick() }} />`)}
      </div>
    <//>`
}

/* ── Layout A: unified filter bar (default) ── */
function FilterBar({ q, typeCounts, statusCounts }) {
  const [pop, setPop] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setPop(false), pop)
  const hasText = q.query.trim().length > 0
  const anyFilter = q.typeFilter !== 'all' || q.statusFilter !== 'all'
  return html`
    <div style=${{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minHeight: 42, padding: '6px 6px 6px 13px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', background: '#fff', flex: '1 1 420px' }}>
      <${Ic.IconSearch} size=${15} style=${{ color: 'var(--mantine-color-gray-5)', flex: '0 0 auto' }} />
      ${q.typeFilter !== 'all' && html`<${FilterToken} tint=${blockTint(q.typeFilter)} label=${D.BLOCK_TYPE_LABELS[q.typeFilter]} onClear=${() => q.setTypeFilter('all')} />`}
      ${q.statusFilter !== 'all' && html`<${FilterToken} tint=${statusTint(q.statusFilter)} label=${q.statusFilter === 'active' ? 'Active' : 'Disabled'} onClear=${() => q.setStatusFilter('all')} />`}
      <input value=${q.query} placeholder=${anyFilter ? 'Search…' : 'Search blocks by title or content'} onChange=${(e) => q.setQuery(e.target.value)}
        style=${{ flex: '1 1 110px', minWidth: 110, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'var(--mantine-color-text)' }} />
      ${hasText && html`<button onClick=${() => q.setQuery('')} aria-label="Clear search" style=${{ display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: 'var(--mantine-color-gray-6)', cursor: 'pointer', padding: 2 }}><${Ic.IconX} size=${13} /></button>`}
      <div ref=${ref} style=${{ position: 'relative', marginLeft: 'auto' }}>
        <button type="button" onClick=${() => setPop((o) => !o)} aria-expanded=${pop} aria-haspopup="menu"
          style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', border: `1px dashed ${pop ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-4)'}`, borderRadius: 999, background: 'transparent', color: pop ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-7)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', flex: '0 0 auto' }}>
          <${Ic.IconPlus} size=${14} /> Filter
        </button>
        ${pop && html`
          <div role="menu" style=${{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, minWidth: 236, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', boxShadow: 'var(--mantine-shadow-md)', padding: 6 }}>
            <${FilterMenuGroups} q=${q} typeCounts=${typeCounts} statusCounts=${statusCounts} onPick=${() => setPop(false)} />
          </div>`}
      </div>
    </div>`
}

/* ── Layout B: faceted rail ── */
function FilterRail({ q, typeCounts, statusCounts, total }) {
  const Opt = ({ on, dot, sdot, name, count, onClick }) => html`
    <button type="button" onClick=${onClick}
      style=${{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', borderRadius: 'var(--mantine-radius-sm)', padding: '7px 9px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        background: on ? 'rgba(45,106,79,0.09)' : 'transparent', color: on ? '#2d6a4f' : 'var(--mantine-color-gray-7)', fontWeight: on ? 600 : 400 }}>
      ${dot && html`<span style=${{ width: 8, height: 8, borderRadius: 999, background: dot, flex: '0 0 auto' }} />`}
      ${sdot && html`<span style=${{ width: 8, height: 8, borderRadius: 999, background: sdot, flex: '0 0 auto' }} />`}
      <span style=${{ flex: 1 }}>${name}</span>
      <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, color: on ? '#2d6a4f' : 'var(--mantine-color-gray-5)' }}>${count}</span>
    </button>`
  const glabel = (t) => html`<div style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mantine-color-gray-5)', margin: '0 0 6px 9px' }}>${t}</div>`
  return html`
    <aside style=${{ position: 'sticky', top: 84, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        ${glabel('Type')}
        <${Opt} on=${q.typeFilter === 'all'} name="All types" count=${total} onClick=${() => q.setTypeFilter('all')} />
        ${D.ORDERED_BLOCK_TYPES.map((t) => html`<${Opt} key=${t} on=${q.typeFilter === t} dot=${blockTint(t).solid} name=${D.BLOCK_TYPE_LABELS[t]} count=${typeCounts[t] || 0} onClick=${() => q.setTypeFilter(q.typeFilter === t ? 'all' : t)} />`)}
      </div>
      <div>
        ${glabel('Status')}
        <${Opt} on=${q.statusFilter === 'all'} name="All" count=${total} onClick=${() => q.setStatusFilter('all')} />
        <${Opt} on=${q.statusFilter === 'active'} sdot=${statusTint('active').solid} name="Active" count=${statusCounts.active || 0} onClick=${() => q.setStatusFilter(q.statusFilter === 'active' ? 'all' : 'active')} />
        <${Opt} on=${q.statusFilter === 'disabled'} sdot=${statusTint('disabled').solid} name="Disabled" count=${statusCounts.disabled || 0} onClick=${() => q.setStatusFilter(q.statusFilter === 'disabled' ? 'all' : 'disabled')} />
      </div>
    </aside>`
}

/* ── Layout C: slim search + Filters popover ── */
function FilterPopover({ q, typeCounts, statusCounts }) {
  const [pop, setPop] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setPop(false), pop)
  const active = (q.typeFilter !== 'all' ? 1 : 0) + (q.statusFilter !== 'all' ? 1 : 0)
  const Chip = ({ on, color, dot, children, onClick }) => html`
    <button type="button" onClick=${onClick}
      style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        border: '1px solid ' + (on ? 'transparent' : 'var(--mantine-color-gray-3)'), background: on ? (color ? color.bg : 'var(--mantine-color-gray-2)') : 'transparent',
        color: on ? (color ? color.fg : 'var(--mantine-color-gray-8)') : 'var(--mantine-color-gray-7)', fontWeight: on ? 600 : 400 }}>
      ${dot && html`<span style=${{ width: 7, height: 7, borderRadius: 999, background: dot }} />`}${children}
    </button>`
  return html`
    <div style=${{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 auto' }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 280px', maxWidth: 360, height: 36, padding: '0 10px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', background: '#fff' }}>
        <${Ic.IconSearch} size=${14} style=${{ color: 'var(--mantine-color-gray-5)' }} />
        <input value=${q.query} placeholder="Search blocks" onChange=${(e) => q.setQuery(e.target.value)} style=${{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'var(--mantine-color-text)' }} />
        ${q.query && html`<button onClick=${() => q.setQuery('')} aria-label="Clear" style=${{ display: 'inline-flex', border: 'none', background: 'transparent', color: 'var(--mantine-color-gray-6)', cursor: 'pointer', padding: 1 }}><${Ic.IconX} size=${12} /></button>`}
      </div>
      <div ref=${ref} style=${{ position: 'relative' }}>
        <button type="button" onClick=${() => setPop((o) => !o)} aria-expanded=${pop} aria-haspopup="menu"
          style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 'var(--mantine-radius-sm)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit',
            border: '1px solid ' + (active ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-3)'), background: '#fff', color: active ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-7)' }}>
          <${Ic.IconFilter} size=${14} /> Filters
          ${active > 0 && html`<span style=${{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--mantine-color-brand-6)', color: '#fff', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10.5 }}>${active}</span>`}
        </button>
        ${pop && html`
          <div role="menu" style=${{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, width: 330, background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)', boxShadow: 'var(--mantine-shadow-md)', padding: 14 }}>
            <div style=${{ marginBottom: 12 }}>
              <div style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mantine-color-gray-5)', marginBottom: 8 }}>Type</div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <${Chip} on=${q.typeFilter === 'all'} onClick=${() => q.setTypeFilter('all')}>All<//>
                ${D.ORDERED_BLOCK_TYPES.map((t) => html`<${Chip} key=${t} on=${q.typeFilter === t} color=${blockTint(t)} dot=${blockTint(t).solid} onClick=${() => q.setTypeFilter(t)}>${D.BLOCK_TYPE_LABELS[t]} <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, opacity: 0.7 }}>${typeCounts[t] || 0}</span><//>`)}
              </div>
            </div>
            <div>
              <div style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mantine-color-gray-5)', marginBottom: 8 }}>Status</div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <${Chip} on=${q.statusFilter === 'all'} onClick=${() => q.setStatusFilter('all')}>All<//>
                <${Chip} on=${q.statusFilter === 'active'} color=${statusTint('active')} onClick=${() => q.setStatusFilter('active')}>Active <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, opacity: 0.7 }}>${statusCounts.active || 0}</span><//>
                <${Chip} on=${q.statusFilter === 'disabled'} color=${statusTint('disabled')} onClick=${() => q.setStatusFilter('disabled')}>Disabled <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, opacity: 0.7 }}>${statusCounts.disabled || 0}</span><//>
              </div>
            </div>
            ${active > 0 && html`<button onClick=${() => { q.setTypeFilter('all'); q.setStatusFilter('all') }} style=${{ marginTop: 12, border: 'none', background: 'transparent', color: 'var(--mantine-color-brand-6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear all filters</button>`}
          </div>`}
      </div>
      ${q.typeFilter !== 'all' && html`<${FilterToken} tint=${blockTint(q.typeFilter)} label=${D.BLOCK_TYPE_LABELS[q.typeFilter]} onClear=${() => q.setTypeFilter('all')} />`}
      ${q.statusFilter !== 'all' && html`<${FilterToken} tint=${statusTint(q.statusFilter)} label=${q.statusFilter === 'active' ? 'Active' : 'Disabled'} onClear=${() => q.setStatusFilter('all')} />`}
    </div>`
}

const ResultMeta = ({ filteredCount, totalCount, allExpanded, onToggleExpand }) => html`
  <${M.Group} gap="sm" align="center" wrap="nowrap">
    <${M.Text} c="dimmed" size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>${filteredCount} / ${totalCount}<//>
    <${M.Button} variant="subtle" color="gray" size="xs" leftSection=${allExpanded ? html`<${Ic.IconChevronsUp} size=${14} />` : html`<${Ic.IconChevronsDown} size=${14} />`} onClick=${onToggleExpand}>${allExpanded ? 'Collapse all' : 'Expand all'}<//>
  <//>`

/* ── Donut + Overview (token distribution) — reused from Blocks.html ── */
function Donut({ byType, total, limit }) {
  const [hover, setHover] = useState(null)
  const size = 200, sw = 28, r = (size - sw) / 2, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2
  const over = total > limit
  let offset = 0
  const segs = D.ORDERED_BLOCK_TYPES.map((t) => { const len = total > 0 ? (byType[t] / total) * C : 0; const seg = { t, len, off: offset, color: blockTint(t).solid }; offset += len; return seg })
  const hv = hover ? { label: D.BLOCK_TYPE_LABELS[hover], tokens: byType[hover], pct: total > 0 ? Math.round((byType[hover] / total) * 100) : 0, color: blockTint(hover).solid } : null
  return html`
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${`${total} of ${limit} tokens used`}>
      <circle cx=${cx} cy=${cy} r=${r} fill="none" stroke="var(--mantine-color-gray-2)" strokeWidth=${sw} />
      ${total > 0 && segs.map((s) => html`
        <circle key=${s.t} cx=${cx} cy=${cy} r=${r} fill="none" stroke=${s.color} strokeWidth=${sw}
          strokeDasharray=${`${s.len} ${C - s.len}`} strokeDashoffset=${-s.off} transform=${`rotate(-90 ${cx} ${cy})`}
          opacity=${hover && hover !== s.t ? 0.28 : 1} onMouseEnter=${() => setHover(s.t)} onMouseLeave=${() => setHover(null)}
          style=${{ cursor: 'pointer', transition: 'opacity 130ms ease' }} />`)}
      ${hv
        ? html`<${React.Fragment}>
            <text x=${cx} y=${cy - 6} textAnchor="middle" style=${{ fontFamily: 'Manrope', fontSize: 15, fontWeight: 600, fill: hv.color }}>${hv.label}</text>
            <text x=${cx} y=${cy + 16} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 13, fill: 'var(--mantine-color-text)' }}>${hv.tokens.toLocaleString()}</text>
            <text x=${cx} y=${cy + 33} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>${hv.pct}% of prompt</text>
          <//>`
        : html`<${React.Fragment}>
            <text x=${cx} y=${cy - 2} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 26, fontWeight: 500, fill: over ? 'var(--mantine-color-red-7)' : 'var(--mantine-color-text)' }}>${total.toLocaleString()}</text>
            <text x=${cx} y=${cy + 18} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>/ ${limit.toLocaleString()} tokens</text>
          <//>`}
    </svg>`
}

function Overview({ blocks, set, onPublish, notify, showGuardrail }) {
  const guardrailCount = blocks.filter((b) => b.type === 'guardrail').length
  const byType = { identity: 0, knowledge: 0, guardrail: 0, process: 0, escalation: 0 }
  for (const b of blocks) byType[b.type] += D.tokensFor(b.body)
  const total = D.ORDERED_BLOCK_TYPES.reduce((s, t) => s + byType[t], 0)
  const lastUpdated = blocks.length ? blocks.reduce((a, b) => (a > b.updated_at ? a : b.updated_at), blocks[0].updated_at) : null
  return html`
    <${M.SimpleGrid} cols=${{ base: 1, sm: 2 }} spacing="md">
      <${M.Card} withBorder radius="md" p="lg" style=${{ background: 'transparent' }}>
        <${M.Stack} gap="md" justify="space-between" style=${{ height: '100%' }}>
          <${M.SimpleGrid} cols=${2} spacing="xs" verticalSpacing=${10}>
            <${M.Text} c="dimmed" size="sm">Status<//><div><${M.Badge} size="sm" radius="sm" variant="light" color=${set.status === 'Live' ? 'green' : 'yellow'}>${set.status}<//></div>
            <${M.Text} c="dimmed" size="sm">Live version<//><${M.Text} size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>v${set.version}<//>
            <${M.Text} c="dimmed" size="sm">Active blocks<//><${M.Text} size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>${blocks.length}<//>
            <${M.Text} c="dimmed" size="sm">Last updated<//><${M.Text} size="sm">${lastUpdated ? relTime(lastUpdated) : '—'}<//>
          <//>
          ${showGuardrail && html`<${GuardrailMeter} count=${guardrailCount} />`}
          <${M.Group} gap="sm">
            <${M.Button} variant="default" leftSection=${html`<${Ic.IconPlus} size=${14} />`} onClick=${() => notify({ color: 'green', title: 'New block', message: 'Composer would open.' })}>New block<//>
            <${M.Button} onClick=${onPublish}>Compile & Publish<//>
          <//>
        <//>
      <//>
      <${M.Card} withBorder radius="md" p="lg" style=${{ background: 'transparent' }}>
        <${M.Stack} gap=${4} align="center" justify="center" style=${{ height: '100%' }}>
          <${Donut} byType=${byType} total=${total} limit=${LIMIT} />
          <${M.Text} c="dimmed" size="xs">Hover a segment for its breakdown<//>
        <//>
      <//>
    <//>`
}

function ExpandPanel({ block, notify }) {
  const lines = block.body.split('\n')
  const preview = lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n…' : '')
  return html`
    <${M.SimpleGrid} cols=${{ base: 1, md: 2 }} spacing="lg" p="md" style=${{ background: 'var(--mantine-color-gray-0)' }}>
      <${M.Stack} gap="sm">
        <${M.Text} tt="uppercase" fw=${600} size="xs" c="dimmed" style=${{ letterSpacing: '0.08em' }}>Block content<//>
        <${M.Text} component="pre" style=${{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12.5, lineHeight: 1.6 }}>${preview}<//>
        <${M.Button} variant="default" size="xs" w="fit-content" leftSection=${html`<${Ic.IconPencil} size=${14} />`} onClick=${() => notify({ color: 'green', title: 'Edit block', message: block.title })}>Edit<//>
      <//>
      <${M.SimpleGrid} cols=${2} spacing="md" style=${{ alignContent: 'start' }}>
        <div><${M.Text} c="dimmed" size="xs">Tokens<//><${M.Text} size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>${D.tokensFor(block.body).toLocaleString()}<//></div>
        <div><${M.Text} c="dimmed" size="xs">Author<//><${M.Text} size="sm">${block.author || '—'}<//></div>
        <div><${M.Text} c="dimmed" size="xs">Updated<//><${M.Text} size="sm">${relTime(block.updated_at)}<//></div>
        <div><${M.Text} c="dimmed" size="xs">Order<//><${M.Text} size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>${block.order && block.order > 0 ? block.order : '—'}<//></div>
      <//>
    <//>`
}

function Row({ block, selected, expanded, maxTok, onSel, onToggleStatus, onToggleExpand, onCopy, copied, notify }) {
  const tok = D.tokensFor(block.body)
  const barPct = maxTok > 0 ? (tok / maxTok) * 100 : 0
  return html`
    <${React.Fragment}>
      <${M.Table.Tr}>
        <${M.Table.Td}><${M.Checkbox} size="xs" checked=${selected} onChange=${() => onSel(block.id)} aria-label="Select" /><//>
        <${M.Table.Td}><${M.ActionIcon} variant="subtle" color="gray" size="sm" onClick=${() => onToggleExpand(block.id)} aria-label="Expand"><${Ic.IconChevronRight} size=${14} style=${{ transition: 'transform 150ms', transform: expanded ? 'rotate(90deg)' : 'none' }} /><//><//>
        <${M.Table.Td}>
          <${M.Group} gap=${6} align="baseline">
            ${orderPrefix(block.order) && html`<${M.Text} span c="dimmed" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 }}>${orderPrefix(block.order)}<//>`}
            <${M.Text} fw=${500} size="sm">${block.title}<//>
          <//>
          <${M.Text} c="dimmed" size="xs">Updated ${relTime(block.updated_at)}<//>
        <//>
        <${M.Table.Td}><${TypeBadge} type=${block.type} /><//>
        <${M.Table.Td}>
          <${M.Group} gap=${8} wrap="nowrap" align="center">
            <${M.Text} size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', minWidth: 42 }}>${tok.toLocaleString()}<//>
            <div style=${{ width: 70, height: 5, borderRadius: 3, background: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}>
              <div style=${{ width: `${barPct}%`, height: '100%', background: blockTint(block.type).solid }} />
            </div>
          <//>
        <//>
        <${M.Table.Td}>
          <${M.Group} gap=${8} wrap="nowrap" align="center">
            <${M.Switch} size="sm" checked=${block.status === 'active'} onChange=${(e) => onToggleStatus(block.id, e.currentTarget.checked)} />
            <${M.Text} size="sm" c=${block.status === 'active' ? undefined : 'dimmed'}>${block.status === 'active' ? 'Active' : 'Disabled'}<//>
          <//>
        <//>
        <${M.Table.Td}>
          <${M.Group} gap=${2} wrap="nowrap">
            <${M.Tooltip} label=${copied ? 'Copied!' : 'Copy body'}><${M.ActionIcon} variant="subtle" color=${copied ? 'green' : 'gray'} onClick=${() => onCopy(block)} aria-label="Copy">${copied ? html`<${Ic.IconCheck} size=${16} />` : html`<${Ic.IconClipboard} size=${16} />`}<//><//>
            <${M.Tooltip} label="Edit"><${M.ActionIcon} variant="subtle" color="gray" onClick=${() => notify({ color: 'green', title: 'Edit block', message: block.title })} aria-label="Edit"><${Ic.IconPencil} size=${16} /><//><//>
            <${M.Tooltip} label="Duplicate"><${M.ActionIcon} variant="subtle" color="gray" aria-label="Duplicate"><${Ic.IconCopy} size=${16} /><//><//>
            <${M.Tooltip} label="Delete"><${M.ActionIcon} variant="subtle" color="red" aria-label="Delete"><${Ic.IconTrash} size=${16} /><//><//>
          <//>
        <//>
      <//>
      ${expanded && html`<${M.Table.Tr}><${M.Table.Td} colSpan=${7} p=${0}><${ExpandPanel} block=${block} notify=${notify} /><//><//>`}
    <//>`
}

function TweaksPanel({ filterLayout, setFilterLayout, startHidden, setStartHidden, animate, setAnimate, showGuardrail, setShowGuardrail }) {
  const [open, setOpen] = useState(false)
  return html`
    <div style=${{ position: 'fixed', right: 16, bottom: 16, zIndex: 500 }}>
      ${open && html`
        <${M.Paper} withBorder shadow="md" radius="md" p="md" mb=${8} style=${{ width: 256, background: '#fff' }}>
          <${M.Stack} gap="sm">
            <${M.Group} justify="space-between"><${M.Text} fw=${600} size="sm">Tweaks<//><${M.ActionIcon} variant="subtle" color="gray" size="sm" onClick=${() => setOpen(false)}><${Ic.IconX} size=${15} /><//><//>
            <${M.Stack} gap=${4}>
              <${M.Text} size="xs" c="dimmed">Filter layout<//>
              <${M.SegmentedControl} size="xs" fullWidth value=${filterLayout} onChange=${setFilterLayout}
                data=${[{ value: 'bar', label: 'Bar' }, { value: 'rail', label: 'Rail' }, { value: 'popover', label: 'Popover' }]} />
            <//>
            <${M.Switch} size="sm" label="Guardrail counter" checked=${showGuardrail} onChange=${(e) => setShowGuardrail(e.currentTarget.checked)} />
            <${M.Switch} size="sm" label="Start summary hidden" checked=${startHidden} onChange=${(e) => setStartHidden(e.currentTarget.checked)} />
            <${M.Switch} size="sm" label="Animate collapse" checked=${animate} onChange=${(e) => setAnimate(e.currentTarget.checked)} />
          <//>
        <//>`}
      <${M.Button} size="xs" variant=${open ? 'filled' : 'default'} leftSection=${html`<${Ic.IconAdjustments} size=${14} />`} onClick=${() => setOpen((o) => !o)}>Tweaks<//>
    </div>`
}

export function Blocks({ notify }) {
  const [items, setItems] = useState(() => D.BLOCKS.map(withSet))
  const [promptSet, setPromptSet] = useState('sage-prod')
  const [selected, setSelected] = useState(new Set())
  const [expanded, setExpanded] = useState(new Set())
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [copiedId, setCopiedId] = useState(null)
  // Tweaks
  const [filterLayout, setFilterLayout] = useState('bar')
  const [animate, setAnimate] = useState(true)
  const [startHidden, setStartHidden] = useState(false)
  const [showGuardrail, setShowGuardrail] = useState(true)
  const [summaryHidden, setSummaryHidden] = useState(false)

  // Switching the set resets transient filters / selection / expansion (one set in view).
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    setTypeFilter('all'); setStatusFilter('all'); setQuery(''); setSelected(new Set()); setExpanded(new Set())
  }, [promptSet])
  useEffect(() => { setSummaryHidden(startHidden) }, [startHidden])

  const set = PROMPT_SETS.find((s) => s.value === promptSet) || PROMPT_SETS[0]
  const inSet = items.filter((b) => b.prompt_set === promptSet)
  const typeCounts = {}; for (const b of inSet) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1
  const statusCounts = { active: 0, disabled: 0 }; for (const b of inSet) statusCounts[b.status] = (statusCounts[b.status] || 0) + 1

  const activeBlocks = inSet.filter((b) => b.status === 'active')
  const guardrailActiveCount = activeBlocks.filter((b) => b.type === 'guardrail').length
  const filtered = inSet.filter((b) => {
    if (typeFilter !== 'all' && b.type !== typeFilter) return false
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (query.trim()) { const q = query.trim().toLowerCase(); if (!`${b.title} ${b.body}`.toLowerCase().includes(q)) return false }
    return true
  })
  const maxTok = filtered.length ? Math.max(0, ...filtered.map((b) => D.tokensFor(b.body))) : 0
  const allExpanded = filtered.length > 0 && filtered.every((b) => expanded.has(b.id))
  const filteredSel = filtered.filter((b) => selected.has(b.id)).length
  const allSel = filtered.length > 0 && filteredSel === filtered.length
  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || query.trim().length > 0

  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpand = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleStatus = (id, checked) => setItems((it) => it.map((b) => (b.id === id ? { ...b, status: checked ? 'active' : 'disabled' } : b)))
  const onToggleExpandAll = () => allExpanded ? setExpanded(new Set()) : setExpanded(new Set(filtered.map((b) => b.id)))
  const onCopy = (b) => { navigator.clipboard?.writeText(b.body); setCopiedId(b.id); setTimeout(() => setCopiedId(null), 2000) }
  const toggleSelAll = () => setSelected((prev) => { const n = new Set(prev); if (filteredSel > 0) filtered.forEach((b) => n.delete(b.id)); else filtered.forEach((b) => n.add(b.id)); return n })
  const clearFilters = () => { setTypeFilter('all'); setStatusFilter('all'); setQuery('') }
  const onPublish = () => notify({ color: 'green', title: 'Prompt published', message: `Version ${D.MASTER_PROMPT_VERSION + 1}` })

  const summaryTokens = activeBlocks.reduce((s, b) => s + D.tokensFor(b.body), 0)
  const q = { query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter }
  const meta = html`<${ResultMeta} filteredCount=${filtered.length} totalCount=${inSet.length} allExpanded=${allExpanded} onToggleExpand=${onToggleExpandAll} />`

  const bulkBar = selected.size > 0 ? html`
    <${M.Paper} withBorder radius="md" p="xs" style=${{ background: 'var(--mantine-color-gray-0)' }}>
      <${M.Group} justify="space-between" wrap="wrap" gap="sm">
        <${M.Text} fw=${500} size="sm" pl=${8}>${selected.size} selected<//>
        <${M.Group} gap=${6}>
          <${M.Button} size="xs" variant="default" onClick=${() => { setItems((it) => it.map((b) => selected.has(b.id) ? { ...b, status: 'active' } : b)); setSelected(new Set()) }}>Enable<//>
          <${M.Button} size="xs" variant="default" onClick=${() => { setItems((it) => it.map((b) => selected.has(b.id) ? { ...b, status: 'disabled' } : b)); setSelected(new Set()) }}>Disable<//>
          <${M.Button} size="xs" variant="default" color="red" onClick=${() => { setItems((it) => it.filter((b) => !selected.has(b.id))); setSelected(new Set()) }}>Delete<//>
          <${M.ActionIcon} variant="subtle" color="gray" onClick=${() => setSelected(new Set())} aria-label="Clear"><${Ic.IconX} size=${15} /><//>
        <//>
      <//>
    <//>` : null

  const table = html`
    <${M.Card} withBorder radius="md" p=${0} style=${{ background: 'transparent', overflow: 'hidden' }}>
      <${M.Table} verticalSpacing="sm" horizontalSpacing="md">
        <${M.Table.Thead}>
          <${M.Table.Tr}>
            <${M.Table.Th} style=${{ width: 40 }}><${M.Checkbox} size="xs" checked=${allSel} indeterminate=${filteredSel > 0 && !allSel} onChange=${toggleSelAll} aria-label="Select all" /><//>
            <${M.Table.Th} style=${{ width: 28 }} /><${M.Table.Th}>Title<//><${M.Table.Th}>Type<//><${M.Table.Th}>Tokens<//><${M.Table.Th}>Status<//><${M.Table.Th}>Actions<//>
          <//>
        <//>
        <${M.Table.Tbody}>
          ${filtered.map((b) => html`<${Row} key=${b.id} block=${b} selected=${selected.has(b.id)} expanded=${expanded.has(b.id)} maxTok=${maxTok} copied=${copiedId === b.id}
            onSel=${toggleSel} onToggleStatus=${toggleStatus} onToggleExpand=${toggleExpand} onCopy=${onCopy} notify=${notify} />`)}
        <//>
      <//>
    <//>`

  const emptyState = html`
    <${M.Paper} withBorder radius="md" p="xl" style=${{ background: 'var(--mantine-color-gray-0)', borderStyle: 'dashed' }}>
      <${M.Stack} gap=${6} align="center">
        <${M.Text} fw=${600}>No blocks to show<//>
        <${M.Text} c="dimmed" size="sm">${inSet.length === 0 ? `“${set.label}” has no blocks yet.` : 'No blocks in this set match your filters.'}<//>
        ${hasFilters && inSet.length > 0 && html`<${M.Button} variant="subtle" color="gray" size="xs" onClick=${clearFilters}>Clear filters<//>`}
        ${inSet.length === 0 && html`<${M.Button} size="xs" mt=${4} onClick=${() => notify({ color: 'green', title: 'New block', message: 'Composer would open.' })}>New block<//>`}
      <//>
    <//>`

  const body = filtered.length === 0 ? emptyState : table

  return html`
    <${M.Box} data-screen-label="Prompt Studio · Blocks">
      <${M.Group} justify="space-between" align="center" px="xl" py="md" wrap="wrap" gap="sm" style=${{ borderBottom: '1px solid var(--mantine-color-gray-2)', background: '#fff', position: 'sticky', top: 0, zIndex: 30 }}>
        <${M.Group} gap="sm" align="center">
          <${M.Text} c="dimmed" size="xs" tt="uppercase" fw=${600} style=${{ letterSpacing: '0.08em' }}>Current Prompt Set<//>
          <${PromptSetSelect} promptSet=${promptSet} setPromptSet=${setPromptSet} />
        <//>
      <//>

      <${M.Box} p="xl">
        <${M.Stack} gap="lg">
          ${!summaryHidden && html`
            <${M.Group} justify="flex-end"><${M.Button} variant="subtle" color="gray" size="xs" leftSection=${html`<${Ic.IconChevronsUp} size=${14} />`} onClick=${() => setSummaryHidden(true)}>Hide summary<//><//>`}
          ${summaryHidden
            ? html`<${M.Paper} withBorder radius="md" p="sm" style=${{ background: 'var(--mantine-color-gray-0)' }}>
                <${M.Group} justify="space-between" wrap="wrap" gap="sm">
                  <${M.Group} gap="lg" wrap="wrap">
                    <${M.Text} fw=${600} size="sm">Prompt summary<//>
                    <${M.Group} gap=${6}><span style=${{ width: 8, height: 8, borderRadius: 999, background: set.status === 'Live' ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-yellow-6)' }} /><${M.Text} size="sm" c="dimmed">${set.status}<//><//>
                    <${M.Text} size="sm" c="dimmed"><b>${activeBlocks.length}</b> active blocks<//>
                    <${M.Text} size="sm" c="dimmed"><b>${summaryTokens.toLocaleString()}</b> tokens<//>
                    ${showGuardrail && html`<${GuardrailMeter} count=${guardrailActiveCount} showHint=${false} />`}
                  <//>
                  <${M.Button} variant="subtle" color="gray" size="xs" leftSection=${html`<${Ic.IconChevronsDown} size=${14} />`} onClick=${() => setSummaryHidden(false)}>Show summary<//>
                <//>
              <//>`
            : html`<${M.Box} style=${{ transition: animate ? 'opacity 200ms' : 'none' }}><${Overview} blocks=${activeBlocks} set=${set} onPublish=${onPublish} notify=${notify} showGuardrail=${showGuardrail} /><//>`}

          ${filterLayout === 'rail'
            ? html`
              <div style=${{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 0 }}>
                <div class="blocks-rail-grid">
                  <${FilterRail} q=${q} typeCounts=${typeCounts} statusCounts=${statusCounts} total=${inSet.length} />
                  <${M.Stack} gap="md">
                    <${M.Group} justify="space-between" align="center" wrap="wrap" gap="sm">
                      <div style=${{ display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 280px', maxWidth: 380, height: 38, padding: '0 11px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-sm)', background: '#fff' }}>
                        <${Ic.IconSearch} size=${14} style=${{ color: 'var(--mantine-color-gray-5)' }} />
                        <input value=${query} placeholder="Search blocks in this set" onChange=${(e) => setQuery(e.target.value)} style=${{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'var(--mantine-color-text)' }} />
                        ${query && html`<button onClick=${() => setQuery('')} aria-label="Clear" style=${{ display: 'inline-flex', border: 'none', background: 'transparent', color: 'var(--mantine-color-gray-6)', cursor: 'pointer', padding: 1 }}><${Ic.IconX} size=${12} /></button>`}
                      </div>
                      ${meta}
                    <//>
                    ${bulkBar}
                    ${body}
                  <//>
                </div>
              </div>`
            : html`
              <${M.Group} justify="space-between" align="flex-start" wrap="wrap" gap="md">
                ${filterLayout === 'popover'
                  ? html`<${FilterPopover} q=${q} typeCounts=${typeCounts} statusCounts=${statusCounts} />`
                  : html`<${FilterBar} q=${q} typeCounts=${typeCounts} statusCounts=${statusCounts} />`}
                ${meta}
              <//>
              ${bulkBar}
              ${body}`}
        <//>
      <//>
      <${TweaksPanel} filterLayout=${filterLayout} setFilterLayout=${setFilterLayout} startHidden=${startHidden} setStartHidden=${setStartHidden} animate=${animate} setAnimate=${setAnimate} showGuardrail=${showGuardrail} setShowGuardrail=${setShowGuardrail} />
    <//>`
}
