// app/admin/settings/getAppearanceHistory.ts
//
// Server-only reader for the Appearance change history. Reads the audit log that
// the Appearance save handler writes (one audit_events row per changed field, in
// the same transaction as the settings write) and shapes it into AppearanceChange[].
//
// This module does NOT write audit rows — emitting them is the Save handler's job
// (see handover §Open decisions). If saves only record a coarse "settings updated"
// event, add per-field diffing at write time so this list can populate.

import 'server-only';
import { getAdminClient } from '@/services/auth/supabase-admin';
import type { AppearanceChange, AppearanceChangeKind } from './types';

/**
 * Maps the theme-settings field id (as stored in `audit_events.field`) to its
 * display label + diff kind. Keep this in sync with the editor fields in
 * Appearance.tsx — if you add a theme token, add it here too.
 */
const FIELD_META: Record<string, { label: string; kind: AppearanceChangeKind }> = {
  background: { label: 'Background', kind: 'color' },
  paper_effect: { label: 'Paper effect', kind: 'toggle' },
  accent: { label: 'Accent', kind: 'color' },
  accent_buttons: { label: 'Apply accent to buttons', kind: 'toggle' },
  lede: { label: 'Lede', kind: 'color' },
  heading: { label: 'Heading (H1)', kind: 'color' },
  body: { label: 'Body copy', kind: 'color' },
  font_primary: { label: 'Primary font', kind: 'font' },
  font_secondary: { label: 'Secondary font', kind: 'font' },
};

/** Pre-format a raw audit value for display, given the field's kind. */
function formatValue(kind: AppearanceChangeKind, raw: unknown): string {
  if (kind === 'toggle') {
    if (raw === true || raw === 'true' || raw === 'on') return 'On';
    if (raw === false || raw === 'false' || raw === 'off') return 'Off';
  }
  return raw == null || raw === '' ? '—' : String(raw);
}

/**
 * Returns Appearance changes for a tenant, newest first.
 * @param tenantId  the tenant whose theme history to read
 * @param limit     cap the list (default 20) — see handover §Open decisions on paging
 */
export async function getAppearanceHistory(
  tenantId: string,
  limit = 20
): Promise<AppearanceChange[]> {
  const supabase = getAdminClient();

  // Adjust entity/field column names + the actor FK alias to your audit schema,
  // or move to an RPC if you prefer to format server-side.
  const { data, error } = await supabase
    .from('audit_events')
    .select(
      `
      id, field, old_value, new_value, created_at,
      actor:users!audit_events_actor_id_fkey ( name, email )
    `
    )
    .eq('tenant_id', tenantId)
    .eq('entity', 'settings.appearance')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data
    .filter((r: any) => FIELD_META[r.field]) // ignore fields we don't render
    .map((r: any): AppearanceChange => {
      const meta = FIELD_META[r.field];
      return {
        id: r.id,
        actor: r.actor?.name ?? 'System',
        email: r.actor?.email ?? undefined,
        field: meta.label,
        kind: meta.kind,
        from: formatValue(meta.kind, r.old_value),
        to: formatValue(meta.kind, r.new_value),
        at: r.created_at,
      };
    });
}
