// Shared Mantine harness for the admin screens.
// Each screen HTML imports from here: React + hooks, htm `html`, Mantine (M),
// Tabler icons (Ic), the theme, the datasets (D), shared helpers, and mountScreen().
//
// Resolves bare specifiers ('react', '@mantine/core', …) through the host page's
// <script type="importmap">. Every screen page carries the same import map + the
// Mantine core/notifications CSS links + the font links.

import React from 'react'
import { createRoot } from 'react-dom/client'
import * as M from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import htm from 'htm'
import * as Ic from '@tabler/icons-react'
import * as D from './data.js'

export { React, M, Ic, D, notifications }
export const { useState, useMemo, useRef, useEffect, useCallback, Fragment } = React
export const html = htm.bind(React.createElement)

/* ── buildAdminTheme() — Second Brain Labs tokens (components/admin/theme/mantine-theme.ts) ── */
export const theme = M.createTheme({
  primaryColor: 'brand',
  colors: {
    brand: M.colorsTuple('#C8542E'),
    ink: M.colorsTuple('#1F1A14'),
    background: M.colorsTuple('#FAF6EE'),
  },
  fontFamily: 'Manrope, sans-serif',
  fontFamilyMonospace: 'DM Mono, monospace',
  headings: { fontFamily: 'Newsreader, serif' },
  fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' },
  spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  radius: { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px' },
  defaultRadius: 'sm',
  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.04)', sm: '0 1px 3px rgba(0,0,0,0.06)', md: '0 4px 6px rgba(0,0,0,0.06)',
    lg: '0 10px 15px rgba(0,0,0,0.06)', xl: '0 20px 25px rgba(0,0,0,0.06)',
  },
  components: { Button: { defaultProps: { color: 'brand' } } },
})

/* ── tint helper: colorsTuple makes every brand shade identical, so brand-0 is a solid
   fill, not a tint. Use accentMix() for any faint accent wash. ── */
export const accentMix = (pct, base = '#fff') => `color-mix(in srgb, var(--mantine-color-brand-6) ${pct}%, ${base})`

/* ════════════════════════════════════════════════════════════════════════
   Navigation — flat sidebar grouped by section (mirrors combined/app.jsx).
   Each item maps to its own screen file; `ready:false` items are not built yet
   and render disabled.
   ════════════════════════════════════════════════════════════════════════ */
export const SCREENS = [
  { section: 'Platform', items: [
    { label: 'Tenants',  href: '/platform/admin',     file: 'Platform Tenants.html', ready: true },
    { label: 'Members',  href: '/platform/members',   file: 'Platform Members.html', ready: true },
    { label: 'Usage',    href: '/platform/usage',     file: 'Platform Usage.html',   ready: true },
    { label: 'Prompt',   href: '/admin/prompt-studio/prompt', file: 'Prompt Preview.html', ready: false },
    { label: 'Settings', href: '/platform/settings',  file: 'Platform Settings.html', ready: true },
  ]},
  { section: 'Second Brain Labs', items: [
    { label: 'Inbound Chats', href: '/admin',          file: 'Inbound Chats.html',  ready: true },
    { label: 'Prompt',        href: '/admin/prompt',   file: 'Tenant Prompt.html',  ready: false },
    { label: 'Settings',      href: '/admin/settings', file: 'Tenant Settings.html', ready: true },
  ]},
  { section: 'Prompt Studio', items: [
    { label: 'Composer', href: '/admin/prompt-builder',        file: 'Composer.html', ready: true },
    { label: 'Blocks',   href: '/admin/prompt-studio/blocks',  file: 'Blocks.html',   ready: true },
    { label: 'History',  href: '/admin/prompt-studio/history', file: 'History.html',  ready: true },
    { label: 'Assets',   href: '/admin/prompt-studio/assets',  file: 'Assets.html',   ready: true },
  ]},
]

const USER = { name: 'Jeff Lougheed', email: 'jeff@2bl.ai', initials: 'JL' }

/* ── shared formatting + badge helpers ── */
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
export const fmtStamp = fmtDate
export const mono = (s) => html`<${M.Text} span style=${{ fontSize: 'var(--mantine-font-size-sm)', fontFamily: 'var(--mantine-font-family-monospace)', wordBreak: 'break-all' }}>${s}<//>`
export const dim = (s) => html`<${M.Text} span c="dimmed" style=${{ fontSize: 'var(--mantine-font-size-sm)' }}>${s}<//>`

// Custom-tinted badge (for the {bg,fg} tints carried in the datasets).
export const TintBadge = ({ tint, children, size = 'sm' }) =>
  html`<${M.Badge} size=${size} radius="sm" variant="light"
    styles=${{
      root: { background: tint.bg, color: tint.fg, textTransform: 'none', fontWeight: 600, width: 'fit-content', maxWidth: 'none' },
      label: { overflow: 'visible', textOverflow: 'clip' },
    }}>${children}<//>`

