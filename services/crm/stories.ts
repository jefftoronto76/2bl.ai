// services/crm/stories.ts
//
// Story reads/writes against the existing `artifacts` table (type = 'story'),
// the same table services/crm/memories.ts writes to — not a dedicated
// stories table. `artifacts.type` has no CHECK constraint, so this new value
// works with zero migration (see System Docs/Database Schema.md's `artifacts`
// row). Mirrors memories.ts's shape closely: the shared service-role client,
// the same MemoryResult<T> discriminated result type (reused as-is — it was
// already generic, not memory-specific), and resolveUserIdForMember (also
// reused from memories.ts, exported for exactly this) for the same
// anonymous/unlinked-member 401 rejection memory creation already has.
//
// Unlike memories, a story has no session and no anchor message — session_id
// is always inserted null, and there is no createXFromAnchor wrapper layer:
// createDraftStory is both the insert and the audit-logging entry point
// (mirroring where createMemoryFromAnchor, not createDraftMemory, logs
// MEMORY_CREATED — adapted here since there's only one layer for stories).
//
// List/delete scoping deliberately differs from memories: memories scope by
// session_id, which a story doesn't have. listStories scopes by tenant_id +
// user_id instead (the same columns services/crm/sessions.ts's listSessions
// scopes chat_sessions by), and discardStory scopes by tenant_id + id + type
// only — matching softDeleteSession's own precedent of tenant-scoping alone,
// not a stricter ownership check invented just for this row type.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { resolveUserIdForMember, ACCOUNT_REQUIRED_ERROR, type MemoryResult } from '@/services/crm/memories'

const ARTIFACT_TYPE = 'story' as const

const STORY_ROW_COLUMNS = 'id, title, body, created_at, updated_at'

export interface StoryRow {
  id: string
  title: string
  body: string
  created_at: string
  updated_at: string
}

function toStoryRow(row: Record<string, unknown>): StoryRow {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string | null | undefined) ?? '',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/**
 * Lists every non-discarded story owned by this user, oldest first — mirrors
 * listMemories's filter/order shape exactly, scoped by tenant_id + user_id
 * (the identifying columns available here) instead of session_id.
 */
export async function listStories(tenantId: string, userId: string): Promise<MemoryResult<StoryRow[]>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .select(STORY_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('type', ARTIFACT_TYPE)
    .is('discarded_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[stories] list error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: (data ?? []).map(toStoryRow) }
}

export interface CreateDraftStoryInput {
  memberId: string | null
  name: string
  description: string
}

/**
 * Creates a story — the sole creation entry point (no anchor-based wrapper
 * exists for stories the way createMemoryFromAnchor wraps createDraftMemory),
 * so this both inserts the row and logs AuditAction.STORY_CREATED itself.
 * Rejects with the same 401 ACCOUNT_REQUIRED_ERROR createDraftMemory does for
 * an anonymous or not-yet-linked member — artifacts.user_id is NOT NULL, so
 * there is no row to attempt without a resolved account.
 */
export async function createDraftStory(
  tenantId: string,
  input: CreateDraftStoryInput,
): Promise<MemoryResult<StoryRow>> {
  const userIdResult = await resolveUserIdForMember(tenantId, input.memberId)
  if (!userIdResult.ok) {
    void logEvent({
      action: AuditAction.STORY_CREATED,
      tenant_id: tenantId,
      actor_type: input.memberId ? 'user' : 'anonymous',
      target_type: 'story',
      outcome: 'failure',
      metadata: { error_detail: 'user_id_lookup_failed', lookup_error: userIdResult.error },
    })
    return { ok: false, status: 500, error: userIdResult.error }
  }
  if (!userIdResult.userId) {
    void logEvent({
      action: AuditAction.STORY_CREATED,
      tenant_id: tenantId,
      actor_type: 'anonymous',
      target_type: 'story',
      outcome: 'failure',
      metadata: { error_detail: 'account_required' },
    })
    return { ok: false, status: 401, error: ACCOUNT_REQUIRED_ERROR }
  }
  const userId = userIdResult.userId

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      session_id: null,
      member_id: input.memberId,
      type: ARTIFACT_TYPE,
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
      actor_type: input.memberId ? 'user' : 'anonymous',
      target_type: 'story',
      outcome: 'failure',
      metadata: { error_detail: error?.message ?? 'no_row_returned' },
    })
    return { ok: false, status: 500, error: error?.message ?? 'Failed to create story' }
  }

  const story = toStoryRow(data)
  console.log('[stories] created:', story.id, '| tenant_id:', tenantId)
  void logEvent({
    action: AuditAction.STORY_CREATED,
    tenant_id: tenantId,
    actor_type: input.memberId ? 'user' : 'anonymous',
    target_type: 'story',
    target_id: story.id,
    outcome: 'success',
  })
  return { ok: true, data: story }
}

/**
 * Soft-discards a story — mirrors discardMemory's discarded_at stamp exactly,
 * scoped by tenant_id + id + type only (no session_id leg; stories have
 * none). No logging inside it, matching discardMemory's own precedent — the
 * caller (DELETE /api/stories/[id]) logs AuditAction.STORY_DISCARDED.
 */
export async function discardStory(tenantId: string, storyId: string): Promise<MemoryResult<null>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ discarded_at: new Date().toISOString() })
    .eq('id', storyId)
    .eq('tenant_id', tenantId)
    .eq('type', ARTIFACT_TYPE)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[stories] discard error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[stories] no story matched id + tenant:', { storyId, tenantId })
    return { ok: false, status: 404, error: 'Story not found' }
  }

  console.log('[stories] discarded:', storyId)
  return { ok: true, data: null }
}
