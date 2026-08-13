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
  // Written by the stale-processing sweep (services/media/index.ts's
  // sweepStaleProcessingItems) and the retry route's matching backstop —
  // literal string, not an import, to keep this module dependency-free (see
  // header comment) — services/media/index.ts pulls in getAdminClient.
  if (message.includes('Processing stalled and timed out')) {
    return 'processing took too long and timed out'
  }
  // Written by the pending-row sweep's abandoned bucket (sweepStalePendingItems)
  // — a row whose trigger call never fired AND whose file never reached
  // Storage either (a genuinely abandoned upload, not just a lost signal).
  if (message.includes('Upload was never completed')) {
    return "the upload didn't finish"
  }
  // Written by verifyAndReprocess (services/media/processor.ts) when a
  // reprocess attempt (retry click, or the stale-processing backstop) finds
  // no file in Storage at all — see isNeedsReupload below, the signal UI
  // components use to swap a doomed retry action for a re-attach prompt.
  if (message.includes('This file needs to be uploaded again')) {
    return 'this file needs to be uploaded again'
  }
  if (message.includes('Deepgram API error')) {
    return "the audio transcription service couldn't process this file"
  }
  if (
    message.includes('Anthropic vision error') ||
    message.includes('Vision tool call returned no usable output')
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

/**
 * True when error_message marks a row whose reprocess attempt found no file
 * in Storage at all — a confirmed-missing file, not a pipeline failure.
 * Retrying again against it is guaranteed to fail identically every time
 * (verifyAndReprocess, services/media/processor.ts, won't even attempt
 * processMediaItem for this case), so UploadThumbnail.tsx and
 * MediaGallery.tsx both check this to swap their retry action for a
 * "please re-attach" prompt instead of offering a doomed retry click.
 * Literal string, not an import of NEEDS_REUPLOAD_ERROR_MESSAGE — same
 * dependency-free rationale as the rest of this module (see header comment).
 */
export function isNeedsReupload(errorMessage: string | null): boolean {
  return (errorMessage ?? '').includes('This file needs to be uploaded again')
}
