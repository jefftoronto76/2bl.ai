# Media Service

### Media service (`services/media/`)

Server-side pipeline for member-uploaded audio/image/document attachments.
Rows live in `media_items` (`type`, `status`, `derived_content`,
`classification`, `error_message`, `latitude`/`longitude` — see
`Database Schema.md`). `POST /api/media/upload-url` INSERTs the `media_items`
row itself (status `pending`) and returns a signed Storage upload URL; the
client then PUTs the file bytes directly to Supabase Storage (never through
our server) — a separate, later request. Once that PUT resolves
successfully, the client calls `POST /api/media/[id]/start-processing`,
which is what actually triggers `processMediaItem` today. A Supabase
Database Webhook also still fires on the INSERT itself
(`app/api/webhooks/media-process/route.ts`), but that route is now an
intentional no-op — see "Trigger ordering" below for why triggering from the
INSERT was the root cause of a real production bug, and why the webhook
route couldn't simply be deleted once that trigger moved.

| File | Exports | Purpose |
|------|---------|---------|
| `processor.ts` | `processMediaItem`, `waitForStorageObject`, `STORAGE_WAIT_DELAYS_MS`, `verifyAndReprocess`, `ReprocessOutcome` | The pipeline itself — see "The pipeline" below. `verifyAndReprocess` is the sole remaining place an existing row gets reprocessed — see "Duplicate uploads". |
| `vision-tool.ts` | `callVisionTool`, `callTextTool`, `AnthropicTool` | Generic forced-tool-use helpers for structured model output — image input and text input respectively, sharing one internal fetch/parse/fallback core. See "The tool-use pattern" below. |
| `index.ts` | `createMediaItem`, `findDuplicateMediaItem`, `backfillMediaChatId`, `updateMediaItem`, `getMediaItem`, `listByChat`, `listByMember`, `isMediaAuditEnabled`, `logMediaEvent`, `logAiMediaEvent`, `logSttMediaEvent`, `sweepStaleProcessingItems`, `MAX_PROCESSING_AGE_SECONDS`, `STALE_PROCESSING_ERROR_MESSAGE`, `sweepStalePendingItems`, `MAX_PENDING_AGE_SECONDS`, `STALE_PENDING_ERROR_MESSAGE`, `NEEDS_REUPLOAD_ERROR_MESSAGE` (+ types) | `media_items` CRUD, the three audit-logging wrappers `processor.ts` uses (kept separate per action family purely for log-query clarity — all three write the same envelope shape), and the two stale-row sweep functions the cron route (`app/api/cron/media-sweep`) and the retry route's backstop use. `isMediaAuditEnabled()` reads `ENABLE_MEDIA_AUDIT_LOGGING` (default on) — see `Utilities/Audit.md` for the actions themselves. |
| `storage.ts` | `generateSignedUploadUrl`, `generateSignedDownloadUrl` (60s), `generateLongLivedSignedUrl` (1hr), `objectExists`, `buildMediaStoragePath` | Supabase Storage (`assets` bucket) signing and existence checks. `objectExists` uses `list()`, not a HEAD request — the basis for `waitForStorageObject`'s retry loop, `sweepStalePendingItems`'s recovered-vs-abandoned check (`index.ts`), `verifyAndReprocess`'s reprocess-vs-needs_reupload check, and `upload-url/route.ts`'s dedup-vs-fresh-upload-fallback check. |
| `useMediaUpload.ts` | client hook | Drives the client-side upload flow (signed URL request → direct PUT → `media_items` row creation), content-hash dedup. `UploadResult.duplicate` carries through whether the server reused an existing row — see "Duplicate uploads". |
| `useFreshImageUrl.ts` | `useFreshImageUrl` | Client hook re-resolving a media item's signed display URL at render time via `GET /api/media/[id]/url`, since `sessionImages`' url (`display-url.ts`) carries `storage.ts`'s 60s-expiry signed URL and is never refreshed after session load. Shows the possibly-stale fallback url immediately while the fresh fetch is in flight, then swaps to the resolved value — no loading flicker for the common case. Wired into the memory panel's four photo-display spots (`BlockCanvas.tsx`'s `ImageBlockRow`, `MemoryCard.tsx`'s draft-state image and `MemorySavedReceipt`'s thumbnail). **Chat-transcript images (`UploadThumbnail.tsx`, the actual render spot — not `MessageList.tsx`/`ChatThread` directly) wired in 2026-08-09 too**, closing the gap this row used to flag: gated so the hook only gets a `mediaItemId` when `item.localPreviewUrl` (an instant, non-expiring local blob set at attach time in `ChatInput.tsx`) isn't already serving the image, so a live local blob never triggers a wasted re-fetch — see `System Docs/Public Site.md`'s `UploadThumbnail` row and `Known Gaps.md`'s now-resolved entry. |
| `display-url.ts` | `withDisplayUrl`, `MediaItemWithUrl` | Signs a display URL for image items only (null for audio/document, null on signing failure). Extracted out of `app/api/media/route.ts` because a `route.ts` file may only export HTTP method handlers — see the file's own header comment and CLAUDE.md's "Next.js App Router `route.ts` files" rule. |
| `errorCopy.ts` | `sanitizeFailureReason`, `isNeedsReupload` | `sanitizeFailureReason` maps a raw `media_items.error_message` to a fixed, pre-written safe phrase for member-facing display — never the raw string (no vendor names, no internal paths). `isNeedsReupload` checks for the specific `NEEDS_REUPLOAD_ERROR_MESSAGE` case so `UploadThumbnail.tsx`/`MediaGallery.tsx` can swap their retry action for a re-attach prompt. Dependency-free so both server (`services/chat/server/media-context.ts`) and client upload-progress UI can use it — literal string matches, not imports of the actual constants (`index.ts` pulls in `getAdminClient`). |
| `types.ts` | `MediaItem`, `MediaItemStatus`, `MediaItemType` | Shared row shape. |

---

## The pipeline (`processMediaItem`)

Entry point. Called from three places today: `POST /api/media/[id]/start-processing`
(the primary trigger — see "Trigger ordering" below), `POST /api/media/[id]/retry`
(via `verifyAndReprocess` — reprocessing a settled or stale-processing item,
or the manual duplicate-match backstop, see "Duplicate uploads" below), and
the stale-pending sweep's `recovered` bucket (`app/api/cron/media-sweep`,
via `sweepStalePendingItems`). `POST /api/media/upload-url`'s dedup branch
does **not** call it — it used to, but never auto-reprocesses anything as of
the duplicate-uploads fix (see "Duplicate uploads" below). The Supabase
Database Webhook (`app/api/webhooks/media-process/route.ts`) does **not**
call it either — intentionally, see "Trigger ordering". Idempotency:
re-fetches the row and
no-ops unless `status === 'pending'` (a defensive re-check — each caller has
its own idempotency guard too, this is the shared last line of defense).
Sets `status: 'processing'`, then dispatches on `item.type` inside a
try/catch that marks the item `'failed'` with `error_message` and logs
`MEDIA_PROCESS_FAILED` (with a `pipeline_step` breadcrumb — e.g.
`'claude_vision'`, `'deepgram_transcription'`, `'text_extraction'`,
`'await_storage_availability'`) on any throw from any pipeline. Every
pipeline funnels through this one catch — none of the three pipeline
functions below has its own top-level try/catch for unexpected errors.

