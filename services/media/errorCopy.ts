// services/media/errorCopy.ts
//
// sanitizeFailureReason — dependency-free (no getAdminClient, no server-only
// imports) so it can be shared by both the server-side LLM-prompt path
// (services/chat/server/media-context.ts, which re-exports it for backward
// compatibility) and client components that need to display a media item's
// failure reason directly (the upload progress cards).

/**
 * Maps a raw, internal error_message to a fixed, pre-written safe phrase —
 * never the raw string itself. This is a category classifier, not string
 * scrubbing: regex-stripping "known bad patterns" (storage paths, vendor
 * names) out of an open-ended string is inherently incomplete, since any
 * error shape not anticipated here would leak straight through. Mapping to
 * a bounded set of known-safe phrases guarantees no vendor name or internal
 * path ever reaches the prompt — or the member — regardless of what the
 * underlying error actually says. The client never receives the raw
 * media_items.error_message (GET /api/media passes it through untouched),
 * so any UI displaying it directly must go through this function first.
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
  if (message.includes('Anthropic file upload error')) {
    return "the file couldn't be uploaded for processing"
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
