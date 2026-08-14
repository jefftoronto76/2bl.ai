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
//      A photo attachment has its own creation path, createPhotoMemoryFromMedia()
//      (added 2026-08-08, PhotoUploadActions.tsx's Bookmark icon) — title/body
//      both come from the photo's own AI-generated caption
//      (media_items.derived_content), not from any message text, and the
//      insert additionally stamps media_item_id so two photos on the same
//      chat message resolve to two independent memories rather than
//      colliding on anchor_message_id alone (see useMemories.ts's composite
//      lookup key).
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
import { getMediaItem, listByChat } from '@/services/media'
import { getStoryIdsForMemories } from '@/services/crm/story-containments'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'

export type MemoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export type MemorySourceKind = 'conversation' | 'photo' | 'video' | 'audio' | 'document'
export type MemoryStatus = 'draft' | 'published'

/**
 * A single block in a memory's body-blocks canvas (Memory Canvas V1 — text
 * and image only; see Design Handovers/handover_canvas_update_notion_08_2026).
 * `content` only ever means something on a 'text' block; `media_item_id`
 * only ever means something on an 'image' one — never both populated on the
 * same block.
 */
export interface MemoryBlock {
  id: string
  type: 'text' | 'image'
  content?: string
  media_item_id?: string
}

export interface MemoryRow {
  id: string
  session_id: string
  anchor_message_id: string
  /**
   * One-to-one photo-bookmark disambiguator (added 2026-08-08, confirmed
   * live in Studio — distinct from photo_artifacts's separate many-to-many
   * "attach this photo to any memory" relationship, not yet built). Null
   * for every non-photo-bookmark memory (conversation/video/audio/document,
   * and any legacy row). Lets two photos on the same chat message resolve
   * to two independent memories instead of colliding on anchor_message_id
   * alone — see createPhotoMemoryFromMedia below and useMemories.ts's
   * composite lookup key.
   */
  media_item_id?: string | null
  source_kind: MemorySourceKind
  title: string
  body: string
  /** Null/absent = legacy row, rendered from `body` alone forever (lazy-seed-on-first-edit — see reviseMemoryBlocks). */
  body_blocks?: MemoryBlock[] | null
  status: MemoryStatus
  created_at: string
  updated_at: string
  /**
   * The story (artifacts.id, type='story') this memory currently belongs
   * to, if any — resolved from artifact_containments (assign-memory-to-
   * story, 2026-08-13; see services/crm/story-containments.ts), not a
   * column on this row itself. null = never assigned. Only listMemories
   * below populates a real value; every other function in this file
   * that returns a MemoryRow (create/rename/reviseBlocks) leaves this
   * undefined — none of those change a memory's story, so there is
   * nothing to look up on their own read-back.
   */
  storyId?: string | null
}

const ARTIFACT_TYPE = 'memory' as const

const MEMORY_ROW_COLUMNS =
  'id, session_id, anchor_message_id, media_item_id, source_kind, title, body, status, created_at, updated_at'

/**
 * listMemories/createDraftMemory/renameMemory/publishMemory deliberately
 * keep selecting the ORIGINAL column list above, unchanged — body_blocks is
 * a new column (per Division of Labor, added by Jeff in Studio, not by CC;
 * see CLAUDE.md) that this backend pass cannot confirm is live yet. Selecting
 * a nonexistent column errors the whole query, not just omits the field, so
 * widening every existing read/write to request it now would risk breaking
 * the ALREADY-SHIPPED memory panel (listMemories backs its initial load) the
 * moment this deploys, if the column isn't there. reviseMemoryBlocks is the
 * one genuinely new mutation added in this pass — nothing calls it yet (the
 * panel UI is a separate, following task), so it's the only place selecting
 * body_blocks is both necessary and safely inert until that column exists.
 */
const MEMORY_ROW_COLUMNS_WITH_BLOCKS = `${MEMORY_ROW_COLUMNS}, body_blocks`

function toMemoryRow(row: Record<string, unknown>): MemoryRow {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    anchor_message_id: row.anchor_message_id as string,
    media_item_id: (row.media_item_id as string | null | undefined) ?? null,
    source_kind: row.source_kind as MemorySourceKind,
    title: row.title as string,
    body: row.body as string,
    body_blocks: (row.body_blocks as MemoryBlock[] | null | undefined) ?? null,
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
 *
 * Also resolves each row's storyId via getStoryIdsForMemories
 * (services/crm/story-containments.ts) — one extra query, keyed by this
 * session's own memory ids. Non-fatal on failure (mirrors listStories' own
 * active-link/subscriber lookups, services/crm/stories.ts): a containment
 * lookup error logs and falls back to every row's storyId reading null,
 * rather than failing the whole memory list over a linkage that's
 * secondary to the memory data itself.
 */