**Trigger ordering — why the webhook is a no-op and `start-processing` exists.**
Processing used to be triggered by the Supabase Database Webhook firing on
the `media_items` INSERT — but that INSERT happens inside
`POST /api/media/upload-url`, before the signed upload URL is even returned
to the client, let alone before the client's PUT of the file bytes (a
separate, later request) lands in Storage. `waitForStorageObject` (below)
existed to close that race with a bounded wait, but PUT duration is
unbounded and network-dependent while the wait budget is fixed — reproduced
on demand: same device, same file, same account, reliable success on wifi,
reliable failure on cellular with `"Storage object not available after 5
attempts"`. Widening the wait budget doesn't fix this class of bug; only
triggering after the PUT is confirmed does.

Fix: `POST /api/media/[id]/start-processing/route.ts` is now the only
trigger for a fresh upload. The client (`useMediaUpload.ts`) calls it
immediately after its own `PUT` to Storage resolves with an ok response —
so by the time `processMediaItem` runs, the file is already there. It's
member-authenticated (ownership-checked against the row, same pattern as
`retry/route.ts` — this is called from the member's own browser, not
server-to-server) and also absorbs what a separate `media.upload_completed`
audit event used to log on its own via `POST /api/events/media`; that event
was deliberately *not* left on the generic events route, since that route
short-circuits entirely when `ENABLE_MEDIA_AUDIT_LOGGING` is off — keeping
the trigger there would have meant a logging toggle could silently disable
the whole media pipeline.

