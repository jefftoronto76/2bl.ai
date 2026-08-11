// services/crm/story-invites.ts
//
// Reusable, multi-person story invite links — story_invite_links (Studio,
// 2026-08-10). Deliberately separate from services/members/members.ts's
// single-use admin/member invite mechanism (token / used_at / status=
// 'invited' on the members table itself): that mechanism mints one members
// row that gets claimed exactly once. A story invite link is a durable
// pointer — "this token grants access to this story" — that many different
// people can each click independently and get added, without ever
// consuming or mutating a shared row. See CLAUDE.md's hard constraint on
// this feature: zero shared code path with createMemberInvite/
// validateMemberToken/acceptInvite/linkInvitedMember.
//
// Grants are recorded on artifact_subscribers (artifact_id, member_id) —
// already live in Studio, previously schema-only. A brand-new person gets a
// fresh `members` row (status='active' immediately — see acceptStoryInvite's
// doc comment for why) plus a subscribers row; an already-active Heirloom
// member just gets the subscribers row.

import { randomBytes } from 'crypto'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

// Days a story invite link stays valid from creation/reset — its own
// decision, distinct from members.ts's INVITE_TTL_DAYS (14 days, tuned for
// a single person to click once). A durable multi-person link defaults
// shorter (7 days); there is no V1 UI to change this per story.
const STORY_INVITE_TTL_DAYS = 7

export type StoryInviteResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface StoryInviteLinkRow {
  id: string
  tenant_id: string
  story_id: string
  token: string
  created_by: string
  primer: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface AcceptStoryInviteResult {
  memberId: string
  storyId: string
  storyTitle: string
  isNewMember: boolean
}

const STORY_INVITE_LINK_COLUMNS =
  'id, tenant_id, story_id, token, created_by, primer, expires_at, revoked_at, created_at, updated_at'

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

function isExpired(row: { expires_at: string | null }): boolean {
  return row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now()
}

type AdminClient = ReturnType<typeof getAdminClient>

async function insertStoryInviteLink(
  supabase: AdminClient,
  tenantId: string,
  storyId: string,
  createdByMemberId: string,
  actorUserId: string,
  primer: string | null,
): Promise<StoryInviteResult<StoryInviteLinkRow>> {
  const token = generateToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + STORY_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    story_id: storyId,
    created_by: createdByMemberId,
    token,
    expires_at: expiresAt,
  }
  if (primer != null && primer.trim().length > 0) {
    payload.primer = primer.trim()
  }

  const { data, error } = await supabase
    .from('story_invite_links')
    .insert(payload)
    .select(STORY_INVITE_LINK_COLUMNS)
    .single()

  if (error) {
    // 23505 = unique violation. The partial unique index on
    // story_id WHERE revoked_at IS NULL means this can only mean a
    // concurrent request already created the active link for this story —
    // not a real failure. Fetch and return that row instead of erroring.
    if (error.code === '23505') {
      console.warn('[story-invites] insert race — active link already exists, returning it', { storyId })
      const { data: existing, error: existingErr } = await supabase
        .from('story_invite_links')
        .select(STORY_INVITE_LINK_COLUMNS)
        .eq('story_id', storyId)
        .is('revoked_at', null)
        .maybeSingle()
      if (!existingErr && existing) {
        return { ok: true, data: existing as StoryInviteLinkRow }
      }
    }
    console.error('[story-invites] insert failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  void logEvent({
    action: AuditAction.STORY_INVITE_LINK_CREATED,
    tenant_id: tenantId,
    actor_id: actorUserId,
    actor_type: 'user',
    target_type: 'story_invite_link',
    target_id: (data as { id: string }).id,
    metadata: { story_id: storyId, has_primer: primer != null && primer.trim().length > 0 },
  })

  return { ok: true, data: data as StoryInviteLinkRow }
}

/**
 * Returns the story's current active (non-revoked) invite link if one
 * exists, otherwise creates one. This is what backs opening the Invite
 * Collaborators modal — repeat opens must not mint a fresh link every time
 * (the DB's partial unique index would reject that anyway); only "Reset
 * link" (resetStoryInviteLink below) is meant to rotate it.
 */
