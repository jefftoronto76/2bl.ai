// POST /api/admin/members/invite
// Tenant-admin scoped. Any authenticated admin can invite members into their own
// tenant. tenant_id is resolved server-side from getAuthContext() — the client-
// supplied tenant_id in the body is ignored (the admin cannot invite to a different
// tenant). Mirrors the business logic of /api/platform/members/invite.

import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { createMemberInvite } from '@/services/members'
import { logEvent, AuditAction } from '@/services/audit'
import { inviteUrlFor } from '@/app/admin/members/inviteLink'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.warn('[admin/members/invite] 401 — auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id: actorId, tenant_id: tenantId } = authCtx

  let body: {
    invited_name?: string | null
    email?: string | null
    phone?: string | null
    auto_open?: boolean
    primer?: string | null
    // tenant_id from the client is intentionally ignored — resolved from auth context
    [key: string]: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { invited_name, email, phone, auto_open, primer } = body

  console.log('[admin/members/invite] POST entry', {
    actorId,
    tenantId,
    hasEmail: !!email,
    hasPhone: !!phone,
    hasName: !!invited_name,
    autoOpen: auto_open === true,
    hasPrimer: !!(primer && String(primer).trim()),
  })

  const supabase = getAdminClient()

  // Fetch tenant domain and default_primer for invite URL construction.
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('domain, default_primer')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantErr) {
    console.warn('[admin/members/invite] tenant lookup failed (non-fatal):', tenantErr.message)
  }

  const tenantDomain = (tenantRow as { domain: string | null; default_primer?: string | null } | null)?.domain ?? null
  const defaultPrimer = (tenantRow as { domain: string | null; default_primer?: string | null } | null)?.default_primer ?? null

  const resolvedPrimer =
    primer != null && String(primer).trim().length > 0 ? String(primer).trim() : defaultPrimer

  const result = await createMemberInvite(
    tenantId,
    actorId,
    (invited_name as string | null | undefined) ?? null,
    (email as string | null | undefined) ?? null,
    (phone as string | null | undefined) ?? null,
    auto_open === true,
    resolvedPrimer,
  )

  if (!result.ok) {
    console.error('[admin/members/invite] createMemberInvite failed:', result.error, { actorId, tenantId })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_CREATED,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: 'user',
      outcome: 'failure',
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: result.error },
    })
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { token, memberId } = result.data
  const inviteUrl = tenantDomain ? inviteUrlFor(token, tenantDomain) : null

  console.log('[admin/members/invite] success', { actorId, tenantId, memberId, hasInviteUrl: !!inviteUrl })

  return Response.json({ token, member_id: memberId, invite_url: inviteUrl }, { status: 201 })
}
