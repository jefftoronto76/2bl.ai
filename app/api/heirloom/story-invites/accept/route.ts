// POST /api/heirloom/story-invites/accept
// Accepts a story invite token for the currently signed-in Clerk user.
// Called by chatStore.tsx from two trigger points: the false→true
// isSignedIn transition (brand-new signup case) AND a mount-time check for
// a visitor who was already signed in when they arrived (existing-member
// case — see chatStore.tsx's own doc comment for why that second trigger
// is necessary). Distinct endpoint, distinct service function
// (acceptStoryInvite, services/crm/story-invites.ts) from
// /api/heirloom/invites/accept's acceptInvite — zero shared code path with
// the single-use admin/member invite mechanism.

import { getCurrentUser, ensureClerkUser } from '@/services/auth'
import { HEIRLOOM_TENANT_ID } from '@/services/members'
import { acceptStoryInvite } from '@/services/crm/story-invites'

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

  console.log('[heirloom/story-invites/accept] entry', {
    clerkUserId: user.providerUserId,
    token: token.slice(0, 8) + '…',
  })

  // ensureClerkUser upserts the users row when needed, eliminating the race
  // between isSignedIn→true (client) and the Clerk user.created webhook
  // (async) — same pattern as /api/heirloom/invites/accept.
  const supabaseUserId = await ensureClerkUser()
  if (!supabaseUserId) {
    console.error('[heirloom/story-invites/accept] ensureClerkUser returned null', {
      clerkUserId: user.providerUserId,
    })
    return Response.json({ error: 'Could not resolve user record' }, { status: 500 })
  }

  const result = await acceptStoryInvite(token, user.providerUserId, supabaseUserId, HEIRLOOM_TENANT_ID)

  if (!result.ok) {
    console.error('[heirloom/story-invites/accept] acceptStoryInvite failed', {
      clerkUserId: user.providerUserId,
      status: result.status,
      error: result.error,
    })
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[heirloom/story-invites/accept] complete', {
    memberId: result.data.memberId,
    storyId: result.data.storyId,
    isNewMember: result.data.isNewMember,
    clerkUserId: user.providerUserId,
  })

  return Response.json({
    ok: true,
    story_id: result.data.storyId,
    story_title: result.data.storyTitle,
    is_new_member: result.data.isNewMember,
  })
}
