import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { sanitizeFailureReason } from '@/services/media/errorCopy'
import {
  MEDIA_UPLOAD_PATTERN_SOURCE,
  MEDIA_UPLOAD_FAILED_PATTERN_SOURCE,
  MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE,
} from '@/services/chat/ui/v1/mediaMarkerPatterns'
import type { ChatMessage } from './types'
import type { MediaAttachmentInput } from './types'

// Re-exported so existing importers (and this file's own test) keep working
// unchanged — the implementation moved to services/media/errorCopy.ts so a
// client component (the upload progress cards) can use the same
// classification without pulling in this module's getAdminClient import.
export { sanitizeFailureReason }

// Built off the same canonical sources registry.ts and MessageList.tsx use
// (mediaMarkerPatterns.ts) — this used to be a fourth, hand-rolled copy that
// only matched MEDIA_UPLOAD, which meant a MEDIA_UPLOAD_FAILED marker (also
// written into real message content by ChatInput.tsx, on any client-side
// pre-upload failure) was never stripped here and leaked as raw bracket
// text straight into the model's own context — a real, confirmed gap, not
// hypothetical (see media-context.test.ts's coverage). Building off the
// shared sources means a fourth marker can never silently repeat this.
// Group 1 in each is the filename, used below to build a fallback when
// stripping empties a message out entirely.
const MEDIA_UPLOAD_PATTERN = new RegExp(MEDIA_UPLOAD_PATTERN_SOURCE, 'g')
const MEDIA_UPLOAD_FAILED_PATTERN = new RegExp(MEDIA_UPLOAD_FAILED_PATTERN_SOURCE, 'g')
const MEDIA_UPLOAD_DUPLICATE_PATTERN = new RegExp(MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE, 'g')
const ALL_MEDIA_MARKER_PATTERNS = [
  MEDIA_UPLOAD_PATTERN,
  MEDIA_UPLOAD_FAILED_PATTERN,
  MEDIA_UPLOAD_DUPLICATE_PATTERN,
]

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
 * Returns a new messages array with all [MEDIA_UPLOAD: …] / [MEDIA_UPLOAD_FAILED: …] /
 * [MEDIA_UPLOAD_DUPLICATE: …] marker strings removed from user message
 * content — every marker ChatInput.tsx can write into real message content,
 * not just the original one. Applied to all messages, not just the last.
 * Returns the original array unchanged when no markers of any of the three
 * types are present.
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

    const hasAnyMarker = ALL_MEDIA_MARKER_PATTERNS.some(pattern => {
      pattern.lastIndex = 0
      return pattern.test(m.content)
    })
    if (!hasAnyMarker) return m

    const filenames = ALL_MEDIA_MARKER_PATTERNS.flatMap(pattern => {
      pattern.lastIndex = 0
      return Array.from(m.content.matchAll(pattern), match => match[1])
    })

    let stripped = m.content
    for (const pattern of ALL_MEDIA_MARKER_PATTERNS) {
      pattern.lastIndex = 0
      stripped = stripped.replace(pattern, '')
    }
    stripped = stripped.trim()
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
