import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/services/auth/supabase-admin';
import { getAuthContext } from '@/services/auth';
import { logEvent, AuditAction } from '@/services/audit';
import type { AppearanceChangeKind } from '@/app/admin/settings/types';
import { hexToRgbTriplet } from '@/services/branding/hex-utils';

// `target` query param ('storefront' | 'admin', default 'storefront') selects
// which tenant_branding row to read/write. Rows are keyed by (tenant_id, target);
// the upsert conflict target is 'tenant_id,target'.
// GET_SELECT includes the two read-only sync columns: defaults_synced_at,
// branding_warnings. They are NOT editable (excluded from STRING/BOOL fields).
// Audit metadata carries `target` so per-target history can be filtered.

type BrandingTarget = 'storefront' | 'admin';

function parseTarget(req: Request): BrandingTarget {
  const t = new URL(req.url).searchParams.get('target');
  return t === 'admin' ? 'admin' : 'storefront';
}

// Per-tenant CSS defaults — returned when tenant_branding has no row yet.
const TENANT_BRAND_DEFAULTS: Record<string, {
  background:      string;
  accent:          string;
  lede:            string;
  heading:         string;
  body:            string;
  font_primary:    string;
  font_secondary:  string;
  font_mono:       string;
  paper_effect:    'warm' | 'lift' | 'flat';
  accent_buttons:  boolean;
  use_db_branding: boolean;
}> = {
  // jefflougheed.ca
  'e07334a0-2afd-4544-898b-edb124d2dd33': {
    background:      '#f9f8f5',
    accent:          '#2d6a4f',
    lede:            '#7e7d7b',
    heading:         '#1a1917',
    body:            '#1a1917',
    font_primary:    'Playfair Display, Georgia, serif',
    font_secondary:  'DM Sans, sans-serif',
    font_mono:       'DM Mono, Courier New, monospace',
    paper_effect:    'lift',
    accent_buttons:  true,
    use_db_branding: false,
  },
  // 2bl.ai (SBL)
  '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb': {
    background:      '#FAF6EE',
    accent:          '#C8542E',
    lede:            '#6B6256',
    heading:         '#1F1A14',
    body:            '#1F1A14',
    font_primary:    'Newsreader, serif',
    font_secondary:  'Manrope, sans-serif',
    font_mono:       'DM Mono, Courier New, monospace',
    paper_effect:    'lift',
    accent_buttons:  true,
    use_db_branding: false,
  },
  // heirloom.2bl.ai
  '20767f1d-1148-4e43-ab73-f6da88f0ac56': {
    background:      '#1C0F06',
    accent:          '#C9A96E',
    lede:            'rgba(245, 239, 230, 0.55)',
    heading:         '#F5EFE6',
    body:            '#F5EFE6',
    font_primary:    'Cormorant Garamond, Georgia, serif',
    font_secondary:  'DM Sans, sans-serif',
    font_mono:       'DM Mono, Courier New, monospace',
    paper_effect:    'lift',
    accent_buttons:  true,
    use_db_branding: false,
  },
};

// User-controllable string columns (includes enum fields like paper_effect)
const STRING_FIELDS = [
  'background',
  'accent',
  'accent_hover',
  'lede',
  'heading',
  'body',
  'font_primary',
  'font_secondary',
  'font_mono',
  'paper_effect',
] as const;

// User-controllable boolean columns (excluded from string validation)
const BOOL_FIELDS = [
  'accent_buttons',
  'use_db_branding',
] as const;

type StringField   = (typeof STRING_FIELDS)[number];
type BoolField     = (typeof BOOL_FIELDS)[number];
type EditableField = StringField | BoolField;

const FIELD_KIND: Record<EditableField, AppearanceChangeKind> = {
  background:      'color',
  accent:          'color',
  accent_hover:    'color',
  lede:            'color',
  heading:         'color',
  body:            'color',
  font_primary:    'font',
  font_secondary:  'font',
  font_mono:       'font',
  paper_effect:    'toggle',
  accent_buttons:  'toggle',
  use_db_branding: 'toggle',
};

// defaults_synced_at + branding_warnings are read-only sync columns surfaced
// to the SyncStatus card. They are NOT in STRING/BOOL fields so they can never
// be written via PATCH.
const GET_SELECT =
  'background, accent, accent_hover, accent_rgb, lede, heading, body, font_primary, font_secondary, font_mono, paper_effect, accent_buttons, use_db_branding, brand_name, logo_url, favicon_folder, defaults_synced_at, branding_warnings';