The webhook route can't simply be deleted, or have its Supabase trigger
config changed from here — Database Webhook configuration lives in Supabase
Studio, outside this codebase, and Supabase will keep POSTing to whatever
URL is configured regardless of what this route does with the request. So
it stays wired but inert: verify the signature, log receipt for
observability, respond `200` so Supabase doesn't retry-storm it, and stop —
see the route file's own header comment.

**The gap this opens, and its close: the stale-pending sweep.** Moving the
trigger to a client-initiated call after the PUT introduces a narrower
failure mode of its own — a client that closes/crashes between the PUT
resolving and that follow-up call firing leaves the row at `status='pending'`
forever, with no error and (unlike a stuck `'processing'` row) no path to
the stale-processing sweep either, since that only ever looks at
`'processing'` rows. `sweepStalePendingItems()` (`services/media/index.ts`),
run by the same cron as the stale-processing sweep, closes this: it selects
every `'pending'` row older than `MAX_PENDING_AGE_SECONDS` (120s — flat, not
per-type, since this isn't about how long a pipeline step legitimately
takes, it's about how long the gap between the PUT resolving and a small,
file-free POST request should ever plausibly be) and calls `objectExists`
(the same check `waitForStorageObject` uses) on each to tell two real cases
apart:
- **File present in Storage** → only the trigger call was lost, not the
  upload. Not touched in the DB — `app/api/cron/media-sweep/route.ts`
  retriggers `processMediaItem` for it directly (`after()`-wrapped, same as
  every other trigger site).
- **File not present** → a genuinely abandoned upload (tab closed mid-PUT).
  Flipped straight to `status='failed'` with
  `error_message: 'Upload was never completed'` (`STALE_PENDING_ERROR_MESSAGE`),
  logged the same way the stale-processing sweep logs its own flips
  (`MEDIA_PROCESS_FAILED`, `pipeline_step: 'stale_pending_sweep'`).

**Execution lifecycle — why every trigger site wraps the call in `after()`.**
All four call sites above invoke `processMediaItem` fire-and-forget (they
respond before the job finishes, since a webhook delivery, a retry click, an
upload request, and a cron tick all need an immediate response, not a
15-minute-long request). Root cause of media items getting stuck at
`status: 'processing'` forever — no `error_message`, no terminal audit
event, one for 5+ days — was that a bare `void processMediaItem(record).catch(...)`
gives Vercel no signal to keep the invocation alive past the response: the
platform is free to freeze/reap the function the instant the response
flushes, silently abandoning whatever point the still-pending promise had
reached. `maxDuration` does not prevent this — it only bounds how long a
function is *allowed* to run once it's actually running; it does nothing to
extend an already-fire-and-forgotten invocation's life. The evidence for
this over a genuine hang: no timeout error was ever caught (a real 900s
`maxDuration` kill, or a hung dependency, would both eventually throw into
the outer `catch` and log `MEDIA_PROCESS_FAILED`) — total silence forever is
the signature of the promise never being resumed at all, not of it running
long.

