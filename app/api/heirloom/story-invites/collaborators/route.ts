// DELETE /api/heirloom/story-invites/collaborators
// Removes one member's access to a story — the invite modal's roster
// "Remove" action (see services/crm/story-invites.ts's
// revokeStoryCollaborator for the ownership check and the
// artifact_subscribers delete itself). A sibling route to
// /api/heirloom/story-invites, not a new action folded into that file's own
// DELETE: that DELETE invalidates the story's shared invite link (a
// story_invite_links row); this one removes a specific already-joined
// person's access (an artifact_subscribers row) — different table,
// different target, same directory.
//
// Identity resolution mirrors /api/heirloom/story-invites exactly:
// getCurrentUser() for the Clerk session, a direct `members` lookup by
// clerk_id to confirm the caller is a real Heirloom member, then
// getCurrentUserId() for the Supabase user id ownership checks compare
// against.

import { getCurrentUser, getCurrentUserId } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { HEIRLOOM_TENANT_ID } from '@/services/members'
import { revokeStoryCollaborator } from '@/services/crm/story-invites'

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()

  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', HEIRLOOM_TENANT_ID)
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()

  if (memberErr) {
    console.error('[heirloom/story-invites/collaborators] member lookup failed:', memberErr.message)
    return Response.json({ error: 'Could not resolve member record' }, { status: 500 })
  }
  if (!memberRow) {
    return Response.json({ error: 'Member record not found' }, { status: 403 })
  }

  let body: { story_id?: unknown; member_id?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // story_id/member_id are required and validated below regardless
  }

  const storyId = typeof body.story_id === 'string' ? body.story_id.trim() : ''
  const memberId = typeof body.member_id === 'string' ? body.member_id.trim() : ''
  if (!storyId) {
    return Response.json({ error: 'story_id is required' }, { status: 400 })
  }
  if (!memberId) {
    return Response.json({ error: 'member_id is required' }, { status: 400 })
  }

  const actorUserId = await getCurrentUserId()
  if (!actorUserId) {
    return Response.json({ error: 'Could not resolve user record' }, { status: 500 })
  }

  console.log('[heirloom/story-invites/collaborators] DELETE entry', {
    clerkUserId: user.providerUserId,
    storyId,
    memberId,
  })

  const result = await revokeStoryCollaborator(HEIRLOOM_TENANT_ID, storyId, memberId, actorUserId)
  if (!result.ok) {
    console.error('[heirloom/story-invites/collaborators] remove failed:', result.error, { storyId, memberId })
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json({ ok: true }, { status: 200 })
}
