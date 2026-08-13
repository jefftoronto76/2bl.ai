// services/chat/ui/v1/mediaMarkerPatterns.ts
//
// Canonical regex SOURCE (no flags) for the MEDIA_UPLOAD / MEDIA_UPLOAD_FAILED /
// MEDIA_UPLOAD_DUPLICATE marker syntax — the single place this syntax is
// defined. Three independent consumers each construct their own RegExp
// instance from these sources:
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