Fix: every trigger site wraps the call in `after()` (`next/server`, stable
since Next 15 — no new dependency), which registers the promise with
Vercel's lifecycle manager so the invocation stays alive until it settles;
an explicit `maxDuration = 900` on that same route then bounds how long
that's allowed to take (`vercel.json`'s `functions` block mirrors each
route-level export, matching a pre-existing redundant-but-harmless pattern).
This was first fixed on the webhook and retry routes; `upload-url/route.ts`'s
dedup-reprocess branch was found to have the identical gap later (missed in
the first pass since it wasn't one of the "obvious" trigger routes) and
fixed the same way at the time — that branch has since been removed
entirely (not just `after()`-wrapped) by the duplicate-uploads fix, see
"Duplicate uploads" below, so this route no longer needs `after()` at all.
`start-processing`/the cron route's pending-recovery retrigger were both
built with `after()` from the start. `verifyAndReprocess`
(`services/media/processor.ts`) is the current sole owner of triggering a
reprocess against an existing row — see "Duplicate uploads".

Testing note: `after()` throws when called outside a real Next.js
request-scoped context, which a route handler invoked directly in Vitest
doesn't have — every affected route's test file stubs it via
`vi.mock('next/server', () => ({ after: (fn) => fn() }))`.

This closes the execution-lifecycle cause of a job stalling. It is not, by
itself, a full guarantee against a row ever getting stuck `processing`
again — e.g. an upstream fetch (Deepgram/Anthropic) with no timeout could
still hold a *kept-alive* invocation open indefinitely. The stale-processing
sweep below is the defense-in-depth recovery mechanism for that —
independent of root cause, not a fix for this one.

**Recovery: the stale-processing sweep.** `app/api/cron/media-sweep/route.ts`
is a Vercel Cron target (`vercel.json`'s `crons`, every 5 minutes) that calls
`sweepStaleProcessingItems()` (`services/media/index.ts`): selects every
`status='processing'` row, and for any row older than its type's
`MAX_PROCESSING_AGE_SECONDS` flips it to `status='failed'` with
`error_message: 'Processing stalled and timed out'` — a per-row guarded
update (`.eq('status', 'processing')` at update time) so a job that
legitimately completes in the gap between the select and the update is left
alone rather than clobbered. The route logs one `MEDIA_PROCESS_FAILED` audit
event per swept row (`pipeline_step: 'stale_processing_sweep'`,
`stalled_since` carrying the original `created_at`) so the audit trail
records *why* a row resolved, not just that it changed. `errorCopy.ts` maps
the fixed error string to member-facing copy the same way it does every
other `error_message`.

Thresholds (`MAX_PROCESSING_AGE_SECONDS`):

| Type | Threshold | Basis |
|---|---|---|
| `image` | 300s | Data-backed — ~30x the observed 10.2s max over a 14-day `audit_events` sample of `media.process_started`→`media.process_completed` pairs. Wide headroom deliberately: the sample is thin, and a stuck row costing a few extra minutes before recovery is a non-issue against the actual failure mode (days of silence). |
| `document` | 600s | **Provisional — no samples exist** (see "Known Unknowns" below). Reasoned from architecture, not data: single-AI-call shape similar to `image` (one Sonnet document-API call + one Haiku classification call, no external queue), doubled vs. `image` only for Sonnet processing a full multi-page PDF vs. Haiku on one photo. |
| `audio` | 5400s (90 min) | **Provisional — no samples exist.** Anchored to `processAudio`'s own 1-hour-signed-URL design assumption for slow Deepgram queues (see that function's comment) — modest headroom above a figure the code's own author already judged plausible, rather than an unrelated number. |

Auth: same shared-secret pattern as the webhook route's `verifySignature`,
against a `CRON_SECRET` env var compared with `timingSafeEqual` — Vercel
Cron sends it automatically as `Authorization: Bearer <CRON_SECRET>` once
that variable is set on the project. **Needs `CRON_SECRET` added in Vercel's
project env vars before this runs for real** (Jeff, Vercel dashboard — same
division of labor as `SUPABASE_WEBHOOK_SECRET`).

Manual backstop: `POST /api/media/[id]/retry` also accepts a `'processing'`
item whose age is past its type's threshold (previously it rejected
`'processing'` outright, always) — lets a member or admin unstick a stalled
job without waiting for the next cron tick. Logged with
`stale_processing_recovery: true` in the `MEDIA_RETRY_REQUESTED` metadata,
since a stale `'processing'` item's `error_message` is always null (that's
the marker of the stuck state) and wouldn't otherwise distinguish this from
an ordinary failed-item retry in the audit trail.

## Duplicate uploads

`POST /api/media/upload-url` dedups by client-computed `content_hash`
(`findDuplicateMediaItem`) — same member, same chat, identical file bytes.
Two things changed here together, found during Step 2 verification:

