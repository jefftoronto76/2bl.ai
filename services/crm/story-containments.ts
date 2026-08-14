// services/crm/story-containments.ts
//
// Story <-> memory linking, via `artifact_containments` (a self-referencing
// `artifacts` join table). Columns confirmed live against Studio directly
// (2026-08-13, assign-memory-to-story): id (uuid, PK), tenant_id (uuid, NOT
// NULL), parent_artifact_id (uuid, NOT NULL, FK -> artifacts.id — the
// story), child_artifact_id (uuid, NOT NULL, FK -> artifacts.id — the
// memory), created_at (timestamptz, default now()), position (integer,
// nullable — added by Jeff in Studio 2026-08-14, real-story-view-1a-static-
// list: `ALTER TABLE artifact_containments ADD COLUMN position integer`,
// ahead of a future drag-reorder phase; every existing row is currently
// NULL. Reported by Jeff, not independently reverified against Studio from
// this pass — this environment has no direct DB credentials to re-query it
// live; re-confirm directly before relying on exact shape again). UNIQUE
// constraint is on the PAIR (parent_artifact_id, child_artifact_id)
// together, not on child_artifact_id alone — the schema is genuinely
// many-to-many. Single-story-per-memory is an APPLICATION-layer rule
// enforced by assignMemoryToStory below (delete any existing row for the
// memory before inserting the new one), not something the database
// enforces or should be asked to.
//
// getMemoriesForStory (below) is the first real "list this story's
// memories" read — orders by position ASC NULLS LAST, then this table's
// own created_at ASC as the fallback/tiebreaker. See that function's own
// doc comment for why created_at can't be trusted as a stable "originally
// added" signal on its own.
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

/** A memory as it appears inside a story's own ordered list — deliberately
 *  narrower than MemoryRow (services/crm/memories.ts): just enough for a
 *  title/kind/snippet/date row plus `session_id` (Phase 1b,
 *  real-story-view-1b-row-tap-editor — needed so a tapped row can open a
 *  correctly-scoped editor: a story's memories routinely come from
 *  DIFFERENT chat sessions than whichever one is open in ChatHero right
 *  now, and every mutation on a memory is that memory's OWN session_id
 *  scoped — see StoryMemoryEditor.tsx's own doc comment for why this
 *  matters beyond just data shape). `source_kind` is redeclared as a
 *  literal union here rather than imported from memories.ts — that file
 *  already imports FROM this one (getStoryIdsForMemories), so importing
 *  its types back would set up a needless two-way file dependency for one
 *  string union; memories.ts's client-side sibling (useMemories.ts) makes
 *  the same redeclare-rather-than-import call already. */
export interface StoryMemoryRow {
  id: string
  session_id: string
  title: string
  body: string
  source_kind: 'conversation' | 'photo' | 'video' | 'audio' | 'document'
  created_at: string
}

/**
 * Lists a story's memories in display order — the first "memories in story
 * X" read anywhere in this codebase (getStoryIdsForMemories above is the
 * reverse lookup, memory -> story). Access-gated the same owned-OR-
 * subscribed way assignMemoryToStory already checks before writing
 * (hasStoryAccess above) — a collaborator granted access via
 * artifact_subscribers can view the story's memories, not just its owner.
 *
 * Order: position ASC NULLS LAST, then this table's own created_at ASC as
 * the tiebreaker/fallback — matches prompt_types.sort_order's nulls-last
 * convention (System Docs/Database Schema.md). Every containment row is
 * currently position: NULL (the column was just added; no drag-reorder UI
 * exists yet to write a real value — see Design Handovers/.../
 * 01_real_story_view), so today this reads in full as "the order each
 * memory was last (re)assigned to this story." That fallback is honest, not
 * a hidden bug: assignMemoryToStory does a delete-then-insert on every
 * reassignment (never an UPDATE), so a memory's containment created_at
 * reflects its most recent pick, not necessarily when it was first added —
 * acceptable for a first read-only view, but not something a future
 * drag-reorder phase should build further behavior on top of; that phase
 * should write real position values instead of leaning on this fallback.
 *
 * Two-step read, not a Supabase embedded-join select — mirrors this file's
 * own getStoryIdsForMemories and stories.ts's listStories (owner+subscriber
 * lookups): fetch the ordered containment rows first, then the matching
 * artifacts, mapped back into that order. A containment row whose memory
 * was since discarded (or, in principle, belongs to a different tenant)
 * simply drops out of the result — filtered by the second query's own
 * `type='memory'`/`discarded_at is null`/tenant scoping, not surfaced as a
 * partial-result error.
 */