export async function listMemories(
  tenantId: string,
  sessionId: string,
): Promise<MemoryResult<MemoryRow[]>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .select(MEMORY_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .is('discarded_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[memories] list error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  const rows = (data ?? []).map(toMemoryRow)
  const storyIdsResult = await getStoryIdsForMemories(tenantId, rows.map(r => r.id))
  if (!storyIdsResult.ok) {
    console.error('[memories] list — story id lookup failed (non-fatal):', storyIdsResult.error)
  }
  const storyIdMap = storyIdsResult.ok ? storyIdsResult.data : {}

  return { ok: true, data: rows.map(r => ({ ...r, storyId: storyIdMap[r.id] ?? null })) }
}

export interface CreateDraftMemoryInput {
  sessionId: string
  anchorMessageId: string
  memberId: string | null
  sourceKind: MemorySourceKind
  title: string
  body: string
  /** Only ever set by createPhotoMemoryFromMedia below — every other caller (createMemoryFromAnchor) omits it, which inserts NULL. */
  mediaItemId?: string
}

/** Distinct error string for the "no linked account" rejection below — lets
 *  callers (createMemoryFromAnchor's audit logging, the route's HTTP status,
 *  and eventually the client's ChatErrorType classification) tell this case
 *  apart from a generic infra failure without a second field. */
export const ACCOUNT_REQUIRED_ERROR = 'An account is required to save memories.'

export type ResolveUserIdResult =
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
 *
 * Exported (2026-08-09) — services/crm/stories.ts's createStory reuses this
 * verbatim rather than duplicating it: a story write needs the exact same
 * members.id -> users.id resolution a memory write does, for the same
 * artifacts.user_id NOT NULL constraint.
 */
export async function resolveUserIdForMember(tenantId: string, memberId: string | null): Promise<ResolveUserIdResult> {
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
    // is NOT NULL, so there is no row to attempt here. 401, not 403: no
    // identity was presented at all (403 would imply an identified-but-
    // forbidden actor, which doesn't apply here), and not 500 so this
    // doesn't read as an infra failure downstream.
    return { ok: false, status: 401, error: ACCOUNT_REQUIRED_ERROR }
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
      media_item_id: input.mediaItemId ?? null,
      member_id: input.memberId,
      type: ARTIFACT_TYPE,
      source_kind: input.sourceKind,
      title: input.title,
      body: input.body,
      status: 'draft' as MemoryStatus,
    })
    .select(MEMORY_ROW_COLUMNS)
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
 * this file — with no model call anywhere in the memory system, there is no
 * archivist-call classification to carry on the result the way one once
 * needed to. Every failure branch below (including createDraftMemory's own)
 * logs to audit_events via AuditAction.MEMORY_CREATED, outcome: 'failure',
 * with a distinct metadata.error_detail per branch — see the Memories entry
 * in System Docs/Known Gaps.md.
 */
export async function createMemoryFromAnchor(
  tenantId: string,
  input: CreateMemoryFromAnchorInput,
): Promise<MemoryResult<MemoryRow>> {
  const { sessionId, anchorMessageId, memberId, sourceKind } = input

  const sessionResult = await getSessionMessages(tenantId, sessionId)
  if (!sessionResult.ok) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'session_lookup_failed', session_error: sessionResult.error },
    })
    return { ok: false, status: sessionResult.status, error: sessionResult.error }
  }

  const rawMessages = Array.isArray(sessionResult.data.messages) ? sessionResult.data.messages : []
  const anchorIdx = (rawMessages as unknown[]).findIndex(
    m => (m as { id?: unknown } | null)?.id === anchorMessageId,
  )
  if (anchorIdx === -1) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'anchor_not_found' },
    })
    return { ok: false, status: 400, error: 'anchor_message_id does not match a message in this session' }
  }

  const anchorContent = (rawMessages[anchorIdx] as { content?: unknown }).content
  if (typeof anchorContent !== 'string') {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'anchor_content_not_string' },
    })
    return { ok: false, status: 400, error: 'anchor message has no text content' }
  }

  const { prose, markers } = createDefaultRegistry().parse(anchorContent)
  const body = prose.trim()
  if (!body) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'empty_body_after_marker_strip' },
    })
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

export interface CreatePhotoMemoryFromMediaInput {
  sessionId: string
  anchorMessageId: string
  mediaItemId: string
  memberId: string | null
}

