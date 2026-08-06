# 2BL.AI — Media Items Spec

**Feature Spec · 2BL.AI Platform** June 2, 2026 · Second Brain Labs

---

## Overview

When a member uploads a file in chat, the platform should identify what the file is and take meaningful action based on that — without interrupting the conversation. Processing happens in the background. The guide acknowledges the upload immediately, keeps the conversation moving, and notifies the member inline when the file is ready.

This spec covers the data model, background job architecture, guide prompt behaviour, and the Media section in member navigation. Artifacts (prior concept) are ignored — this is a clean design.

---

## Member Experience

### Upload

Member taps the attach button in chat and selects a file. The guide responds immediately to the act of uploading — it does not wait for processing.

> *"Got it — I'm working through that recording now. While that's happening, tell me: what made you decide to capture that memory when you did?"*

The guide does not block on processing. The conversation continues.

### Background Processing

A background job picks up the file and runs the appropriate processing pipeline based on type. The member sees no loading state in the main chat — processing is invisible.

### Completion Alert

When processing completes, a persistent event appears inline in the chat thread. This is not a toast — it stays in the thread and is actionable.

> *"✓ Your recording is ready. I've pulled out the key moments — want me to weave them into the story, or would you rather read the transcript first?"*

This re-engagement hook is the guide picking the conversation back up. The member clicks in or responds naturally.

### Failure Handling

If processing fails, the guide surfaces it plainly without technical language.

> *"I wasn't able to process that file — it may be in a format I can't read yet. You could try a different format, or just describe what's in it and we'll work from that."*

---

## Supported File Types & Actions

### Audio

- **Formats:** .m4a (iPhone Voice Memos), .mp3, .wav  
- **Processing:** Deepgram transcription (already stubbed — needs end-to-end wiring)  
- **Derived content:** transcription text stored on record  
- **Guide response after processing:** reads transcript content, responds to what was said — not just that a file arrived  
- E.g. *"You mentioned your dad called it his proudest moment — tell me more about that."*

### Image

- **Formats:** .jpg, .jpeg, .png, .heic, .webp  
- **Processing:** Claude vision pass — describe, classify, extract any visible text  
- **Derived content:** AI-generated caption and classification stored on record  
- **Guide response after processing:** describes what it sees, asks for the story behind it  
- E.g. *"This looks like it's from the 70s — who's the woman in the blue dress?"*

### Document

- **Formats:** .pdf, .docx, .txt  
- **Processing:** text extraction, then Claude classification pass (what kind of document is this?)  
- **Derived content:** extracted text \+ classification stored on record  
- **Guide response after processing:** identifies document type, confirms with member, treats as raw material  
- E.g. *"This reads like something written for a service — is this a eulogy? I'd love to use your own words."*

---

## Data Model

### `media_items` table

New table. Clean design — does not extend or reference the `artifacts` table. Jeff creates this in Supabase Studio.

| Column | Type | Notes |
| :---- | :---- | :---- |
| `id` | uuid | Primary key, `gen_random_uuid()` |
| `tenant_id` | uuid | FK → `tenants.id` — required for RLS |
| `member_id` | uuid | FK → members/users table — who uploaded |
| `chat_id` | uuid | FK → `chat_sessions.id` — originating chat |
| `story_id` | uuid | FK → `stories.id` — nullable, linked after story exists |
| `type` | text | enum: `audio` | `image` | `document` |
| `storage_path` | text | Supabase Storage path |
| `original_filename` | text | Preserved from upload for display |
| `file_size_bytes` | int8 | Stored at upload time |
| `status` | text | enum: `pending` | `processing` | `ready` | `failed` |
| `classification` | text | AI-assigned: `voice_memo` | `photo` | `letter` | etc. |
| `derived_content` | text | Transcription, extracted text, or caption |
| `error_message` | text | Nullable — set on failure |
| `created_at` | timestamptz | Default `now()` |
| `processed_at` | timestamptz | Nullable — set when status → `ready` or `failed` |

### Status lifecycle

| Status | Meaning |
| :---- | :---- |
| `pending` | Record created, file uploaded to storage, job not yet started |
| `processing` | Background job running |
| `ready` | Processing complete, `derived_content` populated |
| `failed` | Job failed — `error_message` populated |

### Storage

Supabase Storage bucket: `media-items` (private, RLS enforced). Path structure:

