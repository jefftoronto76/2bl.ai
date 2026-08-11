# Media Service

### Media service (`services/media/`)

Server-side pipeline for member-uploaded audio/image/document attachments.
Rows live in `media_items` (`type`, `status`, `derived_content`,
`classification`, `error_message`, `latitude`/`longitude` — see
`Database Schema.md`). `POST /api/media/upload-url` INSERTs the `media_items`
row itself (status `pending`) and returns a signed Storage upload URL; the
client then PUTs the file bytes directly to Supabase Storage (never through
our server) — a separate, later request. That INSERT is what a Supabase
Database Webhook fires on, into `app/api/webhooks/media-process/route.ts` →
`processMediaItem` — which is why the job can start racing the Storage PUT
(see `waitForStorageObject` below) rather than being triggered by Storage
confirming the object exists.

| File | Exports | Purpose |
|------|---------|---------|
| `processor.ts` | `processMediaItem`, `waitForStorageObject`, `STORAGE_WAIT_DELAYS_MS` | The pipeline itself — see "The pipeline" below. |
| `vision-tool.ts` | `callVisionTool`, `callTextTool`, `AnthropicTool` | Generic forced-tool-use helpers for structured model output — image input and text input respectively, sharing one internal fetch/parse/fallback core. See "The tool-use pattern" below. |
| `index.ts` | `createMediaItem`, `findDuplicateMediaItem`, `backfillMediaChatId`, `updateMediaItem`, `getMediaItem`, `listByChat`, `listByMember`, `isMediaAuditEnabled`, `logMediaEvent`, `logAiMediaEvent`, `logSttMediaEvent` (+ types) | `media_items` CRUD and the three audit-logging wrappers `processor.ts` uses (kept separate per action family purely for log-query clarity — all three write the same envelope shape). `isMediaAuditEnabled()` reads `ENABLE_MEDIA_AUDIT_LOGGING` (default on) — see `Utilities/Audit.md` for the actions themselves. |
| `storage.ts` | `generateSignedUploadUrl`, `generateSignedDownloadUrl` (60s), `generateLongLivedSignedUrl` (1hr), `objectExists`, `buildMediaStoragePath` | Supabase Storage (`assets` bucket) signing and existence checks. `objectExists` uses `list()`, not a HEAD request, as the basis for `waitForStorageObject`'s retry loop. |
| `useMediaUpload.ts` | client hook | Drives the client-side upload flow (signed URL request → direct PUT → `media_items` row creation), content-hash dedup. |
| `useFreshImageUrl.ts` | `useFreshImageUrl` | Client hook re-resolving a media item's signed display URL at render time via `GET /api/media/[id]/url`, since `sessionImages`' url (`display-url.ts`) carries `storage.ts`'s 60s-expiry signed URL and is never refreshed after session load. Shows the possibly-stale fallback url immediately while the fresh fetch is in flight, then swaps to the resolved value — no loading flicker for the common case. Wired into the memory panel's four photo-display spots (`BlockCanvas.tsx`'s `ImageBlockRow`, `MemoryCard.tsx`'s draft-state image and `MemorySavedReceipt`'s thumbnail). **Chat-transcript images (`UploadThumbnail.tsx`, the actual render spot — not `MessageList.tsx`/`ChatThread` directly) wired in 2026-08-09 too**, closing the gap this row used to flag: gated so the hook only gets a `mediaItemId` when `item.localPreviewUrl` (an instant, non-expiring local blob set at attach time in `ChatInput.tsx`) isn't already serving the image, so a live local blob never triggers a wasted re-fetch — see `System Docs/Public Site.md`'s `UploadThumbnail` row and `Known Gaps.md`'s now-resolved entry. |
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

**Execution lifecycle — why both trigger routes wrap the call in `after()`.**
`app/api/webhooks/media-process/route.ts` and `app/api/media/[id]/retry/route.ts`
both invoke `processMediaItem` fire-and-forget (they respond before the job
finishes, since Supabase's webhook delivery and the retry-click UI both need
an immediate response, not a 15-minute-long request). Root cause of media
items getting stuck at `status: 'processing'` forever — no `error_message`,
no terminal audit event, one for 5+ days — was that a bare
`void processMediaItem(record).catch(...)` gives Vercel no signal to keep the
invocation alive past the response: the platform is free to freeze/reap the
function the instant the response flushes, silently abandoning whatever
point the still-pending promise had reached. `maxDuration` does not prevent
this — it only bounds how long a function is *allowed* to run once it's
actually running; it does nothing to extend an already-fire-and-forgotten
invocation's life. The evidence for this over a genuine hang: no timeout
error was ever caught (a real 900s `maxDuration` kill, or a hung dependency,
would both eventually throw into the outer `catch` and log
`MEDIA_PROCESS_FAILED`) — total silence forever is the signature of the
promise never being resumed at all, not of it running long.

Fix: both routes now wrap the call in `after()` (`next/server`, stable since
Next 15 — no new dependency), which registers the promise with Vercel's
lifecycle manager so the invocation stays alive until it settles; the
existing `maxDuration = 900` then bounds how long that's allowed to take.
The retry route previously had no `maxDuration` at all (silently inheriting
the project/plan default, likely far too short for a slow job) — it now
explicitly sets `maxDuration = 900` to match the webhook route, since it
drives the identical pipeline. `vercel.json`'s `functions` block mirrors both
route-level exports, matching the pre-existing (redundant but harmless)
pattern the webhook route already used.

Testing note: `after()` throws when called outside a real Next.js
request-scoped context, which a route handler invoked directly in Vitest
doesn't have — both route test files stub it via
`vi.mock('next/server', () => ({ after: (fn) => fn() }))`.

This closes the execution-lifecycle cause of a job stalling on new uploads.
It is not, by itself, a full guarantee against a row ever getting stuck
`processing` again — e.g. an upstream fetch (Deepgram/Anthropic) with no
timeout could still hold a *kept-alive* invocation open indefinitely. A
separate defense-in-depth recovery mechanism (a bounded sweep that flips an
old `processing` row to `failed` regardless of cause) is planned as a
follow-up and not yet implemented as of this section.

Mid-pipeline visibility: `logPipelineStepStarted` logs
`MEDIA_PIPELINE_STEP_STARTED` (metadata `pipeline_step`, same key/values the
failure event above uses) at entry to `await_storage_availability` and again
at entry to whichever type-specific step runs next — added because a job
that stalls (network stall, an infinite hang inside a dependency, the
function getting killed before its catch runs) previously left nothing
between `MEDIA_PROCESS_STARTED` and either terminal event, so there was no
way to tell which step it died in without querying `media_items` directly.
Completion needs no separate breadcrumb — each of the three pipeline
functions below already ends by logging `MEDIA_PROCESS_COMPLETED` itself.
Query a specific item's full step timeline with:
```sql
select action, metadata->>'pipeline_step' as step, created_at
from audit_events
where target_id = '<media_item_id>'
order by created_at;
```

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
   own graceful-degradation edge case) throws
   (`'Vision tool call returned no usable output'`) and fails the whole
   item — a photo's caption is core content the member sees directly, so
   this is a real failure, not something to paper over with a placeholder.
   A failed item isn't stuck: `POST /api/media/[id]/retry`
   (`app/api/media/[id]/retry/route.ts`) resets it to `'pending'` and
   re-runs this whole pipeline from scratch. (An earlier version of this
   pipeline soft-degraded this case behind a placeholder caption instead,
   reasoning that a failed item was permanently stuck — that premise was
   wrong given the retry route already existed; see `Known Gaps.md`.) The
   route is a general reprocess capability, not failure-only recovery: it
   accepts any **settled** item — `'ready'` or `'failed'` — and rejects
   `'pending'`/`'processing'` (already in-flight, so a second
   `processMediaItem` run would race the one already running). This matters
   because a `'ready'` item can still carry wrong `derived_content` from a
   since-fixed pipeline bug (the pipeline marked it successful at the time,
   the content just wasn't correct) — reprocessing is how that gets
   corrected without re-uploading the file. The gallery UI
   (`MediaGallery.tsx`) surfaces this as two differently-labeled actions on
   the same button — "Try again" on a failed item, "Reprocess" on a ready
   one — since they read as different user intents even though they hit the
   same endpoint.
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
extracted text in one word via `callTextTool` (see below) — a best-effort
pass: a missing `tool_use` block or a thrown error both fall back to the
`'document'` default rather than failing the item, same as before this
call was migrated to tool-use.

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

Both `callVisionTool<T>(imageUrl, tool, apiKey, options)` and
`callTextTool<T>(text, tool, apiKey, options)` send a **forced**
`tool_choice` (`{ type: 'tool', name: tool.name }`) instead of a text
instruction — they're thin wrappers (image input vs. text input
respectively) around one shared internal function that does the actual
fetch, `tool_use`-block extraction, and fallback logic. The tool's
`input_schema` (JSON Schema) constrains the model's output at the API
level, not the prompt level — the model has no free-text channel available
to wrap a fence around (or pad with extra prose, for a plain-word
response like a classification), and a `tool_use` block's `.input` arrives
already parsed, so there is no `JSON.parse()` on the happy path at all.
Two tools exist today: `VISION_ANALYSIS_TOOL` in `processor.ts`
(`caption`/`classification`/`extracted_text`, used via `callVisionTool` by
`processImage`) and `DOCUMENT_CLASSIFICATION_TOOL` (single
`classification` field, used via `callTextTool` by `processDocument`'s
classification pass) — both match their respective original prompts'
guidance exactly.

