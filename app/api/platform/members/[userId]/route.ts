// DELETE /api/platform/members/:userId
// Platform admin only. Hard-deletes the users row — DB cascades remove
// dependent members, chat_sessions, etc. The audit record is written FIRST
// so it is never lost even if the delete fails. This action is irreversible.

import { getCurrentUser, getTenantFromRequest } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { hardDeleteMember } from '@/services/members'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function DELETE(req: Request, context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await context.params
  if (!userId) return Response.json({ error: 'Missing userId' }, { status: 400 })

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
    const body = await req.json() as { reason?: string }
    reason = body.reason?.trim() || null
  } catch {
    // Body is optional — DELETE requests may have no body.
  }

  const result = await hardDeleteMember(userId, actorId, platformTenantId, reason)

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return new Response(null, { status: 204 })
}