**1. A match is always just reported, never silently acted on.** This route
previously force-reset a `failed` match to `'pending'` and auto-reprocessed
it, transparently — the member saw no signal beyond a small warning icon,
and it assumed the original bytes were still in Storage without checking.
Confirmed broken in production: an upload interrupted mid-PUT on cellular
(the row still reached `'processing'`) had every subsequent dedup-triggered
reprocess fail identically forever with `"Storage object not available
after 5 attempts"` — a real file-is-gone case being silently retried
against forever, not a timing race. Now every match just reports the row's
real, untouched status — `{ mediaItemId, duplicate: true, status }` — and
the client decides what to show:
- `ready` — the real thumbnail renders with a small "Already uploaded"
  label (`UploadThumbnail.tsx`'s `duplicateLabel` prop) — not text-only.
- `pending`/`processing` — same thumbnail treatment, "Already being
  processed".
- `failed` — same thumbnail, "Matches a previous upload that failed", with
  the item's *existing* retry badge (now genuinely live, not silently
  bypassed) as the explicit "choose to retry" action Part 1 asked for.

This is carried end-to-end via `useMediaUpload.ts`'s `UploadResult.duplicate`
(previously computed server-side and dropped at the hook boundary — nothing
downstream could act on it even though the server always knew) and a new
client-authored marker, `[MEDIA_UPLOAD_DUPLICATE: filename | media_item_id |
type | status]` (`ChatInput.tsx` writes it instead of `[MEDIA_UPLOAD: ...]`
when `result.duplicate`), parsed by `MessageList.tsx`'s
`MEDIA_UPLOAD_DUPLICATE_RE` the same way `MEDIA_UPLOAD`/`MEDIA_UPLOAD_FAILED`
already are. Registered in `registry.ts` (`MEDIA_UPLOAD_DUPLICATE_MARKER`,
`dispatch: 'client'`) purely so it strips from prose everywhere else
(`createMemoryFromAnchor`) instead of leaking raw bracket text, same
reasoning as `MEDIA_UPLOAD_MARKER`'s own doc comment.

**2. Never reprocess/retry against an assumed-present file.**
`verifyAndReprocess` (`services/media/processor.ts`) is now the *only* place
an existing row gets reprocessed — `objectExists` first, always:
- File present → resets to `'pending'`, triggers `processMediaItem`
  (`after()`-wrapped), returns `'reprocessing'`.
- File missing → marks `'failed'` with `NEEDS_REUPLOAD_ERROR_MESSAGE`
  (`'This file needs to be uploaded again'`), returns `'needs_reupload'`
  **without** calling `processMediaItem` — retrying again would fail
  identically forever. `POST /api/media/[id]/retry` surfaces this as
  `{ ok: true, needsReupload: true }`; both `UploadThumbnail.tsx` and
  `MediaGallery.tsx` check this (via `errorCopy.ts`'s `isNeedsReupload`,
  checked against the response directly for instant feedback, or against
  the DB-persisted `error_message` for an item that already carries it from
  a prior attempt) and swap the retry action for a disabled badge / hidden
  button plus a "please re-attach" message — a doomed retry is never
  offered twice.

One exception where a match skips the dedup-report path entirely: a
`failed` match whose file is confirmed missing (`objectExists` false) is a
non-match for practical purposes — there's nothing to point the member at.
`upload-url/route.ts` falls through to an ordinary fresh-upload response
(`{ signedUrl, mediaItemId }`, reusing the existing row's id/storage_path
rather than minting a new one) instead of a `duplicate: true` response,
since the client already has real bytes in hand right now, mid-attach — no
reason to make the member click a retry badge first when a real upload can
just happen immediately. `useMediaUpload.ts` needs zero special-case code
for this: it's indistinguishable from a genuinely fresh upload from that
point on.

As a consequence, `upload-url/route.ts` no longer calls `processMediaItem`
at all (its old dedup-reprocess branch and the `after()`/`maxDuration=900`
it needed are both gone) — reprocessing an existing row only ever happens
through `verifyAndReprocess`, called from `retry/route.ts`.

## Upload-url rejections (before a row exists)