// Live/draft status badge.
export const StatusBadge = ({ status }) => {
  const live = String(status).toLowerCase() === 'live'
  return html`<${M.Badge} size="sm" radius="sm" variant="light" color=${live ? 'green' : 'yellow'}>${live ? 'Live' : 'Draft'}<//>`
}

// Meta strip row used on detail cards.
export const MetaRow = ({ label, children }) => html`
  <${M.Group} gap="xs" wrap="wrap" align="baseline">
    <${M.Text} c="dimmed" style=${{ fontSize: 'var(--mantine-font-size-xs)', minWidth: 110 }}>${label}<//>
    <div style=${{ flex: 1, minWidth: 0 }}>${children}</div>
  <//>`

/* ── StatTile — a labelled metric for dashboard headers ── */
export const StatTile = ({ label, value, sub, accent }) => html`
  <${M.Paper} withBorder radius="md" p="md" style=${{ background: 'transparent' }}>
    <${M.Stack} gap=${2}>
      <${M.Text} c="dimmed" size="xs" tt="uppercase" fw=${600} style=${{ letterSpacing: '0.06em' }}>${label}<//>
      <${M.Text} style=${{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 26, fontWeight: 500, lineHeight: 1.1, color: accent || 'var(--mantine-color-text)' }}>${value}<//>
      ${sub && html`<${M.Text} c="dimmed" size="xs">${sub}<//>`}
    <//>
  <//>`

/* ── Donut — generic segmented ring. segments: [{key,label,value,color}].
   Hover a segment to see its detail in the center; otherwise shows total. ── */
