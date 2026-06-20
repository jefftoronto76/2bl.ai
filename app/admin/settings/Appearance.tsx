'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  ColorInput,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppearanceHistory } from './AppearanceHistory';
import type { AppearanceChange } from './types';

interface BrandingRow {
  color_background: string | null;
  color_accent: string | null;
  color_text_primary: string | null;
  color_text_muted: string | null;
  font_display: string | null;
  font_body: string | null;
  font_mono: string | null;
}

type EditableField = keyof BrandingRow;

const EMPTY: BrandingRow = {
  color_background: '',
  color_accent: '',
  color_text_primary: '',
  color_text_muted: '',
  font_display: '',
  font_body: '',
  font_mono: '',
};

function rowToForm(row: BrandingRow | null): BrandingRow {
  if (!row) return EMPTY;
  return {
    color_background:   row.color_background   ?? '',
    color_accent:       row.color_accent        ?? '',
    color_text_primary: row.color_text_primary  ?? '',
    color_text_muted:   row.color_text_muted    ?? '',
    font_display:       row.font_display        ?? '',
    font_body:          row.font_body           ?? '',
    font_mono:          row.font_mono           ?? '',
  };
}

function isDirty(saved: BrandingRow, current: BrandingRow): boolean {
  return (Object.keys(saved) as EditableField[]).some((k) => saved[k] !== current[k]);
}