{tenant\_id}/{member\_id}/{media\_item\_id}/{original\_filename}

Files are never public. All access goes through signed URLs generated server-side.

---

## Background Job Architecture

### Trigger

A Supabase Database Webhook fires on INSERT into `media_items` where `status = pending`. The webhook calls a Vercel background function (not an Edge Function — processing times for audio can exceed Edge limits).

### Job flow

1. Job receives `media_item_id`  
2. Updates `status` → `processing`  
3. Fetches file from Supabase Storage via signed URL  
4. Runs processing pipeline based on type (audio → Deepgram, image → Claude vision, document → extraction \+ Claude classify)  
5. Writes `derived_content` \+ `classification` back to record  
6. Updates `status` → `ready` (or `failed` \+ `error_message`)  
7. Status change triggers Supabase Realtime event on the chat channel

### Realtime alert

The chat UI is already subscribed to a Supabase Realtime channel for the active `chat_id`. The background job's status update (step 7\) is picked up by this subscription. The UI renders the completion event as an inline chat message — styled distinctly from guide and member messages, but within the thread.

The completion message is then passed into the guide's context so it can respond conversationally, picking up from where the upload acknowledgement left off.

### Timeout / retry

Vercel background functions have a maximum execution time of 15 minutes (Pro plan). Deepgram transcription for typical voice memos should complete well within this. If a job exceeds the limit or throws, status is set to `failed` and `error_message` is populated. **No automatic retry in V1** — failed items surface in the Media section with a retry option.

---

## Guide Prompt Additions

### Upload acknowledgement block

Added to the guide's system prompt. Fires when a file upload event is detected in the conversation context.

> *When a member uploads a file, acknowledge it warmly and immediately — do not wait for processing. Keep the conversation moving with a question. Do not describe what you're doing technically. Never say "I'm uploading" or "processing" — just "I'm working through that" or similar. One sentence acknowledgement, one question.*

### Completion re-engagement block

Fires when a `media_item` status change event appears in the conversation context. The guide receives the `derived_content` (transcription, caption, or extracted text) and responds to the actual content.

> *When a file finishes processing, respond to what's in it — not just that it's ready. Reference specific details from the derived content. Offer a clear next step: incorporate it, review it, or build from it. The member should feel like you read it, not just received it.*

### Classification values

The `classification` field is set by the AI during processing and stored on the record. The guide prompt includes a mapping so it knows how to frame each type:

- `voice_memo` → treat as spoken memory, transcribe faithfully, reflect the person's own voice back  
- `interview_recording` → treat as source material, pull key quotes and themes  
- `photo` → anchor in time and place, ask for the story behind it  
- `scanned_document` → read carefully, identify document type before acting  
- `letter` → read for emotional content, offer to incorporate the writer's voice  
- `eulogy` → handle with care, ask permission before incorporating directly  
- `journal_entry` → treat as private source, paraphrase rather than quote directly  
- `other` → describe what you see, ask the member what they'd like to do with it

---

## Media Section — Navigation

### Concept

The Media section is a gallery of everything a member has shared — not a file manager. It's organised by story, not by file type. The emotional framing: "the source material shelf."

### Layout

- Nav item: **Media** (icon: paperclip or grid, between Chats and Stories)  
- Default view: grouped by story — each story has a strip of thumbnails/file rows below its title  
- Files without a `story_id` (not yet linked) appear under "Unassigned" at the bottom  
- Each item shows: thumbnail or file type icon, `original_filename`, classification badge, date, and the chat it came from (tappable — navigates back to that chat)  
- Status badge: processing items show a spinner, failed items show a retry option  
- Tapping an item opens a detail view: full `derived_content` (transcript, caption, extracted text), plus the original file (signed URL download)

### What it is not

- Not a file manager — no folders, no rename, no delete in V1  
- Not a search surface in V1 — browsing only  
- Not a shared library — scoped to the member, not the story collaborators (V2)

---

## Build Sequence

Recommended order. Each step is independently shippable.

