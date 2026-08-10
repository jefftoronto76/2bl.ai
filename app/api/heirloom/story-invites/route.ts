// POST /api/heirloom/story-invites
// Create-or-fetch (and, with reset:true, rotate) the durable, reusable
// invite link for one story — backs InviteCollaboratorsModal.tsx's magic
// link via ChatHero.tsx. Distinct from /api/heirloom/invites (the
// single-use member-facing route, still used by nothing after this
// change but left in place): that route mints a single-use `members`
// row via createMemberInvite; this route never touches `members` at
// creation time at all — see services/crm/story-invites.ts's own doc
// comment for the full rationale. Zero shared code path with the
// admin/single-use invite mechanism.
//
// Identity resolution mirrors /api/heirloom/invites: getCurrentUser() for
// the Clerk session, then a direct `members` lookup by clerk_id — never
// getAuthContext() (the admin/tenant_users boundary).

import { getCurrentUser, getCurrentUserId } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { HEIRLOOM_TENANT_ID } from '@/services/members'
import { createOrGetActiveStoryInviteLink, resetStoryInviteLink } from '@/services/crm/story-invites'

const PRIMER_MAX_LENGTH = 500

export async function POST(req: Request) {
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
    console.error('[heirloom/story-invites] member lookup failed:', memberErr.message)
    return Response.json({ error: 'Could not resolve member record' }, { status: 500 })
  }
  if (!memberRow) {
    console.warn('[heirloom/story-invites] 403 — no member row for caller', {
      clerkUserId: user.providerUserId,
    })
    return Response.json({ error: 'Member record not found' }, { status: 403 })
  }

  let body: { story_id?: unknown; primer?: unknown; reset?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // story_id is required and validated below regardless
  }

  const storyId = typeof body.story_id === 'string' ? body.story_id.trim() : ''
  if (!storyId) {
    return Response.json({ error: 'story_id is required' }, { status: 400 })
  }

  const actorUserId = await getCurrentUserId()
  if (!actorUserId) {
    return Response.json({ error: 'Could not resolve user record' }, { status: 500 })
  }

  // Ownership check — only the story's owner may create/rotate its invite
  // link. Same tenant_id + user_id scoping discardStory (services/crm/
  // stories.ts) already uses for "is this really your story."
  const { data: storyRow, error: storyErr } = await supabase
    .from('artifacts')
    .select('id')
    .eq('id', storyId)
    .eq('tenant_id', HEIRLOOM_TENANT_ID)
    .eq('user_id', actorUserId)
    .eq('type', 'story')
    .is('discarded_at', null)
    .maybeSingle()

  if (storyErr) {
    console.error('[heirloom/story-invites] story lookup failed:', storyErr.message)
    return Response.json({ error: 'Could not resolve story' }, { status: 500 })
  }
  if (!storyRow) {
    return Response.json({ error: 'Story not found' }, { status: 404 })
  }

  const rawPrimer = typeof body.primer === 'string' ? body.primer.trim().slice(0, PRIMER_MAX_LENGTH) : ''
  const reset = body.reset === true

  console.log('[heirloom/story-invites] POST entry', {
    clerkUserId: user.providerUserId,
    memberId: memberRow.id,
    storyId,
    reset,
  })

  const result = reset
    ? await resetStoryInviteLink(HEIRLOOM_TENANT_ID, storyId, memberRow.id, actorUserId, rawPrimer)
    : await createOrGetActiveStoryInviteLink(HEIRLOOM_TENANT_ID, storyId, memberRow.id, actorUserId, rawPrimer)

  if (!result.ok) {
    console.error('[heirloom/story-invites] link create/reset failed:', result.error, {
      clerkUserId: user.providerUserId,
      storyId,
    })
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('domain')
    .eq('id', HEIRLOOM_TENANT_ID)
    .maybeSingle()

  if (tenantErr) {
    console.warn('[heirloom/story-invites] tenant lookup failed (non-fatal):', tenantErr.message)
  }

  const tenantDomain = (tenantRow as { domain: string | null } | null)?.domain ?? null
  const inviteUrl = tenantDomain ? `https://${tenantDomain}/join/${result.data.token}` : null

  console.log('[heirloom/story-invites] success', {
    clerkUserId: user.providerUserId,
    storyId,
    hasInviteUrl: !!inviteUrl,
  })

  return Response.json(
    {
      token: result.data.token,
      story_id: result.data.story_id,
      primer: result.data.primer ?? '',
      expires_at: result.data.expires_at,
      invite_url: inviteUrl,
    },
    { status: 201 },
  )
}
