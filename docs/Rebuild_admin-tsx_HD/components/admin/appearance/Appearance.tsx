'use client'

// Appearance — Storefront + Admin theme editors with live preview, the warm
// "paper-stack" surface derivation, read-only sync status, and change history.
// Used by tenant Settings. Ported from WebsiteAppearance.
//
// TODO: replace THEME_TOKENS / ADMIN_THEME_TOKENS / *_HISTORY / *_SYNC with live
// data and wire save() to persist tokens.

import { useState } from 'react'
import {
  Button, Card, ColorInput, Group, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text,
} from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconChevronRight } from '@tabler/icons-react'
import {
  ADMIN_APPEARANCE_HISTORY, ADMIN_SYNC, ADMIN_THEME_TOKENS, APPEARANCE_HISTORY,
  STOREFRONT_SYNC, THEME_FONT_OPTIONS, THEME_TOKENS,
} from '@/components/admin/lib/fixtures'
import { avatarColor } from '@/components/admin/lib/badges'
import { initials } from '@/components/admin/lib/types'
import { notify } from '@/components/admin/lib/primitives'
import type { AppearanceChange, SyncStatus, ThemeTokens } from '@/components/admin/lib/types'

/* ── hex math + paper-stack derivation ── */
const hx2rgb = (h: string): [number, number, number] => {
  let s = String(h || '').replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s || '000000', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb2hx = (r: number, g: number, b: number) => {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}
export const mixHex = (a: string, b: string, amt: number) => {
  const A = hx2rgb(a), B = hx2rgb(b)
  return rgb2hx(A[0] + (B[0] - A[0]) * amt, A[1] + (B[1] - A[1]) * amt, A[2] + (B[2] - A[2]) * amt)
}
const PAPER_WARM = '#c8a87e'
const paperStack = (bg: string, effect: boolean, ink?: string) =>
  effect
    ? { surface: mixHex(bg, PAPER_WARM, 0.10), sunken: mixHex(bg, PAPER_WARM, 0.20), line: mixHex(bg, PAPER_WARM, 0.42) }
    : { surface: bg, sunken: bg, line: mixHex(bg, ink || '#1a1917', 0.10) }

const fmtHistDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtSyncDate = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const SWATCHES = ['#FAF6EE', '#ffffff', '#f9f8f5', '#2d6a4f', '#1c7ed6', '#C8542E', '#1a1917', '#6b6a64', '#3a3935']
function ColorRow({ label, description, value, onChange, disabled }: { label: string; description: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <ColorInput label={label} description={description} value={value} onChange={onChange} disabled={disabled} format="hex" swatches={SWATCHES} withinPortal styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }} />
  )
}

