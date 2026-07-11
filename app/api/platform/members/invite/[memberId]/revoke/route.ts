// POST /api/platform/members/invite/:memberId/revoke
// Platform admin only. Soft-revokes an invite link: stamps revoked_at on the
// members row (does NOT delete it — the hard-delete DELETE on the parent
// route is a separate, invite-only-member operation). The token then 410s at
// the public redirect route and is rejected by validateMemberToken /
// acceptInvite. Refuses to revoke an already-accepted invite (409).

import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, logAuthEvent, AuditAction, AuthEventType } from '@/services/audit'
import { toInviteLink } from '@/app/admin/members/inviteLink'

interface RouteContext {
  params: Promise<{ memberId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    console.warn('[platform/members/invite/revoke] 401 — no session')
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      outcome: 'failure',
      failure_reason: 'no_session',
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { path: '/api/platform/members/invite/[memberId]/revoke' },
    })
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    console.warn('[platform/members/invite/revoke] 403 — not platform admin', { providerUserId: user.providerUserId })
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      failure_reason: 'not_platform_admin',
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { path: '/api/platform/members/invite/[memberId]/revoke' },
    })
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { memberId } = await context.params
  if (!memberId) return Response.json({ error: 'Missing memberId' }, { status: 400 })

  const supabase = getAdminClient()

  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const actorId = (actorRow as { id: string } | null)?.id ?? null
  const platformTenantId = await getTenantFromRequest(req)

  const { data: memberRow, error: fetchErr } = await supabase
    .from('members')
    .select('id, tenant_id, used_at')
    .eq('id', memberId)
    .maybeSingle()

  if (fetchErr || !memberRow) {
    console.warn('[platform/members/invite/revoke] member not found', { providerUserId: user.providerUserId, memberId })
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  const member = memberRow as { id: string; tenant_id: string; used_at: string | null }

  if (member.used_at) {
    console.warn('[platform/members/invite/revoke] already accepted', { memberId })
    return Response.json({ error: 'This invite has already been accepted and cannot be revoked' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateErr } = await supabase
    .from('members')
    .update({ revoked_at: now, updated_at: now })
    .eq('id', memberId)
    .select('token, created_at, used_at, opened_at, opens, revoked_at, expires_at')
    .maybeSingle()

  if (updateErr || !updated) {
    console.error('[platform/members/invite/revoke] update failed:', updateErr?.message, { memberId })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_REVOKED,
      tenant_id: member.tenant_id ?? platformTenantId,
      actor_id: actorId,
      actor_type: 'user',
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      target_type: 'member',
      target_id: memberId,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: updateErr?.message ?? 'update returned no row' },
    })
    return Response.json({ error: updateErr?.message ?? 'Could not revoke invite' }, { status: 500 })
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_REVOKED,
    tenant_id: member.tenant_id ?? platformTenantId,
    actor_id: actorId,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    outcome: 'success',
    target_type: 'member',
    target_id: memberId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  console.log('[platform/members/invite/revoke] success', { providerUserId: user.providerUserId, memberId })

  return Response.json(toInviteLink(updated as {
    token: string | null
    created_at: string | null
    used_at: string | null
    opened_at: string | null
    opens: number | null
    revoked_at: string | null
    expires_at: string | null
  }))
}
