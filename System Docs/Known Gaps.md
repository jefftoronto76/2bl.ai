# Known Gaps

## Known Gaps

Tracked, not yet addressed. See `System Docs/ARCHITECTURE_OVERVIEW.md` and
`Backlog/SERVICEMIGRATION.md` for the full picture.

- **RLS security posture — application-layer enforcement only, not yet
  database-layer (moved here from CLAUDE.md's "Highest Data Security"
  principle, 2026-08-04 split).** Tenant isolation is enforced today via
  application code: every query is scoped by tenant_id resolved from the
  authenticated session (`getAuthContext()`), a pattern applied consistently
  across all 118 files using the service-role client. Row Level Security is
  enabled on all 32 tables, but only 3 have real policies (confirmed via live
  query 2026-08-04), and the service-role key used for nearly all server-side
  data access bypasses RLS by default (standard Postgres/Supabase behavior).
  This means RLS is not currently providing defense-in-depth — a single
  missed tenant_id filter in application code would not be caught by the
  database. RLS policies are Studio-managed and not tracked in git, so this
  figure should be periodically re-verified against a live query rather than
  assumed permanent. **Plan to close the gap:** add real RLS policies (scoped
  via JWT claims, same pattern already used on `audit_events`/`auth_events` —
  see `System Docs/Database Schema.md`) to tables carrying tenant-scoped PII
  or sensitive data — this is a quick, low-risk addition, but note it only
  protects against anon-key misuse, not the service-role client that carries
  almost all traffic. Closing that larger gap (routing routine tenant-scoped
  reads through a client that respects RLS) is a separate, unscheduled
  architectural project, not a quick fix.
- **Next.js route.ts stray-export incident (2026, moved here from CLAUDE.md's
  "Dependency & API Rules," 2026-08-04 split).** `bbb66e7` exported a helper,
  `withDisplayUrl`, directly from `app/api/media/route.ts` — Next's
  route-type validator rejects any named export from a `route.ts` file that
  isn't an HTTP method handler or a reserved config export, which fails
  `next build` outright (not just a lint warning) but is invisible to
  `tsc --noEmit` alone. This broke `next build` for every commit on `main`
  from PR #244 through PR #245, ~24 hours, before being caught. Fixed by
  extracting the helper to `services/media/display-url.ts`. The standing
  rule this incident backs — route.ts files export only HTTP method handlers,
  verify with a real `next build`, not just `tsc` — stays in CLAUDE.md's
  "Dependency & API Rules."