1. **Schema** — Jeff creates `media_items` table in Supabase Studio  
2. **Storage** — create `media-items` bucket, configure RLS  
3. **ChatInput** — wire the TODO(2bl) attach button, upload to Storage, insert `media_items` record at `status=pending`, insert acknowledgement message into chat  
4. **Background function** — Vercel function that handles audio, image, and document pipelines. Webhook trigger on insert.  
5. **Realtime** — subscribe to `media_items` status changes on chat channel, render completion event inline in thread  
6. **Guide prompt** — add upload acknowledgement and completion re-engagement blocks  
7. **Media nav section** — gallery view, grouped by story

---

## Open Questions

- **Deepgram vs Whisper** for audio transcription — Deepgram is already stubbed; confirm before build.  
- **File size limits** — what's the max we want to accept? Recommend 50MB for V1.  
- **Retry UX** — failed items show a retry button in Media section; does retry re-trigger the same job or require re-upload?  
- **`story_id` linkage** — when does a `media_item` get linked to a story? On upload (if story exists) or lazily? Recommend: on upload if chat has an active story, otherwise null until member or guide links it.  
- **Collaborator access to media** — V2 decision, but the data model should support it from day one (RLS will need a collaborator policy).

---

*Second Brain Labs · 2bl.ai · Confidential*

**Repo status:** this spec was never checked into `docs/` — confirmed absent Aug 1, 2026\. Existed only as an uploaded project-knowledge file until reconstructed here.

---

## Update — August 1, 2026

The June 2 spec above is unchanged and intact as the original design record. This section captures what today's discussion added, sharpened, or confirmed — not a rewrite.

### Confirmed, not new: this was never meant to be a tool-call

Revisited today whether media handling needs real model-triggered tool-calling infrastructure. Answer: no, and the original spec already agreed — "fires when a file upload event is detected in the conversation context" is context-injection, the same pattern used for `MEMBER CONTEXT` and the booking section. The reasoning that confirms it: the model never *decides* to start an upload or its processing — the visitor's tap and the background job both happen entirely outside the model's involvement. The model only ever narrates something that already happened, which is exactly what context-injection is for. No tool needed, now or later, unless a future feature requires the model itself to decide to trigger something (which uploading is not).

### Confirmed, not new: this was always meant to be a shared, cross-product service

The June schema (`tenant_id`, `member_id`, `chat_id`, no product-specific fields) was never Heirloom-only. Today's ask — "ideally, this is a service that all the chats can use" — is already what was designed; nothing needs to change architecturally to honor it.

### New — a sharper bar for the member-facing messaging

The original spec's Completion Alert and Failure Handling examples are good in tone but make no explicit commitment. Today's framing adds five real requirements on top of them:

1. **Easy to understand** — fast, recognizable, consistent across file types.  
2. **Easy to remember/recall** — the member shouldn't have to re-learn the pattern each time.  
3. **Informative, not guessed at** — if the member asks what's happening, the answer is real, not invented.  
4. **Contract-based** — the system states what it can and can't do upfront, effectively an SLA with the member, not just a vague "I'm working on it."  
5. **Genuinely useful feedback, measured against that contract** — the completion/failure message closes the loop against what was actually promised, not just announces a generic status.

**Real cost, flagged plainly, not glossed over:** point 4 only works if per-type processing time estimates are actually accurate. No real timing data exists yet for any of the three pipelines (audio/image/document). A promise that's wrong breaks trust worse than the original spec's vagueness would have. This needs real production timing data before an SLA-style message can honestly ship — not a blocker to designing around, but a real precondition to launching it.

### New — three concrete bugs found, none anticipated by the original spec

Investigated Aug 1 against a real production test conversation:

1. **Race condition** — the background-job webhook fires on the `media_items` INSERT, which happens *before* the client's file upload actually completes to Storage. Processing can attempt to fetch a file that isn't there yet, fail, and mark the item `failed` — even though the upload itself succeeded. Zero retry/backoff logic exists anywhere in the processor.  
2. **No prompt block exists for Heirloom specifically.** The plumbing (context injection) was built and merged July 31, but nobody wrote the actual guide instructions telling it what `ATTACHED MEDIA`/`ATTACHMENT IN PROGRESS` context means or how to react — matches this spec's "Upload acknowledgement block" and "Completion re-engagement block" sections, which were speced in June but never actually authored into Heirloom's compiled prompt.  
3. **N+1 signed-URL refetch on reload.** Every historical image in a conversation does its own uncached, unbatched signed-URL fetch on every page load — not anticipated by this spec at all, a real inefficiency in the display layer, separate from the processing pipeline itself.

