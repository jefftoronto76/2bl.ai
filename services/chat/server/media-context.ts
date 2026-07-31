import { getAdminClient } from '@/services/auth/supabase-admin'
import type { ChatMessage } from './types'
import type { MediaAttachmentInput } from './types'

// Captures the filename out of `[MEDIA_UPLOAD: filename | mediaItemId | type]`
// (group 1) so stripMediaMarkers can build a fallback from it without a
// separate lookup.
const MEDIA_UPLOAD_PATTERN = /\[MEDIA_UPLOAD:\s*([^|]+?)\s*\|[^\]]*\]/g

/**
 * Fetches derived_content for each ready media item and returns a formatted
 * ATTACHED MEDIA section for injection into the system prompt. Any item in
 * `mediaItems` that the query does NOT come back as ready (the common case
 * for something attached in the current turn — processing is async and
 * almost never finishes before this same request builds its prompt) gets an
 * ATTACHMENT IN PROGRESS line instead, built directly from the client-
 * supplied filename/type on `mediaItems` — no second DB lookup, since the
 * ready-item query already tells us which ids are NOT ready.
 *
 * Short-circuits to '' when mediaItems is empty/null, when no tenant is
 * resolved, or when no member is resolved. A DB error on the ready-item
 * query still returns '' (matching prior behavior) rather than guessing —
 * an error there means we don't reliably know status either way.
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

  const readyRows = data ?? []
  const readyIds = new Set(readyRows.map(row => row.id))

  const readySection =
    readyRows.length > 0
      ? `ATTACHED MEDIA:\n\n${readyRows
          .map(row => `[${row.original_filename} (${row.type})]\n${row.derived_content}`)
          .join('\n\n')}`
      : ''

  const inProgressItems = mediaItems.filter(m => !readyIds.has(m.mediaItemId))
  const inProgressSection =
    inProgressItems.length > 0
      ? inProgressItems
          .map(m => `ATTACHMENT IN PROGRESS: ${m.filename} (${m.type}), still processing`)
          .join('\n')
      : ''

  return [readySection, inProgressSection].filter(section => section.length > 0).join('\n\n')
}

/**
 * Returns a new messages array with all [MEDIA_UPLOAD: …] marker strings
 * removed from user message content. Applied to all messages, not just the
 * last. Returns the original array unchanged when no markers are present.
 *
 * A turn that consisted ONLY of attachment markers (no typed caption) must
 * never reach the model as empty content once the markers are stripped —
 * the Anthropic API requires non-empty message text, and an empty turn also
 * gives the model nothing to react to. When stripping would empty a message
 * out, it's replaced with a short fallback built from the filename(s)
 * captured out of that same message's own markers — not a separate lookup.
 */
export function stripMediaMarkers(messages: ChatMessage[]): ChatMessage[] {
  let changed = false
  const result = messages.map(m => {
    if (m.role !== 'user') return m
    MEDIA_UPLOAD_PATTERN.lastIndex = 0
    if (!MEDIA_UPLOAD_PATTERN.test(m.content)) return m

    MEDIA_UPLOAD_PATTERN.lastIndex = 0
    const filenames = Array.from(m.content.matchAll(MEDIA_UPLOAD_PATTERN), match => match[1])

    MEDIA_UPLOAD_PATTERN.lastIndex = 0
    const stripped = m.content.replace(MEDIA_UPLOAD_PATTERN, '').trim()
    changed = true

    return {
      role: m.role,
      content: stripped.length > 0 ? stripped : attachmentOnlyFallback(filenames),
    }
  })
  return changed ? result : messages
}

function attachmentOnlyFallback(filenames: string[]): string {
  if (filenames.length === 0) return '(Sent an attachment with no message.)'
  if (filenames.length === 1) return `(Sent ${filenames[0]} with no message.)`
  return `(Sent ${filenames.length} files with no message: ${filenames.join(', ')}.)`
}
