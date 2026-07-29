// services/crm/memories.ts
//
// Memory reads/writes against the existing `artifacts` table (type = 'memory'),
// per the approved Heirloom Memories plan — not a bespoke table. Mirrors
// services/crm/feedback.ts's shape: the shared service-role client
// (services/auth/supabase-admin.ts, matching conversion-events.ts's
// convention rather than feedback.ts's local one, since there's no legacy
// logging format to preserve here), a discriminated MemoryResult, and every
// write/read scoped by BOTH tenant_id AND session_id — the same cross-tenant
// IDOR guard every other CRM write in this codebase uses.
//
// Lifecycle (see CLAUDE.md's Memories section for the full design):
//   1. The archivist call (services/chat/server/memory-archivist.ts) succeeds
//      -> createDraftMemory() inserts one row, status: 'draft'. Nothing is
//      written on a running/in-flight attempt or on failure — there is no
//      "running" status to reconcile, because no row exists until there's a
//      real draft.
//   2. Rewrite succeeds -> updateDraftMemory() overwrites title/body on the
//      SAME row (evolving one memory, not accumulating duplicates per rewrite).
//   3. "Keep this" -> publishMemory() flips status to 'published'.
//   4. "Discard" -> discardMemory() stamps discarded_at; the row is never
//      hard-deleted this way (soft, same convention as members.revoked_at /
//      users.deleted_at) — but IS hard-deleted by deleteMemoriesForAnchors()
//      when the message it followed is truncated by an edit (mirrors
//      deleteFeedbackFrom's hard-delete-on-truncate behavior exactly).
//
// listMemories() unconditionally excludes discarded_at IS NOT NULL rows —
// discarded memories never round-trip to the client at all, which is what
// makes the "hasMemory must ignore discarded" reconciliation rule a
// non-issue here rather than something the client has to enforce itself.

import { getAdminClient } from '@/services/auth/supabase-admin'

export type MemoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export type MemorySourceKind = 'conversation' | 'photo' | 'video' | 'audio' | 'document'
export type MemoryStatus = 'draft' | 'published'

export interface MemoryRow {
  id: string
  session_id: string
  anchor_message_id: string
  source_kind: MemorySourceKind
  title: string
  body: string
  status: MemoryStatus
  created_at: string
  updated_at: string
}

const ARTIFACT_TYPE = 'memory' as const

function toMemoryRow(row: Record<string, unknown>): MemoryRow {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    anchor_message_id: row.anchor_message_id as string,
    source_kind: row.source_kind as MemorySourceKind,
    title: row.title as string,
    body: row.body as string,
    status: row.status as MemoryStatus,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/**
 * Lists every non-discarded memory for a session, oldest first (conversation
 * order). Tenant + session scoped. Discarded rows are excluded at the query
 * level — the client never sees them, so there is nothing to filter out
 * client-side.
 */
export async function listMemories(
  tenantId: string,
  sessionId: string,
): Promise<MemoryResult<MemoryRow[]>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .select('id, session_id, anchor_message_id, source_kind, title, body, status, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .is('discarded_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[memories] list error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: (data ?? []).map(toMemoryRow) }
}

export interface CreateDraftMemoryInput {
  sessionId: string
  anchorMessageId: string
  memberId: string | null
  sourceKind: MemorySourceKind
  title: string
  body: string
}

/**
 * Inserts the artifacts row for a successful archivist call. Only ever
 * called on success (see the module doc) — there is deliberately no
 * "running" row this ever supersedes.
 */
export async function createDraftMemory(
  tenantId: string,
  input: CreateDraftMemoryInput,
): Promise<MemoryResult<MemoryRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      tenant_id: tenantId,
      session_id: input.sessionId,
      anchor_message_id: input.anchorMessageId,
      member_id: input.memberId,
      type: ARTIFACT_TYPE,
      source_kind: input.sourceKind,
      title: input.title,
      body: input.body,
      status: 'draft' as MemoryStatus,
    })
    .select('id, session_id, anchor_message_id, source_kind, title, body, status, created_at, updated_at')
    .single()

  if (error || !data) {
    console.error('[memories] create error:', error ? JSON.stringify(error) : 'no row returned')
    return { ok: false, status: 500, error: error?.message ?? 'Failed to create memory' }
  }

  console.log('[memories] created draft:', data.id, '| session_id:', input.sessionId)
  return { ok: true, data: toMemoryRow(data) }
}

