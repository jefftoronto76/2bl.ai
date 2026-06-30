// Appearance section for tenant Settings — Storefront + Admin theme editors with
// live preview, sync status, and change history. Split out to keep the Settings
// screen file manageable. Ported from tenant-admin/settings.jsx (WebsiteAppearance).

import { React, html, M, Ic, D, useState } from './harness.js'

/* ── Editor layout CSS (injected once) ──
   The live preview must stay visible WHILE you edit. Mantine's SimpleGrid
   md-breakpoint is viewport-based (≥992px), but this editor lives inside a
   narrow Settings accordion panel, so it collapsed to one column and pushed the
   preview off-screen below the controls. A container query keys the two-up
   layout to the PANEL width instead, and the preview is sticky so it tracks edits:
     • narrow panel → preview pinned on top, controls scroll beneath it
     • wide panel   → preview pinned to the right, controls scroll on the left ── */
if (typeof document !== 'undefined' && !document.getElementById('appx-css')) {
  const s = document.createElement('style'); s.id = 'appx-css'
  s.textContent = `
    .appx-editor { container-type: inline-size; }
    .appx-grid { display: flex; flex-direction: column; gap: 18px; align-items: stretch; }
    .appx-controls { min-width: 0; }
    .appx-preview { position: sticky; top: 8px; align-self: start; order: -1; min-width: 0; }
    @container (min-width: 680px) {
      .appx-grid { flex-direction: row; }
      .appx-controls { flex: 1 1 0; }
      .appx-preview { order: 0; flex: 1 1 0; }
    }`
  document.head.appendChild(s)
}

/* ── Paper-stack derivation — the warm "paper" look is a relationship between
   surfaces derived from one background, not a texture. ── */
const hx2rgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h || '000000', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const rgb2hx = (r, g, b) => { const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b) }
export const mixHex = (a, b, amt) => { const A = hx2rgb(a), B = hx2rgb(b); return rgb2hx(A[0] + (B[0] - A[0]) * amt, A[1] + (B[1] - A[1]) * amt, A[2] + (B[2] - A[2]) * amt) }
const PAPER_WARM = '#c8a87e'
const paperStack = (bg, effect, ink) => effect
  ? { surface: mixHex(bg, PAPER_WARM, 0.10), sunken: mixHex(bg, PAPER_WARM, 0.20), line: mixHex(bg, PAPER_WARM, 0.42) }
  : { surface: bg, sunken: bg, line: mixHex(bg, ink || '#1a1917', 0.10) }

const fmtHistDate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtSyncDate = (iso) => { if (!iso) return null; const d = new Date(iso); return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }) }

const SWATCHES = ['#FAF6EE', '#ffffff', '#f9f8f5', '#2d6a4f', '#1c7ed6', '#C8542E', '#1a1917', '#6b6a64', '#3a3935']
const ColorRow = ({ label, description, value, onChange, disabled }) => html`
  <${M.ColorInput} label=${label} description=${description} value=${value} onChange=${onChange} disabled=${disabled}
    format="hex" swatches=${SWATCHES} withinPortal styles=${{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }} />`

function SyncStatus({ sync }) {
  const synced = fmtSyncDate(sync && sync.defaults_synced_at)
  const warnings = (sync && sync.branding_warnings) || null
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0
  return html`
    <${M.Card} withBorder radius="md" p="md" style=${{ background: 'transparent' }}>
      <${M.Stack} gap="sm">
        <${M.Group} justify="space-between" align="baseline">
          <${M.Text} fw=${600} size="sm">Sync status<//>
          <${M.Text} c="dimmed" tt="uppercase" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.12em' }}>Read-only<//>
        <//>
        <${M.Group} gap="xs" align="baseline" wrap="nowrap">
          <${M.Text} c="dimmed" size="sm" style=${{ minWidth: 92 }}>Last synced<//>
          ${synced
            ? html`<${M.Text} size="sm" style=${{ fontVariantNumeric: 'tabular-nums' }}>${synced}<//>`
            : html`<${M.Group} gap=${6}><span style=${{ width: 7, height: 7, borderRadius: 999, background: 'var(--mantine-color-gray-5)' }} /><${M.Text} size="sm" c="dimmed">Never synced<//><//>`}
        <//>
        <${M.Group} gap="xs" align="flex-start" wrap="nowrap">
          <${M.Text} c="dimmed" size="sm" style=${{ minWidth: 92, marginTop: 2 }}>Warnings<//>
          ${hasWarnings
            ? html`<${M.Stack} gap=${6} style=${{ flex: 1 }}>
                ${warnings.map((w, i) => {
                  const tok = typeof w === 'string' ? w : w.token
                  const msg = typeof w === 'string' ? null : w.message
                  return html`<${M.Group} key=${i} gap=${7} wrap="nowrap" align="flex-start">
                    <${Ic.IconAlertTriangle} size=${14} style=${{ color: '#b07c0c', flex: '0 0 auto', marginTop: 2 }} />
                    <${M.Text} size="sm"><code style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12, background: 'var(--mantine-color-gray-1)', padding: '1px 5px', borderRadius: 4 }}>${tok}</code>${msg ? html` <${M.Text} span c="dimmed" size="sm">${msg}<//>` : null}<//>
                  <//>`
                })}
              <//>`
            : html`<${M.Group} gap=${6}><${Ic.IconCheck} size=${14} style=${{ color: 'var(--mantine-color-green-7)' }} /><${M.Text} size="sm" c="dimmed">No warnings<//><//>`}
        <//>
      <//>
    <//>`
}