Error handling is two-tiered, for both wrappers:
- A non-ok HTTP response is a hard failure and throws — the caller decides
  what that means. `processImage` lets it fail the whole item;
  `processDocument`'s classification pass catches it and falls back to the
  `'document'` default instead, since that call has always been
  best-effort.
- A response that comes back `ok` but without a matching `tool_use` block
  is an API-level edge case with forced `tool_choice`, not the common
  path — neither wrapper itself throws for this; the shared core resolves
  to `null` after also trying the fence-stripped-`JSON.parse()` fallback
  described above. Callers must handle `null` explicitly, and the two
  callers today handle it differently, deliberately: `processImage`
  **throws** on `null` (a photo's caption is core member-facing content —
  a real failure with a working retry path beats a silently-wrong
  placeholder); `processDocument`'s classification pass treats `null` as
  an ordinary "response ok but no usable word" outcome and keeps its
  `'document'` default (a one-word label is a reasonable thing to
  soft-degrade, unlike a photo's caption).

**This is the intended pattern for any future "backend job needs
structured output from a model, with no ongoing conversation" case in this
codebase.** Both wrappers are generic over `T` and take an arbitrary
`AnthropicTool` definition (`name`, `description`, `input_schema`) — a
third caller defines its own tool and schema and calls whichever wrapper
matches its input shape (or, if neither image nor plain text fits, extends
the shared internal function with a new thin wrapper the same way
`callTextTool` was added); nothing here is media-specific beyond living in
this directory today. `processDocument`'s classification call was the
first non-image caller and the reason the shared core was extracted from
`callVisionTool` in the first place — extracted on this second real
caller, not preemptively.

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
- **Tool-use (`callVisionTool`/`callTextTool`)** is for a **standalone
  backend job** — no conversation is happening, and no prose response is
  wanted at all, ever. `processImage` classifying an uploaded photo and
  `processDocument` classifying extracted document text are the two
  callers today.

Neither pattern replaces the other.
