'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppearanceHistory } from './AppearanceHistory';
import { SyncStatus } from './SyncStatus';
import type { AppearanceChange, BrandingTarget, BrandingSync } from './types';
import { DISPLAY_FONTS, BODY_FONTS, ALL_FONTS } from '@/services/branding/font-registry';
import { ThemePreview } from './ThemePreview';
import { AdminPreview } from './AdminPreview';
import './appearance.css';

interface BrandingRow {
  background:     string;
  accent:         string;
  lede:           string;
  heading:        string;
  body:           string;
  font_primary:   string;
  font_secondary: string;
  font_mono:      string;
  paper_effect:    'warm' | 'lift' | 'flat';
  accent_buttons:  boolean;
  use_db_branding: boolean;
}

const EMPTY: BrandingRow = {
  background:      '',
  accent:          '',
  lede:            '',
  heading:         '',
  body:            '',
  font_primary:    '',
  font_secondary:  '',
  font_mono:       '',
  paper_effect:    'lift',
  accent_buttons:  true,
  use_db_branding: false,
};

const EMPTY_SYNC: BrandingSync = { defaults_synced_at: null, branding_warnings: null };

// Per-target subtitle shown under the Storefront/Admin switch.
const TARGET_META: Record<BrandingTarget, { description: string }> = {
  storefront: { description: 'Colors, fonts, and brand tokens for your public storefront — what visitors see.' },
  admin:      { description: 'Colors, fonts, and brand tokens for this admin console — the sidebar, navigation, and buttons your team sees.' },
};

function rowToForm(row: Record<string, unknown> | null): BrandingRow {
  if (!row) return EMPTY;
  return {
    background:      (row.background      as string  | null) ?? '',
    accent:          (row.accent          as string  | null) ?? '',
    lede:            (row.lede            as string  | null) ?? '',
    heading:         (row.heading         as string  | null) ?? '',
    body:            (row.body            as string  | null) ?? '',
    font_primary:    (row.font_primary    as string  | null) ?? '',
    font_secondary:  (row.font_secondary  as string  | null) ?? '',
    font_mono:       (row.font_mono       as string  | null) ?? '',
    paper_effect:    (row.paper_effect    as 'warm' | 'lift' | 'flat' | null) ?? 'lift',
    accent_buttons:  (row.accent_buttons  as boolean | null) ?? true,
    use_db_branding: (row.use_db_branding as boolean | null) ?? false,
  };
}

// Read-only sync fields ride along on the same GET row; they are never part of
// dirty-tracking or the PATCH payload.
function rowToSync(row: Record<string, unknown> | null): BrandingSync {
  if (!row) return EMPTY_SYNC;
  const raw = row.branding_warnings;
  const warnings =
    Array.isArray(raw) && raw.length > 0
      ? raw.map((w) =>
          typeof w === 'string'
            ? { token: w, message: '' }
            : {
                token: String((w as Record<string, unknown>)?.token ?? ''),
                message: String((w as Record<string, unknown>)?.message ?? ''),
              },
        )
      : null;
  return {
    defaults_synced_at: (row.defaults_synced_at as string | null) ?? null,
    branding_warnings: warnings,
  };
}

function isDirty(saved: BrandingRow, current: BrandingRow): boolean {
  return (Object.keys(saved) as Array<keyof BrandingRow>).some(k => saved[k] !== current[k]);
}