### New — the injected context is held to tool-result standards, even though it isn't a tool call

Confirmed today: media handling stays context-injection, not a formal tool call — the model never decides to start an upload, so there's nothing for it to invoke. But the *contract* on what gets injected needs the same rigor a real tool result would require, regardless of the mechanism:

- **The service reports facts. The model translates those facts for the member. It never invents.** Status, failure reason, classification — every value injected into context must be real and complete, the same standard as a literal tool call's return value, not a hint the model is free to embellish or guess around.  
- Concretely: a failure signal must carry the actual `error_message`, not a generic `failed` flag — the guide should simplify a true reason for the member, never manufacture a plausible-sounding one.  
- This is a standing principle for the whole pipeline, not a one-off fix — every future signal added to this system (timing estimates, retry state, whatever comes out of the Media section) should be built to this same bar from the start.

### Confirmed — live schema vs. spec (Aug 1, 2026\)

All 15 originally-specced columns exist and are correctly typed. Confirmed via direct `information_schema.columns` query, not inferred from code.

**Genuinely new since June, not in the original spec:**

- `mime_type` (text, required) — a real MIME type, distinct from the coarse `audio/image/document` enum.  
- `updated_at` (timestamptz, required) — standard housekeeping.  
- `artifact_id` (uuid, nullable) — connects a media item to an `artifacts` row (a saved memory). See "How media relates to memories" below — the column exists, the link is not wired up anywhere in the app yet.

**Two nullability quirks, unexplained, worth a follow-up:**

- `chat_id` is nullable, though the spec's language implies it should always be set for anything uploaded through chat. Open question: is there a legitimate upload path with no chat context?  
- `file_size_bytes` is nullable, though the spec says it's "stored at upload time." Open question: is there a real path where it's legitimately missing, or is this defensive schema that's never actually exercised?

### How media relates to memories

`media_items.artifact_id` is the connection — memories are stored as rows in the `artifacts` table (`type='memory'`), and this column is a foreign key to that table, meant to let a specific photo/audio/document attach to a specific saved memory.