function AppearanceHistory({ rows }) {
  rows = rows || []
  return html`
    <${M.Card} withBorder radius="md" p="md" style=${{ background: 'transparent' }}>
      <${M.Stack} gap="sm">
        <${M.Group} justify="space-between" align="baseline">
          <${M.Text} fw=${600} size="sm">Change history<//>
          <${M.Text} c="dimmed" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 }}>${rows.length} ${rows.length === 1 ? 'change' : 'changes'}<//>
        <//>
        ${rows.length === 0
          ? html`<${M.Text} c="dimmed" size="sm">No changes recorded yet.<//>`
          : html`<${M.Stack} gap=${0}>
              ${rows.map((h, idx) => {
                const c = D.avatarColor(h.actor)
                const DV = ({ kind, value }) => kind === 'color'
                  ? html`<${M.Group} gap=${5} wrap="nowrap"><span style=${{ width: 13, height: 13, borderRadius: 3, background: value, border: '1px solid rgba(0,0,0,0.1)' }} /><${M.Text} span size="sm" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>${value}<//><//>`
                  : html`<${M.Text} span size="sm" style=${kind === 'font' ? { fontFamily: 'var(--mantine-font-family-monospace)' } : undefined}>${value}<//>`
                return html`<${M.Group} key=${h.id} gap="sm" wrap="nowrap" align="flex-start" py=${10} style=${{ borderTop: idx === 0 ? 'none' : '1px solid var(--mantine-color-gray-2)' }}>
                  <span style=${{ width: 28, height: 28, flex: '0 0 28px', borderRadius: 999, background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>${D.initials(h.actor)}</span>
                  <${M.Stack} gap=${3} style=${{ flex: 1, minWidth: 0 }}>
                    <${M.Text} size="sm"><b>${h.actor}</b> changed <b>${h.field}</b><//>
                    <${M.Group} gap=${8} wrap="nowrap" align="center">
                      <${DV} kind=${h.kind} value=${h.from} />
                      <${Ic.IconChevronRight} size=${13} style=${{ color: 'var(--mantine-color-gray-5)', flex: '0 0 auto' }} />
                      <${DV} kind=${h.kind} value=${h.to} />
                    <//>
                  <//>
                  <${M.Text} c="dimmed" title=${h.email} style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, whiteSpace: 'nowrap' }}>${fmtHistDate(h.at)}<//>
                <//>`
              })}
            <//>`}
      <//>
    <//>`
}