export async function createOrGetActiveStoryInviteLink(
  tenantId: string,
  storyId: string,
  createdByMemberId: string,
  actorUserId: string,
  primer: string | null,
): Promise<StoryInviteResult<StoryInviteLinkRow>> {
  const supabase = getAdminClient()

  const { data: existing, error: existingErr } = await supabase
    .from('story_invite_links')
    .select(STORY_INVITE_LINK_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('story_id', storyId)
    .is('revoked_at', null)
    .maybeSingle()

  if (existingErr) {
    console.error('[story-invites] active-link lookup failed:', existingErr.message)
    return { ok: false, status: 500, error: existingErr.message }
  }
  if (existing) {
    return { ok: true, data: existing as StoryInviteLinkRow }
  }

  return insertStoryInviteLink(supabase, tenantId, storyId, createdByMemberId, actorUserId, primer)
}

/**
 * Read-only lookup for the story's current active (non-revoked) invite
 * link, if any — same tenant_id + story_id + revoked_at IS NULL query
 * createOrGetActiveStoryInviteLink uses to check for an existing link,
 * but WITHOUT its create-if-missing fallback. Backs the GET route's
 * response so reopening the invite modal can restore a real link/primer
 * instead of always showing "Not created yet" (invite-modal-restore-on-
 * open, 2026-08-11).
 */
export async function getActiveStoryInviteLink(
  tenantId: string,
  storyId: string,
): Promise<StoryInviteResult<StoryInviteLinkRow | null>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('story_invite_links')
    .select(STORY_INVITE_LINK_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('story_id', storyId)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    console.error('[story-invites] active-link lookup failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: data as StoryInviteLinkRow | null }
}

/**
 * Revokes the story's current active link, if any. Idempotent — a story
 * with no active link is not an error. Separate, standalone export (not
 * just a private step of resetStoryInviteLink) since "Reset link" is the
 * only V1 caller, but a future explicit "revoke without replacing" action
 * can reuse this directly.
 */
export async function revokeStoryInviteLink(
  tenantId: string,
  storyId: string,
  actorUserId: string,
): Promise<StoryInviteResult<null>> {
  const supabase = getAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('story_invite_links')
    .update({ revoked_at: now, updated_at: now })
    .eq('tenant_id', tenantId)
    .eq('story_id', storyId)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    console.error('[story-invites] revoke failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  if (data && data.length > 0) {
    void logEvent({
      action: AuditAction.STORY_INVITE_LINK_REVOKED,
      tenant_id: tenantId,
      actor_id: actorUserId,
      actor_type: 'user',
      target_type: 'story_invite_link',
      target_id: (data[0] as { id: string }).id,
      metadata: { story_id: storyId },
    })
  }

  return { ok: true, data: null }
}

/**
 * "Reset link" — revokes whatever link is currently active for this story
 * (stamping revoked_at, never mutating a token in place) and inserts a
 * fresh row. Preserves full rotation history instead of losing it to an
 * in-place UPDATE, same soft-revoke precedent as members.revoked_at.
 */
export async function resetStoryInviteLink(
  tenantId: string,
  storyId: string,
  createdByMemberId: string,
  actorUserId: string,
  primer: string | null,
): Promise<StoryInviteResult<StoryInviteLinkRow>> {
  const revoked = await revokeStoryInviteLink(tenantId, storyId, actorUserId)
  if (!revoked.ok) return revoked

  const supabase = getAdminClient()
  return insertStoryInviteLink(supabase, tenantId, storyId, createdByMemberId, actorUserId, primer)
}

/**
 * Validates a story invite token for the /join/[token] redirect and the
 * app/heirloom/page.tsx gate check. Returns the link row when it exists,
 * is not revoked, and has not expired; null otherwise. Deliberately never
 * touches `members` or `members.token` — see this file's own doc comment.
 */
export async function validateStoryInviteToken(token: string): Promise<StoryInviteLinkRow | null> {
  if (!token || token.trim().length === 0) return null

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('story_invite_links')
    .select(STORY_INVITE_LINK_COLUMNS)
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !data) return null
  const row = data as StoryInviteLinkRow
  if (isExpired(row)) return null
  return row
}

export interface StoryCollaboratorRow {
  memberId: string
  name: string | null
  email: string | null
  /** When this member's artifact_subscribers grant was written — i.e. when
   *  they joined this story. */
  joinedAt: string
}

/**
 * Lists members who have joined a story — the invite modal's "Existing
 * members" roster (invites-collaboration-modal Phase 5, 2026-08-10).
 * Every row here reflects a real artifact_subscribers grant, written only
 * by acceptStoryInvite above, so there is no "pending" state to represent —
 * unlike members.ts's single-use invite mechanism, this table has nothing
 * between "not granted" and "granted."
 *
 * Scoped to the story's owner, same ownership check the POST route uses for
 * create/reset: only the person who can mint/rotate the invite link can see
 * who has joined through it. Two queries rather than an embedded join
 * (matches listStories' own pattern above) — merged in application code.
 *
 * Deliberately returns no memory count: that depends on artifact_containments
 * (story <-> memory linking), which is unwired — see this repo's Known Gaps.
 * Callers must not fabricate one.
 */
export async function listStoryCollaborators(
  tenantId: string,
  storyId: string,
  ownerUserId: string,
): Promise<StoryInviteResult<StoryCollaboratorRow[]>> {
  const supabase = getAdminClient()

  const { data: storyRow, error: storyErr } = await supabase
    .from('artifacts')
    .select('id')
    .eq('id', storyId)
    .eq('tenant_id', tenantId)
    .eq('user_id', ownerUserId)
    .eq('type', 'story')
    .is('discarded_at', null)
    .maybeSingle()

  if (storyErr) {
    console.error('[story-invites] collaborators — story lookup failed:', storyErr.message)
    return { ok: false, status: 500, error: storyErr.message }
  }
  if (!storyRow) {
    return { ok: false, status: 404, error: 'Story not found' }
  }

  const { data: subRows, error: subErr } = await supabase
    .from('artifact_subscribers')
    .select('member_id, created_at')
    .eq('artifact_id', storyId)
    .order('created_at', { ascending: true })

  if (subErr) {
    console.error('[story-invites] collaborators — subscriber lookup failed:', subErr.message)
    return { ok: false, status: 500, error: subErr.message }
  }

  const subscriberRows = (subRows ?? []) as Array<{ member_id: string; created_at: string }>
  if (subscriberRows.length === 0) {
    return { ok: true, data: [] }
  }

  const memberIds = subscriberRows.map(r => r.member_id)
  const { data: memberRows, error: memberErr } = await supabase
    .from('members')
    .select('id, name, email')
    .eq('tenant_id', tenantId)
    .in('id', memberIds)

  if (memberErr) {
    console.error('[story-invites] collaborators — member lookup failed:', memberErr.message)
    return { ok: false, status: 500, error: memberErr.message }
  }

  const membersById = new Map(
    ((memberRows ?? []) as Array<{ id: string; name: string | null; email: string | null }>)
      .map(m => [m.id, m] as const),
  )

  const collaborators: StoryCollaboratorRow[] = []
  for (const row of subscriberRows) {
    const member = membersById.get(row.member_id)
    // Defensive — a member row could theoretically be missing (deleted
    // independently of its subscriber grant); skip rather than render a
    // roster row with no identity.
    if (!member) continue
    collaborators.push({ memberId: row.member_id, name: member.name, email: member.email, joinedAt: row.created_at })
  }

  return { ok: true, data: collaborators }
}

/**
 * Accepts a story invite token for the currently-signed-in Clerk user.
 * Re-validates the token independently (never trusts an earlier gate
 * check) and branches on whether this clerk_id already has a `members` row
 * for this tenant:
 *
 * - Existing member: only inserts an artifact_subscribers grant. No new
 *   members row, no status change to their existing one.
 * - Brand-new person: inserts a members row directly as status='active'
 *   (never 'invited'→'active' — by the time this runs, Clerk sign-up has
 *   already completed synchronously, so there is no placeholder/pending
 *   period to model the way the single-use admin mechanism's 'invited'
 *   state does), source='story_invite', primer copied from the link, then
 *   the same artifact_subscribers grant.
 *
 * clerk_id is globally unique on `members`, so "does a members row already
 * exist for this clerk_id" is the only safe existing-vs-new test — status
 * is not part of the branch condition, since inserting a second row for a
 * clerk_id that already has one (in any status) would violate that unique
 * constraint regardless.
 */
export async function acceptStoryInvite(
  token: string,
  clerkUserId: string,
  supabaseUserId: string,
  tenantId: string,
): Promise<StoryInviteResult<AcceptStoryInviteResult>> {
  if (!token || !clerkUserId || !supabaseUserId) {
    return { ok: false, status: 400, error: 'Missing required parameters' }
  }

  const supabase = getAdminClient()

  const { data: linkRow, error: linkErr } = await supabase
    .from('story_invite_links')
    .select(STORY_INVITE_LINK_COLUMNS)
    .eq('token', token)
    .maybeSingle()

  if (linkErr) {
    console.error('[story-invites] accept — link lookup failed:', linkErr.message)
    return { ok: false, status: 500, error: linkErr.message }
  }
  if (!linkRow) {
    return { ok: false, status: 404, error: 'Invalid invite link' }
  }

  const link = linkRow as StoryInviteLinkRow

  if (link.revoked_at) {
    return { ok: false, status: 410, error: 'This invite link has been revoked.' }
  }
  if (isExpired(link)) {
    return { ok: false, status: 410, error: 'This invite link has expired.' }
  }
  if (link.tenant_id !== tenantId) {
    console.error('[story-invites] accept — cross-tenant attempt rejected', { linkTenant: link.tenant_id, tenantId })
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const { data: storyRow, error: storyErr } = await supabase
    .from('artifacts')
    .select('id, title')
    .eq('id', link.story_id)
    .eq('tenant_id', tenantId)
    .eq('type', 'story')
    .is('discarded_at', null)
    .maybeSingle()

  if (storyErr) {
    console.error('[story-invites] accept — story lookup failed:', storyErr.message)
    return { ok: false, status: 500, error: storyErr.message }
  }
  if (!storyRow) {
    return { ok: false, status: 404, error: 'This story is no longer available.' }
  }
  const storyTitle = (storyRow as { id: string; title: string }).title

  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('clerk_id', clerkUserId)
    .maybeSingle()

  if (memberErr) {
    console.error('[story-invites] accept — member lookup failed:', memberErr.message)
    return { ok: false, status: 500, error: memberErr.message }
  }

  let memberId: string
  let isNewMember: boolean

  if (memberRow) {
    memberId = (memberRow as { id: string }).id
    isNewMember = false
  } else {
    const { data: newMember, error: insertErr } = await supabase
      .from('members')
      .insert({
        tenant_id: tenantId,
        clerk_id: clerkUserId,
        user_id: supabaseUserId,
        role: 'member',
        status: 'active',
        source: 'story_invite',
        primer: link.primer,
      })
      .select('id')
      .single()

    if (insertErr || !newMember) {
      console.error('[story-invites] accept — new member insert failed:', insertErr?.message)
      return { ok: false, status: 500, error: insertErr?.message ?? 'Failed to create member' }
    }
    memberId = (newMember as { id: string }).id
    isNewMember = true
  }

  const { error: subErr } = await supabase
    .from('artifact_subscribers')
    .upsert(
      { artifact_id: link.story_id, member_id: memberId },
      { onConflict: 'artifact_id,member_id', ignoreDuplicates: true },
    )

  if (subErr) {
    console.error('[story-invites] accept — subscriber grant failed:', subErr.message)
    return { ok: false, status: 500, error: subErr.message }
  }

  void logEvent({
    action: isNewMember
      ? AuditAction.STORY_INVITE_ACCEPTED_NEW_MEMBER
      : AuditAction.STORY_INVITE_ACCEPTED_EXISTING_MEMBER,
    tenant_id: tenantId,
    actor_id: supabaseUserId,
    actor_type: 'user',
    clerk_user_id: clerkUserId,
    target_type: 'story',
    target_id: link.story_id,
    metadata: { member_id: memberId, story_invite_link_id: link.id },
  })

  return { ok: true, data: { memberId, storyId: link.story_id, storyTitle, isNewMember } }
}