function extractDirtyFields(saved: BrandingRow, current: BrandingRow): Record<string, string | boolean> {
  const patch: Record<string, string | boolean> = {};
  for (const k of Object.keys(saved) as Array<keyof BrandingRow>) {
    if (saved[k] !== current[k]) {
      patch[k] = current[k] as string | boolean;
    }
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Google Fonts loader (DOM-only — stays client-side)
// ---------------------------------------------------------------------------

const _loadedFonts = new Set<string>();

function loadGoogleFont(googleFamily: string): void {
  if (_loadedFonts.has(googleFamily)) return;
  _loadedFonts.add(googleFamily);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleFamily}&display=swap`;
  document.head.appendChild(link);
}

function loadFontForValue(value: string): void {
  const entry = ALL_FONTS.find(f => f.value === value);
  if (entry?.googleFamily) loadGoogleFont(entry.googleFamily);
}

// ---------------------------------------------------------------------------
// Native color row — swatch + hex text input (no Mantine ColorInput)
// ---------------------------------------------------------------------------

function ColorRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label
          style={{
            display: 'inline-block',
            width: 28,
            height: 28,
            borderRadius: 4,
            background: value || '#cccccc',
            border: '1px solid rgba(0,0,0,0.15)',
            cursor: 'pointer',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <input
            type="color"
            value={value || '#ffffff'}
            onChange={e => onChange(e.target.value)}
            aria-label={label}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          />
        </label>
        <input
          value={value}
          onChange={e => {
            let v = e.target.value;
            if (v && v[0] !== '#') v = '#' + v;
            onChange(v);
          }}
          spellCheck={false}
          style={{
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 13,
            width: 140,
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: 4,
            padding: '4px 8px',
            background: 'transparent',
            textTransform: 'lowercase',
          }}
        />
      </div>
      {description && (
        <div style={{ fontSize: 12, color: 'var(--mantine-color-dimmed)', marginTop: 4 }}>
          {description}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrandingEditor — the per-target editor (was the body of Appearance()).
// Fetches, edits, and saves ONE target's tenant_branding row. Remounted on
// target switch via `key`, so all state resets cleanly to the new target.
// ---------------------------------------------------------------------------

function BrandingEditor({ target }: { target: BrandingTarget }) {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState<BrandingRow>(EMPTY);
  const [values, setValues]     = useState<BrandingRow>(EMPTY);
  const [sync, setSync]         = useState<BrandingSync>(EMPTY_SYNC);
  const [history, setHistory]   = useState<AppearanceChange[]>([]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/appearance?target=${target}`);
      if (!res.ok) {
        notifications.show({
          color: 'red',
          title: 'Failed to load appearance',
          message: 'Could not load branding settings.',
        });
        return;
      }
      const json: { data: Record<string, unknown> | null } = await res.json();
      const form = rowToForm(json.data);
      setSaved(form);
      setValues(form);
      setSync(rowToSync(json.data));
      if (form.font_primary)   loadFontForValue(form.font_primary);
      if (form.font_secondary) loadFontForValue(form.font_secondary);
      if (form.font_mono)      loadFontForValue(form.font_mono);
    } catch {
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' });
    } finally {
      setLoading(false);
    }
  }, [target]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/appearance/history?target=${target}`);
      if (!res.ok) return;
      const json: { history: AppearanceChange[] } = await res.json();
      setHistory(json.history);
    } catch {
      // History is non-critical — fail silently.
    }
  }, [target]);

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, [fetchSettings, fetchHistory]);

  function set<K extends keyof BrandingRow>(field: K, value: BrandingRow[K]) {
    setValues(v => ({ ...v, [field]: value }));
  }

  const dirty = isDirty(saved, values);

  function handleReset() {
    setValues({ ...saved });
  }

  async function handleSave() {
    const patch = extractDirtyFields(saved, values);
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/appearance?target=${target}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const errBody: unknown = await res.json().catch(() => null);
        const msg =
          typeof errBody === 'object' && errBody !== null && 'error' in errBody
            ? String((errBody as { error: unknown }).error)
            : 'Failed to save appearance.';
        notifications.show({ color: 'red', title: 'Save failed', message: msg });
        return;
      }

      const json: { data: Record<string, unknown> } = await res.json();
      const form = rowToForm(json.data);
      setSaved(form);
      setValues(form);
      setSync(rowToSync(json.data));
      notifications.show({ color: 'green', title: 'Appearance saved', message: 'Branding tokens updated.' });
      await fetchHistory();
    } catch {
      notifications.show({ color: 'red', title: 'Network error', message: 'Could not reach the server.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Stack gap="sm">
        <Skeleton height={40} radius="md" />
        <Skeleton height={40} radius="md" />
        <Skeleton height={180} radius="md" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Live-site gate — off by default; globals.css static tokens win when off */}
      <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
        <Switch
          label={target === 'admin' ? 'Apply to admin console' : 'Apply to live site'}
          description={
            target === 'admin'
              ? 'When on, these stored values theme this admin console. Off by default — save settings here first, then flip this on.'
              : 'When on, these stored values override the design-system defaults on the live storefront. Off by default — save settings here first, then flip this on.'
          }
          checked={values.use_db_branding}
          onChange={e => set('use_db_branding', e.currentTarget.checked)}
          disabled={saving}
          size="md"
        />
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* ── Left column: editor ── */}
        <Stack gap="md">
          {/* Colors card */}
          <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
            <Stack gap="sm">
              <Title order={6} fw={600}>Colors</Title>

              <ColorRow
                label="Background"
                description="Page canvas behind all content."
                value={values.background}
                onChange={v => set('background', v)}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Paper effect</div>
                <SegmentedControl
                  data={[
                    { value: 'warm', label: 'Warm' },
                    { value: 'lift', label: 'Lift' },
                    { value: 'flat', label: 'Flat' },
                  ]}
                  value={values.paper_effect}
                  onChange={v => set('paper_effect', v as 'warm' | 'lift' | 'flat')}
                  disabled={saving}
                  size="sm"
                  fullWidth
                />
                <div style={{ fontSize: 12, color: 'var(--mantine-color-dimmed)', marginTop: 4 }}>
                  Surface depth: warm amber, white lift, or flat.
                </div>
              </div>
              <ColorRow
                label="Accent"
                description="Links and highlights use this color."
                value={values.accent}
                onChange={v => set('accent', v)}
              />
              <Switch
                label="Apply accent to buttons"
                description="When off, primary buttons stay neutral (ink)."
                checked={values.accent_buttons}
                onChange={e => set('accent_buttons', e.currentTarget.checked)}
                disabled={saving}
                size="sm"
              />
              <ColorRow
                label="Lede"
                description="Intro / subtitle text under headings."
                value={values.lede}
                onChange={v => set('lede', v)}
              />
              <ColorRow
                label="Heading (H1)"
                description="Top-level page titles."
                value={values.heading}
                onChange={v => set('heading', v)}
              />
              <ColorRow
                label="Body copy"
                description="Default paragraph text."
                value={values.body}
                onChange={v => set('body', v)}
              />
            </Stack>
          </Card>

          {/* Typography card */}
          <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
            <Stack gap="sm">
              <Title order={6} fw={600}>Typography</Title>
              <Select
                label="Primary font"
                description="Used for headings."
                data={DISPLAY_FONTS}
                value={values.font_primary || null}
                onChange={v => {
                  const val = v ?? '';
                  set('font_primary', val);
                  if (val) loadFontForValue(val);
                }}
                size="sm"
                disabled={saving}
              />
              <Select
                label="Secondary font"
                description="Used for lede and body copy."
                data={BODY_FONTS}
                value={values.font_secondary || null}
                onChange={v => {
                  const val = v ?? '';
                  set('font_secondary', val);
                  if (val) loadFontForValue(val);
                }}
                size="sm"
                disabled={saving}
              />
            </Stack>
          </Card>

          {/* Action row */}
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" size="sm" onClick={handleReset} disabled={saving || !dirty}>
              Reset
            </Button>
            <Button variant="filled" color="green" size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
              Save
            </Button>
          </Group>
        </Stack>

        {/* ── Right column: live preview (storefront vs admin console) ── */}
        {target === 'admin' ? <AdminPreview t={values} /> : <ThemePreview t={values} />}
      </SimpleGrid>

      {/* Read-only branding sync status */}
      <SyncStatus sync={sync} />

      <AppearanceHistory log={history} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Appearance — nests two branding targets: Storefront + Admin.
// The SegmentedControl picks the target; BrandingEditor is keyed on it so a
// switch fully remounts (refetch + fresh state) rather than leaking values
// across targets.
// ---------------------------------------------------------------------------

export function Appearance() {
  const [target, setTarget] = useState<BrandingTarget>('storefront');

  return (
    <Stack gap="md">
      <Stack gap={8}>
        <SegmentedControl
          value={target}
          onChange={v => setTarget(v as BrandingTarget)}
          data={[
            { label: 'Storefront', value: 'storefront' },
            { label: 'Admin', value: 'admin' },
          ]}
          style={{ alignSelf: 'flex-start' }}
        />
        <Text size="sm" c="dimmed">{TARGET_META[target].description}</Text>
      </Stack>

      <BrandingEditor key={target} target={target} />
    </Stack>
  );
}