function StorefrontPreview({ t }) {
  const [note, setNote] = useState(false)
  const headFont = `"${t.font_primary}", serif`, bodyFont = `"${t.font_secondary}", sans-serif`
  const btnBg = t.accent_buttons ? t.accent : '#1a1917'
  const ps = paperStack(t.background, t.paper_effect, t.heading)
  return html`
    <${M.Stack} gap=${6}>
      <${M.Text} c="dimmed" tt="uppercase" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.14em' }}>Live preview<//>
      <div style=${{ background: t.background, fontFamily: bodyFont, borderRadius: 12, border: '1px solid var(--mantine-color-gray-3)', padding: 22 }}>
        <h1 style=${{ fontFamily: headFont, color: t.heading, fontSize: 28, lineHeight: 1.12, margin: 0, fontWeight: 500 }}>Build a second brain that talks.</h1>
        <p style=${{ color: t.lede, fontSize: 15, margin: '13px 0 0', lineHeight: 1.5 }}>Sage answers your visitors in your voice, around the clock — and books the ones who are ready.</p>
        <p style=${{ color: t.body, fontSize: 13.5, margin: '13px 0 0', lineHeight: 1.6 }}>Every conversation is grounded in the notes, prompts, and parameters you control here. <a href="#" onClick=${(e) => e.preventDefault()} style=${{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>See how it works</a>.</p>
        <div style=${{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <span style=${{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 17px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Start a chat</span>
          <span style=${{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 17px', borderRadius: 6, background: 'transparent', color: t.accent, border: `1px solid ${t.accent}`, fontSize: 13.5, fontWeight: 600 }}>Learn more</span>
        </div>
        <div style=${{ marginTop: 20, paddingTop: 12, borderTop: `1px dashed ${mixHex(t.background, t.heading, 0.18)}` }}>
          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: mixHex(t.background, t.heading, 0.5) }}>Surface sample</span>
            <button type="button" onClick=${() => setNote((v) => !v)} style=${{ border: 0, background: 'transparent', padding: 0, font: 'inherit', fontSize: 11.5, color: t.accent, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>${note ? 'Hide' : "What's this?"}</button>
          </div>
          ${note && html`<p style=${{ fontSize: 12, lineHeight: 1.55, margin: '8px 0 0', color: mixHex(t.background, t.heading, 0.62) }}>A demo surface — cards, chips, and borders take their tone from your <b>Background</b>. Toggle <b>Paper effect</b> to watch them gain or lose depth.</p>`}
          <div style=${{ marginTop: 12, background: ps.surface, border: `1px solid ${ps.line}`, borderRadius: 12, padding: 16, transition: 'background 160ms ease, border-color 160ms ease' }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style=${{ width: 30, height: 30, borderRadius: '50%', background: ps.sunken, display: 'grid', placeItems: 'center', color: t.body, fontSize: 11.5, fontWeight: 700, flex: '0 0 auto' }}>SC</span>
              <div style=${{ minWidth: 0 }}>
                <div style=${{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Sarah Chen</div>
                <div style=${{ color: t.lede, fontSize: 12 }}>Summit Realty</div>
              </div>
            </div>
            <p style=${{ color: t.body, fontSize: 13.5, margin: '11px 0 0', lineHeight: 1.55 }}>"Sage books the right people while I sleep — and sounds like me doing it."</p>
            <div style=${{ display: 'flex', gap: 8, marginTop: 12 }}>
              <span style=${{ background: ps.sunken, border: `1px solid ${ps.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: t.body }}>Active</span>
              <span style=${{ background: ps.sunken, border: `1px solid ${ps.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: t.body }}>Pro plan</span>
            </div>
          </div>
        </div>
      </div>
    <//>`
}

const SERIF_FONTS = ['Newsreader', 'Playfair Display', 'Georgia', 'IBM Plex Serif', 'Cormorant Garamond']
const fontStack = (name, fallback) => `"${name}", ${SERIF_FONTS.includes(name) ? 'serif' : fallback}`

function AdminPreview({ t }) {
  const headFont = fontStack(t.font_primary, 'sans-serif')
  const bodyFont = fontStack(t.font_secondary, 'sans-serif')
  const monoFont = `"${t.font_mono}", monospace`
  const btnBg = t.accent_buttons ? t.accent : '#1a1917'
  // Admin renders flat — surfaces derive a faint step from the content background.
  const surface = mixHex(t.background, t.heading, 0.035)
  const line = mixHex(t.background, t.heading, 0.13)
  const brandText = mixHex(t.sidebar_text, '#ffffff', 0.55)
  const navItems = ['Inbound', 'Members', 'Composer', 'Settings']
  return html`
    <${M.Stack} gap=${6}>
      <${M.Text} c="dimmed" tt="uppercase" style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.14em' }}>Live preview<//>
      <div style=${{ overflow: 'hidden', background: t.background, fontFamily: bodyFont, borderRadius: 12, border: '1px solid var(--mantine-color-gray-3)' }}>
        <div style=${{ display: 'flex', minHeight: 344 }}>
          <div style=${{ width: 140, flex: '0 0 140px', background: t.sidebar_bg, padding: '15px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style=${{ marginBottom: 13, padding: '0 5px' }}>
              <div style=${{ fontFamily: headFont, color: brandText, fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>Second Brain</div>
              <div style=${{ fontFamily: monoFont, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.accent, marginTop: 3 }}>Admin</div>
            </div>
            ${navItems.map((n, i) => html`<span key=${n} style=${{ display: 'block', padding: '7px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: i === 1 ? 500 : 400, color: i === 1 ? '#fff' : t.sidebar_text, background: i === 1 ? t.accent : 'transparent' }}>${n}</span>`)}
          </div>
          <div style=${{ flex: 1, minWidth: 0, padding: '18px 18px 20px' }}>
            <h1 style=${{ fontFamily: headFont, color: t.heading, fontSize: 21, lineHeight: 1.15, margin: 0, fontWeight: 600 }}>Members</h1>
            <p style=${{ color: t.muted, fontSize: 12.5, margin: '5px 0 0', lineHeight: 1.5 }}>Manage who can access this workspace.</p>
            <div style=${{ marginTop: 14, background: surface, border: `1px solid ${line}`, borderRadius: 12, padding: 14, transition: 'background 160ms ease, border-color 160ms ease' }}>
              <div style=${{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style=${{ width: 30, height: 30, borderRadius: '50%', background: t.accent, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, flex: '0 0 auto' }}>JL</span>
                <div style=${{ minWidth: 0, flex: 1 }}>
                  <div style=${{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Jeff Lougheed</div>
                  <div style=${{ color: t.muted, fontSize: 12 }}>jeff@naturalresource.co</div>
                </div>
                <span style=${{ background: mixHex(t.background, t.accent, 0.12), color: t.accent, border: `1px solid ${mixHex(t.background, t.accent, 0.3)}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>Owner</span>
              </div>
              <p style=${{ color: t.body, fontSize: 13, margin: '11px 0 0', lineHeight: 1.55 }}>Owners can edit branding, prompts, and billing for this workspace.</p>
            </div>
            <div style=${{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
              <span style=${{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 13, fontWeight: 600 }}>Invite member</span>
              <span style=${{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: 'transparent', color: t.body, border: `1px solid ${mixHex(t.background, t.heading, 0.2)}`, fontSize: 13, fontWeight: 600 }}>Export</span>
            </div>
          </div>
        </div>
      </div>
    <//>`
}

function ThemeEditor({ init, Preview, history, sync, notify, savedMsg, target }) {
  const [t, setT] = useState({ ...init })
  const [saving, setSaving] = useState(false)
  const set = (patch) => setT((d) => ({ ...d, ...patch }))
  const reset = () => setT({ ...init })
  const save = () => { setSaving(true); setTimeout(() => { setSaving(false); notify && notify({ color: 'green', title: 'Appearance saved', message: savedMsg }) }, 500) }
  const isAdmin = target === 'admin'
  const fontData = isAdmin ? D.ADMIN_FONT_OPTIONS : D.THEME_FONT_OPTIONS
  // Field helpers — each control binds a token key to its (admin- or storefront-) label.
  const color = (label, description, key) => html`<${ColorRow} label=${label} description=${description} value=${t[key] || ''} onChange=${(v) => set({ [key]: v })} disabled=${saving} />`
  const font = (label, description, key) => html`<${M.Select} label=${label} description=${description} data=${fontData} value=${t[key]} onChange=${(v) => set({ [key]: v })} allowDeselect=${false} withinPortal />`
  const accentBtns = (label) => html`<${M.Switch} checked=${t.accent_buttons} onChange=${(e) => set({ accent_buttons: e.currentTarget.checked })} disabled=${saving}
    label=${label} description="When off, primary buttons stay neutral (ink)." />`
  const cardStyle = { background: 'transparent' }

  // ── Admin: purpose-built groups — labels name real admin chrome (sidebar, nav, content). ──
  const adminControls = html`<${React.Fragment}>
    <${M.Card} withBorder radius="md" p="md" style=${cardStyle}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">Accent<//>
        ${color('Accent', 'Active nav, primary buttons, links, and the ADMIN kicker.', 'accent')}
        ${color('Accent (hover)', 'Hover state for nav items and accented buttons.', 'accent_hover')}
        ${accentBtns('Use accent on buttons')}
      <//>
    <//>
    <${M.Card} withBorder radius="md" p="md" style=${cardStyle}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">Sidebar<//>
        ${color('Sidebar background', 'The dark navigation rail behind the menu.', 'sidebar_bg')}
        ${color('Sidebar text', 'Inactive navigation item labels.', 'sidebar_text')}
      <//>
    <//>
    <${M.Card} withBorder radius="md" p="md" style=${cardStyle}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">Content<//>
        ${color('Content background', 'Main canvas behind every admin page.', 'background')}
        ${color('Headings', 'Page titles and section headers.', 'heading')}
        ${color('Body text', 'Default paragraph and table text.', 'body')}
        ${color('Muted text', 'Subtitles, helper text, and timestamps.', 'muted')}
      <//>
    <//>
    <${M.Card} withBorder radius="md" p="md" style=${cardStyle}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">Typography<//>
        ${font('Heading font', 'Page titles and section headers.', 'font_primary')}
        ${font('Body font', 'Body and table text.', 'font_secondary')}
        ${font('Label font (mono)', 'Kicker, section labels, and code.', 'font_mono')}
      <//>
    <//>
  <//>`

  // ── Storefront: unchanged single Colors + Typography layout. ──
  const storefrontControls = html`<${React.Fragment}>
    <${M.Card} withBorder radius="md" p="md" style=${cardStyle}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">Colors<//>
        ${color('Background', 'Page canvas behind all content.', 'background')}
        <${M.Switch} checked=${t.paper_effect} onChange=${(e) => set({ paper_effect: e.currentTarget.checked })} disabled=${saving}
          label="Paper effect" description="Layer surfaces and borders into a warm depth derived from your background. Off = flat." />
        ${color('Accent', 'Links and highlights use this color.', 'accent')}
        ${accentBtns('Apply accent to buttons')}
        ${color('Lede', 'Intro / subtitle text under headings.', 'lede')}
        ${color('Heading (H1)', 'Top-level page titles.', 'heading')}
        ${color('Body copy', 'Default paragraph text.', 'body')}
      <//>
    <//>
    <${M.Card} withBorder radius="md" p="md" style=${cardStyle}>
      <${M.Stack} gap="sm">
        <${M.Text} fw=${600} size="sm">Typography<//>
        ${font('Primary font', 'Used for headings.', 'font_primary')}
        ${font('Secondary font', 'Used for lede and body copy.', 'font_secondary')}
      <//>
    <//>
  <//>`

  return html`
    <${M.Stack} gap="md">
      <${M.Box} className="appx-editor">
      <${M.Box} className="appx-grid">
        <${M.Box} className="appx-controls">
        <${M.Stack} gap="md">
          ${isAdmin ? adminControls : storefrontControls}
          <${M.Group} justify="flex-end" gap="sm">
            <${M.Button} variant="subtle" color="gray" size="sm" onClick=${reset} disabled=${saving}>Reset<//>
            <${M.Button} size="sm" onClick=${save} loading=${saving}>Save<//>
          <//>
        <//>
        <//>
        <${M.Box} className="appx-preview"><${Preview} t=${t} /><//>
      <//>
      <//>
      <${SyncStatus} sync=${sync} />
      <${AppearanceHistory} rows=${history} />
    <//>`
}

export function WebsiteAppearance({ notify }) {
  const [target, setTarget] = useState('storefront')
  const isStore = target === 'storefront'
  return html`
    <${M.Stack} gap="md">
      <${M.Stack} gap=${6}>
        <${M.SegmentedControl} value=${target} onChange=${setTarget} data=${[{ value: 'storefront', label: 'Storefront' }, { value: 'admin', label: 'Admin' }]} w="fit-content" />
        <${M.Text} c="dimmed" size="sm">${isStore ? 'Branding for your public chat website — what visitors see.' : 'Branding for this admin console — the sidebar, navigation, and buttons your team sees.'}<//>
      <//>
      ${isStore
        ? html`<${ThemeEditor} key="storefront" target="storefront" init=${D.THEME_TOKENS} Preview=${StorefrontPreview} history=${D.APPEARANCE_HISTORY} sync=${D.STOREFRONT_SYNC} notify=${notify} savedMsg="Public website theme updated." />`
        : html`<${ThemeEditor} key="admin" target="admin" init=${D.ADMIN_THEME_TOKENS} Preview=${AdminPreview} history=${D.ADMIN_APPEARANCE_HISTORY} sync=${D.ADMIN_SYNC} notify=${notify} savedMsg="Admin console theme updated." />`}
    <//>`
}
