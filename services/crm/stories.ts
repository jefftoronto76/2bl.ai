// services/crm/stories.ts
//
// Story reads/writes against the existing `artifacts` table (type = 'story')
// — a sibling to services/crm/memories.ts's `type = 'memory'` rows, same
// table, not a new one. artifacts.type has no CHECK constraint, so this new
// value works with zero migration (see System Docs/Database Schema.md's
// artifacts row).
//
// Unlike a memory, a story has no session_id (it isn't tied to one
// conversation — inserted null) and no anchor_message_id (it wasn't derived
// from a chat message). Scoped by tenant_id + user_id instead of
// tenant_id + session_id — mirrors services/crm/sessions.ts's listSessions
// scoping, not listMemories' — a story belongs to a signed-in member across
// their whole account, the same way their conversation list does, not to
// one chat.
//
// Two future relationships are explicitly NOT built here (see the Heirloom
// chat-widget V2 entry in System Docs/Known Gaps.md):
//   - Story <-> memory, via artifact_containments (a self-referencing
//     artifacts join table, already live in Studio, unused by any code yet).
//   - Story <-> media, via media_items.story_id (a column that already
//     exists, currently always null).

import { getAdminClient } from '@/services/auth/supabase-admin'
import { resolveUserIdForMember } from '@/services/crm/memories'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

export type StoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface StoryRow {
  id: string
  title: string
  body: string | null
  created_at: string
  updated_at: string
  /** True when the story has an active (non-revoked) story_invite_links row
   *  OR any artifact_subscribers row — surfaced so the delete-confirm
   *  dialog can warn before removing access other people currently have.
   *  UI-only signal; discardStory itself is unaffected either way. Always
   *  false on a freshly-created row (toStoryRow's default) — listStories
   *  below is the only place that computes a real value. */
  hasActiveInviteOrSubscribers: boolean
}

const ARTIFACT_TYPE = 'story' as const

const STORY_ROW_COLUMNS = 'id, title, body, created_at, updated_at'

function toStoryRow(row: Record<string, unknown>): StoryRow {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string | null | undefined) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    hasActiveInviteOrSubscribers: false,
  }
}

/**
 * Lists every non-discarded story a signed-in member either owns OR has
 * been granted access to via artifact_subscribers (reusable-story-invite-
 * links, 2026-08-10) — the one enforcement point that lets a story-scoped
 * collaborator see the story they were invited into without seeing
 * anything else in the tenant: they simply own nothing else by
 * construction (see services/crm/story-invites.ts's acceptStoryInvite), so
 * this OR-subscribed widening is the only query that needed to change.
 * Owned-only scoping (mirrors listSessions' tenant_id + user_id scoping,
 * services/crm/sessions.ts) is unchanged for anyone with zero subscriptions
 * — the .or() below degenerates to the exact same query as before when
 * subscribedStoryIds is empty.
 */
