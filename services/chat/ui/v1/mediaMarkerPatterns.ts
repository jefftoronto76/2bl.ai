// services/chat/ui/v1/mediaMarkerPatterns.ts
//
// Canonical regex SOURCE (no flags) for the MEDIA_UPLOAD / MEDIA_UPLOAD_FAILED
// marker syntax — the single place this syntax is defined. Two independent
// consumers each construct their own RegExp instance from these sources:
//   - components/shells/membership/MessageList.tsx's parseUserMessage (drives
//     upload-thumbnail/failure-chip rendering — the real consumer of this
//     syntax on the visitor message side)
//   - services/chat/ui/v1/registry.ts's MEDIA_UPLOAD_MARKER /
//     MEDIA_UPLOAD_FAILED_MARKER (strips the marker from prose for every
//     other registry consumer, chiefly createMemoryFromAnchor,
//     services/crm/memories.ts)
//
// Exporting source strings rather than a shared RegExp keeps each consumer's
// own stateful `g`-flag/.lastIndex usage fully independent — no shared
// mutable regex state to accidentally leak between the two call sites.

/** `[MEDIA_UPLOAD: filename | media_item_id | type]` */
export const MEDIA_UPLOAD_PATTERN_SOURCE =
  String.raw`\[MEDIA_UPLOAD:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]`

/** `[MEDIA_UPLOAD_FAILED: filename]` */
export const MEDIA_UPLOAD_FAILED_PATTERN_SOURCE =
  String.raw`\[MEDIA_UPLOAD_FAILED:\s*([^\]]+?)\s*\]`
