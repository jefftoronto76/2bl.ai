// GET/DELETE /api/platform/members/invite/:memberId
// Platform admin only.
// GET returns the live invite-tracking detail (InviteLink) for the drawer's
// on-open refetch. DELETE hard-deletes a members row that has no associated
// users row (invited-only / waitlist members — status='invited' or
// status='waitlist' with user_id IS NULL); used to revoke an invite or remove
// a waitlist entry before the person has signed up. (Soft revoke — stamping
// revoked_at on an accepted-or-pending invite without deleting the row — is a
// separate POST .../invite/:memberId/revoke endpoint.)

import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, logAuthEvent, AuditAction, AuthEventType } from '@/services/audit'
import { toInviteLink } from '@/app/admin/members/inviteLink'

interface RouteContext {
  params: Promise<{ memberId: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { memberId } = await context.params
  if (!memberId) return Response.json({ error: 'Missing memberId' }, { status: 400 })

  const supabase = getAdminClient()
  const { data: row, error } = await supabase
    .from('members')
    .select('token, created_at, used_at, opened_at, opens, revoked_at, expires_at')
    .eq('id', memberId)
    .maybeSingle()

  if (error || !row) {
    console.warn('[platform/members/invite/get] member not found', { memberId })
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  const invite = toInviteLink(row as {
    token: string | null
    created_at: string | null
    used_at: string | null
    opened_at: string | null
    opens: number | null
    revoked_at: string | null
    expires_at: string | null
  })

  if (!invite) {
    return Response.json({ error: 'No tracked invite for this member' }, { status: 404 })
  }

  return Response.json(invite)
}

export async function DELETE(req: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    console.warn('[platform/members/invite/delete] 401 — no session')
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      outcome: 'failure',
      failure_reason: 'no_session',
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { path: '/api/platform/members/invite/[memberId]' },
    })
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    console.warn('[platform/members/invite/delete] 403 — not platform admin', { providerUserId: user.providerUserId })
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      failure_reason: 'not_platform_admin',
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { path: '/api/platform/members/invite/[memberId]' },
    })
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { memberId } = await context.params
  if (!memberId) return Response.json({ error: 'Missing memberId' }, { status: 400 })

  console.log('[platform/members/invite/delete] DELETE entry', { providerUserId: user.providerUserId, memberId })

  const supabase = getAdminClient()

  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const actorId = (actorRow as { id: string } | null)?.id ?? null
  const platformTenantId = await getTenantFromRequest(req)

  let reason: string | null = null
  try {
    const body = (await req.json()) as { reason?: string }
    reason = body.reason?.trim() || null
  } catch {
    // Body is optional — DELETE requests may have no body.
  }

  // Verify the row exists and has no linked user — refuse to delete a signed-up member here.
  const { data: memberRow, error: fetchErr } = await supabase
    .from('members')
    .select('id, tenant_id, status, user_id')
    .eq('id', memberId)
    .maybeSingle()

  if (fetchErr || !memberRow) {
    console.warn('[platform/members/invite/delete] member not found', { providerUserId: user.providerUserId, memberId })
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  if ((memberRow as { user_id: string | null }).user_id !== null) {
    return Response.json(
      { error: 'Use the user delete endpoint for members who have signed up' },
      { status: 400 },
    )
  }

  const { error: deleteErr } = await supabase.from('members').delete().eq('id', memberId)

  if (deleteErr) {
    console.error('[platform/members/invite/delete] delete failed:', deleteErr.message, { providerUserId: user.providerUserId, memberId })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_REVOKED,
      tenant_id: platformTenantId,
      actor_id: actorId,
      actor_type: 'user',
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      target_type: 'member',
      target_id: memberId,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: deleteErr.message, status: (memberRow as { status: string }).status },
    })
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_REVOKED,
    tenant_id: platformTenantId,
    actor_id: actorId,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    outcome: 'success',
    target_type: 'member',
    target_id: memberId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {
      status: (memberRow as { status: string }).status,
      ...(reason ? { reason } : {}),
    },
  })

  console.log('[platform/members/invite/delete] success', { providerUserId: user.providerUserId, memberId })

  return new Response(null, { status: 204 })
}
