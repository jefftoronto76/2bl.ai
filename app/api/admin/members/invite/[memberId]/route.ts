// DELETE /api/admin/members/invite/:memberId
// Tenant-admin scoped. Revokes an invite-only or waitlist members row that belongs
// to the authenticated admin's tenant and has no linked users row (not yet signed up).
// The tenant_id guard prevents cross-tenant revocation.

import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

interface RouteContext {
  params: Promise<{ memberId: string }>
}

export async function DELETE(req: Request, context: RouteContext) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.warn('[admin/members/invite/delete] 401 — auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id: actorId, tenant_id: tenantId } = authCtx
  const { memberId } = await context.params

  if (!memberId) {
    return Response.json({ error: 'Missing memberId' }, { status: 400 })
  }

  console.log('[admin/members/invite/delete] DELETE entry', { actorId, tenantId, memberId })

  let reason: string | null = null
  try {
    const body = (await req.json()) as { reason?: string }
    reason = body.reason?.trim() || null
  } catch {
    // Body is optional.
  }

  const supabase = getAdminClient()

  // Verify the row exists, belongs to this tenant, and has no linked user.
  const { data: memberRow, error: fetchErr } = await supabase
    .from('members')
    .select('id, tenant_id, status, user_id')
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchErr || !memberRow) {
    console.warn('[admin/members/invite/delete] member not found or wrong tenant', { tenantId, memberId })
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  if ((memberRow as { user_id: string | null }).user_id !== null) {
    return Response.json(
      { error: 'Use the user delete endpoint for members who have signed up' },
      { status: 400 },
    )
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_REVOKED,
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'member',
    target_id: memberId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {
      status: (memberRow as { status: string }).status,
      ...(reason ? { reason } : {}),
    },
  })

  const { error: deleteErr } = await supabase.from('members').delete().eq('id', memberId)

  if (deleteErr) {
    console.error('[admin/members/invite/delete] delete failed:', deleteErr.message, { actorId, tenantId, memberId })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_REVOKED,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: 'user',
      outcome: 'failure',
      target_type: 'member',
      target_id: memberId,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: deleteErr.message },
    })
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  console.log('[admin/members/invite/delete] success', { actorId, tenantId, memberId })

  return new Response(null, { status: 204 })
}
