# Media Upload Dedup — Blocked on a Schema Change

**Status: investigated, not implemented.** 2026-08-05.

## Product decision (confirmed, Jeff)

Duplicate media uploads should merge/dedupe, not create independent rows
as they do today. A weaker, no-schema-change fallback (match on
`original_filename` + `file_size_bytes` + `mime_type` + `member_id`) was
investigated and **explicitly rejected**: *"a false-positive merge
(incorrectly treating two different files as duplicates) is a worse
outcome than dedup simply not existing yet."* Given that, no dedup code
ships until the schema change below lands — this is a deliberate stop, not
a deprioritization.

## Investigation summary

- Confirmed current `media_items` schema (18 columns, via `System Docs/Database
  Schema.md` and `services/media/types.ts`) has no hash/checksum/fingerprint
  column, and none has ever been specced in either version of the media
  items design doc (`Design Handovers/media-items-spec_updated August
  2026.md`, `Design Handovers/Media Management.md`). This is new ground,
  not a half-built feature.
- **Architectural constraint that shapes the whole design:** file bytes
  never pass through the Next.js server. `app/api/media/upload-url/route.ts`'s
  own header comment: "The client PUTs the file binary directly to
  Supabase — the file never passes through this server." A content hash
  therefore **cannot** be computed server-side — it must be computed
  client-side, in `services/media/useMediaUpload.ts`, where the full
  `File` object is already held in memory for the entire `upload()` call
  before the Storage PUT. The natural implementation is
  `crypto.subtle.digest('SHA-256', await file.arrayBuffer())`, computed
  before or alongside the existing `POST /api/media/upload-url` call, sent
  as a new field in that request body.
- `app/api/media/upload-url/route.ts` does no DB read at all before its
  unconditional `createMediaItem` insert today (the only existing read
  resolves the uploader's `member_id`, not a duplicate check) — a dedup
  check would be new logic inserted between that lookup and the insert.
- Matching scope: same member **and** same chat/conversation (matches the
  original investigation's "same file uploaded twice in one conversation"
  framing) — not member-wide or tenant-wide.

## Recommended schema addition (Supabase Studio, Jeff)

| Field | Recommendation |
|---|---|
| Column | `content_hash` |
| Type | `text` — a SHA-256 digest as a 64-character lowercase hex string |
| Nullability | Nullable — applies to new uploads going forward only, no retroactive backfill needed |
| Index (optional, not required for correctness) | Composite index on `(member_id, chat_id, content_hash)` — the exact shape a dedup lookup query would filter on |

## What happens once the column exists

Needs a fresh, separate planning pass at that point — not pre-designed
here — but the shape already investigated (client-side SHA-256 hash sent
in the upload-url POST body, a new DB read inserted before
`createMediaItem`, and reusing the existing retry pattern for a hash-match
found against a previously-`failed` row, per PR #275's
`deliveredTerminalIdsRef` fix) is the direction to pick back up.

## Related work

- `Backlog/media-pipeline-broader-sweep_2026-08-05.md` — the original
  investigation that first flagged "no dedup on duplicate upload" as
  Finding 3.
- PR #275 (`08-05-2026-fix-media-delivery-status-reset`) — fixes a related
  gap (retry success not resurfacing to the guide) that a future dedup
  implementation's "duplicate of a failed upload" case would depend on.
