# Media Service

### Media service (`services/media/`)

Server-side pipeline for member-uploaded audio/image/document attachments.
Rows live in `media_items` (`type`, `status`, `derived_content`,
`classification`, `error_message`, `latitude`/`longitude` — see
`Database Schema.md`). The client uploads file bytes directly to Supabase
Storage via a signed URL (never through our server); a Storage webhook then
INSERTs the `media_items` row, which itself fires the processing webhook
(`app/api/webhooks/media-process/route.ts`) into `processMediaItem`.

| File | Exports | Purpose |
|------|---------|---------|
| `processor.ts` | `processMediaItem`, `waitForStorageObject`, `STORAGE_WAIT_DELAYS_MS` | The pipeline itself — see "The pipeline" below. |
| `vision-tool.ts` | `callVisionTool`, `VisionTool` | Generic forced-tool-use helper for structured model output. See "The tool-use pattern" below. |
| `index.ts` | `createMediaItem`, `findDuplicateMediaItem`, `backfillMediaChatId`, `updateMediaItem`, `getMediaItem`, `listByChat`, `listByMember`, `isMediaAuditEnabled`, `logMediaEvent`, `logAiMediaEvent`, `logSttMediaEvent` (+ types) | `media_items` CRUD and the three audit-logging wrappers `processor.ts` uses (kept separate per action family purely for log-query clarity — all three write the same envelope shape). `isMediaAuditEnabled()` reads `ENABLE_MEDIA_AUDIT_LOGGING` (default on) — see `Utilities/Audit.md` for the actions themselves. |
| `storage.ts` | `generateSignedUploadUrl`, `generateSignedDownloadUrl` (60s), `generateLongLivedSignedUrl` (1hr), `objectExists`, `buildMediaStoragePath` | Supabase Storage (`assets` bucket) signing and existence checks. `objectExists` uses `list()`, not a HEAD request, as the basis for `waitForStorageObject`'s retry loop. |
| `useMediaUpload.ts` | client hook | Drives the client-side upload flow (signed URL request → direct PUT → `media_items` row creation), content-hash dedup. |
| `display-url.ts` | `withDisplayUrl`, `MediaItemWithUrl` | Signs a display URL for image items only (null for audio/document, null on signing failure). Extracted out of `app/api/media/route.ts` because a `route.ts` file may only export HTTP method handlers — see the file's own header comment and CLAUDE.md's "Next.js App Router `route.ts` files" rule. |
| `errorCopy.ts` | `sanitizeFailureReason` | Maps a raw `media_items.error_message` to a fixed, pre-written safe phrase for member-facing display — never the raw string (no vendor names, no internal paths). Dependency-free so both server (`services/chat/server/media-context.ts`) and client upload-progress UI can use it. |
| `types.ts` | `MediaItem`, `MediaItemStatus`, `MediaItemType` | Shared row shape. |

---

## The pipeline (`processMediaItem`)

Entry point, called by the webhook route after signature verification.
Idempotency: re-fetches the row and no-ops unless `status === 'pending'`
(a defensive re-check — the route's own idempotency guard is the primary
one). Sets `status: 'processing'`, then dispatches on `item.type` inside a
try/catch that marks the item `'failed'` with `error_message` and logs
`MEDIA_PROCESS_FAILED` (with a `pipeline_step` breadcrumb — e.g.
`'claude_vision'`, `'deepgram_transcription'`, `'text_extraction'`,
`'await_storage_availability'`) on any throw from any pipeline. Every
pipeline funnels through this one catch — none of the three pipeline
functions below has its own top-level try/catch for unexpected errors.

Before dispatch, `waitForStorageObject` polls `objectExists` with bounded
backoff (`STORAGE_WAIT_DELAYS_MS`, ~5.5s worst case) to close the race
between the `media_items` INSERT (fires the webhook immediately) and the
client's PUT of the file bytes landing in Storage (a separate, later
request) — without this, processing routinely started against an object
that didn't exist yet.

**`processImage`** (image type): generates a 60s signed download URL, then:
1. **GPS extraction** (`extractGpsCoordinates`) — downloads the photo's own
   bytes off that same signed URL and reads EXIF GPS tags via `exifr.gps()`.
   Runs first, independent of and never blocking the vision call. No GPS
   data (the common case — screenshots, downloads, location services off)
   silently resolves to `{ latitude: null, longitude: null }`, no log; an
   actual failure (download failure, corrupt EXIF) also degrades to
   null/null, logged via `console.error` (length/type only, never raw EXIF
   bytes) — this step can never fail the item.