export function Donut({ segments, total, centerSub, size = 180, formatCenter }) {
  const [hover, setHover] = useState(null)
  const sw = 26, r = (size - sw) / 2, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2
  const sum = total != null ? total : segments.reduce((s, x) => s + x.value, 0)
  let offset = 0
  const segs = segments.map((s) => { const len = sum > 0 ? (s.value / sum) * C : 0; const seg = { ...s, len, off: offset }; offset += len; return seg })
  const hv = hover ? segments.find((s) => s.key === hover) : null
  const hvPct = hv && sum > 0 ? Math.round((hv.value / sum) * 100) : 0
  return html`
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
      <circle cx=${cx} cy=${cy} r=${r} fill="none" stroke="var(--mantine-color-gray-2)" strokeWidth=${sw} />
      ${sum > 0 && segs.map((s) => html`
        <circle key=${s.key} cx=${cx} cy=${cy} r=${r} fill="none" stroke=${s.color} strokeWidth=${sw}
          strokeDasharray=${`${s.len} ${C - s.len}`} strokeDashoffset=${-s.off} transform=${`rotate(-90 ${cx} ${cy})`}
          opacity=${hover && hover !== s.key ? 0.28 : 1} onMouseEnter=${() => setHover(s.key)} onMouseLeave=${() => setHover(null)}
          style=${{ cursor: 'pointer', transition: 'opacity 130ms ease' }} />`)}
      ${hv
        ? html`<${Fragment}>
            <text x=${cx} y=${cy - 5} textAnchor="middle" style=${{ fontFamily: 'Manrope', fontSize: 14, fontWeight: 600, fill: hv.color }}>${hv.label}</text>
            <text x=${cx} y=${cy + 15} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 13, fill: 'var(--mantine-color-text)' }}>${hv.value.toLocaleString()}</text>
            <text x=${cx} y=${cy + 32} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>${hvPct}%</text>
          <//>`
        : html`<${Fragment}>
            <text x=${cx} y=${cy - 1} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 25, fontWeight: 500, fill: 'var(--mantine-color-text)' }}>${formatCenter ? formatCenter(sum) : sum.toLocaleString()}</text>
            ${centerSub && html`<text x=${cx} y=${cy + 18} textAnchor="middle" style=${{ fontFamily: 'DM Mono', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>${centerSub}</text>`}
          <//>`}
    </svg>`
}

/* ── DonutLegend — clickable swatch list to pair with a Donut ── */
export const DonutLegend = ({ segments, total }) => html`
  <${M.Stack} gap=${7}>
    ${segments.map((s) => {
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
      return html`<${M.Group} key=${s.key} gap="xs" wrap="nowrap" justify="space-between">
        <${M.Group} gap=${8} wrap="nowrap">
          <span style=${{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: '0 0 auto' }} />
          <${M.Text} size="sm">${s.label}<//>
        <//>
        <${M.Text} size="sm" c="dimmed" style=${{ fontFamily: 'var(--mantine-font-family-monospace)' }}>${s.value.toLocaleString()} · ${pct}%<//>
      <//>`
    })}
  <//>`

export function notify(t) {
  notifications.show({
    color: t.color || 'brand',
    title: t.title,
    message: t.message,
    autoClose: 3200,
  })
}

/* ── Sidebar (UnifiedAdminShell stand-in) ── */
function Sidebar({ active }) {
  const go = (it) => { if (it.ready && it.href !== active) window.location.href = encodeURI(it.file) }
  return html`
    <nav className="sb">
      <div className="sb-head">
        <div className="sb-brand">Second Brain Labs</div>
        <div className="sb-kicker">Admin</div>
      </div>
      <div className="sb-scroll">
        ${SCREENS.map((sec) => html`
          <${Fragment} key=${sec.section}>
            <div className="sb-sec">${sec.section}</div>
            ${sec.items.map((it) => html`
              <button key=${it.href} type="button"
                className=${'sb-item' + (it.href === active ? ' active' : '') + (it.ready ? '' : ' disabled')}
                aria-current=${it.href === active ? 'page' : undefined}
                title=${it.ready ? undefined : 'Not built yet'}
                onClick=${() => go(it)}>
                ${it.label}
                ${!it.ready && html`<span className="sb-soon">soon</span>`}
              </button>`)}
          <//>`)}
      </div>
      <div className="sb-foot">
        <div className="sb-ava">${USER.initials}</div>
        <div style=${{ minWidth: 0 }}>
          <div className="sb-uname">${USER.name}</div>
          <div className="sb-umail">${USER.email}</div>
        </div>
      </div>
    </nav>`
}

/* ── Shell chrome CSS (injected once) ── */
const SHELL_CSS = `
  html, body { margin: 0; }
  #root { min-height: 100vh; }
  #boot { font-family: monospace; color: #b00; white-space: pre-wrap; padding: 14px; }
  .shell { display: flex; min-height: 100vh; }
  .sb { width: 248px; flex: 0 0 248px; background: #17130E; color: #cfc9bf; display: flex; flex-direction: column;
        padding: 20px 14px; box-sizing: border-box; position: sticky; top: 0; height: 100vh; }
  .sb-head { padding: 2px 8px 4px; }
  .sb-brand { font-family: 'Newsreader', serif; font-size: 19px; color: #F5F1E8; line-height: 1.15; }
  .sb-kicker { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.18em; color: #C8542E; text-transform: uppercase; margin-top: 3px; }
  .sb-scroll { flex: 1 1 auto; overflow-y: auto; margin-top: 8px; }
  .sb-scroll::-webkit-scrollbar { width: 0; }
  .sb-sec { font-family: 'DM Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #6f685c; margin: 18px 8px 7px; }
  .sb-item { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: transparent;
             padding: 9px 12px; border-radius: 7px; color: #cfc9bf; font-size: 14px; font-family: inherit; cursor: pointer; }
  .sb-item:hover { background: rgba(255,255,255,0.05); color: #F5F1E8; }
  .sb-item.active { background: #C8542E; color: #fff; }
  .sb-item.disabled { color: #6b6358; cursor: default; }
  .sb-item.disabled:hover { background: transparent; color: #6b6358; }
  .sb-soon { margin-left: auto; font-family: 'DM Mono', monospace; font-size: 8.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b6358; }
  .sb-foot { display: flex; align-items: center; gap: 10px; padding: 14px 8px 4px; border-top: 1px solid rgba(255,255,255,0.07); margin-top: 8px; }
  .sb-ava { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 999px; background: #2E854D; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; }
  .sb-uname { font-size: 13px; color: #F5F1E8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sb-umail { font-size: 11px; color: #8a8276; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .main { flex: 1 1 auto; min-width: 0; background: #FAF6EE; max-height: 100vh; overflow-y: auto; }
  .main-inner { max-width: 1100px; padding: 40px 56px 90px; box-sizing: border-box; }
  .main-bleed { padding: 0; height: 100vh; box-sizing: border-box; }
  @media (max-width: 760px) {
    .sb { display: none; }
    .main-inner { padding: 24px 18px 70px; }
  }
`

let cssInjected = false
function injectShellCSS() {
  if (cssInjected) return
  const el = document.createElement('style')
  el.id = 'admin-shell-css'
  el.textContent = SHELL_CSS
  document.head.appendChild(el)
  cssInjected = true
}

/* ── mountScreen(activeHref, ScreenComponent, opts) ── */
export function mountScreen(activeHref, ScreenComponent, opts = {}) {
  injectShellCSS()
  const boot = document.getElementById('boot')
  if (boot) boot.style.display = 'none'
  const root = createRoot(document.getElementById('root'))
  root.render(html`
    <${M.MantineProvider} theme=${theme} defaultColorScheme="light">
      <${Notifications} position="top-right" zIndex=${2000} />
      <div className="shell">
        <${Sidebar} active=${activeHref} />
        <div className="main">
          <div className=${opts.fullBleed ? 'main-bleed' : 'main-inner'}>
            <${ScreenComponent} notify=${notify} />
          </div>
        </div>
      </div>
    <//>`)
}
