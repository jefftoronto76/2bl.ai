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
// No model call anywhere in this file — the archivist (a second generateText
// call that used to rewrite a passage and invent a title) has been removed
// entirely, both for create and for what used to be Rewrite. See the
// Memories entry in System Docs/Known Gaps.md for the full design.
//
// Lifecycle:
//   1. Create (manual bookmark or the [SAVE_MEMORY] marker) ->
//      createMemoryFromAnchor() reads the anchor message's own stored content
//      verbatim (title from a [MEMORY_TITLE: ...] marker on that message if
//      present, else deriveFallbackMemoryTitle()'s truncation) and calls
//      createDraftMemory() to insert one row, status: 'draft'. Nothing is
//      written on failure — there is no "running" status to reconcile,
//      because no row exists until there's a real draft.
//   2. "Keep this" -> publishMemory() flips status to 'published'.
//   3. "Discard" -> discardMemory() stamps discarded_at; the row is never
//      hard-deleted this way (soft, same convention as members.revoked_at /
//      users.deleted_at) — but IS hard-deleted by deleteMemoriesForAnchors()
//      when the message it followed is truncated by an edit (mirrors
//      deleteFeedbackFrom's hard-delete-on-truncate behavior exactly).
//   4. Independently of the above, at any point: renameMemory() lets the
//      member correct the title inline (draft or published) — an optimistic
//      guess, not a conversation. The passage itself has no revision path
//      anymore; the Rewrite button in MemoryCard.tsx is unwired to a stub
//      (fires a toast, does nothing) pending a future redesign — the only
//      way to get a different passage today is Discard + bookmark again.
//
// listMemories() unconditionally excludes discarded_at IS NOT NULL rows —
// discarded memories never round-trip to the client at all, which is what
// makes the "hasMemory must ignore discarded" reconciliation rule a
// non-issue here rather than something the client has to enforce itself.

import { getAdminClient } from '@/services/auth/supabase-admin'
import { getSessionMessages } from '@/services/crm/sessions'
import { createDefaultRegistry } from '@/services/chat/ui/v1/registry'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

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

/** Distinct error string for the "no linked account" rejection below — lets
 *  callers (createMemoryFromAnchor's audit logging, the route's HTTP status,
 *  and eventually the client's ChatErrorType classification) tell this case
 *  apart from a generic infra failure without a second field. */
export const ACCOUNT_REQUIRED_ERROR = 'An account is required to save memories.'

type ResolveUserIdResult =
  | { ok: true; userId: string | null }
  | { ok: false; error: string }

/**
 * Resolves the Supabase users.id a memory write should be attributed to,
 * from an already-resolved members.id. Not a duplicate of
 * services/crm/feedback.ts's resolveMemberId — that resolves the opposite
 * direction (Clerk session -> users.id -> members.id) and its client-
 * supplied-id fallback never touches user_id at all, so it can't answer this
 * question. `userId: null` on an `ok: true` result covers both a fully
 * anonymous visitor (no memberId) and a member row that exists but isn't
 * linked to an account yet (an invited-but-not-signed-up member,
 * members.user_id IS NULL) — both are the same "no account" case from this
 * table's point of view. `ok: false` is reserved for a genuine lookup
 * failure (DB error), kept distinct so it isn't mistaken for "no account".
 */
