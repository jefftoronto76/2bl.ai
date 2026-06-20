import { getAdminClient } from '@/services/auth/supabase-admin';
import { getAuthContext } from '@/services/auth';
import { logEvent, AuditAction } from '@/services/audit';
import type { AppearanceChangeKind } from '@/app/admin/settings/types';

// Per-tenant CSS defaults — returned when tenant_branding has no row yet.
// Colors are solid-hex approximations of the CSS palette values (including
// any rgba → hex conversions for the muted tokens on their respective bg).
const TENANT_BRAND_DEFAULTS: Record<string, {
  color_background: string;
  color_accent: string;
  color_text_primary: string;
  color_text_muted: string;
  font_display: string;
  font_body: string;
  font_mono: string;
}> = {
  // jefflougheed.ca
  'e07334a0-2afd-4544-898b-edb124d2dd33': {
    color_background: '#f9f8f5',
    color_accent: '#2d6a4f',
    color_text_primary: '#1a1917',
    color_text_muted: '#7e7d7b',
    font_display: 'Playfair Display, Georgia, serif',
    font_body: 'DM Sans, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
  },
  // 2bl.ai (SBL)
  '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb': {
    color_background: '#FAF6EE',
    color_accent: '#C8542E',
    color_text_primary: '#1F1A14',
    color_text_muted: '#6B6256',
    font_display: 'Newsreader, serif',
    font_body: 'Manrope, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
  },
  // heirloom.2bl.ai
  '20767f1d-1148-4e43-ab73-f6da88f0ac56': {
    color_background: '#1C0F06',
    color_accent: '#C9A96E',
    color_text_primary: '#F5EFE6',
    color_text_muted: '#938A81',
    font_display: 'Cormorant Garamond, serif',
    font_body: 'DM Sans, sans-serif',
    font_mono: 'DM Mono, Courier New, monospace',
  },
};

// The 7 user-controllable columns — color_accent_rgb is excluded (derived).
const EDITABLE_FIELDS = [
  'color_background',
  'color_accent',
  'color_text_primary',
  'color_text_muted',
  'font_display',
  'font_body',
  'font_mono',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

const FIELD_KIND: Record<EditableField, AppearanceChangeKind> = {
  color_background:   'color',
  color_accent:       'color',
  color_text_primary: 'color',
  color_text_muted:   'color',
  font_display:       'font',
  font_body:          'font',
  font_mono:          'font',
};

/** Converts a 6-char hex string (#RRGGBB or RRGGBB) to "R G B" triplet for CSS vars. */
function hexToRgbTriplet(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string };
  try {
    authCtx = await getAuthContext();
  } catch (err) {
    console.error('[appearance] auth failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('tenant_branding')
    .select(
      'color_background, color_accent, color_accent_rgb, color_text_primary, color_text_muted, font_display, font_body, font_mono, brand_name, logo_url, favicon_folder'
    )
    .eq('tenant_id', authCtx.tenant_id)
    .maybeSingle();

  if (error) {
    console.error('[appearance] fetch failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (data === null) {
    const defaults =
      TENANT_BRAND_DEFAULTS[authCtx.tenant_id] ??
      TENANT_BRAND_DEFAULTS['e07334a0-2afd-4544-898b-edb124d2dd33'];
    return Response.json({ data: defaults });
  }

  return Response.json({ data });
}

export async function PATCH(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string };
  try {
    authCtx = await getAuthContext();
  } catch (err) {
    console.error('[appearance] auth failed:', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Strip any keys that aren't in the editable set (color_accent_rgb excluded from input).
  const incoming: Partial<Record<EditableField, string>> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string') {
        return Response.json({ error: `${field} must be a string` }, { status: 400 });
      }
      incoming[field] = body[field] as string;
    }
  }

  if (Object.keys(incoming).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Fetch current row for diffing and for the upsert base.
  const { data: current, error: fetchErr } = await supabase
    .from('tenant_branding')
    .select(EDITABLE_FIELDS.join(', '))
    .eq('tenant_id', authCtx.tenant_id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[appearance] current fetch failed:', fetchErr.message);
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  const currentRow = (current ?? {}) as Partial<Record<EditableField, string | null>>;

  // Build the upsert payload with only changed fields.
  const upsertPayload: Record<string, string | null> = { tenant_id: authCtx.tenant_id };
  const changedFields: EditableField[] = [];

  for (const field of EDITABLE_FIELDS) {
    if (incoming[field] !== undefined && incoming[field] !== (currentRow[field] ?? null)) {
      upsertPayload[field] = incoming[field]!;
      changedFields.push(field);
    }
  }

  // Silently derive color_accent_rgb when color_accent is changing.
  if (changedFields.includes('color_accent') && incoming.color_accent) {
    const triplet = hexToRgbTriplet(incoming.color_accent);
    if (triplet) upsertPayload.color_accent_rgb = triplet;
  }

  if (changedFields.length === 0) {
    // Nothing actually changed — return current data without writing.
    return Response.json({ data: current ?? null });
  }

  // Fetch actor name for audit metadata.
  const { data: actorUser } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', authCtx.owner_id)
    .maybeSingle();
  const actorName = actorUser?.name ?? actorUser?.email ?? 'Admin';
  const actorEmail = actorUser?.email ?? null;

  const { data: updated, error: upsertErr } = await supabase
    .from('tenant_branding')
    .upsert(upsertPayload, { onConflict: 'tenant_id' })
    .select(
      'color_background, color_accent, color_accent_rgb, color_text_primary, color_text_muted, font_display, font_body, font_mono, brand_name, logo_url, favicon_folder'
    )
    .single();

  if (upsertErr) {
    console.error('[appearance] upsert failed:', upsertErr.message);
    return Response.json({ error: upsertErr.message }, { status: 500 });
  }

  console.log('[appearance] PATCH', {
    tenant_id: authCtx.tenant_id,
    changed: changedFields,
  });

  const correlationId = req.headers.get('x-correlation-id');

  for (const field of changedFields) {
    void logEvent({
      action: AuditAction.APPEARANCE_UPDATE,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_email: actorEmail,
      target_type: 'settings.appearance',
      target_id: authCtx.tenant_id,
      correlation_id: correlationId,
      metadata: {
        field,
        old_value: currentRow[field] ?? null,
        new_value: incoming[field],
        kind: FIELD_KIND[field],
        actor_name: actorName,
      },
    });
  }

  return Response.json({ data: updated });
}