- **`getSystemPrompt` filters by `status='live'` (2026-07-28) but is still not
  type-aware — single-live-per-type (2026-07-27) constrains Publish but not
  fully the runtime read.** `services/prompt/compiler.ts`'s `getSystemPrompt`
  now scopes its query to `status = 'live'` (closing the original bug where any
  row, live or draft, could be picked purely by highest `version` — see
  `compiler.test.ts`), but it still has **no `prompt_type_id` filtering**. The
  partial unique indexes (`compiled_prompts_single_live_typed_idx` / `_untyped_idx`,
  see `System Docs/Database Schema.md`'s `compiled_prompts` row and
  `System Docs/Utilities/Prompt.md`'s `compile.ts` row) guarantee at most one
  live row per `(tenant_id, prompt_type_id)` slot, but do nothing to make the
  runtime read pick the *correct* slot once a tenant has more than one live type
  (e.g. a live Base and a live Sales prompt for the same tenant) — whichever has
  the higher `version` number among that tenant's live rows wins, regardless of
  type. This "worked" before only because every tenant happened to have exactly
  one compiled row. Making `getSystemPrompt` filter by the runtime-relevant type
  (Base, or whatever a session's `mode`/context calls for) is separate,
  still-open work — do not treat the `status='live'` fix as having closed this.
- **`/admin/prompt` ("Prompt" in nav) is a redundant legacy screen — Save
  removed 2026-07-27, full disposition still undecided.** This screen
  predates the Blocks/Compile & Publish flow and duplicated what that flow
  now does properly, with none of its gates (no release note, and
  `saveCompiledPrompt`'s `.limit(1)` didn't even scope by `prompt_set_id` —
  an arbitrary `compiled_prompts` row per tenant). Its Save action (button +
  the `POST /api/admin/prompt/save` call) has been removed from
  `PromptEditor.tsx`; the page is now read-only (version, compiled content,
  version history — the textarea and "View" no longer write anywhere). It is
  still mounted and still linked from the admin sidebar nav. `services/prompt/
  save.ts`, `POST /api/admin/prompt/save`, and `POST /api/admin/prompt/check`
  (which only ever gated that Save call) are consequently orphaned — no
  remaining caller — but left in place rather than deleted. **Open decision
  for Jeff:** fully remove this screen (delete the page, nav entry, and the
  three orphaned files/routes above) or repurpose it as something else. Until
  decided, do not delete it or its nav entry as a side effect of unrelated work.

- **`AuditAction.PROMPT_SET_MASTER_SET` is orphaned — no remaining caller,
  same treatment as the `/admin/prompt` orphans above.** The composer-family
  work (July 2026) retired `PUT /api/platform/settings/master-prompt`, the
  only place that ever wrote this action — it used to flip
  `prompt_sets.is_composer_prompt` directly with no compile step, no release
  note, and no real audit trail beyond a bare flag flip. Compile & Publish
  (`services/prompt/compile.ts`) is now the only path that activates a
  composer prompt set, same as it already was for every ordinary tenant set;
  its writes go through `AuditAction.PROMPT_COMPILE`, not this constant. The
  `PROMPT_SET_MASTER_SET` enum value is left in place (`services/audit/types.ts`)
  rather than deleted, in case historical `audit_events` rows reference it.

- **`prompt_sets.is_composer_prompt`'s exclusivity rule changed with no
  `System Docs/DB_CHANGELOG.md` entry recording it — a documentation gap in the changelog
  itself, not just in CLAUDE.md.** The 2026-06-26 changelog entry for this
  column is unambiguous: "Exactly one row across all tenants may have
  `is_composer_prompt = true`" — a hard, unqualified platform-wide singleton,
  backed at the time by `prompt_sets_single_composer_idx`. The July 2026
  composer-family work (`Design Handovers/handoff_composer_prompt_family_july 2026/`)
  evolved this into a status-scoped rule instead — only one *live*
  composer-family row is exclusive; multiple `draft` composer-family rows are
  now allowed to coexist (confirmed in `services/prompt/compile.ts`'s
  comments, which describe the lock as scoped `WHERE is_composer_prompt=true
  AND status='live'`). This is a real behavior change to a constraint the
  changelog had previously documented as absolute, and **no corresponding
  `System Docs/DB_CHANGELOG.md` entry documents the change** — it is recoverable only from
  code comments in `compile.ts`, the `PATCH /api/platform/prompt-sets` route,
  and `components/admin/prompt-studio/promptSet.ts`. Flagging so a
  `System Docs/DB_CHANGELOG.md` entry gets backfilled for this migration, and so nobody
  reads the 2026-06-26 entry at face value and assumes the old hard-singleton
  behavior still holds.

- **`PromptSetCard.tsx` shows the same version number in two separate rows —
  cosmetic duplication left over from the compile-publish version-drift fix
  (2026-08-05, PR #283, branch `08-05-26_fix-compile-publish-discrepancies`).**
  `PromptSetMetaStrip` (in `components/admin/settings/PromptSetCard.tsx`,
  shared by tenant Settings → Prompt Sets and Platform Settings → Tenant
  Prompts) renders both a "Version" row and a "Compiled version" row. Before
  PR #283, "Version" read `prompt_sets.version` — a column that never
  increments after row creation and silently drifts from reality (same dead
  field documented on the `compiled_prompts`/`prompt_sets` rows in
  `System Docs/Database Schema.md`) — labeled, misleadingly,
  "· auto-increments on compile." PR #283 fixed the value to source from
  `compiled_version` instead, so the label is now accurate, but it didn't
  remove the row. Both rows now render the identical number: "Version" and
  "Compiled version" show the same `compiled_version`, with "Compiled
  version" the more complete implementation (it also renders a "· out of
  date" staleness note the "Version" row lacks). **Cleanup:** drop the top
  "Version" row entirely and keep "Compiled version." Not urgent — cosmetic
  duplication only, no functional bug.

- **Heirloom chat-widget V2 is UI-first; its backends do not exist yet.**
  The V2 pass (branch `06-11-26_mvp-ui-update`, 2026-06-12) shipped the
  presentation layer only. Outstanding, in dependency order: a `stories`
  schema (Jeff, Studio — created stories are currently **ephemeral client
  state** in ChatHero, lost on refresh) + story CRUD; per-story collaborator
  invites (member-facing magic-link API — the existing `invites` table is the
  admin-created access gate, not this); conversation search (the sidebar field
  is a visible stub); Uploads; Share Heirloom (sidebar item + ChatHeader icon
  are inert; `ShareHeirloomModal` is landed but unmounted — pass the real
  `heirloom.2bl.ai` URL when mounting, its default is a placeholder); Writing
  Prompts copy review (the 4 static prompts in ChatHero are placeholder-grade).
  The v1 `Sidebar.tsx` is superseded and unmounted — delete after preview
  verification.

  **Per-row kebab actions — resolved for conversations 2026-08-03 (PR #247).**
  `ChatHero.tsx` now passes `onRowAction` to `SidebarV2` on both desktop and
  mobile, so kebab menus render for both conversation and story rows.
  Conversation `star` / `rename` / `delete` are fully wired to real endpoints
  (`PATCH` / `DELETE /api/sessions/[id]`) with optimistic updates and
  revert-on-failure. Still not built: story rows remain backend-less (delete
  only mutates the ephemeral local `stories` state — no network call, since
  there's still no `stories` table), and `moveToChapter` / `removeFromChapter`
  / `invite` remain deliberate no-ops for both row types.

- **Media-item state machine (`chatStore.tsx`) — four real bugs found and
  fixed 2026-08-04/05 (PRs #269–#272).** Original symptom: the Heirloom guide
  claimed it couldn't see uploaded photos/files, despite the compiled system
  prompt already having correct instructions for `ATTACHED MEDIA` /
  `ATTACHMENT IN PROGRESS` / `ATTACHMENT FAILED`. Root-caused to four
  distinct, independent bugs, not one:
  1. **#269 — stale ref.** `mediaItemsRef` only updated on React re-render;
     `send()` has no `await` between an upload completing and reading it
     once a session already exists, so a just-attached item was missing
     from that turn's `media_items` entirely. Fixed by writing the ref
     synchronously in `addMediaItem()`.
  2. **#270 — unbounded resend.** `getMediaItems()` re-sent every attachment
     ever made in a session on every subsequent turn, so
     `resolveMediaContext()` re-resolved and re-injected every prior
     attachment's `derived_content` into the system prompt forever. Fixed
     with `deliveredTerminalIdsRef` tracking which items have already
     reached a terminal state and been surfaced once.
  3. **#271 — delivery marked too early.** That marking happened at
     request-build time, not on confirmed success — a request that then
     failed outright still marked the item delivered, silently losing it.
     Fixed by splitting `getMediaItems()` (pure read) from
     `markMediaItemsDelivered()` (called by `useChatTurn.ts` only on
     genuine success).
  4. **#272 — cross-conversation leak.** Neither `newChat()` nor
     `loadSession()`/`hydrateConversation()` ever reset the two refs, so
     switching conversations without a full page reload leaked one
     conversation's attachment context into a different one's system
     prompt — a real privacy issue (personal photos/documents), not just
     wasted tokens. Fixed with a conditional reset keyed on the session id
     actually changing.

  All four are merged to `main`. See `System Docs/Utilities/Chat UI.md`'s
  "Media-item delivery tracking" section for the current, post-fix
  mechanics. A related but separate test-isolation issue (fake-indexeddb
  state leaking across tests within a file, surfaced while writing the
  regression tests for these fixes) was also found and fixed in the same
  window (PR #273) — that one is test infrastructure, not a product bug.

- **Media pipeline broader sweep — six items found and fixed 2026-08-05
  (PRs #275–#280).** Follow-up investigation after the #269–#272 saga
  above, scoped to the rest of the media pipeline (upload, processing,
  retry, dedup) rather than just `chatStore.tsx`'s delivery tracking.
  Originating investigation: `Backlog/media-pipeline-broader-sweep_2026-08-05.md`.
  Six distinct fixes, all merged:
  1. **#275 — stale delivered-status tracking blocking retry resurfacing.**
     `deliveredTerminalIdsRef` (the #270/#271 fix above) tracked only
     *whether* an item had been delivered while terminal, not *what status
     it was* at that moment — so an item delivered to the guide as `failed`
     never resurfaced even after a later retry genuinely flipped it to
     `ready` in the DB. Fixed by keying the ref on `id -> status-at-delivery`
     instead of just `id`; symmetric in both directions, not special-cased.
  2. **#276 — PDF documents 32-50MB failing to process.**
     `extractTextFromPdf` sent the whole file inline as base64, hitting
     Anthropic's documented 32MB-per-request payload limit well below this
     app's own 50MB upload cap — any document in that gap failed outright in
     production. Migrated to Anthropic's Files API (upload once, reference
     by `file_id`, delete after extraction), per Anthropic's own documented
     recommendation for this exact scenario. **Introduces a new dependency
     on a beta Anthropic endpoint** (`anthropic-beta: files-api-2025-04-14`
     header) — flagging as an ongoing watch item, since beta endpoints can
     change shape without notice; re-check this if PDF processing starts
     failing unexpectedly. A separate, previously unflagged page-count limit
     (100/600 pages) is not addressed by this fix — no page-counting guard
     exists in this stack.
  3. **#277 — retry never actually re-triggering processing.** The retry
     route reset a failed item to `status=pending` and hoped the Supabase
     Database Webhook (INSERT-only) would pick up the resulting UPDATE — it
     never could, regardless of how the webhook trigger is configured in
     Studio. Fixed by calling `processMediaItem` directly (its own
     idempotency guard makes this safe under concurrent retries); no
     Supabase Studio changes needed.
  4. **#278 — composer state leaking across conversation switches.**
     `ChatInput.tsx` is mounted once, unkeyed, and survives `newChat()`/
     `loadSession()` calls — nothing reset its local `attachments`/
     draft-text/recording state, so switching conversations mid-draft
     silently carried it into the wrong conversation. Same bug class as
     #272, different location (the composer's own state, not
     `chatStore.tsx`'s media-item tracking).
  5. **#279 — test coverage for previously-untested surfaces.** Pure
     test-debt paydown for `upload-url`/`[id]/url` routes,
     `useMediaUpload.ts`, and `processor.ts`'s `processAudio`/`processImage`/
     `processDocument` pipeline bodies (previously covered only via the
     shared `waitForStorageObject` helper) — no behavior change.
  6. **#280 — media upload dedup.** Duplicate uploads (the same file
     uploaded twice in one conversation) previously created independent
     `media_items` rows. Required a new **`content_hash` column** (`text`,
     nullable) — added by Jeff in Studio first, per the investigation in
     `Backlog/media-upload-dedup-schema-request.md` — since file bytes never
     pass through the Next.js server (client PUTs directly to Supabase
     Storage) and a content hash can only be computed client-side. A match
     on a `ready`/`pending`/`processing` row is reused silently; a match on
     a `failed` row is reset to `pending` and reprocessed directly (reuses
     #277's pattern). A weaker, no-schema-change fallback (filename+size+
     mime+member matching) was investigated and explicitly rejected —
     see the schema-request doc for why.

  Plus **#281** — #276 and #277 initially shipped with `console.log`/
  `console.error` instead of this repo's `audit_events` convention; brought
  into compliance immediately after merging, ahead of live production
  testing against both. New `AuditAction` values documented in
  `System Docs/Utilities/Audit.md`.

- **Guide still reported uncertain/failed media status despite 100% backend
  success — three more bugs found and fixed 2026-08-06.** Live testing on
  2026-08-05 showed every media operation (`audit_events`) succeeding on the
  backend, yet the guide repeatedly told the member it "didn't load" or
  couldn't confirm how many attachments succeeded — a symptom the #269–#281
  work above didn't fully close. Root-caused to three more distinct bugs, all
  in the same delivery-tracking machinery:
  1. **Delivery-marking race.** `markMediaItemsDelivered()` recorded a
     *live* read of `mediaItemsRef.current`, taken only after the assistant's
     reply finished streaming. `resolveMediaContext`
     (`services/chat/server/index.ts`) freezes an item's status into that
     turn's system prompt at *request-build* time, before any streaming
     happens. If an item flipped `pending` → `ready` in the gap between
     those two moments (plausible for any multi-second reply, more so with
     several attachments in flight), the old code marked it "delivered as
     ready" even though the reply the member actually received reflected the
     older, still-processing snapshot — permanently excluding the item from
     ever resurfacing. Fixed by having `getMediaItems()` snapshot each due
     item's status at read-time (`dueStatusSnapshotRef`) and having
     `markMediaItemsDelivered()` key off that snapshot instead of a fresh
     re-read. See `System Docs/Utilities/Chat UI.md`'s "Media-item delivery
     tracking" section for the mechanics.
  2. **Duplicate-reuse status bug.** `ChatInput.tsx` hardcoded
     `status: 'pending'` on every `addMediaItem()` call, including when the
     #280 dedup match reused an item that was already `ready` —
     `mergeMediaItem`'s incoming-always-wins merge then flipped it back to
     `pending` client-side, re-arming bug 1's race for something that had
     already succeeded. Fixed by having `/api/media/upload-url` report the
     reused item's real status and threading it through
     `useMediaUpload.ts`'s `UploadResult.status` into `ChatInput.tsx`,
     instead of assuming every result means "brand new."
  3. **Polling effect silently dying.** The pending-item poll effect
     (`chatStore.tsx`) only rescheduled by depending on `mediaItems`
     changing, and its own fetch callback only called `setMediaItems` (the
     one thing that re-armed the effect) when a given 3-second check found
     at least one newly-terminal item. Real processing routinely takes
     longer than 3 seconds, so the first check often found nothing, and the
     effect then never rescheduled — the client stayed stuck believing an
     item was still processing long after the DB said otherwise. Fixed by
     making the scheduling self-sustaining, checking `mediaItemsRef.current`
     fresh each round independent of whether that round found something new.

  All three verified with regression tests reproducing the exact race/dead-
  poll conditions (not just "tests pass") — see
  `components/shells/membership/chatStore.mediaItemsRace.test.tsx`,
  `chatStore.mediaPolling.test.tsx`, and `ChatInput.upload.test.tsx`.

- **A stuck "Processing…" badge on a first-message attachment traced to a
  permanently-null `chat_id`, not a resurfacing of the delivery-tracking
  bugs above — found and fixed 2026-08-06, PR #291.** Live-tested the same
  morning as the three-bugs entry above; symptom looked identical (a member
  photo stuck showing "Processing…" indefinitely despite the DB confirming
  `status: 'ready'` within seconds) but the delivery-tracking machinery
  those three fixes shape was independently confirmed correct via a passing
  regression test reproducing the exact multi-item-batch scenario against
  the already-fixed code. Root cause was one layer earlier: `ChatInput.tsx`
  uploads attachments *before* calling `sendMessage()`, and `sendMessage()`
  is what lazily creates the session — so an attachment on a brand-new
  conversation's first message always reaches `/api/media/upload-url` while
  no session exists yet, and its `media_items` row is created with
  `chat_id: null`. Every client-side status mechanism (Realtime, the
  catch-up fetch, the poll) filters by `chat_id`, so a still-null row could
  never be found by any of them again, ever — confirmed live via a direct DB
  query: 3 items uploaded on a new conversation's first message all showed
  `chat_id: null`, all reached `status: 'ready'` server-side within seconds,
  all three permanently stuck client-side. Fixed by having `send()`
  (`useChatTurn.ts`) include the pending `mediaItemIds` in the
  `POST /api/sessions` body when it has to create a new session, and having
  that route backfill `chat_id` on those rows server-side in the same
  request (`backfillMediaChatId`, `services/media/index.ts`) — scoped to the
  resolved member and only touching rows still null, with every failure path
  durably logged rather than silently re-orphaning the row. See
  `System Docs/Utilities/Chat UI.md`'s "Media-item delivery tracking"
  section and `System Docs/API Routes.md`'s `/api/sessions` row for the full
  mechanics; `System Docs/Utilities/Audit.md` for the two new `AuditAction`
  values. Regression coverage: `app/api/sessions/route.test.ts` (server-side
  backfill logic) and
  `components/shells/membership/chatStore.newConversationMediaBackfill.test.tsx`
  (client-side, end to end).

- **Save CTA message threshold should be tenant-configurable.** Currently
  hardcoded at 4 messages in `SaveChatCTA.tsx` (`if (messages.length < 4 …)`).
  Should be a per-tenant setting stored in `tenants.settings` JSONB with a
  default of 4. Same pattern as `chat_in_progress_idle_seconds` /
  `chat_active_idle_seconds` — admin UI in Settings, fetched via
  `GET /api/admin/tenant-settings`, written via `PATCH /api/admin/tenant-settings`.
  Schema change (add key to `tenants.settings` JSONB) is Jeff's Studio work;
  code work proceeds once the column convention is confirmed.

- **Server-side Stop-abort's reliable mechanism (poll-based) hasn't been
  live-tested yet.** (2026-07-28, see `System Docs/Utilities/Chat UI.md`'s
  "Stop / interrupted-turn protocol" for the full history.) The first attempt
  (threading `Request.signal` into `streamText()`'s `abortSignal`) was
  live-tested and confirmed **not working** on this deployment — the client
  correctly recorded every Stop, but the server kept generating regardless,
  most likely because Next.js middleware reconstructs the request via
  header-forwarding at the edge→function boundary rather than passing a live
  signal object through (see `System Docs/Utilities/Chat UI.md`'s "Stop /
  interrupted-turn protocol" for the full trace). The
  current mechanism no longer depends on that connection-level signal at
  all: the client explicitly PATCHes `chat_sessions.stop_requested_at` the
  instant Stop is clicked, and `streamChat()` polls it every 500ms, comparing
  against the current turn's own start time. This is designed specifically
  to route around the confirmed failure mode, but it has not itself been
  retested live yet. Same DB check as before: click Stop mid-reply, query
  `server_abort_confirmed_at` for that session afterward — populated is
  proof it fired; null means it's still broken and needs another pass.
- **`services/payments/` not created.** Stripe Connect work is deferred; not
  even a scaffold exists yet.
- **Chat-UI strangle — widget shell extracted (centralization Step E).** The
  engine, marker registry, `useChatTurn` hook, and type contracts moved to
  `services/chat/ui/v1/` (PRs #42–46); `src/lib/sage.ts` and `src/lib/store.ts`
  were deleted. The widget-shell visual components (`Hero`, `Chat`, `sage/*`)
  now live in `components/shells/widget/`, with the headless `useWidgetShell` +
  `useSageParameters` in `services/chat/ui/v1/`. `Nav.tsx` was relocated into
  `app/(jefflougheed)/components/` (importing `ShareModal` via relative
  `./ShareModal`), which clears the last `src→app` boundary warning and empties
  `src/components/` (directory removed; `src/` holds only `calendly.d.ts`).
  `boundaries/element-types` is now at **0 warnings**; the rule has since been
  flipped to `error` (Step G, confirmed in `.eslintrc.json`) — no longer pending.
- **eslint `components` element-type registered (centralization Step D).** Root
  `components/**` (the Mantine admin UI) is now a first-class boundary element:
  `app → components` and `components → services` are legal; `components` may not
  reach into `app` or `src` internals. This is the same allowance the
  `components/shells/` widget + membership shells will consume in Steps E/F. The
  rule has since been flipped to `error` (Step G, confirmed in `.eslintrc.json`)
  — no longer pending.
- **Memories (Heirloom) — Manual path shipped 2026-07-29; Auto shipped
  2026-07-31 via marker, not a real tool call; Offered still not built.** The
  memory bookmark, card (running/draft/saved/error states), and
  Keep/Rewrite/Discard all ship in the manual pass — see
  `services/chat/ui/v1/useMemories.ts`, `components/shells/membership/memory/`,
  and the bookmark on `components/chat/MessageActions.tsx` /
  `UserMessageActions.tsx` (behind `onKeep`, which the jefflougheed widget
  shell doesn't pass — memories are Heirloom-only).
  - **Auto** (PR #242, "07-31-26_save-memory-marker") is live: a bare
    `[SAVE_MEMORY]` marker (`services/chat/ui/v1/registry.ts`) lets the guide
    auto-save a memory mid-conversation, dispatched client-side to the same
    `memories.create()` the manual bookmark calls — functionally the "guide
    invokes a save mid-conversation" behavior the original design called
    Auto, just implemented as a marker rather than a real tool call.
    `services/chat/server/stream.ts`'s `streamText()` still passes no `tools`
    param — there is still no generic tool-use wiring in this codebase — but
    that no longer means auto-save doesn't exist; the marker path covers it.
  - **Offered** (the guide asks inline via "Write it up" / "Not yet" chips)
    is still **not built** — no chip-based confirmation flow exists yet. The
    blocker cited previously (Heirloom has no compiled prompt of its own) no
    longer applies: Heirloom's tenant now has its own live `compiled_prompts`
    row (see `System Docs/Public Site.md`'s Heirloom storefront chat section
    "Tenant note," resolved 2026-08-04), which is also what makes the
    `[SAVE_MEMORY]` marker possible
    without touching jefflougheed's shared `DEFAULT_SYSTEM_PROMPT`. Building
    Offered is now a prompt-instructions + chip-UI task on Heirloom's own
    compiled prompt, not a blocked one.
  Also not in this pass: the story-linking concept entirely — a memory does
  not require a story to be saved (there is no `stories` table), and when
  story-linking is eventually built it should be many-to-many (a memory
  connecting to more than one thing), not a single column on `artifacts`.
  - **Anonymous visitors get a dead-end "account required" failure on
    bookmark — no path forward to actually create one.** Fixed in PR #288
    (2026-08-06): `createDraftMemory` now cleanly rejects an anonymous or
    not-yet-linked member's save attempt (401, `ACCOUNT_REQUIRED_ERROR`,
    `services/crm/memories.ts`) instead of erroring on the `artifacts.user_id`
    `NOT NULL` constraint, and the bookmark shows accurate `account_required`
    copy with a working "Try again" (`services/chat/ui/v1/useMemories.ts`,
    `components/shells/membership/memory/MemoryCard.tsx`). But "Try again"
    just re-attempts the same call, which will keep failing the same way for
    an anonymous visitor — there is still no account-creation flow wired to
    that moment. The instant someone tries to save something is the
    highest-intent point to convert them into a signed-up member, and today
    that moment is still a dead end, just a legible one. A real fix would
    surface a sign-up/account-creation prompt directly from the bookmark's
    error state (e.g. reusing the existing `MagicLinkCard` auth flow already
    used elsewhere in Heirloom) rather than leaving the visitor stuck.
    Flagged as a real, wanted improvement — explicitly out of scope for PR
    #288, which only made the failure clean and legible, not actionable.
- **`members.user_id` left null on some active, Clerk-linked members —
  root-caused and fixed in code 2026-08-06; historical rows need a Studio
  backfill.** A live query surfaced 2 `members` rows (`status: 'active'`,
  real `clerk_id`, `user_id: NULL`) — the same state as a correctly-linked
  member, except the pointer to `users.id` was never written. Root cause:
  `services/auth/sync-member.ts`'s `syncMember()` — the fallback the Clerk
  webhook (`app/api/webhooks/clerk/route.ts`) and `POST /api/members/sync`
  both call when `linkInvitedMember` doesn't match a pending invite — built
  its `members` upsert payload without `user_id` at all (the field was
  structurally absent from `SyncMemberInput`, not conditionally skipped).
  Reachable two ways, both silent before this fix (console-only, no durable
  log): (1) a plain email/token mismatch against an invited row routes
  straight to `syncMember` on the first webhook delivery; (2) a race where
  `syncMember` inserts an orphan row for a `clerk_id` before a later webhook
  delivery lets `linkInvitedMember` find the real invited row — that
  `UPDATE` then fails on `members.clerk_id`'s unique constraint, so the
  webhook falls back to `syncMember` again. `acceptInvite()`
  (`services/members/members.ts`, client-triggered from
  `/api/heirloom/invites/accept`) was the only code reconciling case (2), and
  only if that client call actually completed. **Fixed:** `syncMember` now
  resolves/creates the `users` row first (mirroring `linkInvitedMember`) and
  always includes the resulting `user_id` — see `System Docs/Utilities/Auth.md`.
  **Also added:** durable `audit_events` logging for every failure branch in
  `linkInvitedMember`/`acceptInvite`/`syncMember` that could previously skip
  or fail the `user_id` write silently — `MEMBER_USER_RESOLVE_FAILED`,
  `MEMBER_LINK_UPDATE_FAILED`, `MEMBER_ORPHAN_CLEANUP_FAILED`,
  `MEMBER_ORPHAN_RECONCILED` (see `System Docs/Utilities/Members.md`) — plus
  an admin-side safety fix (`app/api/admin/members/invite/[memberId]/route.ts`
  DELETE now gates on `clerk_id`, not `user_id`, so a broken row can't be
  hard-deleted through the "revoke stale invite" path without cleaning up
  its Clerk identity) and a visibility fix (`app/admin/members/page.tsx` and
  `app/(platform)/platform/members/page.tsx` previously excluded these rows
  from both of their queries entirely — `user_id IS NOT NULL` and
  `user_id IS NULL AND status IN ('invited','waitlist')` both miss
  `status='active' AND user_id IS NULL` — so they rendered nowhere in the
  admin UI; a third query now surfaces them with a "Needs attention" badge,
  read-only until backfilled). **Not yet done:** backfilling the 2 known
  rows (and any others created before this fix shipped) — Jeff's call, in
  Studio, per the division-of-labor convention. Re-run
  `select id, created_at, email, name, status, clerk_id, user_id from members
  where user_id is null and status not in ('invited', 'waitlist');` first
  (some rows may self-heal on next login, since `syncMember`/`/api/members/sync`
  fire on every re-auth), confirm a `users` row exists for each remaining
  `clerk_id` before backfilling (no `users` row = a deeper failure, not a
  simple pointer fix), then
  `update members m set user_id = u.id from users u where m.clerk_id = u.clerk_id
  and m.user_id is null and m.status not in ('invited', 'waitlist');`.

- **`.stage.engaged .composer-wrap`'s `margin-top` resolves by CSS
  cascade-order accident, not deliberate breakpoint design — found during
  the jefflougheed chat widget documentation pass, 2026-08-07.** Four rules
  across `app/(jefflougheed)/globals.css` set this property, all at the same
  `.stage.engaged .composer-wrap` selector specificity and all `!important`,
  so the winner is whichever appears last in the file among the rules
  matching a given viewport width: `globals.css:294` (base `.composer-wrap`
  only, lower specificity, `8px`), `globals.css:465` (inside
  `@media (max-width: 768px)`, `0px` — the original mobile value),
  `globals.css:499` (**unscoped** — applies at every width including
  desktop, from a later "Ported from Design Handovers" section, `12px`), and
  `globals.css:507` (inside `@media (max-width: 640px)`, same ported
  section, `10px`). Live-verified via Playwright/`getComputedStyle` at a
  390px mobile viewport (engaged via the `?mode=question` programmatic-focus
  path — the only way to reach genuine mobile inline-engaged state, see
  `System Docs/jefflougheed Chat Widget.md`'s §2): computed value is
  **10px**. Confirmed current values per breakpoint: desktop non-engaged
  `8px`; 641–768px engaged `12px` (the unscoped rule wins over the original
  mobile block's `0px`, which is therefore fully shadowed and never actually
  applies at any width); ≤640px engaged `10px`. **Suggested fix:**
  consolidate to one rule per intended breakpoint tier, make a deliberate
  call on whether `0px` should be restored for the original mobile band or
  the later port's values are the real intent, and comment the tiers
  explicitly so a future edit can't silently reorder-break the cascade
  again. **Priority: cosmetic, not urgent** — an 8–12px spacing delta, no
  functional impact (unlike the three real bugs fixed the same night). Full
  writeup with the per-rule table: `System Docs/jefflougheed Chat Widget.md`'s §6.

- **Eight dead `.chat-overlay-*` CSS selectors sit interleaved with two live
  ones in `app/(jefflougheed)/globals.css:552-593` — found during the same
  documentation pass, 2026-08-07.** Of the ten class selectors under the
  "Full-screen chat overlay" comment header — `.chat-overlay`,
  `.chat-overlay-inner`, `.chat-overlay-header`, `.chat-overlay-title`,
  `.chat-overlay-dot`, `.chat-overlay-actions`, `.chat-overlay-close`,
  `.chat-overlay-scroll`, `.chat-overlay-greeting`, `.chat-overlay-log`,
  `.chat-overlay-composer` — only the last two are referenced anywhere in
  `components/shells/widget/WidgetShell.tsx` (confirmed via grep: one match
  each; zero for the other eight). The other eight are an earlier,
  hand-rolled-class implementation of the overlay's chrome (header, close
  button, greeting text, etc.), superseded when that markup moved to inline
  Tailwind utilities directly in the JSX — the old CSS was never removed.
  They're visually indistinguishable from `.chat-overlay-log`/
  `.chat-overlay-composer`, the two selectors Bug 3's `--color-surface` fix
  actually touched (2026-08-06/07), which is exactly the kind of place this
  becomes a real hazard: a future edit restyling "the overlay" via one of
  the eight dead selectors would silently do nothing. **Suggested fix:**
  delete the eight dead selectors; keep `.chat-overlay-log`/
  `.chat-overlay-composer`. **Priority: minor cleanup debt**, not urgent —
  no functional impact today, purely a maintenance hazard for future edits.
  Full selector-by-selector accounting: `System Docs/jefflougheed Chat
  Widget.md`'s §6.
