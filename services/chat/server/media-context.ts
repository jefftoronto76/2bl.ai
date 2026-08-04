import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import type { ChatMessage } from './types'
import type { MediaAttachmentInput } from './types'

// Captures the filename out of `[MEDIA_UPLOAD: filename | mediaItemId | type]`
// (group 1) so stripMediaMarkers can build a fallback from it without a
// separate lookup.
const MEDIA_UPLOAD_PATTERN = /\[MEDIA_UPLOAD:\s*([^|]+?)\s*\|[^\]]*\]/g

/**
 * Maps a raw, internal error_message to a fixed, pre-written safe phrase —
 * never the raw string itself. This is a category classifier, not string
 * scrubbing: regex-stripping "known bad patterns" (storage paths, vendor
 * names) out of an open-ended string is inherently incomplete, since any
 * error shape not anticipated here would leak straight through. Mapping to
 * a bounded set of known-safe phrases guarantees no vendor name or internal
 * path ever reaches the prompt regardless of what the underlying error
 * actually says — the fallback category alone is the backstop.
 */
export function sanitizeFailureReason(raw: string | null): string {
  const message = raw ?? ''

  if (message.includes('Storage object not available after')) {
    return "the file didn't finish uploading before we tried to process it"
  }
  if (message.includes('Deepgram API error')) {
    return "the audio transcription service couldn't process this file"
  }
  if (
    message.includes('Anthropic vision error') ||
    message.includes('No text block returned from Anthropic vision')
  ) {
    return "the image couldn't be analyzed"
  }
  if (
    message.includes('DEEPGRAM_API_KEY is not configured') ||
    message.includes('ANTHROPIC_API_KEY is not configured')
  ) {
    return "a processing service isn't available right now"
  }
  if (
    message.includes('Failed to create signed download URL') ||
    message.includes('Failed to create long-lived signed URL') ||
    message.includes('Failed to download file')
  ) {
    return "the file couldn't be retrieved for processing"
  }
  return 'something went wrong while processing this file'
}

/**
 * Fetches status/derived_content/error_message for every attached media item
 * and returns a formatted context section for injection into the system
 * prompt, split into up to three parts:
 *
 *  - ATTACHED MEDIA: ready items, carrying the real derived_content.
 *  - ATTACHMENT FAILED: failed items, carrying a sanitized (never raw)
 *    failure reason via sanitizeFailureReason — a real reason, not a bare
 *    "failed" flag, but never the internal error string itself.
 *  - ATTACHMENT IN PROGRESS: everything else (pending/processing, or an item
 *    the query didn't return a row for at all — the common case for
 *    something attached in the current turn, since processing is async and
 *    almost never finishes before this same request builds its prompt),
 *    built from the client-supplied filename/type on `mediaItems` — no
 *    second DB lookup needed, since the query already tells us which ids
 *    are ready or failed.
 *
 * Short-circuits to '' when mediaItems is empty/null, when no tenant is
 * resolved, or when no member is resolved. A DB error still returns ''
 * (matching prior behavior) rather than guessing — an error there means we
 * don't reliably know status either way.
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
    .select('id, original_filename, type, derived_content, status, error_message')
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .eq('member_id', memberId)

  if (error) {
    console.error('[chat/media-context] resolveMediaContext error:', error.message)
    return ''
  }

  const rows = data ?? []

  const readyRows = rows.filter(row => row.status === 'ready' && row.derived_content)
  const readyIds = new Set(readyRows.map(row => row.id))

  const failedRows = rows.filter(row => row.status === 'failed')
  const failedIds = new Set(failedRows.map(row => row.id))

  const readySection =
    readyRows.length > 0
      ? `ATTACHED MEDIA:\n\n${readyRows
          .map(row => `[${row.original_filename} (${row.type})]\n${row.derived_content}`)
          .join('\n\n')}`
      : ''

  const failedSection =
    failedRows.length > 0
      ? `ATTACHMENT FAILED:\n\n${failedRows
          .map(
            row =>
              `[${row.original_filename} (${row.type})] ${sanitizeFailureReason(row.error_message)}`,
          )
          .join('\n\n')}`
      : ''

  const inProgressItems = mediaItems.filter(
    m => !readyIds.has(m.mediaItemId) && !failedIds.has(m.mediaItemId),
  )
  const inProgressSection =
    inProgressItems.length > 0
      ? inProgressItems
          .map(m => `ATTACHMENT IN PROGRESS: ${m.filename} (${m.type}), still processing`)
          .join('\n')
      : ''

  const context = [readySection, failedSection, inProgressSection]
    .filter(section => section.length > 0)
    .join('\n\n')

  void logEvent({
    action: AuditAction.CHAT_MEDIA_CONTEXT_RESOLVED,
    tenant_id: tenantId,
    actor_type: memberId ? 'user' : 'anonymous',
    outcome: 'success',
    metadata: {
      clientSentItems: mediaItems.length,
      readyCount: readyRows.length,
      failedCount: failedRows.length,
      inProgressCount: inProgressItems.length,
      contextLength: context.length,
    },
  })

  return context
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