**Confirmed: this exists in schema, and is confirmed NOT wired up anywhere in the app.** Nothing sets this value on upload, and nothing reads it — the photo slots on memory cards (`MemoryCard.tsx`) are explicitly non-interactive placeholders by design in V1 ("a promise, not an upload," per the card's own header comment). No actual logic has been decided for *when* or *how* an uploaded item gets associated with a memory — e.g. does uploading a photo shortly before/after a `SAVE_MEMORY` trigger auto-link them, does the member choose manually, does it only happen once the Media section exists. This is a real, undecided design question, not just an unwired connection.

### Still confirmed absent, matching the original spec's own build sequence

Per the June build sequence, steps 4 (background function), 6 (guide prompt), and 7 (Media nav section) were never fully completed. Specifically: the Realtime alert mechanism (step 5\) was never implemented — current behavior is context-injection on the visitor's *next* message, not an inline event pushed the instant processing finishes. **Update (2026-08-05): the Media nav section isn't fully absent — `components/shells/membership/MediaGallery.tsx` exists, with working retry and download UI, and (as of this PR) is now wired into `SidebarV2`'s "Media" nav item, reachable in the shipped app.** The guide prompt blocks are being written now, as a direct result of today's bug investigation.

---

## Built / To-Do / Sequencing (Aug 1, 2026\)

### Built

| Item | State | Confidence |
| :---- | :---- | :---- |
| `media_items` table, storage bucket, signed-URL upload flow | Live, working | Confirmed — real upload succeeds, renders client-side |
| Background webhook trigger on INSERT | Live, working | Confirmed — fires reliably, just fires too early (see Bug 1 below) |
| Processing pipelines (Deepgram for audio, Claude vision for images, extraction for documents) | Live, working | Confirmed for images; audio/document not independently verified today |
| `resolveMediaContext` — injects `ATTACHED MEDIA:` / `ATTACHMENT IN PROGRESS:` into system prompt | Live, working | Merged July 31 (PR \#241), tested |
| `stripMediaMarkers` — empty-turn guard (never sends Anthropic a blank message on attachment-only turns) | Live, working | Merged July 31, tested |
| Context-injection is the delivery mechanism, not a tool-call | Confirmed correct design | Matches June spec's own intent, re-validated Aug 1 |
| Shared-service architecture (not Heirloom-specific) | Confirmed correct design | Schema was never product-scoped; no rework needed |

### To-Do

| Item | What it actually is | Priority |
| :---- | :---- | :---- |
| **Bug 1 — race condition** | Webhook fires on DB insert, before the client's file bytes finish uploading to Storage. Processing 404s, marks `failed`. Zero retry logic anywhere. **Fix in progress as of Aug 1\.** | High — real, live, user-visible failure |
| **Bug 2 — no prompt block for Heirloom** | The context signal exists; nothing tells the guide what it means. Model falls back to a generic "can't see images yet" guardrail response. **Fix in progress as of Aug 1\.** | High — directly causes the reported bug |
| **Bug 3 — N+1 image refetch on reload** | Every historical image does its own uncached signed-URL round trip on every page load. Real inefficiency, not perception. **Fix in progress as of Aug 1\.** | Medium — works, just slow/wasteful |
| **Write the actual prompt blocks** | Upload acknowledgement \+ completion re-engagement, per June spec's language, adapted to Heirloom's actual voice and AND-chain trigger discipline | High — blocked on Bug 2 being scoped, otherwise ready now |
| **Collect real processing-time data** | No timing data exists for any of the three pipelines today. Precondition for the SLA/contract messaging — can't promise something unmeasured. | Medium — needed before the contract framework can ship honestly |
| **Contract/SLA messaging design** | The 5-point framework (understandable, recallable, informative, contract-based, useful feedback against the contract) — real design work, zero implementation | Medium — depends on timing data above |
| **Realtime push** | Original spec called for inline completion events the instant processing finishes. Never built. Current fallback: context-injection on the visitor's next message — works, but not instant. | Low — real gap, but the fallback is functional |
| **Media nav section** | Gallery view, grouped by story, "source material shelf" framing from the original spec. **Update (2026-08-05): not "never built" — `MediaGallery.tsx` exists with working retry/download UI, and is now wired into `SidebarV2`'s "Media" nav item (this PR), reachable in the shipped app.** Story-grouping and the "source material shelf" framing are still absent — see `Backlog/media-gallery-finish-to-spec.md`. | Low — no functional dependency on anything above |
| **Connect media to artifacts (`artifact_id`)** | Column exists, confirmed dead — nothing sets or reads it. Real design decision needed first, not just wiring: auto-link on upload near a `SAVE_MEMORY` trigger, member manually attaches, or deferred until the Media section exists and becomes the natural place this happens. | Medium — blocks memory cards from ever showing real photos, but needs a decision before it needs code |
| **Retry UX** | June spec flagged this as an open question — does retry re-trigger the same job or require re-upload? Never decided. | Low — matters more once Bug 1's real failure rate is known |

### Sequencing

**Phase 1 — fix the plumbing (in progress):**

1. Bug 1 (race condition) — the actual data-integrity fix, do first since everything downstream assumes uploads process reliably.  
2. Bug 3 (N+1 refetch) — independent of Bug 1, can happen in parallel.  
3. Bug 2 (missing prompt block) — write it now; it doesn't need to wait on Bugs 1/3, but test it against a *working* pipeline once Bug 1's fixed, not before.

**Phase 2 — earn the data (passive, runs alongside other work):** 4\. Once Bug 1's fixed and real uploads are flowing reliably, start capturing real processing-time data per type. This doesn't block anything else — it just needs the pipeline to be trustworthy first, and time to accumulate.

**Phase 3 — build the real experience (needs Phase 2's data, real design time):** 5\. Contract/SLA messaging — write the actual acknowledgement/completion language against real timing numbers, not guesses. 6\. Decide Realtime vs. staying with context-injection, now informed by how the contract messaging is meant to feel (an SLA implies some responsiveness expectation — worth revisiting once the UX is actually designed).

**Phase 4 — the parts with no urgency (whenever):** 7\. Media nav section finish-to-spec work (story grouping, "source material shelf" framing — the nav connection itself shipped 2026-08-05; see `Backlog/media-gallery-finish-to-spec.md`). 8\. Retry UX decision.

**What NOT to do:** don't build the contract/SLA messaging before Phase 2's timing data exists — that's the one sequencing rule worth holding firm on, since a wrong promise is worse than the current vague acknowledgement.  
