// services/chat/ui/v1/mediaMarkerPatterns.ts
//
// Canonical regex SOURCE (no flags) for the MEDIA_UPLOAD / MEDIA_UPLOAD_FAILED /
// MEDIA_UPLOAD_DUPLICATE marker syntax — the single place this syntax is
// defined. Independent consumers each construct their own RegExp instance
// from these sources:
//   - components/shells/membership/MessageList.tsx's parseUserMessage (drives
//     upload-thumbnail/failure-chip/duplicate-label rendering — the real
//     consumer of this syntax on the visitor message side)
//   - services/chat/ui/v1/registry.ts's MEDIA_UPLOAD_MARKER /
//     MEDIA_UPLOAD_FAILED_MARKER / MEDIA_UPLOAD_DUPLICATE_MARKER (strips the
//     marker from prose for every other registry consumer, chiefly
//     createMemoryFromAnchor, services/crm/memories.ts)
//   - services/chat/server/media-context.ts's stripMediaMarkers (strips it
//     from what actually reaches the model — MEDIA_UPLOAD_FAILED was
//     missing from this specific consumer until 2026-08-12, meaning it leaked
//     into AI/guide context raw; verified via test that MEDIA_UPLOAD_DUPLICATE
//     never repeats that gap — see media-context.test.ts)
//   - titleSourceFromContent (below), used by both title-deriving call sites
//     that read a session's first user message directly — chatStore.tsx's
//     deriveSessionTitle (DB-backed sessions) and persistence.ts's
//     deriveTitle (the shared local IndexedDB thread index, both chat
//     surfaces) — neither stripped this syntax before 2026-08-14, so a
//     media-only first turn (no typed caption) rendered its title as the
//     raw `[MEDIA_UPLOAD: filename | id | type]` bracket text verbatim.
//
// Exporting source strings rather than a shared RegExp keeps each consumer's
// own stateful `g`-flag/.lastIndex usage fully independent — no shared
// mutable regex state to accidentally leak between call sites.

/** `[MEDIA_UPLOAD: filename | media_item_id | type]` */
export const MEDIA_UPLOAD_PATTERN_SOURCE =
  String.raw`\[MEDIA_UPLOAD:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]`

/** `[MEDIA_UPLOAD_FAILED: filename]` */
export const MEDIA_UPLOAD_FAILED_PATTERN_SOURCE =
  String.raw`\[MEDIA_UPLOAD_FAILED:\s*([^\]]+?)\s*\]`

/**
 * `[MEDIA_UPLOAD_DUPLICATE: filename | media_item_id | type | status]` —
 * written by ChatInput.tsx instead of MEDIA_UPLOAD when a content-hash match
 * reused an existing row rather than a fresh upload happening (see
 * app/api/media/upload-url/route.ts's dedup branch and useMediaUpload.ts's
 * UploadResult.duplicate). `status` is the matched row's status AT THE TIME
 * OF THE MATCH — MessageList.tsx's renderer prefers the live status off
 * mediaItems (chatStore) when available, falling back to this captured
 * value only before that catches up (e.g. first paint, before the catch-up
 * fetch resolves).
 */
export const MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE =
  String.raw`\[MEDIA_UPLOAD_DUPLICATE:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]`

const ALL_MARKER_PATTERN_SOURCES = [
  MEDIA_UPLOAD_PATTERN_SOURCE,
  MEDIA_UPLOAD_FAILED_PATTERN_SOURCE,
  MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE,
]

const TYPE_FALLBACK_LABEL: Record<string, string> = {
  image: 'Photo shared',
  audio: 'Audio shared',
  document: 'Document shared',
}

/** First captured `type` field off a MEDIA_UPLOAD/MEDIA_UPLOAD_DUPLICATE marker in `content`, if any — MEDIA_UPLOAD_FAILED carries no type. */
function firstMarkerType(content: string): string | null {
  const upload = new RegExp(MEDIA_UPLOAD_PATTERN_SOURCE).exec(content)
  if (upload) return upload[3].trim()
  const duplicate = new RegExp(MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE).exec(content)
  if (duplicate) return duplicate[3].trim()
  return null
}

/**
 * Strips all known media marker syntax out of a raw first-message string and
 * returns text safe to derive a title from — the member's own typed caption
 * when one is present, or a short type-aware fallback (`'Photo shared'`,
 * etc.) when the message was attachment-only. Genuinely marker-free content
 * (plain text, or empty) passes through unchanged — the fallback only kicks
 * in when a marker was actually found and stripped to nothing. Callers still
 * own their own length truncation (limits differ slightly by call site) —
 * this only guarantees the input to that truncation never contains raw
 * bracket syntax.
 */
export function titleSourceFromContent(content: string): string {
  const hadMarker = ALL_MARKER_PATTERN_SOURCES.some(source => new RegExp(source).test(content))
  let stripped = content
  for (const source of ALL_MARKER_PATTERN_SOURCES) {
    stripped = stripped.replace(new RegExp(source, 'g'), '')
  }
  stripped = stripped.replace(/\s+/g, ' ').trim()
  if (stripped.length > 0 || !hadMarker) return stripped
  const type = firstMarkerType(content)
  return (type && TYPE_FALLBACK_LABEL[type]) || 'Attachment shared'
}
