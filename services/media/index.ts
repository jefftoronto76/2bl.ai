import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { objectExists } from './storage'
import type { MediaItemStatus, MediaItemType, MediaItem } from './types'

export type { MediaItemStatus, MediaItemType, MediaItem } from './types'
export { withDisplayUrl, type MediaItemWithUrl } from './display-url'

export interface CreateMediaItemInput {
  id: string
  tenant_id: string
  member_id: string
  chat_id: string | null
  type: MediaItemType
  original_filename: string
  storage_path: string
  file_size_bytes: number
  mime_type: string
  content_hash: string | null
}

export interface UpdateMediaItemInput {
  status?: MediaItemStatus
  derived_content?: string | null
  classification?: string | null
  error_message?: string | null
  processed_at?: string | null
  /** Set once, alongside the ready-transition update, by processImage's GPS extraction step — see services/media/processor.ts. */
  latitude?: number | null
  longitude?: number | null
}

export async function createMediaItem(input: CreateMediaItemInput): Promise<MediaItem> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .insert({
      id: input.id,
      tenant_id: input.tenant_id,
      member_id: input.member_id,
      chat_id: input.chat_id,
      story_id: null,
      type: input.type,
      original_filename: input.original_filename,
      storage_path: input.storage_path,
      file_size_bytes: input.file_size_bytes,
      mime_type: input.mime_type,
      content_hash: input.content_hash,
      status: 'pending' as MediaItemStatus,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create media item: ${error?.message}`)
  return data as MediaItem
}

/**
 * Looks up an existing media_items row uploaded by the same member, in the
 * same chat, with identical file content (matched by content_hash, computed
 * client-side since file bytes never pass through this server — see
 * services/media/useMediaUpload.ts). Used by the upload-url route to dedupe
 * a duplicate upload instead of creating an independent row. Scoped to
 * member_id + chat_id (not member-wide or tenant-wide) — "the same file
 * uploaded twice in one conversation," not a broader match.
 *
 * A null chatId (pre-session upload) matches only against other null-chatId
 * rows from the same member, not against a real chat_id.
 */
export async function findDuplicateMediaItem(params: {
  tenantId: string
  memberId: string
  chatId: string | null
  contentHash: string
}): Promise<MediaItem | null> {
  const supabase = getAdminClient()
  let query = supabase
    .from('media_items')
    .select()
    .eq('tenant_id', params.tenantId)
    .eq('member_id', params.memberId)
    .eq('content_hash', params.contentHash)

  query = params.chatId ? query.eq('chat_id', params.chatId) : query.is('chat_id', null)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1)
  if (error || !data || data.length === 0) return null
  return data[0] as MediaItem
}

export interface BackfillChatIdInput {
  tenantId: string
  memberId: string
  chatId: string
  mediaItemIds: string[]
}

/**
 * Backfills chat_id on media_items rows uploaded before their session
 * existed. The first message of a brand-new conversation uploads its
 * attachments before /api/sessions ever creates a row (ChatInput.tsx's
 * handleSend uploads before calling send()), so those rows are created with
 * chat_id: null — and every client-side status mechanism (Realtime, the
 * catch-up fetch, the poll) filters by chat_id, so a still-null row can never
 * be found again once the session exists. Called from app/api/sessions/route.ts
 * POST, in the same request that creates the session, right after its id is
 * known.
 *
 * Scoped to tenant_id + member_id (never trusts the id list alone — a caller
 * could otherwise backfill someone else's rows) and only touches rows still
 * null (`chat_id IS NULL`), so it can never clobber an already-correct
 * chat_id from a genuinely different call. Returns the ids actually updated;
 * the caller diffs against the requested list to detect ids that didn't
 * match (already set, wrong owner, or nonexistent) for its own audit
 * logging — this function does no logging itself, matching updateMediaItem
 * above.
 */
export async function backfillMediaChatId(
  input: BackfillChatIdInput,
): Promise<{ updatedIds: string[] }> {
  if (input.mediaItemIds.length === 0) return { updatedIds: [] }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .update({ chat_id: input.chatId, updated_at: new Date().toISOString() })
    .in('id', input.mediaItemIds)
    .eq('tenant_id', input.tenantId)
    .eq('member_id', input.memberId)
    .is('chat_id', null)
    .select('id')

  if (error) throw new Error(`Failed to backfill media chat_id: ${error.message}`)
  return { updatedIds: (data ?? []).map((row) => (row as { id: string }).id) }
}

export async function updateMediaItem(id: string, input: UpdateMediaItemInput): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('media_items')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(`Failed to update media item: ${error.message}`)
}

export async function getMediaItem(id: string, tenantId: string): Promise<MediaItem | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .select()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error) return null
  return data as MediaItem
}

export async function listByChat(
  chatId: string,
  tenantId: string,
  statuses?: MediaItemStatus[],
): Promise<MediaItem[]> {
  const supabase = getAdminClient()
  let query = supabase
    .from('media_items')
    .select()
    .eq('chat_id', chatId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (statuses && statuses.length > 0) {
    query = query.in('status', statuses)
  }

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as MediaItem[]
}

export async function listByMember(
  memberId: string,
  tenantId: string,
): Promise<MediaItem[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .select()
    .eq('member_id', memberId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as MediaItem[]
}

/**
 * How long a row may sit at status='processing' before the stale-processing
 * sweep (app/api/cron/media-sweep/route.ts) considers it stalled rather than
 * legitimately still running, per type. `image` is data-backed (~30x the
 * observed 10.2s max over a 14-day sample — see System Docs/Utilities/Media.md's
 * "Known Unknowns" section). `document` and `audio` have zero completed-job
 * samples as of this writing — both are judgment calls (document reasoned
 * from its single-AI-call architecture similar to image; audio anchored to
 * processAudio's own 1-hour-signed-URL design assumption for slow Deepgram
 * queues) and should be revisited once real samples exist.
 */
export const MAX_PROCESSING_AGE_SECONDS: Record<MediaItemType, number> = {
  image: 300,
  document: 600,
  audio: 5400,
}

/**
 * Fixed error_message the sweep (and the retry route's stale-processing
 * backstop) writes to a row it flips from 'processing' to 'failed' — a
 * distinct, honest string rather than reusing one of the pipeline's own
 * thrown-error messages, since nothing actually threw here. errorCopy.ts
 * maps this to member-facing copy the same way it does every other
 * error_message.
 */
export const STALE_PROCESSING_ERROR_MESSAGE = 'Processing stalled and timed out'

export interface StaleProcessingItem {
  id: string
  tenant_id: string
  member_id: string
  type: MediaItemType
  mime_type: string
  original_filename: string
  file_size_bytes: number
  created_at: string
}

/**
 * Defense-in-depth recovery for a media_items job that stalls at
 * status='processing' for any reason — not tied to one root cause, since a
 * hung upstream fetch with no timeout could still hold a kept-alive
 * invocation open even after the after()-lifecycle fix (see
 * app/api/webhooks/media-process/route.ts and app/api/media/[id]/retry/route.ts).
 * Selects every 'processing' row, filters in application code against
 * MAX_PROCESSING_AGE_SECONDS by type (a single query is simpler than three
 * per-type date-filtered queries given how few rows are ever in this state),
 * then flips each stale row to 'failed' with STALE_PROCESSING_ERROR_MESSAGE.
 * The per-row update re-checks status='processing' so a job that legitimately
 * completes in the gap between the select and this update is left alone
 * rather than being clobbered. Returns only the rows actually swept (a
 * failed guard update is silently skipped, not retried) so the caller can
 * log an audit event per item without re-querying.
 */
export async function sweepStaleProcessingItems(): Promise<StaleProcessingItem[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .select('id, tenant_id, member_id, type, mime_type, original_filename, file_size_bytes, created_at')
    .eq('status', 'processing')

  if (error || !data) return []

  const now = Date.now()
  const stale = (data as StaleProcessingItem[]).filter((item) => {
    const ageSeconds = (now - new Date(item.created_at).getTime()) / 1000
    return ageSeconds > MAX_PROCESSING_AGE_SECONDS[item.type]
  })

  const swept: StaleProcessingItem[] = []
  for (const item of stale) {
    const { data: updated, error: updateError } = await supabase
      .from('media_items')
      .update({
        status: 'failed',
        error_message: STALE_PROCESSING_ERROR_MESSAGE,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('status', 'processing')
      .select('id')

    // An empty (not erroring) result means the guard condition didn't match —
    // the row moved off 'processing' between the select above and this
    // update — same "no rows matched" signal backfillMediaChatId's own
    // .update().select('id') pattern relies on.
    if (!updateError && updated && updated.length > 0) swept.push(item)
  }

  return swept
}

/**
 * How long a row may sit at status='pending' before the sweep considers the
 * trigger call lost/never-sent rather than merely slow. Flat, not per-type —
 * unlike MAX_PROCESSING_AGE_SECONDS this isn't about how long a pipeline
 * step legitimately takes; it's about how long the gap between the client's
 * Storage PUT resolving and its immediate follow-up call to
 * POST /api/media/[id]/start-processing should ever plausibly be. That call
 * carries no file body, so it should complete in well under this window
 * regardless of type or connection quality.
 */
export const MAX_PENDING_AGE_SECONDS = 120

/**
 * Fixed error_message for a stale 'pending' row whose file never actually
 * reached Storage — a genuinely abandoned upload (tab closed mid-PUT),
 * distinct from STALE_PROCESSING_ERROR_MESSAGE's "started but never
 * finished" and from a row whose file IS present (see
 * sweepStalePendingItems's `recovered` bucket — that case isn't a failure at
 * all, just a lost trigger call, so it gets retriggered instead of failed).
 */
export const STALE_PENDING_ERROR_MESSAGE = 'Upload was never completed'

export interface StalePendingSweepResult {
  /**
   * The file IS present in Storage — the client's PUT actually succeeded,
   * only the follow-up trigger call was lost (tab closed right after the
   * PUT, a flaky connection dropped that one small request, etc). Not
   * touched in the DB by this function — the caller is expected to
   * retrigger processMediaItem for each of these (the same way the
   * start-processing route itself would have).
   */
  recovered: MediaItem[]
  /**
   * The file is NOT present in Storage — a genuinely abandoned upload.
   * Already flipped to status='failed' with STALE_PENDING_ERROR_MESSAGE by
   * this function; the caller only needs to log it.
   */
  abandoned: MediaItem[]
}

/**
 * Defense-in-depth recovery for the other half of the trigger-ordering fix:
 * moving the processing trigger to POST /api/media/[id]/start-processing
 * (called by the client right after its Storage PUT resolves) closes the
 * too-early race, but introduces a narrower failure mode of its own — a
 * client that closes/crashes between the PUT resolving and that follow-up
 * call firing leaves the row at 'pending' forever, with no error and (unlike
 * a stuck 'processing' row) no path to sweepStaleProcessingItems either,
 * since that function only ever looks at 'processing' rows.
 *
 * Selects every 'pending' row older than MAX_PENDING_AGE_SECONDS and uses
 * objectExists (the same check waitForStorageObject uses, services/media/processor.ts)
 * to tell the two real cases apart: if the file is actually in Storage, only
 * the trigger call was lost, so the row is recoverable, not failed — the
 * caller retriggers processing for it. If the file was never written, the
 * upload itself was abandoned, and this function flips the row straight to
 * 'failed' since there is nothing left to retrigger.
 */
export async function sweepStalePendingItems(): Promise<StalePendingSweepResult> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .select()
    .eq('status', 'pending')

  if (error || !data) return { recovered: [], abandoned: [] }

  const now = Date.now()
  const stale = (data as MediaItem[]).filter(
    (item) => (now - new Date(item.created_at).getTime()) / 1000 > MAX_PENDING_AGE_SECONDS,
  )

  const recovered: MediaItem[] = []
  const abandoned: MediaItem[] = []

  for (const item of stale) {
    const fileExists = await objectExists(item.storage_path)
    if (fileExists) {
      recovered.push(item)
      continue
    }

    const { data: updated, error: updateError } = await supabase
      .from('media_items')
      .update({
        status: 'failed',
        error_message: STALE_PENDING_ERROR_MESSAGE,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('status', 'pending')
      .select('id')

    if (!updateError && updated && updated.length > 0) abandoned.push(item)
  }

  return { recovered, abandoned }
}

/**
 * Returns true unless ENABLE_MEDIA_AUDIT_LOGGING is explicitly set to 'false'.
 * Readable from environment variables — no deploy required to toggle.
 */
export function isMediaAuditEnabled(): boolean {
  return process.env.ENABLE_MEDIA_AUDIT_LOGGING !== 'false'
}

interface LogMediaEventParams {
  tenant_id: string
  member_id: string
  media_item_id: string
  action: string
  outcome: 'success' | 'failure'
  correlation_id: string
  metadata: Record<string, unknown>
  actor_id?: string | null
}

/**
 * Wraps logEvent with the common media-item envelope so processor.ts
 * does not repeat shared fields across three log calls.
 */
export async function logMediaEvent(params: LogMediaEventParams): Promise<void> {
  await logEvent({
    action: params.action as AuditAction,
    tenant_id: params.tenant_id,
    actor_id: params.actor_id ?? null,
    actor_type: 'user',
    target_type: 'media_item',
    target_id: params.media_item_id,
    outcome: params.outcome,
    correlation_id: params.correlation_id,
    metadata: {
      member_id: params.member_id,
      ...params.metadata,
    },
  })
}

/**
 * Wraps logEvent for Anthropic AI calls within the media processing pipeline.
 * Same envelope as logMediaEvent — kept separate for log query clarity.
 */
export async function logAiMediaEvent(params: LogMediaEventParams): Promise<void> {
  await logEvent({
    action: params.action as AuditAction,
    tenant_id: params.tenant_id,
    actor_id: params.actor_id ?? null,
    actor_type: 'system',
    target_type: 'media_item',
    target_id: params.media_item_id,
    outcome: params.outcome,
    correlation_id: params.correlation_id,
    metadata: {
      member_id: params.member_id,
      ...params.metadata,
    },
  })
}

/**
 * Wraps logEvent for Deepgram STT calls within the media processing pipeline.
 * Same envelope as logMediaEvent — kept separate for log query clarity.
 */
export async function logSttMediaEvent(params: LogMediaEventParams): Promise<void> {
  await logEvent({
    action: params.action as AuditAction,
    tenant_id: params.tenant_id,
    actor_id: params.actor_id ?? null,
    actor_type: 'system',
    target_type: 'media_item',
    target_id: params.media_item_id,
    outcome: params.outcome,
    correlation_id: params.correlation_id,
    metadata: {
      member_id: params.member_id,
      ...params.metadata,
    },
  })
}
