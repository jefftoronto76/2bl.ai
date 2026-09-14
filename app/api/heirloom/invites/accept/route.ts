// POST /api/heirloom/invites/accept
// Accepts an invite token for the currently signed-in Clerk user.
// Called by ChatProvider on the false→true isSignedIn transition when the
// visitor arrived with a valid ?invite=TOKEN in the URL.
//
// Sequence lives entirely in acceptInvite's own doc comment
// (services/members/members.ts) — not duplicated here, since a prior copy
// of this same sequence went stale relative to that function more than
// once. acceptInvite races the Clerk webhook's linkInvitedMember for the
// same signup event; both close that race via an atomic conditional UPDATE
// rather than an ordering assumption — see Design Handovers/
// identity_reconciliation_replan_2026-09-14.md.

import { getCurrentUser, ensureClerkUser } from '@/services/auth'
import { acceptInvite } from '@/services/members'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: unknown; alreadySignedIn?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // empty body handled below
  }

  const token = typeof body.token === 'string' && body.token.trim().length > 0
    ? body.token.trim()
    : null

  // From chatStore's mount-time effect (an already-signed-in visitor holding
  // an invite token) vs. its sign-in-transition effect (a brand-new signup) —
  // see acceptInvite's skipOrphanCleanup doc comment for why this matters.
  const alreadySignedIn = body.alreadySignedIn === true

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

  const result = await acceptInvite(
    token,
    user.providerUserId,
    supabaseUserId,
    user.name ?? null,
    { skipOrphanCleanup: alreadySignedIn },
  )

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
