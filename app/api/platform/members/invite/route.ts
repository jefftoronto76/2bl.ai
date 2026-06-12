// POST /api/platform/members/invite
// Platform admin only. Creates a members row with status = 'invited' and
// returns the generated token. The client constructs the full invite URL from
// window.location.origin + the tenant-appropriate path + '?invite=' + token.

import { getCurrentUser } from '@/services/auth'
import { createMemberInvite } from '@/services/members'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { tenant_id?: string; invited_name?: string | null }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id, invited_name } = body
  if (!tenant_id) {
    return Response.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const actorId = req.headers.get('x-correlation-id') // passed as audit correlation; actor resolved below
  void actorId // suppress lint; actor_id stamped inside createMemberInvite via getCurrentUser providerUserId

  // Resolve the Supabase users.id for the acting admin for audit attribution.
  const { getAdminClient } = await import('@/services/auth/supabase-admin')
  const supabase = getAdminClient()
  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const resolvedActorId = (actorRow as { id: string } | null)?.id ?? null

  const result = await createMemberInvite(tenant_id, resolvedActorId, invited_name ?? null)

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json({ token: result.data.token, member_id: result.data.memberId }, { status: 201 })
}