function SyncStatusCard({ sync }: { sync: SyncStatus }) {
  const synced = fmtSyncDate(sync?.defaults_synced_at ?? null)
  const warnings = sync?.branding_warnings || null
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0
  return (
    <Card withBorder radius="md" p="md" style={{ background: 'transparent' }}>
      <Stack gap="sm">
        <Group justify="space-between" align="baseline">
          <Text fw={600} size="sm">Sync status</Text>
          <Text c="dimmed" tt="uppercase" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.12em' }}>Read-only</Text>
        </Group>
        <Group gap="xs" align="baseline" wrap="nowrap">
          <Text c="dimmed" size="sm" style={{ minWidth: 92 }}>Last synced</Text>
          {synced
            ? <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{synced}</Text>
            : <Group gap={6}><span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--mantine-color-gray-5)' }} /><Text size="sm" c="dimmed">Never synced</Text></Group>}
        </Group>
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Text c="dimmed" size="sm" style={{ minWidth: 92, marginTop: 2 }}>Warnings</Text>
          {hasWarnings ? (
            <Stack gap={6} style={{ flex: 1 }}>
              {warnings!.map((w, i) => (
                <Group key={i} gap={7} wrap="nowrap" align="flex-start">
                  <IconAlertTriangle size={14} style={{ color: '#b07c0c', flex: '0 0 auto', marginTop: 2 }} />
                  <Text size="sm">
                    <code style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12, background: 'var(--mantine-color-gray-1)', padding: '1px 5px', borderRadius: 4 }}>{w.token}</code>
                    {w.message ? <Text span c="dimmed" size="sm"> {w.message}</Text> : null}
                  </Text>
                </Group>
              ))}
            </Stack>
          ) : (
            <Group gap={6}><IconCheck size={14} style={{ color: 'var(--mantine-color-green-7)' }} /><Text size="sm" c="dimmed">No warnings</Text></Group>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

function AppearanceHistoryCard({ rows }: { rows: AppearanceChange[] }) {
  const DiffValue = ({ kind, value }: { kind: AppearanceChange['kind']; value: string }) =>
    kind === 'color' ? (
      <Group gap={5} wrap="nowrap">
        <span style={{ width: 13, height: 13, borderRadius: 3, background: value, border: '1px solid rgba(0,0,0,0.1)' }} />
        <Text span size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>{value}</Text>
      </Group>
    ) : (
      <Text span size="sm" style={kind === 'font' ? { fontFamily: 'var(--mantine-font-family-monospace)' } : undefined}>{value}</Text>
    )
  return (
    <Card withBorder radius="md" p="md" style={{ background: 'transparent' }}>
      <Stack gap="sm">
        <Group justify="space-between" align="baseline">
          <Text fw={600} size="sm">Change history</Text>
          <Text c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 }}>{rows.length} {rows.length === 1 ? 'change' : 'changes'}</Text>
        </Group>
        {rows.length === 0 ? (
          <Text c="dimmed" size="sm">No changes recorded yet.</Text>
        ) : (
          <Stack gap={0}>
            {rows.map((h, idx) => {
              const c = avatarColor(h.actor)
              return (
                <Group key={h.id} gap="sm" wrap="nowrap" align="flex-start" py={10} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--mantine-color-gray-2)' }}>
                  <span style={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: 999, background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>{initials(h.actor)}</span>
                  <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm"><b>{h.actor}</b> changed <b>{h.field}</b></Text>
                    <Group gap={8} wrap="nowrap" align="center">
                      <DiffValue kind={h.kind} value={h.from} />
                      <IconChevronRight size={13} style={{ color: 'var(--mantine-color-gray-5)', flex: '0 0 auto' }} />
                      <DiffValue kind={h.kind} value={h.to} />
                    </Group>
                  </Stack>
                  <Text c="dimmed" title={h.email} style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtHistDate(h.at)}</Text>
                </Group>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

function StorefrontPreview({ t }: { t: ThemeTokens }) {
  const [note, setNote] = useState(false)
  const headFont = `"${t.font_primary}", serif`
  const bodyFont = `"${t.font_secondary}", sans-serif`
  const btnBg = t.accent_buttons ? t.accent : '#1a1917'
  const ps = paperStack(t.background, t.paper_effect, t.heading)
  return (
    <Stack gap={6}>
      <Text c="dimmed" tt="uppercase" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.14em' }}>Live preview</Text>
      <div style={{ background: t.background, fontFamily: bodyFont, borderRadius: 12, border: '1px solid var(--mantine-color-gray-3)', padding: 22 }}>
        <h1 style={{ fontFamily: headFont, color: t.heading, fontSize: 28, lineHeight: 1.12, margin: 0, fontWeight: 500 }}>Build a second brain that talks.</h1>
        <p style={{ color: t.lede, fontSize: 15, margin: '13px 0 0', lineHeight: 1.5 }}>Sage answers your visitors in your voice, around the clock — and books the ones who are ready.</p>
        <p style={{ color: t.body, fontSize: 13.5, margin: '13px 0 0', lineHeight: 1.6 }}>
          Every conversation is grounded in the notes, prompts, and parameters you control here.{' '}
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>See how it works</a>.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 17px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Start a chat</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 17px', borderRadius: 6, background: 'transparent', color: t.accent, border: `1px solid ${t.accent}`, fontSize: 13.5, fontWeight: 600 }}>Learn more</span>
        </div>
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: `1px dashed ${mixHex(t.background, t.heading, 0.18)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: mixHex(t.background, t.heading, 0.5) }}>Surface sample</span>
            <button type="button" onClick={() => setNote((v) => !v)} style={{ border: 0, background: 'transparent', padding: 0, font: 'inherit', fontSize: 11.5, color: t.accent, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>{note ? 'Hide' : "What's this?"}</button>
          </div>
          {note && <p style={{ fontSize: 12, lineHeight: 1.55, margin: '8px 0 0', color: mixHex(t.background, t.heading, 0.62) }}>A demo surface — cards, chips, and borders take their tone from your <b>Background</b>. Toggle <b>Paper effect</b> to watch them gain or lose depth.</p>}
          <div style={{ marginTop: 12, background: ps.surface, border: `1px solid ${ps.line}`, borderRadius: 12, padding: 16, transition: 'background 160ms ease, border-color 160ms ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: ps.sunken, display: 'grid', placeItems: 'center', color: t.body, fontSize: 11.5, fontWeight: 700, flex: '0 0 auto' }}>SC</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Sarah Chen</div>
                <div style={{ color: t.lede, fontSize: 12 }}>Summit Realty</div>
              </div>
            </div>
            <p style={{ color: t.body, fontSize: 13.5, margin: '11px 0 0', lineHeight: 1.55 }}>&ldquo;Sage books the right people while I sleep — and sounds like me doing it.&rdquo;</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <span style={{ background: ps.sunken, border: `1px solid ${ps.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: t.body }}>Active</span>
              <span style={{ background: ps.sunken, border: `1px solid ${ps.line}`, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, color: t.body }}>Pro plan</span>
            </div>
          </div>
        </div>
      </div>
    </Stack>
  )
}

function AdminPreview({ t }: { t: ThemeTokens }) {
  const headFont = `"${t.font_primary}", sans-serif`
  const bodyFont = `"${t.font_secondary}", sans-serif`
  const btnBg = t.accent_buttons ? t.accent : '#1a1917'
  const ps = paperStack(t.background, t.paper_effect, t.heading)
  const navItems = ['Inbound', 'Members', 'Composer', 'Settings']
  return (
    <Stack gap={6}>
      <Text c="dimmed" tt="uppercase" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 10, letterSpacing: '0.14em' }}>Live preview</Text>
      <div style={{ overflow: 'hidden', background: t.background, fontFamily: bodyFont, borderRadius: 12, border: '1px solid var(--mantine-color-gray-3)' }}>
        <div style={{ display: 'flex', minHeight: 344 }}>
          <div style={{ width: 140, flex: '0 0 140px', background: '#101113', padding: '15px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ marginBottom: 13, padding: '0 5px' }}>
              <div style={{ fontFamily: headFont, color: '#fff', fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>Second Brain</div>
              <div style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.accent, marginTop: 3 }}>Admin</div>
            </div>
            {navItems.map((n, i) => (
              <span key={n} style={{ display: 'block', padding: '7px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: i === 1 ? 500 : 400, color: i === 1 ? '#fff' : 'rgba(255,255,255,0.6)', background: i === 1 ? t.accent : 'transparent' }}>{n}</span>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, padding: '18px 18px 20px' }}>
            <h1 style={{ fontFamily: headFont, color: t.heading, fontSize: 21, lineHeight: 1.15, margin: 0, fontWeight: 600 }}>Members</h1>
            <p style={{ color: t.lede, fontSize: 12.5, margin: '5px 0 0', lineHeight: 1.5 }}>Manage who can access this workspace.</p>
            <div style={{ marginTop: 14, background: ps.surface, border: `1px solid ${ps.line}`, borderRadius: 12, padding: 14, transition: 'background 160ms ease, border-color 160ms ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: t.accent, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11.5, fontWeight: 700, flex: '0 0 auto' }}>JL</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: t.heading, fontSize: 13.5, fontWeight: 600 }}>Jeff Lougheed</div>
                  <div style={{ color: t.lede, fontSize: 12 }}>jeff@naturalresource.co</div>
                </div>
                <span style={{ background: mixHex(t.background, t.accent, 0.12), color: t.accent, border: `1px solid ${mixHex(t.background, t.accent, 0.3)}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>Owner</span>
              </div>
              <p style={{ color: t.body, fontSize: 13, margin: '11px 0 0', lineHeight: 1.55 }}>Owners can edit branding, prompts, and billing for this workspace.</p>
            </div>
            <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: btnBg, color: '#fff', fontSize: 13, fontWeight: 600 }}>Invite member</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 6, background: 'transparent', color: t.body, border: `1px solid ${mixHex(t.background, t.heading, 0.2)}`, fontSize: 13, fontWeight: 600 }}>Export</span>
            </div>
          </div>
        </div>
      </div>
    </Stack>
  )
}

interface ThemeEditorProps {
  init: ThemeTokens
  Preview: React.ComponentType<{ t: ThemeTokens }>
  history: AppearanceChange[]
  sync: SyncStatus
  savedMsg: string
}
function ThemeEditor({ init, Preview, history, sync, savedMsg }: ThemeEditorProps) {
  const [t, setT] = useState<ThemeTokens>({ ...init })
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<ThemeTokens>) => setT((d) => ({ ...d, ...patch }))
  const reset = () => setT({ ...init })
  const save = () => {
    setSaving(true)
    setTimeout(() => { setSaving(false); notify({ color: 'green', title: 'Appearance saved', message: savedMsg }) }, 500)
  }
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap="md">
          <Card withBorder radius="md" p="md" style={{ background: 'transparent' }}>
            <Stack gap="sm">
              <Text fw={600} size="sm">Colors</Text>
              <ColorRow label="Background" description="Page canvas behind all content." value={t.background} onChange={(v) => set({ background: v })} disabled={saving} />
              <Switch checked={t.paper_effect} onChange={(e) => set({ paper_effect: e.currentTarget.checked })} disabled={saving} label="Paper effect" description="Layer surfaces and borders into a warm depth derived from your background. Off = flat." />
              <ColorRow label="Accent" description="Links and highlights use this color." value={t.accent} onChange={(v) => set({ accent: v })} disabled={saving} />
              <Switch checked={t.accent_buttons} onChange={(e) => set({ accent_buttons: e.currentTarget.checked })} disabled={saving} label="Apply accent to buttons" description="When off, primary buttons stay neutral (ink)." />
              <ColorRow label="Lede" description="Intro / subtitle text under headings." value={t.lede} onChange={(v) => set({ lede: v })} disabled={saving} />
              <ColorRow label="Heading (H1)" description="Top-level page titles." value={t.heading} onChange={(v) => set({ heading: v })} disabled={saving} />
              <ColorRow label="Body copy" description="Default paragraph text." value={t.body} onChange={(v) => set({ body: v })} disabled={saving} />
            </Stack>
          </Card>
          <Card withBorder radius="md" p="md" style={{ background: 'transparent' }}>
            <Stack gap="sm">
              <Text fw={600} size="sm">Typography</Text>
              <Select label="Primary font" description="Used for headings." data={THEME_FONT_OPTIONS} value={t.font_primary} onChange={(v) => set({ font_primary: v! })} allowDeselect={false} withinPortal />
              <Select label="Secondary font" description="Used for lede and body copy." data={THEME_FONT_OPTIONS} value={t.font_secondary} onChange={(v) => set({ font_secondary: v! })} allowDeselect={false} withinPortal />
            </Stack>
          </Card>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" size="sm" onClick={reset} disabled={saving}>Reset</Button>
            <Button size="sm" onClick={save} loading={saving}>Save</Button>
          </Group>
        </Stack>
        <Preview t={t} />
      </SimpleGrid>
      <SyncStatusCard sync={sync} />
      <AppearanceHistoryCard rows={history} />
    </Stack>
  )
}

export function WebsiteAppearance() {
  const [target, setTarget] = useState('storefront')
  const isStore = target === 'storefront'
  return (
    <Stack gap="md">
      <Stack gap={6}>
        <SegmentedControl value={target} onChange={setTarget} data={[{ value: 'storefront', label: 'Storefront' }, { value: 'admin', label: 'Admin' }]} w="fit-content" />
        <Text c="dimmed" size="sm">{isStore ? 'Branding for your public chat website — what visitors see.' : 'Branding for this admin console — the sidebar, navigation, and buttons your team sees.'}</Text>
      </Stack>
      {isStore ? (
        <ThemeEditor key="storefront" init={THEME_TOKENS} Preview={StorefrontPreview} history={APPEARANCE_HISTORY} sync={STOREFRONT_SYNC} savedMsg="Public website theme updated." />
      ) : (
        <ThemeEditor key="admin" init={ADMIN_THEME_TOKENS} Preview={AdminPreview} history={ADMIN_APPEARANCE_HISTORY} sync={ADMIN_SYNC} savedMsg="Admin console theme updated." />
      )}
    </Stack>
  )
}
