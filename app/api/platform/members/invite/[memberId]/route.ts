// DELETE /api/platform/members/invite/:memberId
// Platform admin only. Hard-deletes a members row that has no associated users row
// (invited-only / waitlist members — status='invited' or status='waitlist' with user_id IS NULL).
// Used to revoke an invite or remove a waitlist entry before the person has signed up.

import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

interface RouteContext {
  params: Promise<{ memberId: string }>
}

export async function DELETE(req: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    console.warn('[platform/members/invite/delete] 401 — no session')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    console.warn('[platform/members/invite/delete] 403 — not platform admin', { providerUserId: user.providerUserId })
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