export async function GET(req: Request) {
  const target = parseTarget(req);

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
    .select(GET_SELECT)
    .eq('tenant_id', authCtx.tenant_id)
    .eq('target', target)
    .maybeSingle();

  if (error) {
    console.error('[appearance] fetch failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (data === null) {
    const defaults =
      TENANT_BRAND_DEFAULTS[authCtx.tenant_id] ??
      TENANT_BRAND_DEFAULTS['e07334a0-2afd-4544-898b-edb124d2dd33'];
    return Response.json({ data: { ...defaults, target, defaults_synced_at: null, branding_warnings: null } });
  }

  return Response.json({ data });
}

export async function PATCH(req: Request) {
  const target = parseTarget(req);

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

  // Parse and validate string fields
  const incomingStr: Partial<Record<StringField, string>> = {};
  for (const field of STRING_FIELDS) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string') {
        return Response.json({ error: `${field} must be a string` }, { status: 400 });
      }
      incomingStr[field] = body[field] as string;
    }
  }

  // Parse and validate boolean fields
  const incomingBool: Partial<Record<BoolField, boolean>> = {};
  for (const field of BOOL_FIELDS) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'boolean') {
        return Response.json({ error: `${field} must be a boolean` }, { status: 400 });
      }
      incomingBool[field] = body[field] as boolean;
    }
  }

  if (Object.keys(incomingStr).length + Object.keys(incomingBool).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Fetch current row for diffing and for the upsert base.
  const { data: current, error: fetchErr } = await supabase
    .from('tenant_branding')
    .select([...STRING_FIELDS, ...BOOL_FIELDS].join(', '))
    .eq('tenant_id', authCtx.tenant_id)
    .eq('target', target)
    .maybeSingle();

  if (fetchErr) {
    console.error('[appearance] current fetch failed:', fetchErr.message);
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  const currentRow = (current ?? {}) as Record<string, string | boolean | null>;

  // Build upsert payload with only changed fields.
  const upsertPayload: Record<string, string | boolean | null> = {
    tenant_id: authCtx.tenant_id,
    target,
  };
  const changedFields: EditableField[] = [];

  for (const field of STRING_FIELDS) {
    if (incomingStr[field] !== undefined && incomingStr[field] !== (currentRow[field] ?? null)) {
      upsertPayload[field] = incomingStr[field]!;
      changedFields.push(field);
    }
  }

  for (const field of BOOL_FIELDS) {
    if (incomingBool[field] !== undefined && incomingBool[field] !== (currentRow[field] ?? null)) {
      upsertPayload[field] = incomingBool[field]!;
      changedFields.push(field);
    }
  }

  // Derive accent_rgb when accent changes.
  if (changedFields.includes('accent') && incomingStr.accent) {
    const triplet = hexToRgbTriplet(incomingStr.accent);
    if (triplet) upsertPayload.accent_rgb = triplet;
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
  const actorName  = actorUser?.name ?? actorUser?.email ?? 'Admin';
  const actorEmail = actorUser?.email ?? null;

  const { data: updated, error: upsertErr } = await supabase
    .from('tenant_branding')
    .upsert(upsertPayload, { onConflict: 'tenant_id,target' })
    .select(GET_SELECT)
    .single();

  if (upsertErr) {
    console.error('[appearance] upsert failed:', upsertErr.message);
    return Response.json({ error: upsertErr.message }, { status: 500 });
  }

  console.log('[appearance] PATCH', {
    tenant_id: authCtx.tenant_id,
    target,
    changed: changedFields,
  });

  const correlationId  = req.headers.get('x-correlation-id');
  const stringFieldSet = new Set<string>(STRING_FIELDS);

  for (const field of changedFields) {
    const oldVal = currentRow[field] ?? null;
    const newVal: string | boolean | null = stringFieldSet.has(field)
      ? (incomingStr[field as StringField] ?? null)
      : (incomingBool[field as BoolField] ?? null);

    void logEvent({
      action: AuditAction.APPEARANCE_UPDATE,
      tenant_id:   authCtx.tenant_id,
      actor_id:    authCtx.owner_id,
      actor_email: actorEmail,
      target_type: 'settings.appearance',
      target_id:   authCtx.tenant_id,
      correlation_id: correlationId,
      metadata: {
        target,
        field,
        old_value: oldVal,
        new_value: newVal,
        kind: FIELD_KIND[field],
        actor_name: actorName,
      },
    });
  }

  revalidatePath('/');
  revalidatePath('/secondbrainlabs');
  revalidatePath('/heirloom');

  return Response.json({ data: updated });
}
