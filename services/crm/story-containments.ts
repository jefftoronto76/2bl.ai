// services/crm/story-containments.ts
//
// Story <-> memory linking, via `artifact_containments` (a self-referencing
// `artifacts` join table). Columns confirmed live against Studio directly
// (2026-08-13, assign-memory-to-story): id (uuid, PK), tenant_id (uuid, NOT
// NULL), parent_artifact_id (uuid, NOT NULL, FK -> artifacts.id — the
// story), child_artifact_id (uuid, NOT NULL, FK -> artifacts.id — the
// memory), created_at (timestamptz, default now()). UNIQUE constraint is on
// the PAIR (parent_artifact_id, child_artifact_id) together, not on
// child_artifact_id alone — the schema is genuinely many-to-many.
// Single-story-per-memory is an APPLICATION-layer rule enforced by
// assignMemoryToStory below (delete any existing row for the memory before
// inserting the new one), not something the database enforces or should be
// asked to.
//
// Own file, sibling to stories.ts — mirrors why story-invites.ts is its own
// file rather than folded into stories.ts: a distinct enough concern
// (linking two artifacts, not story CRUD).

import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

type AdminClient = ReturnType<typeof getAdminClient>

export type StoryContainmentResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

/**
 * Owned-OR-subscribed access check for one story — the same shape
 * listStories (services/crm/stories.ts) computes for a whole list, inlined
 * here for a single storyId rather than calling listStories and filtering
 * its result (that would fetch and scope every story the caller can see
 * just to check one). `data: false` covers every "not accessible" case
 * uniformly — the story doesn't exist, isn't in this tenant, is discarded,
 * or the caller has neither ownership nor a subscription grant — so this
 * never leaks which case applied to the caller.
 */
async function hasStoryAccess(
  supabase: AdminClient,
  tenantId: string,
  userId: string,
  storyId: string,
): Promise<StoryContainmentResult<boolean>> {
  const { data: storyRow, error: storyErr } = await supabase
    .from('artifacts')
    .select('id, user_id')
    .eq('id', storyId)
    .eq('tenant_id', tenantId)
    .eq('type', 'story')
    .is('discarded_at', null)
    .maybeSingle()

  if (storyErr) {
    console.error('[story-containments] hasStoryAccess — story lookup failed:', storyErr.message)
    return { ok: false, status: 500, error: storyErr.message }
  }
  if (!storyRow) return { ok: true, data: false }
  if ((storyRow as { user_id: string }).user_id === userId) return { ok: true, data: true }

  // Not the owner — check for a subscriber grant. artifact_subscribers is
  // keyed by member_id, not user_id (same resolution listStories does).
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (memberErr) {
    console.error('[story-containments] hasStoryAccess — member lookup failed:', memberErr.message)
    return { ok: false, status: 500, error: memberErr.message }
  }
  if (!memberRow) return { ok: true, data: false }

  const { data: subRow, error: subErr } = await supabase
    .from('artifact_subscribers')
    .select('id')
    .eq('artifact_id', storyId)
    .eq('member_id', (memberRow as { id: string }).id)
    .maybeSingle()

  if (subErr) {
    console.error('[story-containments] hasStoryAccess — subscriber lookup failed:', subErr.message)
    return { ok: false, status: 500, error: subErr.message }
  }
  return { ok: true, data: !!subRow }
}

/**
 * Assigns a memory to a story — sequential delete-then-insert, not an RPC.
 * The one RPC in this codebase (publish_compiled_prompt,
 * services/prompt/compile.ts) solves a genuinely harder problem: a 7-step
 * atomic transaction across two tables under an advisory lock, guarding a
 * real cross-request race. This has none of that — one authenticated member
 * acting on one row they own — so it follows the plainer precedent already
 * established by revokeStoryCollaborator/acceptStoryInvite
 * (services/crm/story-invites.ts) for this exact shape of two-step grant
 * mutation. Not atomic: a crash between delete and insert can leave the
 * memory briefly unassigned — recoverable (the picker shows no current
 * story, the member picks again), never corrupted or duplicated, since the
 * delete always runs first.
 *
 * Both sides are checked before any write. The memory must belong to this
 * tenant/user (owner-scoped, matching every other memory write in
 * services/crm/memories.ts). The target story must be accessible to the
 * caller — owned OR subscribed (hasStoryAccess above), not owner-only — a
 * collaborator should be able to add their own memories to a story they
 * were invited into, not only the story's creator.
 */