async function resolveUserIdForMember(tenantId: string, memberId: string | null): Promise<ResolveUserIdResult> {
  if (!memberId) return { ok: true, userId: null }
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('members')
    .select('user_id')
    .eq('id', memberId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('[memories] resolveUserIdForMember lookup error:', JSON.stringify(error))
    return { ok: false, error: error.message }
  }
  return { ok: true, userId: (data?.user_id as string | undefined) ?? null }
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
  const userIdResult = await resolveUserIdForMember(tenantId, input.memberId)
  if (!userIdResult.ok) {
    // A genuine DB error resolving user_id — an infra failure, not the
    // "no account" case, so it keeps the generic 500 shape.
    return { ok: false, status: 500, error: userIdResult.error }
  }
  if (!userIdResult.userId) {
    // Anonymous visitor (no memberId) or a member not yet linked to an
    // account (memberId resolved but members.user_id is null) — artifacts.user_id
    // is NOT NULL, so there is no row to attempt here. A distinct status
    // (403, not 500) so this doesn't read as an infra failure downstream.
    return { ok: false, status: 403, error: ACCOUNT_REQUIRED_ERROR }
  }
  const userId = userIdResult.userId

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
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

const FALLBACK_TITLE_MAX_CHARS = 60

/**
 * Fallback title for a memory created from a message with no [MEMORY_TITLE]
 * marker — the common case: the bookmark can fire on any message (plain
 * interview questions, brief acknowledgments), most of which the guide never
 * flagged as memory-worthy in the moment. Mirrors
 * components/shells/membership/chatStore.tsx's deriveSessionTitle (the
 * existing 60-char/ellipsis convention already used for conversation titles
 * in this app), adapted to break at the last full word rather than
 * mid-character.
 */
export function deriveFallbackMemoryTitle(content: string): string {
  const text = content.trim().replace(/\s+/g, ' ')
  if (text.length <= FALLBACK_TITLE_MAX_CHARS) return text
  const truncated = text.slice(0, FALLBACK_TITLE_MAX_CHARS)
  const lastSpace = truncated.lastIndexOf(' ')
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`
}

export interface CreateMemoryFromAnchorInput {
  sessionId: string
  anchorMessageId: string
  memberId: string | null
  sourceKind: MemorySourceKind
}

/**
 * The only memory-creation path — no model call. The guide's own message
 * already is the passage: this reads the anchor message's own stored content
 * verbatim (every marker, including MEMORY_TITLE itself, stripped via the
 * same default registry every other render path uses) rather than asking a
 * model to rewrite it. Title comes from a [MEMORY_TITLE: ...] marker on that
 * message if the guide emitted one, else deriveFallbackMemoryTitle().
 *
 * Returns the plain shared MemoryResult, same as every other function in
 * this file — with no model call anywhere in the memory system, there is
 * exactly one failure shape left (a Supabase write erroring), so there is no
 * classification to carry on the result the way an archivist-call result
 * once needed to.
 */
export async function createMemoryFromAnchor(
  tenantId: string,
  input: CreateMemoryFromAnchorInput,
): Promise<MemoryResult<MemoryRow>> {
  const { sessionId, anchorMessageId, memberId, sourceKind } = input

  const sessionResult = await getSessionMessages(tenantId, sessionId)
  if (!sessionResult.ok) return { ok: false, status: sessionResult.status, error: sessionResult.error }

  const rawMessages = Array.isArray(sessionResult.data.messages) ? sessionResult.data.messages : []
  const anchorIdx = (rawMessages as unknown[]).findIndex(
    m => (m as { id?: unknown } | null)?.id === anchorMessageId,
  )
  if (anchorIdx === -1) {
    return { ok: false, status: 400, error: 'anchor_message_id does not match a message in this session' }
  }

  const anchorContent = (rawMessages[anchorIdx] as { content?: unknown }).content
  if (typeof anchorContent !== 'string') {
    return { ok: false, status: 400, error: 'anchor message has no text content' }
  }

  const { prose, markers } = createDefaultRegistry().parse(anchorContent)
  const body = prose.trim()
  if (!body) {
    return { ok: false, status: 400, error: 'anchor message has no content to save once markers are stripped' }
  }

  const markerTitle = markers.find(m => m.type === 'MEMORY_TITLE')?.fields[0]?.trim()
  const title = markerTitle || deriveFallbackMemoryTitle(body)
  const titleSource = markerTitle ? 'marker' : 'fallback'

  const createResult = await createDraftMemory(tenantId, { sessionId, anchorMessageId, memberId, sourceKind, title, body })

  if (!createResult.ok) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: createResult.error, title_source: titleSource },
    })
    return createResult
  }

  void logEvent({
    action: AuditAction.MEMORY_CREATED,
    tenant_id: tenantId,
    actor_type: memberId ? 'user' : 'anonymous',
    target_type: 'memory',
    target_id: createResult.data.id,
    outcome: 'success',
    metadata: { title_source: titleSource },
  })

  return createResult
}

/**
 * Title-only update — backs the inline title-edit affordance on MemoryCard
 * and MemorySavedReceipt. Never touches body — title is an optimistic guess
 * the member can correct directly; the passage has no equivalent revision
 * path. No status check: a draft and a published memory are both editable
 * through this same function.
 */
export async function renameMemory(
  tenantId: string,
  sessionId: string,
  memoryId: string,
  title: string,
): Promise<MemoryResult<MemoryRow>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .select('id, session_id, anchor_message_id, source_kind, title, body, status, created_at, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[memories] rename error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[memories] no memory matched id + tenant + session:', { memoryId, tenantId, sessionId })
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  console.log('[memories] renamed:', memoryId)
  return { ok: true, data: toMemoryRow(data) }
}

/**
 * "Keep this" — flips a draft to published. Tenant + session scoped; 404s
 * (rather than silently no-op'ing) if the id doesn't resolve, so a stale/
 * foreign memory_id surfaces as an error, not a silent skip.
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
 * position (see the Memories entry in System Docs/Known Gaps.md — this is
 * the whole reason memories are keyed by id in the first place: no
 * index-drift class of bug to guard against).
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