function extractDirtyFields(saved: BrandingRow, current: BrandingRow): Partial<BrandingRow> {
  const patch: Partial<BrandingRow> = {};
  for (const k of Object.keys(saved) as EditableField[]) {
    if (saved[k] !== current[k]) {
      patch[k] = current[k];
    }
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------------

function AppearancePreview({ values }: { values: BrandingRow }) {
  const bg     = values.color_background   || '#FAF6EE';
  const accent = values.color_accent       || '#C8542E';
  const primary = values.color_text_primary || '#1F1A14';
  const muted  = values.color_text_muted   || '#6B6256';
  const serif  = values.font_display       || 'Georgia, serif';
  const sans   = values.font_body          || 'system-ui, sans-serif';
  const mono   = values.font_mono          || 'monospace';

  return (
    <Card
      withBorder
      radius="md"
      p="md"
      style={{ background: bg, minHeight: 180, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: primary }}>
        Heading preview
      </div>
      <div style={{ fontFamily: sans, fontSize: 14, color: primary, lineHeight: 1.6 }}>
        Body copy in your selected font. The quick brown fox jumps over the lazy dog.
      </div>
      <div style={{ fontFamily: sans, fontSize: 12, color: muted }}>
        Muted text — used for labels, timestamps, and secondary copy.
      </div>
      <div style={{ fontFamily: mono, fontSize: 11, color: muted }}>
        mono — code, IDs, tokens
      </div>
      <Group gap="xs" mt="auto">
        <span
          style={{
            background: accent,
            color: '#fff',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: sans,
            fontWeight: 600,
          }}
        >
          Accent button
        </span>
        <span
          style={{
            border: `1.5px solid ${accent}`,
            color: accent,
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: sans,
          }}
        >
          Outlined
        </span>
      </Group>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Appearance() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<BrandingRow>(EMPTY);
  const [values, setValues] = useState<BrandingRow>(EMPTY);
  const [history, setHistory] = useState<AppearanceChange[]>([]);

  const fetchSettings = useCallback(async () => {
    console.log('[Appearance] fetching settings');
    try {
      const res = await fetch('/api/admin/appearance');
      if (!res.ok) {
        console.error('[Appearance] settings fetch failed:', res.status);
        notifications.show({
          color: 'red',
          title: 'Failed to load appearance',
          message: 'Could not load branding settings.',
        });
        return;
      }
      const json: { data: BrandingRow | null } = await res.json();
      const form = rowToForm(json.data);
      setSaved(form);
      setValues(form);
    } catch (err) {
      console.error('[Appearance] settings fetch threw:', err);
      notifications.show({
        color: 'red',
        title: 'Network error',
        message: 'Could not reach the server.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    console.log('[Appearance] fetching history');
    try {
      const res = await fetch('/api/admin/appearance/history');
      if (!res.ok) return;
      const json: { history: AppearanceChange[] } = await res.json();
      setHistory(json.history);
    } catch {
      // History is non-critical — fail silently.
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, [fetchSettings, fetchHistory]);

  function set(field: EditableField, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  const dirty = isDirty(saved, values);

  async function handleSave() {
    const patch = extractDirtyFields(saved, values);
    if (Object.keys(patch).length === 0) return;

    console.log('[Appearance] PATCH dispatch:', patch);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/appearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const msg =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'Failed to save appearance.';
        console.error('[Appearance] PATCH failed:', msg);
        notifications.show({ color: 'red', title: 'Save failed', message: msg });
        return;
      }

      const json: { data: BrandingRow } = await res.json();
      const form = rowToForm(json.data);
      console.log('[Appearance] PATCH success:', form);
      setSaved(form);
      setValues(form);
      notifications.show({
        color: 'green',
        title: 'Appearance saved',
        message: 'Branding tokens updated.',
      });

      // Re-fetch history so the new rows appear immediately.
      await fetchHistory();
    } catch (err) {
      console.error('[Appearance] PATCH threw:', err);
      notifications.show({
        color: 'red',
        title: 'Network error',
        message: 'Could not reach the server.',
      });
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
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* ── Left column: editor ── */}
        <Card withBorder radius="md" p="md" style={{ backgroundColor: 'transparent' }}>
          <Stack gap="sm">
            <Title order={6} fw={600}>
              Colors
            </Title>
            <ColorInput
              label="Background"
              description="Page and surface background."
              value={values.color_background ?? ''}
              onChange={(v) => set('color_background', v)}
              format="hex"
              size="sm"
              disabled={saving}
            />
            <ColorInput
              label="Accent"
              description="Primary brand color — buttons, links, highlights."
              value={values.color_accent ?? ''}
              onChange={(v) => set('color_accent', v)}
              format="hex"
              size="sm"
              disabled={saving}
            />
            <ColorInput
              label="Text primary"
              description="Main body and heading text."
              value={values.color_text_primary ?? ''}
              onChange={(v) => set('color_text_primary', v)}
              format="hex"
              size="sm"
              disabled={saving}
            />
            <ColorInput
              label="Text muted"
              description="Secondary, label, and caption text."
              value={values.color_text_muted ?? ''}
              onChange={(v) => set('color_text_muted', v)}
              format="hex"
              size="sm"
              disabled={saving}
            />

            <Title order={6} fw={600} mt="xs">
              Fonts
            </Title>
            <Text size="xs" c="dimmed" mt={-4}>
              Enter any valid CSS font-family string, e.g. <em>Playfair Display, serif</em>.
            </Text>
            <TextInput
              label="Display font"
              description="Used for headings and display text."
              value={values.font_display ?? ''}
              onChange={(e) => set('font_display', e.currentTarget.value)}
              size="sm"
              disabled={saving}
              placeholder="e.g. Playfair Display, serif"
            />
            <TextInput
              label="Body font"
              description="Used for body copy and UI text."
              value={values.font_body ?? ''}
              onChange={(e) => set('font_body', e.currentTarget.value)}
              size="sm"
              disabled={saving}
              placeholder="e.g. DM Sans, sans-serif"
            />
            <TextInput
              label="Mono font"
              description="Used for code, IDs, and monospace contexts."
              value={values.font_mono ?? ''}
              onChange={(e) => set('font_mono', e.currentTarget.value)}
              size="sm"
              disabled={saving}
              placeholder="e.g. DM Mono, monospace"
            />

            <Group justify="flex-end" mt="xs">
              <Button
                variant="filled"
                color="green"
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!dirty}
              >
                Save
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* ── Right column: live preview ── */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">
            Preview
          </Text>
          <AppearancePreview values={values} />
        </Stack>
      </SimpleGrid>

      <AppearanceHistory log={history} />
    </Stack>
  );
}
