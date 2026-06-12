// DELETE /api/platform/members/invite/:memberId
// Platform admin only. Hard-deletes a members row that has no associated users row
// (invited-only / waitlist members — status='invited' or status='waitlist' with user_id IS NULL).
// Used to revoke an invite or remove a waitlist entry before the person has signed up.

import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

interface RouteContext {
  params: Promise<{ memberId: string }>
}

export async function DELETE(req: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

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

  // Verify the row exists and has no linked user — refuse to delete a signed-up member here.
  const { data: memberRow, error: fetchErr } = await supabase
    .from('members')
    .select('id, tenant_id, status, user_id')
    .eq('id', memberId)
    .maybeSingle()

  if (fetchErr || !memberRow) {
    return Response.json({ error: 'Member not found' }, { status: 404 })
  }

  if ((memberRow as { user_id: string | null }).user_id !== null) {
    return Response.json(
      { error: 'Use the user delete endpoint for members who have signed up' },
      { status: 400 },
    )
  }

  void logEvent({
    action: AuditAction.MEMBER_HARD_DELETED,
    tenant_id: platformTenantId,
    actor_id: actorId,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    target_type: 'member',
    target_id: memberId,
    metadata: {
      reason: 'admin_revoke_invite',
      status: (memberRow as { status: string }).status,
    },
  })

  const { error: deleteErr } = await supabase.from('members').delete().eq('id', memberId)

  if (deleteErr) {
    console.error('[platform/members/invite/delete] delete failed:', deleteErr.message)
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return new Response(null, { status: 204 })
}