2. **Vision analysis** — `callVisionTool<VisionAnalysis>` (see below) asks
   Claude Haiku for `caption`/`classification`/`extracted_text`. A
   non-`null` result is used directly; a `null` result (the tool-use call's
   own graceful-degradation edge case) falls back to a fixed safe
   placeholder (`caption: 'A photo.'`) rather than failing the item — an
   empty `derived_content` would make `createPhotoMemoryFromMedia`
   (`services/crm/memories.ts`) treat the photo as still-processing and
   permanently unbookmarkable.
3. Writes `status: 'ready'`, `derived_content` (caption + extracted text,
   joined), `classification`, `latitude`/`longitude` to the row.

`AI_MEDIA_REQUEST_SENT` / `AI_MEDIA_REQUEST_FAILED` /
`AI_MEDIA_RESPONSE_RECEIVED` bracket the vision call specifically (a
non-ok HTTP response from `callVisionTool` throws and fails the whole
item); `MEDIA_PROCESS_COMPLETED` logs `gps_found` (presence only, never
raw coordinates) alongside the usual fields. See `Utilities/Audit.md` for
the full action list.

**`processAudio`** (audio type): a 1-hour signed URL (Deepgram batch queues
can be slow), then a Deepgram nova-3 batch transcription call. Separate
from the live in-chat voice recording at `/api/transcribe` (nova-2,
browser `MediaRecorder`) — do not conflate the two. Classification is a
filename heuristic (`interview_recording` vs `voice_memo`), not a model
call.

**`processDocument`** (document type): downloads the file, calls
`extractText` (`services/content/assets.ts` — Anthropic document API for
PDF, mammoth for DOCX, plain Buffer read for TXT; only the PDF path emits
AI audit events), then a second, separate Haiku call classifies the
extracted text in one word (still a free-text prompt, not tool-use — see
below for why this hasn't been migrated).

---

## The tool-use pattern (`vision-tool.ts`)

`processImage`'s vision call used to ask for JSON via a plain text
instruction (`"Return JSON only: {...}"`) appended to the image, then
`JSON.parse()` a text content block. This produced a real, confirmed
production bug: Claude sometimes wrapped its response in a ` ```json `
markdown fence despite the instruction, `JSON.parse()` threw on the fence
characters, and the item fell back to a degraded placeholder. A stopgap
(strip the fence before parsing) shipped first; this was the structural
fix.

`callVisionTool<T>(imageUrl, tool, apiKey, options)` sends the image plus a
**forced** `tool_choice` (`{ type: 'tool', name: tool.name }`) instead of
a text instruction. The tool's `input_schema` (JSON Schema) constrains the
model's output at the API level, not the prompt level — the model has no
free-text channel available to wrap a fence around, and a `tool_use`
block's `.input` arrives already parsed, so there is no `JSON.parse()` on
the happy path at all. `processImage` defines the one tool in use today —
`VISION_ANALYSIS_TOOL` in `processor.ts`, with `caption`/`classification`/
`extracted_text` fields matching the original prompt exactly.

Error handling is two-tiered:
- A non-ok HTTP response is a hard failure and throws — the caller (today,
  `processImage`) decides what that means (failing the whole item).
- A response that comes back `ok` but without a matching `tool_use` block
  is an API-level edge case with forced `tool_choice`, not the common
  path — `callVisionTool` does not throw for this. As defense-in-depth
  only, it looks for a `text` block and retries the old
  fence-stripped-`JSON.parse()` recovery; if that also fails, or there's no
  text block, it resolves to `null`. Callers must handle `null` explicitly
  — `processImage`'s `null` branch is exactly the old JSON-parse-failure
  fallback, reused.

**This is the intended pattern for any future "backend job needs
structured output from a model, with no ongoing conversation" case in this
codebase.** `callVisionTool` is generic over `T` and takes an arbitrary
`VisionTool` definition (`name`, `description`, `input_schema`) — a second
caller defines its own tool and schema and calls the same function; nothing
in it is media-specific beyond living in this directory today.
`processDocument`'s classification call (see above) is a candidate for this
same migration but was left as free text — out of scope for the change
that introduced this pattern.

### Not the marker system

Do not confuse this with `services/chat/ui/v1/registry.ts`'s marker system
(`[BOOKING: ...]`, `[NAME: ...]`, `[SAVE_MEMORY]`, etc. — see
`Marker Syntax.md`). Both are legitimate, structured-output mechanisms, for
different situations:

- **Markers** are for a model emitting structured signals **inline**,
  embedded in ordinary prose, **during an actual conversation turn** a
  visitor or member is having with the AI. The registry detects and strips
  them from the displayed text while the conversation continues around
  them.
- **Tool-use (`callVisionTool`)** is for a **standalone backend job** — no
  conversation is happening, and no prose response is wanted at all, ever.
  `processImage` classifying an uploaded photo is the only caller today.

Neither pattern replaces the other.
