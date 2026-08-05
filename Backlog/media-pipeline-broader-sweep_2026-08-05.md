# Media Pipeline — Broader Sweep

**Investigation report · 2BL.AI Platform · August 5, 2026**

---

## Context

A focused investigation on 2026-08-04/05 found and fixed four real, compounding
bugs in `chatStore.tsx`'s media-item handling (PRs #269–#272 — see
`System Docs/Known Gaps.md`). That work was scoped specifically to "the guide
can't see uploaded attachments." It did not review the broader media pipeline
end to end.

Given four real bugs were found in a row in one narrow area that had never
been scrutinized before, this sweep reviewed the adjacent, un-investigated
parts of the same pipeline: `services/media/processor.ts`, the upload/webhook/
retry API routes, the mobile vs. desktop upload UI, and test coverage across
the whole system.

**This was an investigation-only pass.** No code was changed. Findings are
classified as confirmed bug (with severity), confirmed fine, or needs a live
test to determine — the same discipline used throughout the 2026-08-04
session.

---

## Headline findings

| # | Finding | Classification | Severity |
|---|---|---|---|
| 1 | Retry can never actually re-trigger processing | Confirmed bug | **High** |
| 2 | Composer attachments/text leak across conversation switches | Confirmed bug | **Medium-High** |
| 3 | No dedup on duplicate upload | Confirmed, not a bug | — |
| 4 | Mobile vs. desktop upload paths | Confirmed fine | — |
| 5 | Three previously-known bugs (race condition, prompt block, N+1 refetch) | Confirmed still fixed | — |
| 6 | 50MB documents vs. Anthropic PDF-block limits | Needs live test | — |
| 7 | Test coverage gaps | Confirmed gap | — |

---

## 1. Retry can never actually re-trigger processing

**Classification: Confirmed bug — High severity**

`app/api/webhooks/media-process/route.ts:63-66`:

```ts
// Only handle INSERT events on media_items
if (payload.type !== 'INSERT' || payload.table !== 'media_items') {
  return Response.json({ ok: true, skipped: true })
}
```

`app/api/media/[id]/retry/route.ts` "retries" a failed item by resetting it to
`status: 'pending'` via a Supabase `UPDATE`. The route's own comment already
flags uncertainty:

> "If the webhook is INSERT-only, the platform admin must re-trigger manually."

This isn't actually a question of how the Supabase Database Webhook is
configured in Studio — **the webhook route itself unconditionally discards
any non-INSERT payload**, regardless of what event types Studio sends. So
retry can never work through this path. The item silently resets to
`pending` and sits there forever; nothing ever picks it up.

There is also no cron/reconciliation sweep anywhere in the codebase that
would catch rows stuck at `pending`/`processing`.

**Mitigating factor:** `MediaGallery.tsx` — the only caller of the retry
endpoint, with a real "Try again" button — is built but **not mounted
anywhere in the app**. A repo-wide search for `<MediaGallery` turns up
nothing outside the component itself and design docs, which matches
`System Docs/Known Gaps.md`'s note that the Media nav section "was never
built at all." So this bug is not live-user-facing today, but it is real,
has zero test coverage, and will silently fail the moment someone wires the
Gallery into navigation.

**Compounding gap:** even if the webhook path were fixed, `chatStore.tsx`'s
delivery-tracking (`deliveredTerminalIdsRef`, the #270/#271 fix from
2026-08-04) treats `failed` as a terminal, already-delivered state. A
successful retry from the Gallery has no mechanism to reset that ref, so the
guide would never learn the item eventually succeeded — Retry and chatStore
are two disconnected systems today.

**Recommended fix direction:** either configure the Supabase webhook to also
fire on UPDATE and stop discarding it in the route (guarding re-entry via the
existing `status !== 'pending'` idempotency check), or have the retry route
call `processMediaItem` directly instead of relying on the DB webhook at all.

---

## 2. Composer attachments/text leak across conversation switches

**Classification: Confirmed bug — Medium-High severity**