/**
 * The photo-bookmark creation path — sibling to createMemoryFromAnchor, not
 * a branch inside it: this has its own failure modes (a not-yet-processed
 * photo, an unowned media item) that have nothing to do with anchor-message
 * lookup. Backs the per-photo Bookmark action (PhotoUploadActions.tsx) —
 * unlike the whole-message bookmark, this never needs the anchor message to
 * have any text content at all (a caption-less photo message couldn't be
 * bookmarked before this existed).
 *
 * Title and body both come from the photo's own AI-generated caption
 * (media_items.derived_content, written by the Haiku vision pass that runs
 * on every upload) — read server-side, never trusted from the client.
 * deriveFallbackMemoryTitle() truncates it the same way every other
 * fallback-titled memory does; there is no [MEMORY_TITLE] marker equivalent
 * for a photo (nothing in the transcript to parse one from).
 *
 * Ownership check mirrors reviseMemoryBlocks's own image-block validation
 * exactly: getMediaItem (tenant-scoped) plus listByChat membership (session-
 * scoped) — a client can't bookmark another session's or tenant's photo by
 * guessing/replaying a media_item_id. 409 (not 400) when the item hasn't
 * finished processing yet or derived_content is still null — the client
 * already gates the button on status: 'ready', so reaching this branch means
 * a race (the item flipped back, or was queried mid-processing), not a
 * malformed request.
 */
export async function createPhotoMemoryFromMedia(
  tenantId: string,
  input: CreatePhotoMemoryFromMediaInput,
): Promise<MemoryResult<MemoryRow>> {
  const { sessionId, anchorMessageId, mediaItemId, memberId } = input

  const [item, sessionMediaItems] = await Promise.all([
    getMediaItem(mediaItemId, tenantId),
    listByChat(sessionId, tenantId),
  ])
  const belongsToSession = sessionMediaItems.some(m => m.id === mediaItemId)

  if (!item || !belongsToSession) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'media_item_not_in_session', media_item_id: mediaItemId },
    })
    return { ok: false, status: 400, error: `media_item_id ${mediaItemId} does not belong to this session` }
  }

  if (item.status !== 'ready' || !item.derived_content) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: 'media_item_not_ready', media_item_id: mediaItemId, status: item.status },
    })
    return { ok: false, status: 409, error: 'This photo is still being processed — try again in a moment.' }
  }

  const body = item.derived_content.trim()
  const title = deriveFallbackMemoryTitle(body)

  const createResult = await createDraftMemory(tenantId, {
    sessionId,
    anchorMessageId,
    memberId,
    mediaItemId,
    sourceKind: 'photo',
    title,
    body,
  })

  if (!createResult.ok) {
    void logEvent({
      action: AuditAction.MEMORY_CREATED,
      tenant_id: tenantId,
      actor_type: memberId ? 'user' : 'anonymous',
      target_type: 'memory',
      outcome: 'failure',
      metadata: { error_detail: createResult.error, media_item_id: mediaItemId },
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
    metadata: { media_item_id: mediaItemId },
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
    .select(MEMORY_ROW_COLUMNS)
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

const MAX_BLOCKS = 50

type ValidateBlocksResult =
  | { ok: true; blocks: MemoryBlock[] }
  | { ok: false; error: string }

/**
 * Narrows/validates the raw (untrusted, still `unknown`) `blocks` value from
 * a revise_blocks PATCH body into a real MemoryBlock[], or a single 400-worthy
 * error string. Real validation, not just a UI restriction — a client sending
 * a block type outside 'text'/'image' (e.g. a future video/quote/divider) is
 * rejected here even though nothing in the V1 UI would ever construct one,
 * since this is the actual scope boundary, not the UI's.
 */
function validateBlocks(blocks: unknown): ValidateBlocksResult {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { ok: false, error: 'blocks must be a non-empty array' }
  }
  if (blocks.length > MAX_BLOCKS) {
    return { ok: false, error: `blocks must not exceed ${MAX_BLOCKS} items` }
  }

  const validated: MemoryBlock[] = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'each block must be an object' }
    }
    const { id, type, content, media_item_id } = raw as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'each block must have a non-empty id' }
    }
    if (type !== 'text' && type !== 'image') {
      return { ok: false, error: `block ${id} has an invalid type — only 'text' and 'image' are supported` }
    }
    if (type === 'text') {
      if (content !== undefined && typeof content !== 'string') {
        return { ok: false, error: `block ${id}'s content must be a string` }
      }
      validated.push({ id, type, content: typeof content === 'string' ? content : '' })
    } else {
      if (typeof media_item_id !== 'string' || !media_item_id.trim()) {
        return { ok: false, error: `block ${id} (image) requires a media_item_id` }
      }
      validated.push({ id, type, media_item_id })
    }
  }

  const hasNonEmptyText = validated.some(b => b.type === 'text' && (b.content ?? '').trim().length > 0)
  if (!hasNonEmptyText) {
    return { ok: false, error: 'at least one text block must contain non-whitespace content' }
  }

  return { ok: true, blocks: validated }
}

