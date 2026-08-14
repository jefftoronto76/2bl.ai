# Chat UI Service

### Chat UI service (`services/chat/ui/v1/`)

The shared client-side chat engine — the marker registry + the `useChatTurn`
turn hook — consumed by **both** the jefflougheed visitor chat
(`components/shells/widget/WidgetShell.tsx`'s `WidgetShellChat`/`WidgetShellHero`)
and the Heirloom chat (`app/heirloom/`). Extracted in PRs #42–46.
The type + registry modules are server-safe (no React); `useChatTurn.ts` is a
`'use client'` hook and is intentionally NOT re-exported from the barrel, so
server consumers (e.g. the admin transcript renderer via `parseBookingCards`)
can import the registry without pulling a client module.

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `MarkerType`, `ParsedMarker`, `MarkerParseResult`, `MarkerDispatch`, `MarkerDefinition`, `MarkerRegistry`, `ChatEngineAccessors`, `UseChatTurnOptions`, `UseChatTurnReturn` | Type contracts for the marker registry and the turn hook. No React. `ChatMessage` / `ChatMode` are imported from `services/chat/server/types`, not redefined. |
| `registry.ts` | `createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER`, `EMAIL_MARKER`, `PHONE_MARKER`, `ACCOUNT_CREATE_MARKER`, `SAVE_MEMORY_MARKER`, `MEMORY_TITLE_MARKER`, `MEDIA_UPLOAD_MARKER`, `MEDIA_UPLOAD_FAILED_MARKER` | Concrete marker registry. `createMarkerRegistry()` parses content into `{ prose, markers }`, stripping every registered marker (and its trailing incomplete fragment) from prose, collapsing blank lines. `createDefaultRegistry()` preloads every display-stripped marker. `BOOKING_MARKER` (`[BOOKING: …]`, 4 fields, `dispatch: 'client'`); `NAME_MARKER` (`[NAME: firstname]`, 1 field, `dispatch: 'server'`); `EMAIL_MARKER` (`[EMAIL: address]`, 1 field, `dispatch: 'server'`); `PHONE_MARKER` (`[PHONE: value]`, 1 field, `dispatch: 'server'`); `ACCOUNT_CREATE_MARKER` (`[ACCOUNT_CREATE: reason]`, 1 field, `dispatch: 'client'` — the membership shell renders a `MagicLinkCard` inline; stripped everywhere else); `SAVE_MEMORY_MARKER` (bare `[SAVE_MEMORY]`, no field, `dispatch: 'client'`) and `MEMORY_TITLE_MARKER` (`[MEMORY_TITLE: short title]`, 1 field, `dispatch: 'server'`); `MEDIA_UPLOAD_MARKER` (`[MEDIA_UPLOAD: filename | media_item_id | type]`, 3 fields, `dispatch: 'client'`) and `MEDIA_UPLOAD_FAILED_MARKER` (`[MEDIA_UPLOAD_FAILED: filename]`, 1 field, `dispatch: 'client'`) — see `System Docs/Marker Syntax.md` for all. Unlike every other marker here, the MEDIA_UPLOAD pair is written into a **visitor** message's own stored content by the client-side upload flow (`ChatInput.tsx`), not emitted by the AI; registered here purely so `createMemoryFromAnchor` and every other registry consumer strip them from prose instead of leaking raw bracket text — the real per-upload consumer is `MessageList.tsx`'s own separate `parseUserMessage` parser. Both markers' regex is built from a shared source string in `mediaMarkerPatterns.ts` (own row below, added 2026-08-09) rather than being defined twice — see that row for why. The `[CONTACT:]` marker was retired — contact capture moved to the server-side visitor-message watcher in `services/crm/session.ts`, and the marker, its `'CONTACT'` `MarkerType` member, and the Heirloom `ContactCard` are all removed. |
| `mediaMarkerPatterns.ts` | `MEDIA_UPLOAD_PATTERN_SOURCE`, `MEDIA_UPLOAD_FAILED_PATTERN_SOURCE`, `MEDIA_UPLOAD_DUPLICATE_PATTERN_SOURCE`, `titleSourceFromContent` | Canonical regex **source strings** (no flags) for the MEDIA_UPLOAD/MEDIA_UPLOAD_FAILED/MEDIA_UPLOAD_DUPLICATE marker syntax — added 2026-08-09 to close a real fragility: `registry.ts`'s `MEDIA_UPLOAD_MARKER`/`MEDIA_UPLOAD_FAILED_MARKER` and `MessageList.tsx`'s own `parseUserMessage` parser previously each defined the same syntax as independently-authored regexes, correct only because neither had been edited since the other. Consumers each build their own `RegExp` instance off these shared sources — kept as plain strings, not a shared `RegExp` object, so each consumer's own `g`-flag `.lastIndex` state stays fully independent. No React, server-safe. `titleSourceFromContent` (added 2026-08-14) is the one exported helper rather than a raw pattern source — strips all three marker types from a raw message string and returns either the leftover typed caption or a short type-aware fallback (`'Photo shared'`, etc.) for an attachment-only message; used by both title-deriving call sites (`chatStore.tsx`'s `deriveSessionTitle`, `persistence.ts`'s `deriveTitle`) so a media-only first message never renders its title as raw bracket syntax — see `System Docs/Marker Syntax.md`'s `[MEDIA_UPLOAD: ...]` section for the incident this fixed. |
| `parseBookingCards.ts` | `parseBookingCards` (+ `BookingCardData`, `SageParameterPublic`, `OpenAs`) | Headless wrapper over `createDefaultRegistry()` preserving the legacy `{ prose, cards }` API and additionally returning the registry's full `markers: ParsedMarker[]` (additive — consumed by the admin transcript debug pills; existing `{ prose, cards }` consumers unchanged). Filters parsed markers to `BOOKING` and maps each to `BookingCardData`; non-BOOKING markers (e.g. `NAME`) are stripped from prose but not surfaced as cards. Server-safe (no React) so the admin transcript renderer (`app/admin/sessions/[id]/page.tsx`) and the visitor-chat components (`Chat`, `Hero`, `SageReply`, `BookingCard`, `useSageParameters`) all consume it. Moved here from `src/components/sage/parseBookingCards.ts` in centralization Step B. Unit-tested in `parseBookingCards.test.ts`. **Admin transcript debug pills**: `app/admin/sessions/[id]/page.tsx` (server component) calls `getCurrentUser()` and, only when `isPlatformAdmin` (server-resolved from `users.role`), renders each assistant message's `markers[].raw` as dark monospace `DebugPill`s below the booking cards — the page itself stays accessible to regular tenant admins; only the debug view is gated. |
| `persistence.ts` | `bufferThread`, `clearDraft`, `clearSession`, `clearTranscripts`, `readThread`, `readIndex`, `findMostRecentThread`, `toPersistedMessage(s)` (+ `PersistedMessage`, `PersistedThread`, `ThreadIndexEntry`, `PersistenceNamespace`, `DRAFT_ID`) | Pure (no React, no store) **IndexedDB** thread buffer — despite the name suggesting localStorage, it wraps `idb`/`indexedDB` and is namespaced per `PersistenceNamespace` (`'heirloom'` → the `heirloom:chat:v1` database, `'sage'` → `sage:chat:v1`), shared by **both** the Heirloom membership shell and the jefflougheed widget shell (see `System Docs/Public Site.md`'s Heirloom "Persistence note" for the behavior, which applies to both namespaces identically). `toPersistedMessage` round-trips `status`/`stopped`/`versions`/`versionIdx`/`edited` alongside `id`/`role`/`content`/`timestamp` (fixed 2026-07-27 — it used to silently drop them on write); reconciling any in-flight-looking state back to settled (e.g. a revived `'sending'` status reading as `'failed'`) is `reviveUIMessage`'s job on the read side (`message.ts`), not this module's. Moved here from `app/heirloom/lib/chatPersistence.ts` in centralization Step B. Unit-tested in `persistence.test.ts`. |
| `chatReducer.ts` | `chatReducer`, `initialState`, `Message` (+ `ShellState`, `ChatAction`) | Pure Heirloom **shell** reducer (no React, no JSX) — sidebar + chat-panel open/close state (`TOGGLE_SIDEBAR` / `SET_SIDEBAR` / `OPEN_CHAT` / `CLOSE_CHAT`). Conversation state lives in the shared session (`useChatSession`); this owns only presentation/shell state, composed with the session by the membership-shell `ChatProvider`. Re-exports `Message = UIMessage`. Moved here from `app/heirloom/components/store/chatReducer.ts` in centralization Step F. Unit-tested in `chatReducer.test.ts`. |
| `useSageParameters.ts` | `useSageParameters` | Headless `'use client'` data hook (no JSX) — fetches `/api/sage/parameters` on mount and returns the public `SageParameterPublic[]` (resilient to fetch errors; returns `[]`). Consumed by the widget-shell `Hero` and `Chat` to resolve `open_as` / `embed_code` for each parsed `[BOOKING: …]` card by URL match. Moved here from `src/components/sage/useSageParameters.ts` in centralization Step E. |
| `useWidgetShell.ts` | `useWidgetShell` | The jefflougheed widget-shell presentation store — a headless module-level Zustand singleton (no JSX) owning **shell** state only: `isExpanded`, `expand(mode?)`, `collapse`, `mode`, `setMode`, `composerRef`, `setComposerRef`. Conversation state (messages/sessionId/streaming/error/mode) lives in the shared session (`useChatSession`, instanceKey `"sage"`) — NOT here. Being a module singleton is load-bearing: the overlay (`Chat`), the inline `Hero` composer, and `SectionProcess` read/write the same object, so opening the overlay from one surface is seen by the others. `expand('question')` sets `isExpanded` + `mode` together — the pairing Chat's mode-bridge depends on. Extracted from `src/lib/store.ts` (`useSageStore`) in centralization Step E; the conversation slice had already migrated to `useChatSession`, and five callerless fields (`visitorName`/`setVisitorName`, `hasGreeted`/`setGreeted`, `focusComposer`) plus the callerless `reset()` were dropped. Unit-tested in `useWidgetShell.test.ts`. |
| `useChatTurn.ts` | `useChatTurn` | Store-agnostic turn engine (`'use client'`). Takes injected `ChatEngineAccessors` (`getMessages` / `addMessage` / `updateLastMessage` / `patchMessageById` / `removeMessageById` / `truncateAfter` / `setStreaming` / `setSessionId` / `getSessionId` / `getMode?`) and owns one turn end-to-end: append user message → lazily create a session (`POST /api/sessions`) → stream from `/api/sage` (via the shared `readDataStream`) → persist the transcript (`PATCH /api/sessions/[id]`, `visitorName: null`). Returns `{ send, sendHidden, retry, stop, regenerate, setActiveVersion, editMessage, resendMessage, isStreaming, errorType }`. `errorType` classifies why the most recent turn didn't complete normally (`ChatErrorType`: `network` / `rate_limited` / `stream_interrupted` / `auth_error` / `unknown` / `user_stopped` — the 6 this hook's own classifier can produce; `services/chat/ui/v1/types.ts`'s union also has 3 more, `account_required` / `server_error` / `invalid_response`, added 2026-08-06 for the memory-bookmark create path below and never produced here or persisted to `chat_sessions.last_error_type`) — `null` when it succeeded. On a failure the hook tags the failed message (the user message for `send`/`retry`/`editMessage`/`resendMessage`, the assistant placeholder for `sendHidden`/`regenerate`) with `UIMessage.error_type` and PATCHes `/api/sessions/[id]` with `last_error_type`, so both the per-message and per-session classification reach the DB (previously the PATCH never fired on a failed turn). `user_stopped` (2026-07-28) goes through the identical classify → banner → persist path when the visitor hits Stop, rather than a special-cased silent branch — see "Stop / interrupted-turn protocol" below. Each surface's error banner renders the matching string from `components/chat/errorCopy.ts`. `editMessage(messageId, text)` / `resendMessage(messageId)` (added 2026-07-27) truncate the transcript forward from a visitor message (via `truncateAfter`) and re-deliver it — `editMessage` also replaces its content and sets `UIMessage.edited`; both share the `truncateAndRedeliver` internal, hard-cancel any in-flight turn synchronously before mutating (sequencing rule: a stream token arriving after truncation must never write into a message that no longer exists), and fire a fire-and-forget `DELETE /api/sessions/[id]/feedback?fromIndex=N` for every index the truncation drops (`services/crm/feedback.ts` `deleteFeedbackFrom`) so a new reply can never silently inherit a rating that belonged to different, now-discarded content. Rendered by `components/chat/UserMessageActions.tsx` (Edit/Copy/Send again row) + `components/chat/EditableUserBubble.tsx` (the in-place editing textarea), wired into `components/shells/membership/MessageList.tsx`. jefflougheed (via `ChatSessionProvider`/`useChatSession`, `instanceKey="sage"`) and Heirloom (`useReducer` via `ChatProvider`) both consume it by wrapping their store in `ChatEngineAccessors`. |
| `useMemories.ts` | `useMemories` | Headless `'use client'` data hook (no JSX) for the Heirloom memory bookmark/card — fetch-on-mount, keyed by the anchor message's stable `UIMessage.id` (not array position, to avoid the index-drift class of bug `useMessageFeedback` guards against on edit/truncate). Returns `{ memories, getByAnchor, isPending, getPendingKind, hasError, getErrorType, hasOpenDraft, isLoaded, create, keep, discard, rename, reviseBlocks }`. `reviseBlocks(memoryId, blocks)` (Memory Canvas V1, 2026-08-08) PATCHes `action: 'revise_blocks'` and — unlike `rename()`, which trusts the argument it was given since `title` is a field the client fully controls — parses the response and merges the server's own `body_blocks`/`body` into local state, since `body` is derived server-side from `blocks` (`reviseMemoryBlocks`, `services/crm/memories.ts`); echoing the client's own argument here was a real bug found in review (fixed same day) that left `body` stale after every block edit. `hasOpenDraft(anchorId)` and `keepDisabled` (the manual bookmark's suppression flag, computed in `components/shells/membership/MessageList.tsx`) are **per-anchor** (fixed 2026-08-06, PR #288) — previously a single whole-session boolean, so one open draft anywhere disabled every bookmark in the transcript, including retries of a failed one (the exact regression `Design Handovers/heirloom_chat_handoffV2_2026_July 28/memories/README.md` §6 rule #3 warned against); now `hasOpenDraft(X)` is true only while anchor `X` itself has an open draft, so a stale draft on one message never blocks another's bookmark or its own retry. `create(anchorMessageId, sourceKind)` POSTs `/api/sessions/[id]/memories`; on failure it classifies the response via a module-local `classifyCreateFailure(res, data)` into a `ChatErrorType` (status `401` → `account_required`, `5xx` → `server_error`, any other non-ok → `unknown`, a `2xx` with a missing/malformed `memory` field → `invalid_response`; a thrown `fetch()` → `network`) and stores it per-anchor via `getErrorType(anchorId)` (also added 2026-08-06 — previously `erroredAnchors` was a plain per-anchor boolean with one hardcoded error message regardless of cause). `components/shells/membership/memory/MemoryCard.tsx`'s `MemoryErrorLine` renders `ERROR_COPY[errorType]` (`components/chat/errorCopy.ts`, same shared vocabulary `useChatTurn.ts`'s own error banner uses above) with a "Try again" button that re-invokes `create()` for that exact anchor — which only behaves correctly now that `hasOpenDraft`/`keepDisabled` are per-anchor, since a session-wide suppression flag would have kept the retry disabled regardless. No model call anywhere in this hook or in `services/crm/memories.ts` — `create()` is a verbatim write; see `System Docs/Utilities/CRM.md`'s `memories.ts` row for the server side (`user_id` resolution, the 401 rejection, and audit logging). |
| `bufferMarkdown.ts` | `bufferMarkdown` | Pure, no-React function that truncates a streaming assistant message at the earliest unresolved inline markdown token (unterminated bold/italic run, inline code span, code fence, or link/image bracket — including an in-progress `[BOOKING: …` marker, since an unclosed marker bracket is just an unclosed `[`). Plain prose with no markdown syntax always passes through unchanged; emphasis delimiters gate on CommonMark's flanking rule (opener must not be followed by whitespace) so a `* bullet` list marker is never misread as an opening `*`. Unit-tested in `bufferMarkdown.test.ts`. |
| `useBufferedMarkdown.ts` | `useBufferedMarkdown` | Thin `'use client'` `useMemo` wrapper over `bufferMarkdown` — `(content, active) => string`. Returns `content` unchanged once `active` is false (the message is no longer the one being streamed into). Consumed by `ChatThread.tsx`'s internal `BufferedMarkdown` component, not called directly by either chat surface. |
| `index.ts` | barrel | Re-exports the type contracts + the registry runtime (`createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER`, `EMAIL_MARKER`, `PHONE_MARKER`, `ACCOUNT_CREATE_MARKER`). `useChatTurn` and `useBufferedMarkdown` are imported directly from their modules, not the surface. |

#### Media-item delivery tracking (`chatStore.tsx`, 2026-08-04/05)

`getMediaItems` / `markMediaItemsDelivered` (`ChatEngineAccessors`, both
optional) are the accessors `useChatTurn.ts` calls to build and confirm the
`media_items` sent to `/api/sage` on each turn. Only Heirloom's
`ChatProvider` (`components/shells/membership/chatStore.tsx`) implements
them — jefflougheed passes neither, so its sessions never carry media
context. The concrete state lives in two refs on `ChatProvider`; four real
bugs found and fixed across PRs #269–#272 (2026-08-04/05) shaped the current
shape — see `System Docs/Known Gaps.md`'s resolved entry for the full
incident.

- **`mediaItemsRef`** (`ClientMediaItem[]`) is the actual source of truth
  `getMediaItems()` reads — not the `mediaItems` `useState` (which exists
  only so the UI re-renders on updates). `addMediaItem()` writes both the
  ref and the state synchronously in the same call, computed off the ref's
  current value rather than a `setState` functional updater (#269 fix): a
  just-uploaded attachment is followed by `send()` in the same synchronous
  call stack with no `await` in between once a session already exists, so a
  render-only mirror would still read the *previous* render's array —
  silently dropping the attachment from that turn's request.
- **`deliveredTerminalIdsRef`** (`Set<string>`) tracks which ids have
  already had their `ready`/`failed` state included in a *genuinely
  successful* request. `getMediaItems()` filters `mediaItemsRef.current` to
  items still pending/processing (always included, every turn, until they
  resolve, so the guide can pick up a completion no matter how many turns
  processing takes) plus ready/failed items not yet in this set. Without
  it, every attachment ever made in a session gets resent forever, and
  `resolveMediaContext()` re-resolves and re-injects its `derived_content`
  into the system prompt on every later turn — unbounded growth as a
  conversation accumulates attachments (#270 fix).
- **`getMediaItems()` is a pure read — it does not mutate
  `deliveredTerminalIdsRef` itself.** Marking happens only in
  `markMediaItemsDelivered(mediaItemIds)`, called by `useChatTurn.ts` from
  exactly four points, all on the true-success path only (never on abort or
  a classified failure): `send()`, `retry()`, `regenerate()`, and
  `truncateAndRedeliver()` (the shared implementation behind both
  `editMessage()` and `resendMessage()`). Before this split (#271 fix),
  marking happened at request-*build* time inside `getMediaItems()` itself
  — a request that then failed outright (network error, no `Retry`) still
  left the item marked delivered, so if the member sent a brand-new message
  instead of retrying, the guide never actually saw the terminal state and
  it was never offered again.
- **Both refs reset on a genuine conversation switch, not on every
  hydrate.** `hydrateConversation()` — the single choke point `loadSession()`
  and the cross-device DB-recovery effect both go through — clears
  `mediaItemsRef` / `deliveredTerminalIdsRef` / `mediaItems` only when the
  incoming `sessionId` differs from `prevSessionIdRef`'s prior value;
  `newChat()` (which calls the core's `reset()` directly, bypassing
  `hydrateConversation`) carries the identical reset inline. The conditional
  check matters: `hydrateConversation` is also used by
  `injectAssistantMessage()` to append a message to the *current* session
  with an *unchanged* `sessionId`, and resetting unconditionally would wipe
  a still-active conversation's own media items every time that fires.
  Without this reset at all (#272 fix), switching conversations without a
  full page reload left a prior conversation's attachment ids in the ref,
  which `getMediaItems()` would then resend on the new conversation's next
  turn — a real cross-conversation data leak (personal photos/documents
  resolved into the wrong system prompt), not just wasted tokens.
- **`dueStatusSnapshotRef` (`Map<string, MediaItemStatus>`) — added
  2026-08-06 to fix a delivery-marking race the #269–#272/#275 fixes above
  didn't close.** `resolveMediaContext` (`services/chat/server/index.ts`)
  freezes an item's status into that turn's system prompt at *request-build*
  time, well before any streaming happens. `markMediaItemsDelivered` used to
  record a *live* read of `mediaItemsRef.current`, taken only after the
  assistant's reply finished streaming — often several seconds later. If an
  item flipped `pending` → `ready` in that gap (plausible for any turn whose
  reply takes a few seconds, more so with several attachments in flight), the
  old code marked it "delivered as ready" even though the reply the member
  actually received was generated from the *older*, still-processing
  snapshot — permanently excluding the item from ever resurfacing, so the
  guide never got a chance to actually confirm it. Fixed by having
  `getMediaItems()` snapshot each due item's status into this ref at the
  exact moment it's read, and having `markMediaItemsDelivered()` key off
  *that* snapshot (consuming/deleting the entry) instead of a fresh re-read.
  Reset alongside the other two refs in `hydrateConversation()`/`newChat()`.
- **The pending-item poll effect (below "Media items — Realtime
  subscription + catch-up hydration") was silently dying after one empty
  check — fixed 2026-08-06.** It used to reschedule itself only via its
  `mediaItems` dependency changing, and its own fetch callback only called
  `setMediaItems` (the sole thing that re-armed the effect) when a given
  3-second round found at least one newly-terminal item. Real processing
  routinely takes longer than 3 seconds, so the very first round often found
  nothing — and the effect then never rescheduled, ever, until something
  unrelated changed `mediaItems`. This was the only client-side mechanism
  that updates status without a new message, so when it died, the client
  stayed stuck believing an item was still processing long after the DB said
  otherwise. Fixed by making the scheduling self-sustaining: a local `poll()`
  reschedules itself from inside its own `.then()`/`.catch()` continuation
  based on whether `mediaItemsRef.current` still has a pending/processing
  item — checked fresh each round — independent of whether that particular
  round's fetch found anything new. Still stops for real once nothing is
  pending/processing; still restarts on a genuinely new attachment via the
  unchanged `mediaItems` dependency.
- **The dedup duplicate-reuse path was resetting an already-`ready` item back
  to `pending` client-side — fixed 2026-08-06.** `ChatInput.tsx` hardcoded
  `status: 'pending'` on every `addMediaItem()` call, including when
  `/api/media/upload-url`'s dedup match (#280) reused an item that was
  already `ready` (or `processing`) — `mergeMediaItem`'s incoming-always-wins
  merge then flipped it back to `pending` in `mediaItemsRef`, re-arming the
  delivery-marking race above for something that had already succeeded
  cleanly. Fixed by having the route report the reused item's real status
  (`existing.status`, or `'pending'` for the reprocessed-failed case) and
  threading it through `useMediaUpload.ts`'s `UploadResult.status` into
  `ChatInput.tsx`'s `addMediaItem()` call, instead of assuming every result
  means "brand new."
- **An item attached before its session existed had a permanently-null
  `chat_id`, stranding it outside every status mechanism — fixed 2026-08-06,
  PR #291.** `ChatInput.tsx`'s `handleSend` uploads attachments *before*
  calling `sendMessage()`, and `sendMessage()` (`useChatTurn.ts`'s `send()`)
  is what lazily creates the session — so an attachment on a brand-new
  conversation's first message always reaches `/api/media/upload-url` while
  `state.sessionId` is still null, and its `media_items` row is created with
  `chat_id: null`. Every status mechanism above — Realtime's channel filter,
  the catch-up fetch, and the poll — filters by `chat_id`, so a still-null
  row could never be found again by any of them, ever (not even a page
  reload, which hits the same dead filter): confirmed live via a direct DB
  query, a permanently stuck "Processing…" badge despite the server having
  already finished. Fixed by having `send()` include the pending
  `mediaItemIds` in the `POST /api/sessions` body when it has to create a new
  session, and `app/api/sessions/route.ts` backfills `chat_id` on those rows
  server-side in that same request (`backfillMediaChatId`,
  `services/media/index.ts`) — see `System Docs/API Routes.md`'s `/api/sessions`
  row and `System Docs/Utilities/Audit.md`'s `MEDIA_CHAT_ID_BACKFILLED` /
  `MEDIA_CHAT_ID_BACKFILL_FAILED` entry for the full mechanics. Note this is a
  distinct bug from the six above — none of #269–#286's fixes touch when or
  how `chat_id` itself gets set, only how the client tracks/resends status
  once a `chat_id` already exists.

#### Optimistic-send echo (`pendingEcho`, `chatStore.tsx`, 2026-08-06, PR #293)

Closes a separate gap from the delivery-tracking work above: with an
attachment on the message, `ChatInput.tsx`'s `handleSend` doesn't call
`sendMessage()` (and therefore `useChatTurn`'s `send()` doesn't add the real
message to `messages`) until `Promise.all(pendingAttachments.map(upload))`
resolves — the full upload round trip (client-side SHA-256 hash,
`POST /api/media/upload-url`, `PUT` the file body to Storage). Until then
there is no message for `UploadThumbnail` to mount inside at all, which read
as a real gap between hitting Send and anything rendering (confirmed live,
not a guess).

`pendingEcho` (`ChatState`, exported type `PendingEcho`) is a purely visual,
ephemeral placeholder for exactly that window — `{ text, attachments: {
filename, previewUrl?, type, width?, height? }[] }` (`width`/`height` added
2026-08-07, PR #298 — the image-aspect-ratio fix; see
`System Docs/Public Site.md`'s `UploadThumbnail` row). It never has an id and never touches
`mediaItems`; it is swapped for the real message, not reconciled with it. Set
in `ChatInput.tsx`'s `handleSend`, in the attachment branch only (a text-only
send already calls `sendMessage` with no `await` in front of it, so it
already appeared instantly — no echo needed there), right before the upload
round trip starts, using each attachment's already-live pick-time preview
blob URL (`att.previewUrl`, from `addFiles` — no longer revoked immediately
on Send; the revoke is deferred until the echo clears, since the echo needs
it for its full lifetime). Cleared on the line immediately after
`sendMessage(...)` is called — `useChatTurn.ts`'s `send()` adds the real
message synchronously (`accessors.addMessage`) before its first `await`, so
by the time control returns to `handleSend`'s next line the real message
already exists; clearing the echo there means the swap happens in the same
tick, with no visible gap or flash. Rendered by
`components/shells/membership/MessageList.tsx`'s own
`PendingEchoAttachment`/`PendingEchoBubble` — standalone components sharing
`UploadThumbnail`'s container classes and shimmer treatment, not built by
reusing `UploadThumbnail.tsx` itself (kept untouched by this change). As of
2026-08-07 (PR #298), `PendingEchoAttachment` also duplicates
`UploadThumbnail`'s `thumbnailBoxSize()` box-sizing math (from the new
`width`/`height` fields above) so the echo renders the same real-aspect-ratio
box the real thumbnail will swap into — same duplicated-not-shared
convention, so this file's own no-shared-code note above still holds.
`PendingEchoAttachment` has no `status` concept and never reaches `ready` (it
is always torn down before that could apply — see the swap-timing paragraph
above), so it has no equivalent of `UploadThumbnail`'s ready-checkmark badge
(PR #299).

`ChatState.hasStarted` is widened to `messages.length > 0 || pendingEcho !==
null` (was `messages.length > 0` alone) so the very first message of a
brand-new conversation — the exact case the `chat_id` backfill fix above
exists for — still mounts `MessageList` (where the echo renders) instead of
`ChatHero.tsx`'s empty-state greeting while the echo needs to be visible.

**No interaction with the `chat_id` backfill fix above, by design — not
assumed.** An architecture that made the *real* message/media-item entity
appear optimistically (a client-side temp id, reconciled to the real id once
the upload resolves) was considered and rejected specifically because it
would have reintroduced the bug the backfill fix closed: `send()`'s
synchronous `getMediaItems()` read (used to build `POST /api/sessions`'s
`pendingMediaItemIds`) would then run before the real id existed, so the
one-shot backfill call would have nothing real to backfill against.
`pendingEcho` avoids this entirely by leaving the real upload → `addMediaItem`
→ `sendMessage` timing completely untouched — same `Promise.all(uploads)`
gate as before this change, so `getMediaItems()`, the backfill payload, and
Sage's same-turn media context are all byte-identical to pre-`pendingEcho`
behavior.

Regression coverage: `components/shells/membership/optimistic-echo.test.tsx`
— echo appears synchronously with the real local preview before the mocked
upload resolves, is replaced by the real message with no duplicate once it
settles, a text-only send never produces an echo, and the `chat_id` backfill
payload is unchanged by the echo's presence.

#### Stop / interrupted-turn protocol (2026-07-28)

When the visitor hits Stop, whatever text had already streamed in — including
none at all — is **always kept** in that assistant message's own `content`
and tagged `UIMessage.stopped = true` (`useChatTurn.ts`'s `finishAbortedTurn`).
This is what renders the "Stopped" badge in the transcript
(`MessageActions.tsx`, `SessionDrawer.tsx`) and is what's persisted to
`chat_sessions.messages`. **One path regardless of timing (2026-07-28):**
`finishAbortedTurn` previously branched on `content === ''` — an empty
placeholder was deleted outright rather than tagged, so a Stop hit before the
first token arrived left **zero trace** of the turn ever having been
attempted: no error, no badge, no `last_error_type`, nothing in
`chat_sessions.messages` beyond the visitor's own message. That branch is
removed; every Stop, at any point in the stream, now goes through the
identical `stopped: true` + `error_type: 'user_stopped'` tagging.

**`'user_stopped'` is the 6th, and last, `ChatErrorType` this hook's own
classifier ever produces** (`services/chat/ui/v1/types.ts`
— alongside `network` / `rate_limited` / `stream_interrupted` / `auth_error` /
`unknown`), with its own `errorCopy.ts` entry ("You stopped the response.").
The union itself has 3 further members (`account_required` / `server_error` /
`invalid_response`, added 2026-08-06) that `useMemories.ts` produces for the
memory-bookmark create path below — this hook never throws them, and they
never reach `chat_sessions.last_error_type`.
It is not a failure — the visitor deliberately cancelled — but it's modeled
as a class in the same system rather than a special-cased silent branch, so a
Stop gets the exact same treatment every other non-completion gets: `send()`/
`sendHidden()`/`retry()` call `setErrorType('user_stopped')` and
`persist(..., 'user_stopped')` on abort (previously these calls were skipped
entirely for Stop, which is how it stayed silent), writing
`chat_sessions.last_error_type = 'user_stopped'` through the same
`updateSession` path as the other 5. `regenerate()`'s abort handling is a
separate implementation (doesn't call `finishAbortedTurn`) that already
restores the prior good version when nothing new streamed rather than losing
data — that content-preservation logic is intentionally unchanged; only the
banner/persist calls were added there for consistency. The user message's
delivery `status` stays `'sent'` on every Stop path — cancelling generation
was never a delivery failure, so that part is untouched.

**What changed:** how that partial text is resent to the model on the
*next* turn. Claude 4.5 tolerated a truncated assistant turn being replayed
verbatim as if it were a complete reply. **Sonnet 4.6+ (the model this
codebase runs on) does not** — replaying a `stopped` assistant message as a
normal history turn gives the model no signal its own prior reply was cut
short, so it "continues" as though it had already finished speaking, which
produces worse continuations than telling it explicitly. The fix is
`toModelMessages()` (`services/chat/ui/v1/message.ts`): when building the
wire-format `ChatMessage[]` sent to `/api/sage`, a `stopped: true` assistant
turn's **role slot stays in the array** — its content is swapped for a short
neutral `STOPPED_PLACEHOLDER` rather than the visitor's own cut-off words —
and the verbatim partial text is folded into the *next user* turn as a
`[SYSTEM: ...]`-tagged continuation note instead (reusing the codebase's
existing hidden-system-content convention — see `dispatchSystemSignal` in
`chatStore.tsx`).

**Correctness fix (2026-07-28):** an earlier version of this function
*dropped* the stopped assistant turn from the array entirely instead of
keeping its role slot. That broke strict user/assistant role alternation,
which the Anthropic Messages API requires: the message that prompted the
now-stopped reply stayed in the array as its own `user` entry, and with the
assistant turn removed, the very next entry was the fold — also `role:
'user'` — producing two consecutive `user` entries with no `assistant`
between them. Every send following a stop-with-content would have sent
malformed history to Anthropic. Caught during review, not in production;
fixed by keeping the placeholder instead of dropping the turn.
`message.test.ts` has an explicit invariant test (`toModelMessages` >
"never produces two consecutive same-role entries") covering this going
forward.

This is a **wire-only transform** — `send()`/`sendHidden()`/`regenerate()`
call `toModelMessages()` only when building the array passed to
`streamTurn()`/`/api/sage`; the message actually added to the store
(`accessors.addMessage`) and persisted (`persist()` reads
`accessors.getMessages()`, never the model-facing array) is untouched. The
`[SYSTEM: ...]` tag therefore never reaches `chat_sessions.messages` and
never renders in any transcript view (widget shell, Heirloom `MessageList`,
admin `SessionDrawer`) — the existing `[SYSTEM:]` admin-debug branch in
`MessageList.tsx` only inspects stored messages, which this content never
becomes. The one residual risk this doesn't eliminate: the model could in
principle quote the note back verbatim in its reply; the note explicitly
instructs it not to as a mitigation, but this is a prompt-following
expectation, not a code-level guarantee.

`reviveUIMessage()` (`message.ts`) was fixed in the same pass to carry
`stopped`/`versions`/`versionIdx`/`status` through on read-back — it
previously dropped all four, so the "Stopped" badge and this continuation
logic (which keys off `stopped`) both silently broke after a page reload or
in the admin transcript view even though the DB row had the data.

On a genuine stream **error** (not Stop), the existing behavior is already
correct and was not changed: the partial text is wiped to `''` before
persisting, and `retry()` resends the pre-failure context — nothing more.

**Server-side abort propagation.** Stop previously only cancelled the
client's own `fetch` — the server had no `AbortSignal` at all, so the
Anthropic call kept generating to completion after the visitor had stopped
listening, billing for the full generation and still running `onFinish`
(token accounting + `[NAME:]`/`[EMAIL:]`/`[PHONE:]` marker detection, calendar-
offer detection) against text the visitor explicitly cut off and never
confirmed.

**First attempt (2026-07-28, since replaced): threading `Request.signal`
through.** The initial fix threaded the inbound `Request.signal`
(`app/api/sage/route.ts`) through `streamChat()` into `runChatStream()`'s
`abortSignal` (`services/chat/server/stream.ts`), which passes straight into
`streamText()`'s own `abortSignal` — verified against the installed
`ai@3.4.33` source that the AI SDK forwards it to the provider's `doStream()`
call, correctly cancelling the upstream request and correctly preventing
`onFinish` from firing on an aborted stream. This was sound in principle, but
**live-tested and confirmed broken on this deployment**: the client correctly
recorded every Stop (`chat_sessions.last_error_type = 'user_stopped'`
populated as expected), but `server_abort_confirmed_at` stayed null after a
real mid-stream Stop — the server kept generating the full response
regardless. Root cause, as far as it can be determined from code:
`middleware.ts` runs on every `/api/sage` request (its matcher includes
`/(api|trpc)(.*)`) and reconstructs the request via Next.js's internal
header-forwarding mechanism (`x-middleware-override-headers`, confirmed in
the installed `next` package's source) rather than passing a live object
through — a `Headers` object is just strings, structurally incapable of
carrying a live `AbortSignal` reference across that hop. Whatever `req.signal`
the route handler ends up with is tied to a separate internal edge→function
request, not reliably to the original browser connection. This is plausible,
not certain — confirming it definitively would need Vercel-internal
visibility neither Jeff nor Claude Code has from this environment — but it
matches the observed behavior exactly, and it's why the fix stopped depending
on `Request.signal` at all rather than trying to patch around it.

**Current mechanism: explicit client-driven signal, server-side poll.**
Since connection-level disconnect detection can't be trusted here, the client
tells the server explicitly instead — an ordinary new HTTP request, which
doesn't have the cross-hop reliability problem a connection-state signal
does. `useChatTurn.ts`'s `stop()` now fires an immediate
`PATCH /api/sessions/[id]` with `{ stop_requested: true }` the instant Stop is
clicked (alongside its existing `abortControllerRef.current?.abort()`, which
only cancels the client's own fetch and was never the part that was broken).
`updateSession` (`services/crm/sessions.ts`) stamps
`chat_sessions.stop_requested_at` using the *server's* clock — never a
client-supplied timestamp, to avoid clock skew between the client and
whichever server instance later polls it.

`streamChat()` (`services/chat/server/index.ts`) captures `turnStartedAt` at
the top of the function and builds its own `AbortController` via
`createServerAbortController`, which can be triggered by either of two
independent paths:
1. **The poll (reliable, load-bearing):** a `setInterval` every 500ms reads
   `stop_requested_at` for this session and aborts if it's set *and newer
   than `turnStartedAt`* — comparing against the turn's own start time,
   rather than requiring a reset write between turns, is what stops a stale
   flag left over from an earlier stopped turn from false-triggering a later,
   unrelated one.
2. **`req.signal` (best-effort, not load-bearing):** kept wired as a zero-cost
   bonus — if this deployment's request pipeline ever does propagate a real
   disconnect onto it, it aborts immediately instead of waiting for the next
   poll tick. Confirmed not to be what's actually catching Stops today.

Whichever path fires first stops the other (the poll included, so it doesn't
keep querying after the turn is already cancelled) and writes
`chat_sessions.server_abort_confirmed_at` — unchanged from the original
design, just now fed by a mechanism proven to actually fire. `runChatStream`'s
catch block still distinguishes an `AbortError` (quiet `499`) from a genuine
upstream failure (`502`).

**Accepted trade-offs:** worst case ~500ms of continued generation after
Stop is clicked (bounded by the poll interval, a large improvement over
running to full completion, but not instant), plus roughly one extra
lightweight DB read per 500ms of generation time per in-flight turn. Both
are the direct cost of not being able to trust the platform's own connection
state — tighten the interval if faster cutoff is worth more polling reads.

**Still open:** this design hasn't yet been retested live. The mechanism is
built specifically to not depend on the thing that was confirmed broken, but
"should work now" and "confirmed working" are different claims — the same
DB check applies (click Stop mid-reply, query `server_abort_confirmed_at` for
that session afterward) and needs to actually happen before this is proven.

**`components/chat/ChatThread.tsx`** — the shared message-list presentation component consumed by both the jefflougheed widget shell (`WidgetShell.tsx`) and the Heirloom membership shell (`MessageList.tsx`). Owns: the message loop + per-assistant-message marker parsing (`createDefaultRegistry().parse`), scroll-to-bottom behavior (see the per-surface `scrollGuard` props documented in `System Docs/Public Site.md`), and — as of the shared markdown renderer — markdown rendering itself. Each caller supplies render "slots" (`renderUserMessage`, `renderAssistantMessage`, `renderError`, `renderStreamingIndicator`) plus a `markdownComponents` (react-markdown `Components`) map for its own styling; `ChatThread` calls `registry.parse(msg.content)` for every assistant message, buffers the resulting prose through `useBufferedMarkdown` (only for the last message while `isStreaming` — every earlier, settled message renders in full), renders it via an internal `BufferedMarkdown` sub-component (`<ReactMarkdown components={markdownComponents}>`), and passes the rendered node to `renderAssistantMessage(msg, parsed, markdown)` as a third argument. `BufferedMarkdown` is a real component (not a bare hook call inside `.map`) so `useBufferedMarkdown`'s `useMemo` call stays legal under the Rules of Hooks. The widget's `SageReply.tsx` renders the passed-through `markdown` node inside its existing wrapper div (no longer calls `ReactMarkdown` itself; `sage/markdownComponents.tsx` is unchanged). Membership's `MessageList.tsx` renders it via a new `AssistantMarkdownBubble` (same avatar/bubble chrome as `MessageBubble`, markdown owns its own block spacing) using the new `components/shells/membership/markdownComponents.tsx` — Heirloom's first markdown-rendering surface (warm-prose styling on the existing Heirloom Tailwind tokens: `text-primary`/`text-muted`/`accent`/`surface`/`border`; no table/strikethrough overrides — not needed, and inert without `remark-gfm`). Smoke-tested in `ChatThread.test.tsx`. `renderError: (retry, errorType) => ReactNode` receives the classified `ChatErrorType` (`errorType` prop, `null` when the last turn succeeded) alongside `retry`; both surfaces' implementations render the matching string from `components/chat/errorCopy.ts`'s `ERROR_COPY` map rather than one generic message.

**`core/` — session + keyboard infrastructure**

| File | Exports | Purpose |
|------|---------|---------|
| `core/store.ts` | `createChatSessionStore`, `ChatSessionStore`, `ChatSessionState`, `HydrateInput` | Pure, framework-agnostic conversation store backed by `zustand/vanilla`. Holds `messages`, `sessionId`, `isStreaming`, `errorType`, `mode`. No shell/presentation state. |
| `core/store-registry.ts` | `getSingletonStore`, `hasSingletonStore`, `__resetSingletonStore`, `__clearSingletonRegistry` | Module-level singleton registry (client-only). Same `instanceKey` in → same store out. Throws on the server. |
| `core/useChatSession.ts` | `useChatSession`, `ChatSession`, `ChatSessionConfig` | Core hook: resolves the backing store (singleton if `instanceKey` provided, otherwise ref-local isolated), builds `ChatEngineAccessors` (including `truncateAfter`, added 2026-07-27), calls `useChatTurn` once, exposes `send` / `sendHidden` / `retry` / `stop` / `regenerate` / `setActiveVersion` / `editMessage` / `resendMessage` / `setMode` / `hydrate` / `reset` plus the full `ChatSession` state. One provider → one engine. |
| `core/ChatSessionProvider.tsx` | `ChatSessionProvider`, `useChatSessionContext` | React context wrapper. `ChatSessionProvider` calls `useChatSession` once; surfaces call `useChatSessionContext()`. Throws outside a provider. |
| `core/useKeyboardViewport.ts` | `useKeyboardViewport`, `UseKeyboardViewportOptions`, `UseKeyboardViewportReturn`, `KeyboardViewportMeasurement`, `KeyboardViewportState` | Shared iOS visual-viewport hook for both chat shells. Listens to `visualViewport` resize/scroll events; returns `{ height, offsetTop, keyboardOpen, sync }`. Optional `lockBodyScroll` (freezes `document.body` while active, restores scroll position on deactivate), `trackViewport: false` (scroll-lock only, no VV listeners — used by the Chat overlay), and `onViewportChange` callback for reflow-free CSS-var writes without a React re-render. SSR-safe; no-ops on browsers without the VisualViewport API and when `active: false`. See `Design Handovers/chat-shells.md` §3 for per-surface wiring details. |
