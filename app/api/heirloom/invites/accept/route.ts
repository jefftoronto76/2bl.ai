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

import { getCurrentUser, ensureClerkUser } from '@/services/auth'
import { acceptInvite } from '@/services/members'

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

  console.log('[heirloom/invites/accept] entry', {
    clerkUserId: user.providerUserId,
    token: token.slice(0, 8) + '…',
  })

  // ensureClerkUser upserts the users row when needed, eliminating the race
  // between isSignedIn→true (client) and the Clerk user.created webhook (async).
  const supabaseUserId = await ensureClerkUser()
  if (!supabaseUserId) {
    console.error('[heirloom/invites/accept] ensureClerkUser returned null', {
      clerkUserId: user.providerUserId,
    })
    return Response.json({ error: 'Could not resolve user record' }, { status: 500 })
  }
  console.log('[heirloom/invites/accept] users row resolved', {
    clerkUserId: user.providerUserId,
    supabaseUserId,
  })

  const result = await acceptInvite(token, user.providerUserId, supabaseUserId, user.name ?? null)

  if (!result.ok) {
    console.error('[heirloom/invites/accept] acceptInvite failed', {
      clerkUserId: user.providerUserId,
      status: result.status,
      error: result.error,
    })
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[heirloom/invites/accept] complete', {
    memberId: result.data.memberId,
    clerkUserId: user.providerUserId,
  })

  return Response.json({ ok: true })
}