/**
 * Overwrites title/body on an existing draft row for a successful Rewrite —
 * evolves the same memory rather than creating a new row per rewrite cycle.
 * Tenant + session scoped; 404s (rather than silently no-op'ing) if the id
 * doesn't resolve, so a stale/foreign memory_id surfaces as an error, not a
 * silent skip.
 */
export async function updateDraftMemory(
  tenantId: string,
  sessionId: string,
  memoryId: string,
  title: string,
  body: string,
): Promise<MemoryResult<MemoryRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ title, body, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .select('id, session_id, anchor_message_id, source_kind, title, body, status, created_at, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[memories] update error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[memories] no memory matched id + tenant + session:', { memoryId, tenantId, sessionId })
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  return { ok: true, data: toMemoryRow(data) }
}

/**
 * "Keep this" — flips a draft to published. Tenant + session scoped, same
 * 404-on-miss behavior as updateDraftMemory.
 */
export async function publishMemory(
  tenantId: string,
  sessionId: string,
  memoryId: string,
): Promise<MemoryResult<MemoryRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ status: 'published' as MemoryStatus, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .select('id, session_id, anchor_message_id, source_kind, title, body, status, created_at, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[memories] publish error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[memories] no memory matched id + tenant + session:', { memoryId, tenantId, sessionId })
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  console.log('[memories] published:', memoryId)
  return { ok: true, data: toMemoryRow(data) }
}

/**
 * "Discard" — soft, stamps discarded_at rather than deleting. Same
 * soft-marker convention as members.revoked_at / users.deleted_at elsewhere
 * in this schema. The row is excluded from listMemories() from this point on.
 */
export async function discardMemory(
  tenantId: string,
  sessionId: string,
  memoryId: string,
): Promise<MemoryResult<null>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ discarded_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[memories] discard error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[memories] no memory matched id + tenant + session:', { memoryId, tenantId, sessionId })
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  console.log('[memories] discarded:', memoryId)
  return { ok: true, data: null }
}

/**
 * Hard-deletes every memory anchored to one of the given message ids —
 * called when editing/resending a visitor message truncates the transcript
 * forward from that point (services/chat/ui/v1/useChatTurn.ts
 * `truncateAndRedeliver`). Mirrors deleteFeedbackFrom's role for
 * message_feedback exactly, but keyed by message id rather than array
 * position (see CLAUDE.md — this is the whole reason memories are keyed by
 * id in the first place: no index-drift class of bug to guard against).
 * Hard delete, not discardMemory's soft stamp: truncated content is being
 * removed from history entirely, not declined by the visitor.
 */
export async function deleteMemoriesForAnchors(
  tenantId: string,
  sessionId: string,
  anchorMessageIds: string[],
): Promise<MemoryResult<null>> {
  if (anchorMessageIds.length === 0) return { ok: true, data: null }

  const supabase = getAdminClient()

  const { error } = await supabase
    .from('artifacts')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .in('anchor_message_id', anchorMessageIds)

  if (error) {
    console.error('[memories] delete-for-anchors error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[memories] cleared memories for truncated anchors:', { sessionId, count: anchorMessageIds.length })
  return { ok: true, data: null }
}

/**
 * Reads one memory's title/body/anchor — used by the Rewrite flow's
 * archivist call to pass the prior draft as context. Tenant + session scoped.
 */
export async function getMemory(
  tenantId: string,
  sessionId: string,
  memoryId: string,
): Promise<MemoryResult<MemoryRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .select('id, session_id, anchor_message_id, source_kind, title, body, status, created_at, updated_at')
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .maybeSingle()

  if (error) {
    console.error('[memories] get error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  return { ok: true, data: toMemoryRow(data) }
}
