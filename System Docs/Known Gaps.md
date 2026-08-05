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
