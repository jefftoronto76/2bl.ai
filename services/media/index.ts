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
}

export interface UpdateMediaItemInput {
  status?: MediaItemStatus
  derived_content?: string | null
  classification?: string | null
  error_message?: string | null
  processed_at?: string | null
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
      status: 'pending' as MediaItemStatus,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create media item: ${error?.message}`)
  return data as MediaItem
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
