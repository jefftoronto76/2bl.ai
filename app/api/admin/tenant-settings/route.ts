import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth'
import { logEvent, AuditAction } from '@/services/audit'

interface TenantSettings {
  chat_in_progress_idle_seconds: number
  chat_active_idle_seconds: number
  invite_gate_enabled: boolean
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[tenant-settings] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('chat_in_progress_idle_seconds, chat_active_idle_seconds, settings')
    .eq('id', authCtx.tenant_id)
    .maybeSingle()

  if (error) {
    console.error('[tenant-settings] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    console.warn('[tenant-settings] tenant row not found:', authCtx.tenant_id)
    return Response.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const tenantSettings = data.settings as Record<string, unknown> | null

  const settings: TenantSettings = {
    chat_in_progress_idle_seconds: data.chat_in_progress_idle_seconds,
    chat_active_idle_seconds: data.chat_active_idle_seconds,
    invite_gate_enabled: (tenantSettings?.invite_gate_enabled as boolean | undefined) ?? true,
  }
  console.log('[tenant-settings] GET', { tenant_id: authCtx.tenant_id, ...settings })

  return Response.json(settings)
}

export async function PATCH(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[tenant-settings] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    chat_in_progress_idle_seconds?: unknown
    chat_active_idle_seconds?: unknown
    invite_gate_enabled?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Build the tenants column update — only include provided fields.
  const colUpdate: Record<string, unknown> = {}

  if (body.chat_in_progress_idle_seconds !== undefined || body.chat_active_idle_seconds !== undefined) {
    if (!isPositiveInteger(body.chat_in_progress_idle_seconds)) {
      return Response.json(
        { error: 'chat_in_progress_idle_seconds must be a positive integer' },
        { status: 400 },
      )
    }
    if (!isPositiveInteger(body.chat_active_idle_seconds)) {
      return Response.json(
        { error: 'chat_active_idle_seconds must be a positive integer' },
        { status: 400 },
      )
    }
    if (body.chat_in_progress_idle_seconds >= body.chat_active_idle_seconds) {
      return Response.json(
        { error: 'chat_in_progress_idle_seconds must be less than chat_active_idle_seconds' },
        { status: 400 },
      )
    }
    colUpdate.chat_in_progress_idle_seconds = body.chat_in_progress_idle_seconds
    colUpdate.chat_active_idle_seconds = body.chat_active_idle_seconds
  }

  if (body.invite_gate_enabled !== undefined) {
    if (typeof body.invite_gate_enabled !== 'boolean') {
      return Response.json({ error: 'invite_gate_enabled must be a boolean' }, { status: 400 })
    }
    // Read-modify-write the JSONB settings column.
    const { data: current, error: fetchErr } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', authCtx.tenant_id)
      .maybeSingle()
    if (fetchErr) {
      console.error('[tenant-settings] settings fetch failed:', fetchErr.message)
      return Response.json({ error: fetchErr.message }, { status: 500 })
    }
    const existing = (current?.settings as Record<string, unknown> | null) ?? {}
    colUpdate.settings = { ...existing, invite_gate_enabled: body.invite_gate_enabled }
  }

  if (Object.keys(colUpdate).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(colUpdate)
    .eq('id', authCtx.tenant_id)
    .select('chat_in_progress_idle_seconds, chat_active_idle_seconds, settings')
    .single()

  if (error) {
    console.error('[tenant-settings] update failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const tenantSettings = data.settings as Record<string, unknown> | null

  const settings: TenantSettings = {
    chat_in_progress_idle_seconds: data.chat_in_progress_idle_seconds,
    chat_active_idle_seconds: data.chat_active_idle_seconds,
    invite_gate_enabled: (tenantSettings?.invite_gate_enabled as boolean | undefined) ?? true,
  }
  console.log('[tenant-settings] PATCH', { tenant_id: authCtx.tenant_id, ...settings })

  void logEvent({
    action: AuditAction.TENANT_SETTINGS_UPDATE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'tenant_settings',
    target_id: authCtx.tenant_id,
    correlation_id: req.headers.get('x-correlation-id'),
    changes: { after: colUpdate },
    metadata: {},
  })

  return Response.json(settings)
}
