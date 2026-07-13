import { getAdminClient } from '@/services/auth/supabase-admin'
import type { ChatMessage } from './types'
import type { MediaAttachmentInput } from './types'

const MEDIA_UPLOAD_PATTERN = /\[MEDIA_UPLOAD:[^\]]*\]/g

/**
 * Fetches derived_content for each ready media item and returns a formatted
 * ATTACHED MEDIA section for injection into the system prompt.
 *
 * Short-circuits to '' when mediaItems is empty/null, when no tenant is
 * resolved, or when none of the items have status='ready'.
 */
export async function resolveMediaContext(
  mediaItems: MediaAttachmentInput[] | null | undefined,
  tenantId: string | null,
  memberId: string | null,
): Promise<string> {
  if (!mediaItems || mediaItems.length === 0 || !tenantId || !memberId) return ''

  const ids = mediaItems.map(m => m.mediaItemId)

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('media_items')
    .select('id, original_filename, type, derived_content')
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .eq('member_id', memberId)
    .eq('status', 'ready')
    .not('derived_content', 'is', null)

  if (error) {
    console.error('[chat/media-context] resolveMediaContext error:', error.message)
    return ''
  }

  if (!data || data.length === 0) return ''

  const sections = data.map(
    row => `[${row.original_filename} (${row.type})]\n${row.derived_content}`,
  )

  return `ATTACHED MEDIA:\n\n${sections.join('\n\n')}`
}

/**
 * Returns a new messages array with all [MEDIA_UPLOAD: …] marker strings
 * removed from user message content. Applied to all messages, not just the
 * last. Returns the original array unchanged when no markers are present.
 */
export function stripMediaMarkers(messages: ChatMessage[]): ChatMessage[] {
  let changed = false
  const result = messages.map(m => {
    if (m.role !== 'user' || !MEDIA_UPLOAD_PATTERN.test(m.content)) return m
    MEDIA_UPLOAD_PATTERN.lastIndex = 0
    const stripped = m.content.replace(MEDIA_UPLOAD_PATTERN, '').trim()
    changed = true
    return { role: m.role, content: stripped }
  })
  return changed ? result : messages
}
