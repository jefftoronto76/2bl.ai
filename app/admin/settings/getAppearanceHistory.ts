// app/admin/settings/getAppearanceHistory.ts
//
// Server-only reader for the Appearance change history. Reads audit_events rows
// written by the Appearance PATCH route — one row per changed field, each
// carrying field/old_value/new_value/kind/actor_name in metadata.
//
// Does NOT write audit rows — that is the Save handler's responsibility.

import 'server-only';
import { getAdminClient } from '@/services/auth/supabase-admin';
import type { AppearanceChange, AppearanceChangeKind } from './types';

/**
 * Maps tenant_branding column names (as stored in metadata.field) to their
 * display label and diff kind. Includes both new schema names and legacy names
 * so old audit_events rows still render correctly.
 */
const FIELD_META: Record<string, { label: string; kind: AppearanceChangeKind }> = {
  // New schema
  background:     { label: 'Background',         kind: 'color'  },
  accent:         { label: 'Accent',             kind: 'color'  },
  accent_hover:   { label: 'Accent hover',        kind: 'color'  },
  lede:           { label: 'Lede',               kind: 'color'  },
  heading:        { label: 'Heading (H1)',        kind: 'color'  },
  body:           { label: 'Body copy',           kind: 'color'  },
  sidebar_bg:     { label: 'Sidebar background',  kind: 'color'  },
  sidebar_text:   { label: 'Sidebar text',        kind: 'color'  },
  muted:          { label: 'Muted text',          kind: 'color'  },
  font_primary:   { label: 'Primary font',        kind: 'font'   },
  font_secondary: { label: 'Secondary font',      kind: 'font'   },
  font_mono:      { label: 'Mono font',           kind: 'font'   },
  paper_effect:   { label: 'Paper effect',        kind: 'toggle' },
  accent_buttons: { label: 'Accent buttons',      kind: 'toggle' },
  // Legacy backward-compat (old audit_events rows still render)
  color_background:   { label: 'Background',    kind: 'color' },
  color_accent:       { label: 'Accent',         kind: 'color' },
  color_text_primary: { label: 'Text primary',   kind: 'color' },
  color_text_muted:   { label: 'Text muted',     kind: 'color' },
  font_display:       { label: 'Display font',   kind: 'font'  },
  font_body:          { label: 'Body font',      kind: 'font'  },
};

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
 * @param limit     cap the list (default 20)
 */
export async function getAppearanceHistory(
  tenantId: string,
  limit = 20
): Promise<AppearanceChange[]> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('audit_events')
    .select('id, metadata, actor_email, created_at')
    .eq('tenant_id', tenantId)
    .eq('action', 'appearance.update')
    .eq('target_type', 'settings.appearance')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data
    .filter((r: any) => {
      const field = (r.metadata as Record<string, unknown> | null)?.field;
      return typeof field === 'string' && FIELD_META[field];
    })
    .map((r: any): AppearanceChange => {
      const meta_json = r.metadata as Record<string, unknown>;
      const field = meta_json.field as string;
      const meta = FIELD_META[field];
      return {
        id: String(r.id),
        actor: (meta_json.actor_name as string | undefined) ?? r.actor_email ?? 'System',
        email: r.actor_email ?? undefined,
        field: meta.label,
        kind: meta.kind,
        from: formatValue(meta.kind, meta_json.old_value),
        to: formatValue(meta.kind, meta_json.new_value),
        at: r.created_at,
      };
    });
}