/** Joined in array order, blank-line separated — the transcript's read-only `body` mirror of the blocks' text content. */
function flattenBlocksToBody(blocks: MemoryBlock[]): string {
  return blocks
    .filter(b => b.type === 'text' && (b.content ?? '').trim().length > 0)
    .map(b => (b.content as string).trim())
    .join('\n\n')
}

/**
 * revise_blocks — the panel's block-canvas editing mutation (Memory Canvas
 * V1). Lazy-seed-on-first-edit: this is the ONLY way a memory ever acquires
 * body_blocks — nothing seeds it at create time, so a legacy or
 * never-edited row stays `body_blocks: null` (rendered from `body` alone)
 * until a member's first edit in the panel calls this. Writes body_blocks
 * and a flattened `body` in the same update, since `body` remains the
 * transcript's (MemoryCard/MemorySavedReceipt) read-only source of truth —
 * validateBlocks's "at least one non-empty text block" rule is what keeps
 * that flatten from ever going blank.
 *
 * Image blocks' media_item_id is resolved server-side (getMediaItem, tenant-
 * scoped) and checked against this session's own media items (listByChat) —
 * a client cannot attach another session's or another tenant's photo by
 * guessing/replaying an id.
 */
export async function reviseMemoryBlocks(
  tenantId: string,
  sessionId: string,
  memoryId: string,
  blocks: unknown,
): Promise<MemoryResult<MemoryRow>> {
  const validation = validateBlocks(blocks)
  if (!validation.ok) {
    void logEvent({
      action: AuditAction.MEMORY_BLOCKS_REVISED,
      tenant_id: tenantId,
      target_type: 'memory',
      target_id: memoryId,
      outcome: 'failure',
      metadata: { error_detail: validation.error },
    })
    return { ok: false, status: 400, error: validation.error }
  }

  const imageMediaItemIds = Array.from(
    new Set(validation.blocks.filter(b => b.type === 'image').map(b => b.media_item_id as string)),
  )

  if (imageMediaItemIds.length > 0) {
    const sessionMediaItems = await listByChat(sessionId, tenantId)
    const sessionMediaItemIds = new Set(sessionMediaItems.map(item => item.id))

    for (const mediaItemId of imageMediaItemIds) {
      const item = await getMediaItem(mediaItemId, tenantId)
      if (!item || !sessionMediaItemIds.has(mediaItemId)) {
        void logEvent({
          action: AuditAction.MEMORY_BLOCKS_REVISED,
          tenant_id: tenantId,
          target_type: 'memory',
          target_id: memoryId,
          outcome: 'failure',
          metadata: { error_detail: 'media_item_not_in_session', media_item_id: mediaItemId },
        })
        return { ok: false, status: 400, error: `media_item_id ${mediaItemId} does not belong to this session` }
      }
    }
  }

  const body = flattenBlocksToBody(validation.blocks)

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('artifacts')
    .update({ body_blocks: validation.blocks, body, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .eq('type', ARTIFACT_TYPE)
    .select(MEMORY_ROW_COLUMNS_WITH_BLOCKS)
    .maybeSingle()

  if (error) {
    console.error('[memories] revise_blocks error:', JSON.stringify(error))
    void logEvent({
      action: AuditAction.MEMORY_BLOCKS_REVISED,
      tenant_id: tenantId,
      target_type: 'memory',
      target_id: memoryId,
      outcome: 'failure',
      metadata: { error_detail: error.message },
    })
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[memories] no memory matched id + tenant + session:', { memoryId, tenantId, sessionId })
    void logEvent({
      action: AuditAction.MEMORY_BLOCKS_REVISED,
      tenant_id: tenantId,
      target_type: 'memory',
      target_id: memoryId,
      outcome: 'failure',
      metadata: { error_detail: 'not_found' },
    })
    return { ok: false, status: 404, error: 'Memory not found' }
  }

  console.log('[memories] revised blocks:', memoryId)
  void logEvent({
    action: AuditAction.MEMORY_BLOCKS_REVISED,
    tenant_id: tenantId,
    target_type: 'memory',
    target_id: memoryId,
    outcome: 'success',
    metadata: { block_count: validation.blocks.length },
  })
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
    .select(MEMORY_ROW_COLUMNS)
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
