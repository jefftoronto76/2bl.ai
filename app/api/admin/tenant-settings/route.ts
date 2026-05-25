import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

interface TenantSettings {
  chat_in_progress_idle_seconds: number
  chat_active_idle_seconds: number
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
    .select('chat_in_progress_idle_seconds, chat_active_idle_seconds')
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

  const settings: TenantSettings = {
    chat_in_progress_idle_seconds: data.chat_in_progress_idle_seconds,
    chat_active_idle_seconds: data.chat_active_idle_seconds,
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
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

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

  const inProgress: number = body.chat_in_progress_idle_seconds
  const active: number = body.chat_active_idle_seconds

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('tenants')
    .update({
      chat_in_progress_idle_seconds: inProgress,
      chat_active_idle_seconds: active,
    })
    .eq('id', authCtx.tenant_id)
    .select('chat_in_progress_idle_seconds, chat_active_idle_seconds')
    .single()

  if (error) {
    console.error('[tenant-settings] update failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const settings: TenantSettings = {
    chat_in_progress_idle_seconds: data.chat_in_progress_idle_seconds,
    chat_active_idle_seconds: data.chat_active_idle_seconds,
  }
  console.log('[tenant-settings] PATCH', { tenant_id: authCtx.tenant_id, ...settings })

  return Response.json(settings)
}