export async function getMemoriesForStory(
  tenantId: string,
  userId: string,
  storyId: string,
): Promise<StoryContainmentResult<StoryMemoryRow[]>> {
  const supabase = getAdminClient()

  const storyAccess = await hasStoryAccess(supabase, tenantId, userId, storyId)
  if (!storyAccess.ok) return storyAccess
  if (!storyAccess.data) {
    return { ok: false, status: 404, error: 'Story not found' }
  }

  const { data: containments, error: containmentErr } = await supabase
    .from('artifact_containments')
    .select('child_artifact_id, position, created_at')
    .eq('tenant_id', tenantId)
    .eq('parent_artifact_id', storyId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (containmentErr) {
    console.error('[story-containments] getMemoriesForStory — containment lookup failed:', containmentErr.message)
    return { ok: false, status: 500, error: containmentErr.message }
  }
  if (!containments || containments.length === 0) {
    return { ok: true, data: [] }
  }

  const orderedIds = containments.map(row => row.child_artifact_id as string)

  const { data: memoryRows, error: memoryErr } = await supabase
    .from('artifacts')
    .select('id, session_id, title, body, source_kind, created_at')
    .eq('tenant_id', tenantId)
    .eq('type', 'memory')
    .is('discarded_at', null)
    .in('id', orderedIds)

  if (memoryErr) {
    console.error('[story-containments] getMemoriesForStory — memory lookup failed:', memoryErr.message)
    return { ok: false, status: 500, error: memoryErr.message }
  }

  const rowsById = new Map((memoryRows ?? []).map(row => [row.id as string, row]))

  const ordered: StoryMemoryRow[] = orderedIds
    .map(id => rowsById.get(id))
    .filter((row): row is NonNullable<typeof row> => !!row)
    .map(row => ({
      id: row.id as string,
      session_id: row.session_id as string,
      title: row.title as string,
      body: row.body as string,
      source_kind: row.source_kind as StoryMemoryRow['source_kind'],
      created_at: row.created_at as string,
    }))

  return { ok: true, data: ordered }
}

export type MoveDirection = 'up' | 'down'

/**
 * Moves one memory up or down within its story's ordered list — Phase 1c
 * (real-story-view-1c-reorder). Deliberately reuses getMemoriesForStory
 * itself for both the access check AND the current ordered list, rather
 * than re-deriving either: that function already does the exact two-step
 * (ordered containment rows, then filtered to non-discarded memories in
 * this tenant) this needs, and a containment row can outlive its memory —
 * discardMemory (services/crm/memories.ts) only stamps artifacts.discarded_at,
 * it never cleans up artifact_containments — so reordering against raw
 * containment rows instead of this already-filtered list could silently
 * compute a swap against an index the client never actually sees.
 *
 * Renumber-then-swap-then-write, always — never a two-NULL swap and never
 * a special "first move ever" branch. Every containment row's position is
 * NULL today (no UI has ever written one), so any move has to first make
 * the CURRENT effective order (position ASC NULLS LAST, created_at ASC —
 * see getMemoriesForStory's own doc comment) permanent by assigning it
 * sequential positions 0..n-1, THEN swap the moved item with its neighbor
 * in that freshly-assigned numbering, THEN write every row in one batch.
 * This is correct whether the story has never been touched or has been
 * reordered many times before — there is no separate "first move" case.
 *
 * Single batch upsert, not N sequential updates — one round trip for the
 * whole story's positions, keyed on the real
 * (parent_artifact_id, child_artifact_id) unique constraint (this file's
 * own header comment) rather than each row's own id, matching the
 * composite-key upsert convention services/crm/feedback.ts's upsertFeedback
 * already uses (`onConflict: 'session_id,message_index'`) — same shape,
 * different pair of columns.
 */
export async function moveMemoryInStory(
  tenantId: string,
  userId: string,
  storyId: string,
  memoryId: string,
  direction: MoveDirection,
): Promise<StoryContainmentResult<null>> {
  const listResult = await getMemoriesForStory(tenantId, userId, storyId)
  if (!listResult.ok) return listResult

  const memories = listResult.data
  const index = memories.findIndex(m => m.id === memoryId)
  if (index === -1) {
    return { ok: false, status: 404, error: 'Memory not found in this story' }
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= memories.length) {
    return {
      ok: false,
      status: 400,
      error: direction === 'up' ? 'Already at the top of the list' : 'Already at the bottom of the list',
    }
  }

  // Renumber every row 0..n-1 in the current effective order, then swap the
  // two positions being moved — not the array elements themselves, just
  // which position number each of the two ends up with.
  const positions = memories.map((_, i) => i)
  ;[positions[index], positions[targetIndex]] = [positions[targetIndex], positions[index]]

  const supabase = getAdminClient()
  const { error } = await supabase.from('artifact_containments').upsert(
    memories.map((m, i) => ({
      tenant_id: tenantId,
      parent_artifact_id: storyId,
      child_artifact_id: m.id,
      position: positions[i],
    })),
    { onConflict: 'parent_artifact_id,child_artifact_id' },
  )

  if (error) {
    console.error('[story-containments] moveMemoryInStory — upsert failed:', error.message)
    void logEvent({
      action: AuditAction.STORY_MEMORY_REORDERED,
      tenant_id: tenantId,
      actor_id: userId,
      actor_type: 'user',
      target_type: 'memory',
      target_id: memoryId,
      outcome: 'failure',
      metadata: { error_detail: error.message, story_id: storyId, direction },
    })
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[story-containments] moved memory in story:', { memoryId, storyId, direction })
  void logEvent({
    action: AuditAction.STORY_MEMORY_REORDERED,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: 'user',
    target_type: 'memory',
    target_id: memoryId,
    outcome: 'success',
    metadata: { story_id: storyId, direction, positions: memories.map((m, i) => ({ memory_id: m.id, position: positions[i] })) },
  })
  return { ok: true, data: null }
}
