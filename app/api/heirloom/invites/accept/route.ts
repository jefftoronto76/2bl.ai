// POST /api/heirloom/invites/accept
// Accepts an invite token for the currently signed-in Clerk user.
// Called by ChatProvider on the false→true isSignedIn transition when the
// visitor arrived with a valid ?invite=TOKEN in the URL.
//
// Sequence (handled in acceptInvite service function):
// 1. Find the invited members row by token (unused only).
// 2. Delete any orphan active row syncMember may have inserted (the webhook
//    upserts on clerk_id conflict; the invited row has clerk_id=null so no
//    conflict fires and a second row is created first).
// 3. Stamp the original invited row: clerk_id, user_id, status='active',
//    source='invite', used_at=now().

import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { acceptInvite } from '@/services/members'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // empty body handled below
  }

  const token = typeof body.token === 'string' && body.token.trim().length > 0
    ? body.token.trim()
    : null

  if (!token) {
    return Response.json({ error: 'token is required' }, { status: 400 })
  }

  // Resolve the Supabase users.id for the signed-in Clerk user.
  const supabase = getAdminClient()
  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()

  const supabaseUserId = (userRow as { id: string } | null)?.id ?? null
  if (!supabaseUserId) {
    console.error('[heirloom/invites/accept] no users row for clerk_id:', user.providerUserId)
    return Response.json({ error: 'User not found' }, { status: 404 })
  }

  const result = await acceptInvite(token, user.providerUserId, supabaseUserId)

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_ACCEPTED,
    tenant_id: null, // HEIRLOOM_TENANT_ID stamped inside acceptInvite on the members row
    actor_id: supabaseUserId,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    target_type: 'member',
    target_id: result.data.memberId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return Response.json({ ok: true })
}
