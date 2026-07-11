// POST /api/admin/members/invite/:memberId/revoke
// Tenant-admin scoped. Soft-revokes an invite link: stamps revoked_at on the
// members row (does NOT delete it — the hard-delete DELETE on the parent
// route is a separate, invite-only-member operation). The tenant_id guard
// prevents cross-tenant revocation. The token then 410s at the public
// redirect route and is rejected by validateMemberToken / acceptInvite.
// Refuses to revoke an already-accepted invite (409).

import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'
import { toInviteLink } from '@/app/admin/members/inviteLink'

interface RouteContext {
  params: Promise<{ memberId: string }>
}

export async function POST(req: Request, context: RouteContext) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.warn('[admin/members/invite/revoke] 401 — auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id: actorId, tenant_id: tenantId } = authCtx
  const { memberId } = await context.params
  if (!memberId) return Response.json({ error: 'Missing memberId' }, { status: 400 })

  const supabase = getAdminClient()

  const { data: memberRow, error: fetchErr } = await supabase
    .from('members')
    .select('id, tenant_id, used_at')
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchErr || !memberRow) {
    console.warn('[admin/members/invite/revoke] member not found or wrong tenant', { tenantId, memberId })
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  const member = memberRow as { id: string; tenant_id: string; used_at: string | null }

  if (member.used_at) {
    console.warn('[admin/members/invite/revoke] already accepted', { tenantId, memberId })
    return Response.json({ error: 'This invite has already been accepted and cannot be revoked' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateErr } = await supabase
    .from('members')
    .update({ revoked_at: now, updated_at: now })
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .select('token, created_at, used_at, opened_at, opens, revoked_at, expires_at')
    .maybeSingle()

  if (updateErr || !updated) {
    console.error('[admin/members/invite/revoke] update failed:', updateErr?.message, { tenantId, memberId })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_REVOKED,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: 'user',
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
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'user',
    outcome: 'success',
    target_type: 'member',
    target_id: memberId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  console.log('[admin/members/invite/revoke] success', { actorId, tenantId, memberId })

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