export async function assignMemoryToStory(
  tenantId: string,
  userId: string,
  memoryId: string,
  storyId: string,
): Promise<StoryContainmentResult<null>> {
  const supabase = getAdminClient()

  const { data: memoryRow, error: memoryErr } = await supabase
    .from('artifacts')
    .select('id')
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('type', 'memory')
    .is('discarded_at', null)
    .maybeSingle()

  if (memoryErr) {
    console.error('[story-containments] assign — memory lookup failed:', memoryErr.message)
    return { ok: false, status: 500, error: memoryErr.message }
  }
  if (!memoryRow) {
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  const storyAccess = await hasStoryAccess(supabase, tenantId, userId, storyId)
  if (!storyAccess.ok) return storyAccess
  if (!storyAccess.data) {
    return { ok: false, status: 404, error: 'Story not found' }
  }

  const { error: deleteErr } = await supabase
    .from('artifact_containments')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('child_artifact_id', memoryId)

  if (deleteErr) {
    console.error('[story-containments] assign — delete existing containment failed:', deleteErr.message)
    void logEvent({
      action: AuditAction.MEMORY_ASSIGNED_TO_STORY,
      tenant_id: tenantId,
      actor_id: userId,
      actor_type: 'user',
      target_type: 'memory',
      target_id: memoryId,
      outcome: 'failure',
      metadata: { error_detail: deleteErr.message, story_id: storyId },
    })
    return { ok: false, status: 500, error: deleteErr.message }
  }

  const { error: insertErr } = await supabase
    .from('artifact_containments')
    .insert({ tenant_id: tenantId, parent_artifact_id: storyId, child_artifact_id: memoryId })

  if (insertErr) {
    console.error('[story-containments] assign — insert containment failed:', insertErr.message)
    void logEvent({
      action: AuditAction.MEMORY_ASSIGNED_TO_STORY,
      tenant_id: tenantId,
      actor_id: userId,
      actor_type: 'user',
      target_type: 'memory',
      target_id: memoryId,
      outcome: 'failure',
      metadata: { error_detail: insertErr.message, story_id: storyId },
    })
    return { ok: false, status: 500, error: insertErr.message }
  }

  console.log('[story-containments] assigned memory to story:', { memoryId, storyId })
  void logEvent({
    action: AuditAction.MEMORY_ASSIGNED_TO_STORY,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: 'user',
    target_type: 'memory',
    target_id: memoryId,
    outcome: 'success',
    metadata: { story_id: storyId },
  })
  return { ok: true, data: null }
}

/**
 * Resolves the storyId (parent_artifact_id) each of the given memory ids is
 * currently contained in, if any — one query, keyed by child_artifact_id.
 * Backs listMemories' per-row storyId field (services/crm/memories.ts). A
 * memory with no containment row is simply absent from the returned map,
 * not an error — most memories have never been assigned to a story.
 */
export async function getStoryIdsForMemories(
  tenantId: string,
  memoryIds: string[],
): Promise<StoryContainmentResult<Record<string, string>>> {
  if (memoryIds.length === 0) return { ok: true, data: {} }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('artifact_containments')
    .select('parent_artifact_id, child_artifact_id')
    .eq('tenant_id', tenantId)
    .in('child_artifact_id', memoryIds)

  if (error) {
    console.error('[story-containments] getStoryIdsForMemories failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.child_artifact_id as string] = row.parent_artifact_id as string
  }
  return { ok: true, data: map }
}
