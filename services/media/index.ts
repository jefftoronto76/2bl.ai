import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
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