`POST /api/media/upload-url` can reject a request before any `media_items`
row is created — invalid JSON, a missing required field, HEIC, an
unsupported mime type, an oversized file, or a member lookup failure. Found
during the `MEDIA_UPLOAD_FAILED`-leak investigation above: none of these had
any audit trail at all, under any action, which is also why that
investigation could only give a partial picture of how often client-side
pre-upload failures actually happen. `logUploadRejected` (a local helper in
`upload-url/route.ts`) now logs each of these via the base `logEvent`
directly — `AuditAction.MEDIA_UPLOAD_REJECTED`, one shared action with
`metadata.reason` distinguishing which of the 9 cases fired (not one action
per case — same reasoning as `MEDIA_PROCESS_FAILED`'s `pipeline_step`), and
`target_type: 'upload_attempt'` / `target_id: null` since there's no row yet
to attach to. `logMediaEvent` doesn't fit here — it hardcodes `target_type:
'media_item'` and requires a `media_item_id` neither of which exist at this
point in the request. Deliberately excludes the route's two earlier failure
points, unauthenticated (401) and tenant-not-found (400) — a different
category of failure, out of scope for this action. See `Utilities/Audit.md`
for the full reason-value list.

A second, pre-existing gap found and fixed alongside this: `stripMediaMarkers`
(`services/chat/server/media-context.ts`, the function that strips marker
syntax out of what's actually sent to the model) had its own hand-rolled
pattern that only matched `MEDIA_UPLOAD` — `MEDIA_UPLOAD_FAILED` was never
stripped and leaked as raw bracket text straight into the model's own
context on any client-side pre-upload failure, undetected until this fix
went looking for the same class of leak in the new `MEDIA_UPLOAD_DUPLICATE`
marker. Rebuilt to import the same canonical pattern sources
(`mediaMarkerPatterns.ts`) `registry.ts` and `MessageList.tsx` already use,
so a fourth marker can't silently repeat this — verified with explicit
tests (`media-context.test.ts`), not assumed safe by construction.

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
backoff (`STORAGE_WAIT_DELAYS_MS`, ~5.5s worst case) — now a **defensive
guard**, not the primary race-closer it used to be. It used to exist to
close the gap between the `media_items` INSERT (which used to fire
processing immediately) and the client's PUT landing in Storage; see
"Trigger ordering" above for why that was the actual root cause of a real
production bug and why triggering is no longer INSERT-based. It stays in
place for a genuinely different, much smaller race: Storage's own
read-after-write consistency between the PUT succeeding and a subsequent
`list()` call (`objectExists`) from a different request seeing it. No data
confirms this window is real for Supabase Storage specifically, but removing
a cheap, bounded, already-tested check on the chance it isn't would trade a
near-zero cost for the risk of reintroducing the exact failure mode this
system has now spent multiple fixes on. `STORAGE_WAIT_DELAYS_MS` is left
unchanged for now — it was sized against a multi-second-to-tens-of-seconds
gap that no longer exists by design, so it's worth revisiting once there's
real post-fix data, not bundled into this same change.

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

---

## Known Unknowns

**`document` and `audio` processing durations are unmeasured.** A query of
`audit_events` for `media.process_started` → `media.process_completed` pairs
over the most recent 14 days returned zero completed `document` or `audio`
jobs — only `image` jobs have any real duration data at all. This is a
standing caveat, not a one-off note: any max-age/stale-job threshold, timeout,
or similar duration-based logic applied to `document` or `audio` items in
this codebase is a judgment call, not something backed by observed data, and
should be revisited once genuine samples of those two types exist. Re-run the
duration query scoped to `metadata->>'type'` periodically to check whether
this gap has closed.

The one piece of in-code evidence bearing on this: `processAudio`'s comment
above `generateLongLivedSignedUrl` — "Use a long-lived URL (1hr) to guard
against slow Deepgram queues for large audio files causing URL expiry before
the fetch completes." This describes the signed *URL's* validity window, not
a measured or expected job duration — `processAudio` passes that URL
directly to Deepgram's `/v1/listen` endpoint (`url` in the request body, not
raw bytes) and `await`s the response synchronously; Deepgram fetches the
audio itself, on its own schedule, and the whole call blocks until Deepgram
returns the finished transcript in that same HTTP response (the code parses
`data.results.channels[0].alternatives[0].transcript` directly off it — no
polling, no callback). The 1-hour URL exists because the author judged
Deepgram's own queueing + fetch + transcription of a large file plausible
enough to approach that order of magnitude that a short-lived URL could
expire first. That is a design-time risk assumption baked into the pipeline,
not a measurement — but it is the only signal in the codebase that audio
jobs' legitimate duration could be dramatically longer than an image job's,
and any audio-specific timeout should stay consistent with it rather than
being picked independently.