export async function listStories(
  tenantId: string,
  userId: string,
): Promise<StoryResult<StoryRow[]>> {
  const supabase = getAdminClient()

  // Resolve this user's members.id — artifact_subscribers grants are keyed
  // by member_id, not user_id. No active members row (shouldn't happen for
  // a signed-in caller, but defensive) just means no subscribed stories.
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (memberErr) {
    console.error('[stories] list member lookup error:', JSON.stringify(memberErr))
    return { ok: false, status: 500, error: memberErr.message }
  }

  let subscribedStoryIds: string[] = []
  if (memberRow) {
    const { data: subRows, error: subErr } = await supabase
      .from('artifact_subscribers')
      .select('artifact_id')
      .eq('member_id', (memberRow as { id: string }).id)

    if (subErr) {
      console.error('[stories] list subscriber lookup error:', JSON.stringify(subErr))
      return { ok: false, status: 500, error: subErr.message }
    }
    subscribedStoryIds = (subRows ?? []).map(r => r.artifact_id as string)
  }

  const orFilter = subscribedStoryIds.length > 0
    ? `user_id.eq.${userId},id.in.(${subscribedStoryIds.join(',')})`
    : `user_id.eq.${userId}`

  const { data, error } = await supabase
    .from('artifacts')
    .select(STORY_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('type', ARTIFACT_TYPE)
    .is('discarded_at', null)
    .or(orFilter)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[stories] list error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  const storyRows = data ?? []
  const storyIds = storyRows.map(row => row.id as string)

  let idsWithActiveLink = new Set<string>()
  let idsWithSubscribers = new Set<string>()
  if (storyIds.length > 0) {
    const [linkResult, subscriberResult] = await Promise.all([
      supabase.from('story_invite_links').select('story_id').in('story_id', storyIds).is('revoked_at', null),
      supabase.from('artifact_subscribers').select('artifact_id').in('artifact_id', storyIds),
    ])
    if (linkResult.error) {
      console.error('[stories] active-link lookup error (non-fatal):', JSON.stringify(linkResult.error))
    }
    if (subscriberResult.error) {
      console.error('[stories] subscriber lookup error (non-fatal):', JSON.stringify(subscriberResult.error))
    }
    idsWithActiveLink = new Set((linkResult.data ?? []).map(r => r.story_id as string))
    idsWithSubscribers = new Set((subscriberResult.data ?? []).map(r => r.artifact_id as string))
  }

  return {
    ok: true,
    data: storyRows.map(row => ({
      ...toStoryRow(row),
      hasActiveInviteOrSubscribers: idsWithActiveLink.has(row.id as string) || idsWithSubscribers.has(row.id as string),
    })),
  }
}

/** Distinct error string for the "no linked account" rejection below — same
 *  shape as memories.ts's ACCOUNT_REQUIRED_ERROR, but its own copy: a
 *  reused "...to save memories" string would misdescribe this action. */
export const STORY_ACCOUNT_REQUIRED_ERROR = 'An account is required to begin a story.'

export interface CreateStoryInput {
  memberId: string | null
  name: string
  description: string
}

/**
 * Inserts a new story row. Mirrors createDraftMemory's structure
 * (services/crm/memories.ts) exactly — same resolveUserIdForMember account
 * check, same tenant-scoped insert — as its own sibling function, not a call
 * into createDraftMemory: that function's ARTIFACT_TYPE is a fixed 'memory'
 * constant with no argument to override it, so a story needs its own insert
 * with its own 'story' constant, set the same way.
 *
 * name -> title, description -> body: BeginStoryModal.tsx's own field
 * names already match artifacts.title/artifacts.body 1:1 in meaning (a
 * short name, a longer free-text line about it) — the same two plain-text
 * fields a memory's title/body already carry, so no metadata detour is
 * needed for a value the column already exists for.
 *
 * session_id and anchor_message_id are both left out of the insert — a
 * story has no conversation and no anchor message behind it. status is set
 * to 'published' explicitly (not left to insert-time defaults): unlike a
 * memory, a story has no draft/Keep workflow — it exists the moment it's
 * created.
 */
export async function createStory(
  tenantId: string,
  input: CreateStoryInput,
): Promise<StoryResult<StoryRow>> {
  const userIdResult = await resolveUserIdForMember(tenantId, input.memberId)
  if (!userIdResult.ok) {
    // A genuine DB error resolving user_id — an infra failure, not the
    // "no account" case, so it keeps the generic 500 shape.
    void logEvent({
      action: AuditAction.STORY_CREATED,
      tenant_id: tenantId,
      actor_type: input.memberId ? 'user' : 'anonymous',
      target_type: 'story',
      outcome: 'failure',
      metadata: { error_detail: 'user_id_lookup_failed' },
    })
    return { ok: false, status: 500, error: userIdResult.error }
  }
  if (!userIdResult.userId) {
    // Anonymous visitor (no memberId) or a member not yet linked to an
    // account — artifacts.user_id is NOT NULL, so there is no row to
    // attempt here. 401, not 403: no identity was presented at all.
    void logEvent({
      action: AuditAction.STORY_CREATED,
      tenant_id: tenantId,
      actor_type: 'anonymous',
      target_type: 'story',
      outcome: 'failure',
      metadata: { error_detail: 'account_required' },
    })
    return { ok: false, status: 401, error: STORY_ACCOUNT_REQUIRED_ERROR }
  }
  const userId = userIdResult.userId

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      member_id: input.memberId,
      session_id: null,
      type: ARTIFACT_TYPE,
      status: 'published',
      title: input.name,
      body: input.description,
    })
    .select(STORY_ROW_COLUMNS)
    .single()

  if (error || !data) {
    console.error('[stories] create error:', error ? JSON.stringify(error) : 'no row returned')
    void logEvent({
      action: AuditAction.STORY_CREATED,
      tenant_id: tenantId,
      actor_type: 'user',
      target_type: 'story',
      outcome: 'failure',
      metadata: { error_detail: error?.message ?? 'no_row_returned' },
    })
    return { ok: false, status: 500, error: error?.message ?? 'Failed to create story' }
  }

  console.log('[stories] created:', data.id)
  void logEvent({
    action: AuditAction.STORY_CREATED,
    tenant_id: tenantId,
    actor_type: 'user',
    target_type: 'story',
    target_id: data.id,
    outcome: 'success',
  })
  return { ok: true, data: toStoryRow(data) }
}

/**
 * Updates a story's description after creation — the Admin panel's
 * (StoryAdminPanel) description field. `description` -> `body`, the exact
 * same column createStory's own `description` input already writes to (see
 * that function's doc comment) — not a different column, no metadata
 * detour. Owner-scoped identically to discardStory below (tenant_id +
 * user_id + type='story'), and 404s the same non-leaking way for both "no
 * such story" and "not yours."
 */
export async function updateStoryDescription(
  tenantId: string,
  userId: string,
  storyId: string,
  description: string,
): Promise<StoryResult<StoryRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ body: description })
    .eq('id', storyId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('type', ARTIFACT_TYPE)
    .select(STORY_ROW_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[stories] update description error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[stories] no story matched id + tenant + user for description update:', { storyId, tenantId, userId })
    return { ok: false, status: 404, error: 'Story not found' }
  }

  console.log('[stories] description updated:', storyId)
  return { ok: true, data: toStoryRow(data) }
}

/**
 * "Delete" — soft, stamps discarded_at rather than deleting. Same
 * soft-marker convention discardMemory already uses on this same artifacts
 * table (services/crm/memories.ts). Tenant + user scoped (not session-scoped
 * — a story has none); 404s rather than silently no-op'ing if the id
 * doesn't resolve or belongs to someone else.
 */
export async function discardStory(
  tenantId: string,
  userId: string,
  storyId: string,
): Promise<StoryResult<null>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ discarded_at: new Date().toISOString() })
    .eq('id', storyId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('type', ARTIFACT_TYPE)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[stories] discard error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[stories] no story matched id + tenant + user:', { storyId, tenantId, userId })
    return { ok: false, status: 404, error: 'Story not found' }
  }

  console.log('[stories] discarded:', storyId)
  return { ok: true, data: null }
}