`<ChatInput />` is mounted once, unkeyed, in `ChatHero.tsx:226`, and stays
alive across `loadSession`/`newChat` calls — conversation switches happen
without a full page reload (confirmed by the #272 bug write-up itself).
`ChatInput.tsx` has zero `useEffect` watching `state.sessionId` to reset its
local `attachments` or `value` state.

Practical effect: stage a photo and/or type a draft while viewing
conversation A, switch to conversation B via the sidebar without sending,
and the staged attachment/text is still sitting in the composer — now
overlaid on conversation B's thread. Hit send and it silently attaches to B
instead of A. The file itself lands in the correct DB row (chat_id is read
from `state.sessionId` at send time, so there's no data corruption), but the
content goes to the wrong conversation from the user's point of view.

This is exactly the "cleanup/reset gap on session switch" class of bug that
the #272 fix addressed for `mediaItemsRef` / `deliveredTerminalIdsRef` —
just unaddressed in the composer's own local state, which lives in a
different file entirely.

Confirmed via code inspection and React remount semantics (no `key` prop
tied to session identity → no remount on session change); no live test
needed to establish this.

**Recommended fix direction:** reset `attachments`, `value`, and
`transcribeState` in a `useEffect` keyed on `state.sessionId` change, mirroring
the pattern already used for `mediaItemsRef`/`deliveredTerminalIdsRef` in
`chatStore.tsx`.

---

## 3. No dedup on duplicate upload

**Classification: Confirmed, not a bug — needs a product decision**

`buildMediaStoragePath` always mints a fresh UUID per upload
(`{tenant_id}/media/{member_id}/{media_item_id}/{filename}`), so re-selecting
the same file — even byte-identical — always creates an independent
`media_items` row and storage object. No collision, no merge, no dedup
anywhere in `upload-url/route.ts` or `useMediaUpload.ts`.

This appears to be an implicit consequence of the architecture rather than a
deliberate decision — there's no uniqueness constraint and the original spec
never calls for one. It doesn't break anything (both items would surface to
the guide independently, with the same filename), but it's worth an explicit
product call rather than leaving it as an accident of the ID scheme.

---

## 4. Mobile vs. desktop upload paths

**Classification: Confirmed fine**

`SourceMenu`'s popover (desktop) and sheet (mobile) variants, plus the
camera/library/scan/browse entry points, all funnel through the same
`addFiles` → `handleSend` → `useMediaUpload` pipeline in `ChatInput.tsx`.
There is no divergent mobile-specific upload path that tonight's fixes could
have missed.

---

## 5. Previously-known bugs — still fixed, no regressions

**Classification: Confirmed fine**

Re-verified against `Design Handovers/media-items-spec_updated August
2026.md`'s three originally-flagged bugs:

- **Race condition** (webhook fires before the client's file PUT lands in
  Storage): `waitForStorageObject` in `processor.ts` still gates all three
  pipelines (audio/image/document) with a bounded retry (0/300/700/1500/3000ms),
  and is covered by `processor.test.ts`.
- **Missing Heirloom prompt block**: `resolveMediaContext`
  (`services/chat/server/media-context.ts`) still emits `ATTACHED MEDIA` /
  `ATTACHMENT FAILED` / `ATTACHMENT IN PROGRESS` sections. No contradiction
  with tonight's chatStore fixes — they operate at different layers
  (server-side context resolution vs. client-side delivery tracking) and are
  complementary, not overlapping.
- **N+1 signed-URL refetch on reload**: `GET /api/media` batches signed URLs
  via `withDisplayUrl` in parallel (tested in `route.test.ts`); `InlineImage`
  in `MessageList.tsx` only falls back to its own per-item fetch when
  `item.url`/`localPreviewUrl` is genuinely absent from the catch-up fetch.
  Still fixed.

---

## 6. 50MB documents vs. Anthropic PDF-block limits

**Classification: Needs a live test to determine**

`app/api/media/upload-url/route.ts` allows documents up to 50MB. The shared
`extractText` helper (`services/content/assets.ts`) was originally written
for a 10MB admin-upload cap and sends the entire base64-encoded PDF in a
single Anthropic message. Failure is already handled gracefully — a failure
here lands in `status: 'failed'` with a sanitized reason via
`sanitizeFailureReason`, not a silent swallow — but whether real-world large
PDFs actually succeed against Anthropic's document-block limits is
unverified. Worth a live test with a large real PDF once time permits.

---

## 7. Test coverage gaps

**Classification: Confirmed gap**

Beyond what the 2026-08-04 PRs added for `chatStore.tsx`'s media-item
handling specifically, these have **zero test coverage**:

- `app/api/webhooks/media-process/route.ts` — signature verification,
  idempotency guard, and the INSERT-only filter (exactly where the Finding 1
  bug lives)
- `app/api/media/[id]/retry/route.ts`
- `app/api/media/[id]/url/route.ts`
- `app/api/media/upload-url/route.ts`
- `services/media/useMediaUpload.ts`
- `ChatInput.tsx`'s upload flow (no `ChatInput.test.tsx` exists)
- The actual bodies of `processAudio` / `processImage` / `processDocument` in
  `services/media/processor.ts` — only the shared `waitForStorageObject`
  helper is tested (`processor.test.ts`). The Deepgram, Claude-vision,
  Claude-PDF, and mammoth call paths, and all of their error branches, are
  entirely unexercised.

---

## Minor / doc-hygiene notes

- `MediaGallery.tsx` exists, with real retry/download UI, but is unmounted.
  `System Docs/Known Gaps.md`'s "Media nav section... never built at all" is
  stale/imprecise — the component exists, it's just not wired into
  navigation. Worth a one-line correction next time that file is touched.
- `Design Handovers/stream-unification-plan.md` still says `streamChat`
  "ignores `[MEDIA_UPLOAD:]` markers entirely" — outdated relative to
  `resolveMediaContext`'s current, working behavior.

---

## Suggested priority if fixes are picked up next

1. **Retry-webhook bug (Finding 1)** — data-integrity issue, currently latent
   but will bite the moment the Media Gallery ships to navigation.
2. **Composer cross-conversation leak (Finding 2)** — user-facing correctness
   issue, live today.
3. **Close the webhook/retry-route test gap** before either fix above ships,
   so the fix itself is verifiable and the regression can't reopen silently.

---

*Second Brain Labs · 2bl.ai · Internal — investigation only, no code changed.*
