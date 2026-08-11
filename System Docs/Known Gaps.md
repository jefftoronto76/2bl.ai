# Known Gaps

## Known Gaps

Tracked, not yet addressed. See `System Docs/ARCHITECTURE_OVERVIEW.md` and
`Backlog/SERVICEMIGRATION.md` for the full picture.

- **Memory panel width doesn't reseed if the whole chat drawer closes while
  a memory is still open — found during Stage C live-preview review,
  2026-08-08.** `panelWidth` only reseeds on the effect in `ChatHero.tsx`
  that watches `openMemory` transition `null` → non-`null`. Closing and
  reopening the memory panel itself (its own Close button) goes through
  exactly that transition and reseeds correctly, confirmed live. But
  `ChatDrawerV2` closing (e.g. `ChatHeader`'s Close button) doesn't unmount
  `ChatHero` or touch `openMemory` — the drawer just slides off-screen — so
  if the memory panel was open when the drawer closed, `openMemory` is still
  non-`null` when the drawer reopens, the effect's dependency never
  re-fires, and `panelWidth` is left exactly wherever it was, rather than
  reseeding to the usual ~55%-of-remaining-space default. Low visible
  impact — a stale-but-still-valid width, not a broken one — and not
  member-facing per Jeff. **Fix if ever done:** also reseed on the drawer's
  own close → open transition, not just the panel's.

- **Sidebar has no resize of its own, even in full-screen — found during
  Stage C live-preview review, 2026-08-08.** `SidebarV2` force-collapses to
  its 48px rail whenever the memory panel is open (Stage B,
  `forceCollapsed` prop), with no way to widen it back — including in
  `isFullScreen` mode, where `ChatDrawerV2` is `w-screen` and there's
  genuinely spare width the rail-collapse doesn't need to reclaim. This is
  new scope, not part of the memory-panel-layout Stage A–F plan (that plan
  is the chat/panel divider only — sidebar resize was explicitly ruled out
  of scope for it, repeatedly, during planning). Would need its own plan,
  likely gated on `isFullScreen` rather than applying everywhere.

- **No visual distinction between closing the chat drawer and closing the
  memory panel — found during Stage C live-preview review, 2026-08-08.**
  Both close actions look and feel similar enough that which one just
  happened isn't immediately obvious. Cosmetic, not functional — revisit
  only if real usage shows it's actually confusing, not preemptively.

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

- **Heirloom chat-widget V2 is UI-first; most of its backends do not exist
  yet.** The V2 pass (branch `06-11-26_mvp-ui-update`, 2026-06-12) shipped
  the presentation layer only. Story creation/read/delete are real now
  (2026-08-09 — see "Real story creation and persistence" below); still
  outstanding: per-story collaborator invites (member-facing magic-link API
  — the existing `invites` table is the admin-created access gate, not
  this); conversation search (the sidebar field is a visible stub);
  Uploads; Share Heirloom (sidebar item + ChatHeader icon are inert;
  `ShareHeirloomModal` is landed but unmounted — pass the real
  `heirloom.2bl.ai` URL when mounting, its default is a placeholder);
  Writing Prompts copy review (the 4 static prompts in ChatHero are
  placeholder-grade). The v1 `Sidebar.tsx` is superseded and unmounted —
  delete after preview verification.

  **Per-row kebab actions — resolved for conversations 2026-08-03 (PR
  #247); resolved for story delete 2026-08-09.** `ChatHero.tsx` now passes
  `onRowAction` to `SidebarV2` on both desktop and mobile, so kebab menus
  render for both conversation and story rows. Conversation `star` /
  `rename` / `delete` are fully wired to real endpoints (`PATCH` /
  `DELETE /api/sessions/[id]`) with optimistic updates and
  revert-on-failure. Story `delete` is now real too (`DELETE
  /api/stories/[id]`, see below) — no revert-on-failure yet, unlike the
  conversation path (a failed delete toasts and leaves the row in place,
  it doesn't retry). Still not built: `moveToChapter` / `removeFromChapter`
  remain deliberate no-ops for both row types, and `star` / `rename`
  remain no-ops for story rows specifically (only ever wired for
  conversations). `invite` is no longer a kebab item at all — see "Invite
  — real as of 2026-08-10" below for its own dedicated entry point.

- **Real story creation and persistence (2026-08-09).** A story is an
  `artifacts` row with `type='story'` — a sibling to memories'
  `type='memory'` rows on the same table, **not** the dedicated `stories`
  table earlier passes of this doc described as outstanding Studio work.
  `artifacts.type` has no CHECK constraint, so this needed zero migration.
  `services/crm/stories.ts` (`createStory`/`listStories`/`discardStory`)
  mirrors `services/crm/memories.ts`'s structure closely — same
  `resolveUserIdForMember` account-required check (now exported from
  `memories.ts` and reused, rather than duplicated), same
  `getAdminClient()`/audit-logging shape — but scoped by `tenant_id` +
  `user_id` (mirroring `listSessions`' scoping) rather than `tenant_id` +
  `session_id` (`listMemories`' scoping), since a story isn't tied to one
  conversation: `session_id` and `anchor_message_id` are both left out of
  the insert. `name`/`description` (`BeginStoryModal.tsx`'s own field
  names) map to `title`/`body` — the same two columns a memory's
  title/passage already use — not `metadata`. Routes: `GET`/`POST
  /api/stories`, `DELETE /api/stories/[id]`. `ChatHero.tsx`'s `stories`
  state now hydrates via `GET /api/stories` on mount and stays in sync
  with real creates/deletes, replacing the old ephemeral
  `crypto.randomUUID()` local-only rows.

  **Two further relationships were explicitly deferred, not built:**
  story ↔ memory (via `artifact_containments`, a self-referencing
  `artifacts` join table that's been schema-only and unreferenced by any
  code since 2026-08-08 — still true after this pass) and story ↔ media
  (via `media_items.story_id`, a column that already exists and is still
  always null). Selecting into a story's own view is also still a no-op —
  `SidebarV2`'s story rows have an `onClick` affordance already built, but
  `ChatHero.tsx` never passes `onSelectStory`, and there is no story view
  to select into yet.

  **Invite — real as of 2026-08-10 (invites-collaboration-modal), but partial.**
  `invite` is no longer a kebab item at all (it was buried and dead) —
  `SidebarV2` now renders a dedicated per-story-row invite icon
  (`onInviteStory`), wired in `ChatHero.tsx` to a real
  `InviteCollaboratorsModal` (previously fully built but unmounted) and a new
  member-facing route, `POST /api/heirloom/invites` (see `API Routes.md`).
  Clicking the icon creates a real, generic (no invited_name/email/phone)
  single-use `members` invite via `createMemberInvite`, with the modal's
  Custom Greeting field writing straight to `members.primer` — the same
  mechanism `InviteMemberModal.tsx`'s admin flow already uses, not a separate
  "note" concept. Its story picker now draws from the real `stories` state
  described above (`ChatHero.tsx` passes the same list to both
  `SidebarV2` and `InviteCollaboratorsModal`), no longer the ephemeral rows
  this paragraph originally described. **What's still not real:** (1) the
  story tie — stories themselves are real now (`artifacts.type='story'`,
  above), but `createMemberInvite` doesn't write the chosen story to any
  real column or join table yet; which story an invite is "for" is still
  recorded only in that invite's own audit-event metadata
  (`createMemberInvite`'s `storyId` param), not as a queryable relationship
  — the modal's "Already invited" roster is therefore always empty (`[]`)
  since there's nothing real to populate it from. (2) The prototype's
  second entry point — a "Share this story" button inside a real story
  view — was not built; there is no real story view yet (deferred, separate
  stage). (3) Whether the story picker's selection should ever change what
  the link actually *grants* (vs. just relabeling the modal's copy) is an
  open product question, not decided — `acceptInvite`'s access grant is
  unchanged (tenant-level only) for this pass.

  **Superseded, same day — reusable-story-invite-links (2026-08-10).** The
  first half of (1) — the story tie having no real column/relationship — is
  closed by a wholly separate mechanism, not a patch to this one:
  `story_invite_links` (new table, `services/crm/story-invites.ts`) is a
  real, durable, per-story FK — `story_id` is a genuine column, not
  audit-metadata — and multiple different people can each accept the same
  token independently (unlike `createMemberInvite`'s single-row-single-use
  shape, which structurally cannot represent that). The second half of (1)
  — the roster being empty because there was nothing real to populate it
  from — is **not** closed by this alone; see below, it's still empty for a
  different reason now.
  `ChatHero.tsx`'s magic-link creation was repointed from `/api/heirloom/
  invites` to `/api/heirloom/story-invites` the same day; `/api/heirloom/
  invites*` and `createMemberInvite`/`acceptInvite` themselves are
  untouched and still fully functional, just no longer exercised by this
  particular UI path. (2) — a real story view to select into — remains
  genuinely deferred; unaffected by this change. (3) is now moot for the
  reusable link specifically: it always grants access to exactly the one
  story chosen at creation (`artifact_subscribers`), never tenant-level —
  changing the picker on an *existing* link still only relabels the copy
  and does not retroactively change what that link grants, same as before.
  The modal's "Already invited" roster is **still** not populated from real
  data (`ChatHero.tsx` still passes `collaborators={[]}`) — this pass wired
  the grant mechanism, not the roster UI; see `System Docs/API Routes.md`'s
  "Story Invite Links" section and `System Docs/Database Schema.md`'s
  `story_invite_links` row for the real shape.

  **Superseded again, same day — invite_modal_updates (Phase 5, 2026-08-10).**
  Fixes a real bug the story-invite-links merge above carried forward
  unnoticed (it swapped the backend but not this flow): `handleInviteStory`
  called `createInviteLink('', storyId, false)` **immediately** on click,
  before the modal had even opened or the member had typed anything — every
  click on the per-story invite icon minted (or, if 1 already existed for
  that story, silently reused) a real, shareable magic link with no
  deliberate action behind it. `InviteCollaboratorsModal`'s `magicLink` prop
  is optional now (`magicLink?: string`); opening the modal only sets
  `invite: { storyId }`, `inviteLink` stays `null` until the member clicks
  the new **Create** button in the link row's own spot (see that component's
  row in `System Docs/Public Site.md` for the full Create/Copy state
  mechanics). Also new: an **invalidation warning** — changing the story
  picker or the Custom Greeting while a link is live no longer applies
  silently (previously either changed nothing about the link, leaving stale
  copy, or blanked it with no explanation depending on which field). The
  edit is captured, a warning dialog fires, and only on Continue does the
  edit apply AND the old link get revoked server-side (new `DELETE
  /api/heirloom/story-invites`) — dropping back to "Not created yet," never
  auto-creating a replacement. No warning with no link yet (nothing real to
  lose), and none on "Reset link" itself (its own label already says what
  it does). Both mechanics match `Design Handovers/invite_modal_updates_08_2026/
  README.md`'s reference exactly.

  **The roster gap above is finally closed, partially.** "Already invited"
  is now "Existing members" — the joined/pending count and mixed badges are
  gone, since every row here reflects a genuine `artifact_subscribers`
  grant (a roster row only exists once `acceptStoryInvite` has written one;
  there is no "pending" state on this table to represent). New `GET /api/
  heirloom/story-invites?story_id=` + `listStoryCollaborators` (`services/
  crm/story-invites.ts`) join `artifact_subscribers` to `members`, owner-
  scoped the same way create/reset already are. **Still not real: a memory
  count per collaborator.** The design reference's mockup shows "Joined
  `[date]` · `N` memories" — this codebase has no way to compute the `N`
  yet, since it depends on the still-unbuilt story ↔ memory relationship
  (`artifact_containments`, called out as unwired in "Real story creation
  and persistence" above and unchanged by this pass). Shipped as "Joined
  `[date]`" alone rather than fabricating a count; `Collaborator.memoryCount`
  is `number | undefined` (undefined ≠ 0) so a future wiring of
  `artifact_containments` has a field ready without another prop-shape
  change. `Collaborator.relationship` is also now optional and only
  rendered when present — the real `members` table has no relationship
  column, and the design mockup's "Daughter"/"Brother" values are sample
  data with nothing behind them in this schema; never fabricated here
  either.

  **Superseded again, 2026-08-11 — invite-modal-restore-on-open.** Fixes a
  bug the `invite_modal_updates` paragraph above shipped unnoticed: opening
  the modal (`handleInviteStory`) always reset `inviteLink` to `null` and
  `invitePrimer` to `''`, with no check for whether a real, active link
  (with a saved primer) already existed for that story — closing and
  reopening the modal always showed "Not created yet" and a blank Custom
  Greeting, even for a story someone had already created a real link for
  (in this session or another one). Nothing fetched existing state on open.
  Fixed by adding a read-only lookup, `getActiveStoryInviteLink`
  (`services/crm/story-invites.ts`) — the same `tenant_id` + `story_id` +
  `revoked_at IS NULL` query `createOrGetActiveStoryInviteLink` already
  runs internally, but without its create-if-missing fallback, so opening
  the modal can never itself mint a link — and exposing it via the existing
  `GET /api/heirloom/story-invites?story_id=` route as a new `active_link`
  field alongside `collaborators` (same request, no new endpoint —
  `System Docs/API Routes.md`). `ChatHero.tsx`'s collaborators-fetch effect
  (already keyed on `invite?.storyId`, so it already re-runs on every modal
  open) now also reads `active_link` and, when present, overwrites the
  blank reset with the real `token`/`primer`/`invite_url`. A story with no
  active link is unaffected — the existing blank-reset behavior stands, so
  "Not created yet" still means what it says.

- **`/join/[token]` missing its middleware host-rewrite exclusion — found
  and fixed in post-merge doc review, 2026-08-10 (reusable-story-invite-links).**
  `middleware.ts` has an `isInvitePath` guard (`/invite` or `/invite/*`)
  ANDed into the SBL/Heirloom/Legacy host-rewrite blocks and the preview-
  routing guard, specifically so `heirloom.2bl.ai/invite/x` falls through
  to the root `/invite/[token]/route.ts` handler instead of being rewritten
  to `/heirloom/invite/x` (no such route). `/join/[token]` — this feature's
  own public redirect, structurally identical to `/invite/[token]` — shipped
  without the equivalent `isJoinPath` guard: on `heirloom.2bl.ai/join/x`,
  the Heirloom rewrite block would have fired and rewritten it to
  `/heirloom/join/x`, a 404, on exactly the host this feature is for.
  Caught by deliberately checking whether the new sibling route had every
  treatment its precedent did, not by an observed failure — actual
  production exposure before the fix was not independently verified either
  way. Fixed by adding `isJoinPath` and ANDing it into the same four places
  `isInvitePath` already was. See `System Docs/App Structure and Routing.md`
  for the mechanism and `System Docs/API Routes.md`'s `/join/[token]` row.
  **Lesson for the next new top-level public route:** grep `isInvitePath`'s
  usages in `middleware.ts` first and mirror every one, don't just add the
  route file.

- **Story invite acceptance not reaching its expected end state for a real
  member — instrumented 2026-08-10 (PR #341), four independent real gaps
  found and fixed 2026-08-10/11 (PRs #343, #344, #346, #348).** Original
  reported live symptom: a story invite is accepted, but the story does not
  appear in the new member's account afterward — the expected end state
  never materializes. PR #341 (see prior revision of this entry, or its own
  section in `System Docs/Public Site.md`'s `chatStore` row) added
  diagnostic-only `console.log` checkpoints with no behavior change. Code
  review of the full flow — not the suggested browser-console reproduction —
  surfaced four distinct, independent bugs rather than one root cause,
  covering different ways the flow could silently fail to reach its expected
  end state:
  1. **#343 — `autoOpenChat` never set for the `?join=` path.** `page.tsx`
     only ever set `autoOpenChat` from `members.auto_open` on the `?invite=`
     path; a story-invite visitor's chat panel simply never opened, so
     nothing in the flow — including the accept call's own trigger effects —
     was visibly happening to them.
  2. **#344 — no visitor-facing prompt to actually create an account.** A
     not-signed-in story-invite visitor got a bare "Hi" greeting with no
     mention of the story, and no CTA telling them they needed to sign up
     for the invite to take effect — `acceptStoryInviteToken` only ever
     fires post-sign-in, so a visitor who never saw a reason to sign up
     never triggered it at all. Fixed with a contextual greet (story title +
     inviter name, deterministic/no-LLM via `injectAssistantMessage`)
     immediately followed by an injected `[ACCOUNT_CREATE: story invite]`
     message when not signed in. See the `chatStore` row in
     `System Docs/Public Site.md` and the `[ACCOUNT_CREATE: reason]` entry in
     `System Docs/Marker Syntax.md`.
  3. **#346 — sidebar `stories` list never refetched.** Even when the accept
     call genuinely succeeded server-side, `ChatHero.tsx`'s `stories` state
     was fetched exactly once, on mount — this alone is very likely the
     literal original report ("story does not appear... afterward"): the
     grant existed in the DB, but the sidebar showing it required a manual
     page reload. Fixed by extracting the mount fetch into a reusable
     `refreshStories` callback, now also called when `joinedStoryConfirmation`
     fires.
  4. **#348 — failure paths were silent to the visitor.** Both
     `acceptStoryInviteToken` failure branches (non-ok response, rejected
     fetch) only ever `console.error`'d — a genuine server-side failure
     (e.g. an expired/revoked link) left the visitor signed in with no story
     and no explanation, indistinguishable from success from their side.
     Fixed with a generic, no-LLM fallback message via the same
     `injectAssistantMessage` mechanism.

  Each fix shipped with its own committed test; `services/crm/story-invites.ts`'s
  server-side `acceptStoryInvite` itself was re-read during this pass and
  still appears correct — no server-side fix was needed. This closes out the
  client-side investigation PR #341 opened; if the original live report
  persists after this, the next step is re-verifying the server-side grant
  path (`artifact_subscribers` upsert) against production data, not the
  client flow this entry now covers end-to-end.

  **Superseded, same day — the server-side half flagged above as "no fix
  needed" did in fact need one, 2026-08-11 (PR #351).** Not a bug in
  `acceptStoryInvite`'s own logic (that re-read was correct as far as it
  went) but a reliability gap in *when* it got called: every accept
  ultimately depended on the client's browser successfully firing `POST
  /api/heirloom/story-invites/accept` (the two `chatStore.tsx` trigger
  points this entry already covers) — a single point of failure with no
  server-side fallback, the exact shape CLAUDE.md's Marker fallback
  principle exists to prevent. Confirmed separately, via live Studio data,
  as also producing a second, quieter symptom: when Clerk's `user.created`
  webhook happened to process a story-invite signup before the client's own
  accept call did, the webhook had no concept of story invites at all and
  fell through to the generic `syncMember` upsert — the `artifact_subscribers`
  grant still landed correctly (via the client call arriving after), but the
  resulting `members` row got `source: null` and no `primer` instead of
  `source: 'story_invite'`, silently losing personalization/attribution
  without ever locking the person out. **Fixed** by threading a new
  `storyInviteToken` field through `chatStore.tsx` → `MessageList.tsx` →
  `MagicLinkCard.tsx` → `useAuthFlow.ts` into the Clerk adapter
  (`services/auth/providers/clerk/client.ts`), which now writes it into
  Clerk `unsafeMetadata` as `heirloom_story_invite_token` — combined into
  the SAME `signUp.update()` call the pre-existing `heirloom_invite_token`
  write already made, since `unsafeMetadata` is a full-object replace, not a
  merge, and writing them separately would let one silently wipe the other.
  `app/api/webhooks/clerk/route.ts`'s `user.created`/`user.updated` handler
  now reads that key and calls `acceptStoryInvite()` directly — the exact
  same function the client calls — so whichever of {webhook, client} runs
  first performs the real insert and the other is a safe no-op; a missing or
  failed token still falls through to the pre-existing
  `linkInvitedMember`/`syncMember` cascade as a safety net. Since this makes
  `acceptStoryInvite` reachable from two racing callers instead of one, its
  new-member insert (`services/crm/story-invites.ts`) is now also hardened
  against a concurrent `23505` unique-violation on `members.clerk_id` —
  re-fetches and continues as the existing-member branch rather than
  surfacing a 500, mirroring `createOrGetActiveStoryInviteLink`'s own
  precedent for the identical race shape. Shipped as commit `fbd3807d` +
  test coverage in `1bf8c55e`, merged as PR #351. See
  `System Docs/API Routes.md`'s `/api/webhooks/clerk` row and
  `System Docs/Utilities/Auth.md` for the mechanism.

- **Stories "Create" button rendered permanently disabled — fixed 2026-08-10
  (PR #335, branch `2026-08-10-fix-create-story-button-styling`).**
  `SidebarV2`'s Create button was built inert in the original V2 UI-first
  pass (2026-06-12), alongside the still-inert Uploads/Share Heirloom nav
  buttons and Writing Prompts section, via two unconditional
  `opacity-40 pointer-events-none` classes. When real
  `disabled={storiesDisabled || !onCreateStory}` logic was wired in later
  (real story creation, 2026-08-09), the leftover inert classes were never
  removed — the button was functionally enabled (`onCreateStory` genuinely
  supplied by `ChatHero.tsx`; `storiesDisabled` defaults `false`) but
  rendered greyed out and, via `pointer-events-none`, unclickable
  regardless of state. Fixed by removing the two unconditional classes; the
  `disabled:opacity-40 disabled:cursor-not-allowed
  disabled:hover:bg-transparent` variants are untouched and still apply
  correctly for the genuine `storiesDisabled=true` case. Added
  `SidebarV2.createButton.test.tsx`, asserting on the rendered class list
  rather than just the `disabled` prop/attribute — the prior test gap that
  let this ship unnoticed.

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

- **Upload-card flicker + Send-to-thumbnail latency — both root-caused and
  fixed 2026-08-06, PR #293.** A design handoff (see the stale-doc note
  below) proposed a rich card system for upload status (`UploadCard`,
  selecting between `UploadRunningCard`/`UploadReadyCard`/`UploadErrorCard`
  by `item.status`) to replace `MessageList.tsx`'s plain inline chips. It was
  built, then live-tested and found to visibly flicker — cards disappearing
  and reappearing instead of updating smoothly — rather than assumed fixed.
  Root cause: the selector returned three structurally different component
  types at the same JSX position, keyed off `item.status`; React's
  reconciliation is type-based at each tree position, so a changed returned
  type there unmounts the whole old subtree and mounts a new one from
  scratch, regardless of a stable outer `key`. Rather than patch the card
  system, it was replaced entirely with a simpler pattern built directly from
  a live reference (Claude.ai's own mobile web chat) instead of the handoff:
  `UploadThumbnail.tsx` keeps one persistent element (the `<img>`/icon) at
  the same JSX position and type across every status, with shimmer/retry as
  additive sibling children — see `System Docs/Public Site.md`'s
  `UploadThumbnail` row for the full structural description, and
  `components/shells/membership/upload-thumbnail-render.test.tsx`'s
  no-remount test for the regression guard. Tapping a ready image opens the
  new `ImageLightbox.tsx` (own row, same doc).

  A second, separate gap surfaced in the same live-testing pass: a
  noticeable delay between hitting Send with an attachment and anything
  rendering at all, traced to `ChatInput.tsx`'s `handleSend` not calling
  `sendMessage()` until the full upload round trip resolves — investigated
  and fixed via `pendingEcho`, an optimistic, purely visual placeholder; see
  `System Docs/Utilities/Chat UI.md`'s "Optimistic-send echo" section for
  the full mechanics, including why a true optimistic entity (a client-side
  temp id, reconciled later) was considered and rejected — it would have
  reintroduced this same file's `chat_id`-backfill bug above.

  **Stale design-handoff docs, not corrected in place (flagged here for
  context, separate note going to CD):** both
  `Design Handovers/design_handoff_upload_progress_2026/` and
  `Design Handovers/design_handoff_upload_progress_2026_V2/` still describe
  the now-deleted `UploadRunningCard`/`UploadReadyCard`/`UploadErrorCard` as
  current/buildable; the former's `HANDOFF_UPLOAD_FLOW.md` also describes the
  also-now-deleted `InlineImage`/`InlineFileChip` chips as the current
  `MessageList.tsx` rendering. Neither directory is linked from `System
  Docs/`, so nothing here pointed at them as current — but anyone opening
  either doc next should know both predate this entry.

- **Thumbnail image dimensions are client-only — not persisted, so a
  returning visitor/second viewer doesn't get the zero-shift sizing
  guarantee (2026-08-07, PR #298/#299).** `UploadThumbnail.tsx` used to force
  every image into a fixed 192×144 crop box (`object-cover`); it now sizes a
  240×320 bounding box (`max-w-60 max-h-80 object-contain`) from the image's
  real `width`/`height`, preserving aspect ratio — see `System Docs/Public
  Site.md`'s `UploadThumbnail` row for the full mechanics. Those dimensions
  are captured client-side only, in `ChatInput.tsx`'s `addFiles` (a plain
  `new Image()` decode off the pick-time blob URL, reading
  `naturalWidth`/`naturalHeight`), threaded through `Attachment` →
  `PendingEcho.attachments[]` / `ClientMediaItem` — never sent to or stored
  by the server. That's sufficient for the person who just uploaded (the
  live case this PR targeted), but on a page reload, or for any other viewer
  of the same conversation, `item.width`/`height` is simply `undefined` — no
  cropping either way (still `object-contain`), just without the
  before-first-paint sizing that avoids a decode-time layout shift.
  Persisting them server-side was investigated and deliberately deferred: it
  needs a new `media_items.width`/`height` column pair (`ALTER TABLE
  media_items ADD COLUMN width integer, ADD COLUMN height integer` — nullable,
  no default), which is Jeff's Studio call per the division-of-labor
  convention, not something built around blindly; and it needs a **new**
  fetch+decode step in `services/media/processor.ts`'s `processImage`, which
  today never downloads image bytes at all — it hands Anthropic's vision API
  a signed URL by reference, so there's no existing in-memory decode pass to
  extend, contrary to what might be assumed from `processDocument`'s
  (PDF/DOCX/TXT) fetch+`arrayBuffer` pattern in the same file. **Not yet
  done — Jeff's Studio work, then a follow-up code task once the columns
  exist.**

- **Images in chat threads don't reliably reload when scrolling back to
  them — found 2026-08-08 during live-preview testing of the scroll-to-latest
  nudge.** Scrolling away from and back to an earlier image attachment in the
  transcript sometimes shows it failed/blank rather than the image.
  **Root cause confirmed 2026-08-09**, while fixing the same symptom in the
  memory panel: every `sessionImages`/`mediaItems` `url` is a signed Supabase
  Storage URL (`generateSignedDownloadUrl`, `services/media/storage.ts`)
  issued with a **60-second expiry**, fetched once at session load
  (`services/media/display-url.ts`'s batch `withDisplayUrl`) or on a Realtime
  update, and never refreshed — any `<img>` rendered off that value more than
  a minute later is broken. The fix is `services/media/useFreshImageUrl.ts`,
  a hook that re-resolves a specific `media_item_id`'s url via the existing
  `GET /api/media/[id]/url` right at display time, showing the possibly-stale
  value immediately as a fallback while the fresh fetch resolves. Applied
  2026-08-09 to the memory panel's four photo-display spots
  (`BlockCanvas.tsx`'s `ImageBlockRow`, `MemoryCard.tsx`'s draft-state image
  and `MemorySavedReceipt`'s thumbnail — `MemoryCardView.tsx`'s hero image
  renders through `ImageBlockRow` too, so it's covered by the same edit).
  **Resolved 2026-08-09**: the actual chat-transcript render spot is
  `UploadThumbnail.tsx` (rendered by `MessageList.tsx` per `userMsg.uploads`
  entry) — it now calls `useFreshImageUrl` too, gated so the re-fetch only
  fires when falling through to `item.url`; `item.localPreviewUrl` (the
  instant, non-expiring local blob set at attach time in `ChatInput.tsx`)
  still renders directly with no fetch when it's available, since that path
  was never affected by the 60s expiry. See `System Docs/Public Site.md`'s
  `UploadThumbnail` row for the mechanics.

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
  not require a story to be saved, and when story-linking is eventually
  built it should be many-to-many (a memory connecting to more than one
  thing), not a single column on `artifacts`. (Stories themselves are real
  now, as of 2026-08-09 — see "Real story creation and persistence" above
  — but still via `artifacts.type='story'`, not a dedicated `stories`
  table; this paragraph's "many-to-many, not a single column" guidance is
  about the still-unbuilt memory↔story link, `artifact_containments`, and
  is unaffected by that.)
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
  - **`MemorySavedReceipt` icon + inline rename (fixed 2026-08-08, PR
    #301).** The saved-state receipt showed a fixed checkmark instead of the
    memory's own kind-specific icon, and had a hover-revealed pencil/input
    rename affordance that didn't belong on a read-only collapsed state. Now
    the kind icon (matching the running pill and draft card) sits in the
    circle, a plain `Check` sits next to "Kept" (a distinct job — confirms
    saved, doesn't repeat the kind), and the rename UI is gone entirely. See
    `System Docs/Public Site.md`'s memory bookmark row.
  - **Memory panel — Stages A–E shipped 2026-08-08 (PRs #302, #306, #307,
    #308); F (mobile) shipped 2026-08-09 (PR #325).** Clicking a saved memory (the row is now a button,
    `onOpen` prop) opens it in a side panel: `SidebarV2` force-collapses to
    its existing 48px rail (`forceCollapsed` prop), the chat column narrows,
    and a third pane renders — **`MemoryCardView`, the real chrome, as of
    PR #312 (2026-08-08)** — the Stage A throwaway `MemoryPanelStub` this
    entry used to describe no longer exists. The panel now has a live
    header (editable title, eyebrow/date, stubbed "add to story", close), a
    scrollable body (per-kind media placeholder + passage), and a
    persistent icon-only footer (Talk about this / Use as a base stubbed;
    Remove wired to a real discard, routed through the same
    delete-confirmation dialog session/story deletes already use). **Title
    editing is real; passage editing is not** —
    `renameMemory()` (`services/crm/memories.ts`) only ever updates title,
    nothing updates body — and this is the ONLY place in the app either
    kind of editing exists at all: the
    transcript's own `MemoryCard`/`MemorySavedReceipt` (see the entry
    above) stay exactly as read-only as they were before this panel shipped,
    untouched by any of it. See `System Docs/Public Site.md`'s
    `MemoryCardView` row for the full mechanics.
    **C, D, E all shipped:** the chat/panel divider is drag-resizable (mouse
    and keyboard — arrow-key nudge, Home/double-click reset), with the
    hover/drag visual treatment (accent line, pill, background wash) from
    `Design Handovers/design_handoff_memory_panel_layout_2026/Curtain.tsx` —
    see the sprint-close pointer below for the short version. **F (mobile) —
    shipped 2026-08-09, PR #325 — diverged from the original spec on
    purpose.** `onOpenMemory` is no longer gated on `isMobile`, so the
    receipt is clickable on mobile too, and tapping it opens `MemoryCardView`
    as a full-screen overlay (`inset-0`/`h-[100dvh]`, no rounding, no scrim)
    — not the "slide up from the bottom" partial sheet the original design
    handoff spec'd. That partial-sheet framing was superseded once Media's
    own mobile bottom sheet shipped the same week (PR #324) and needed a
    visually distinct treatment for the memory panel to avoid the two
    looking like the same affordance; see `System Docs/Public Site.md`'s
    `ChatHero` row for the full mechanics and the reasoning for no scrim /
    reusing the existing `hl-animate-sheet` timing. Original spec still at
    `Design Handovers/design_handoff_memory_panel_layout_2026/README.md` for
    historical reference only — it does not describe what shipped. The
    `ChatDrawerV2` architectural constraint this section used to flag
    (`clamp(680px,50vw,1120px)` cap, no `overflow-hidden` in its ancestry)
    is still real and still worth knowing — see `System Docs/Public Site.md`'s
    `ChatDrawerV2` row.
  - **Sprint-close pointer, 2026-08-08 — memory panel resize (Stages A–E) +
    scroll-to-latest nudge.** PRs #301–#303, #305–#308, and #310 (confirmed
    via `git log --merges`; #304 falls inside that number range but is an
    unrelated schema-docs PR, not part of this work; #309 is this pointer's
    own docs PR). Chat/panel divider is now drag-resizable (mouse + keyboard),
    with hover/focus visual treatment and a Home/double-click reset that
    reflects the current window size — see the Memory panel entry above for
    per-stage detail. Chat transcript also gained a scroll-to-latest button
    that appears when scrolled away from the bottom
    (`components/shells/membership/ScrollToLatestButton.tsx`, PR #310,
    merged) — see `System Docs/Public Site.md`'s row for the mechanics; the
    threshold-mismatch gap it introduced has its own bullet below.
    **Stage F (mobile memory panel) — resolved 2026-08-09.** Tapping a saved
    memory on mobile now opens the panel as a full-screen overlay
    (`inset-0`/`h-[100dvh]`, no rounding, no scrim — distinct from the
    Media pane's partial `85vh` sheet added the same week); see
    `System Docs/Public Site.md`'s `ChatHero` row for the mechanics.
  - **Memory Canvas V1 — block canvas (text + image blocks only) shipped
    2026-08-08, revised same day per the Text+Image Scope Handover
    (`Design Handovers/handover_memory edit panel_08_2026/`).** The panel's
    passage is now editable: `artifacts.body_blocks` (jsonb, nullable,
    additive), the `revise_blocks` mutation (`reviseMemoryBlocks`,
    `services/crm/memories.ts`, `Utilities/CRM.md`'s `memories.ts` row),
    `useMemories.reviseBlocks` (`Utilities/Chat UI.md`), and
    `MemoryCardView`'s block canvas (`BlockCanvas.tsx`, `Public Site.md`'s
    rows for both) — see those files for the mechanics. Deliberately
    narrower than the fuller canvas the design handover proposed: exactly
    two block types (text, image — no video/quote/divider/gallery), no
    drag-to-reorder, no mobile change. **The block canvas renders
    immediately on open** — no pencil, no separate "Edit mode": a memory
    with `body_blocks: null` gets a default single text block derived from
    `memory.body` (`buildDefaultBlocks()`, matching the reference
    prototype), and text content commits on **every keystroke** (not
    blur-gated — a deliberate, confirmed reversal of the first same-day
    attempt at this, which used blur-gating and a pencil-gated lazy seed;
    both were corrected once the handover confirmed the reference's actual
    behavior). Insert control: a "+" ("BlockInserter") sits before the first
    block and after every block (N blocks → N+1 slots) — independent of
    reordering, which stays out of scope — expanding to exactly 2 icon
    options (text, image) rather than the reference's 6-type picker; picking
    "image" opens a picker of the session's own ready photos rather than
    inserting an unattached block. Every keystroke round-trips through
    `reviseMemoryBlocks`'s full validation and a DB write (the media-item
    ownership check in particular) — an accepted, explicit cost, not an
    oversight; a short debounce was flagged as a possible future
    optimization, not implemented. Image blocks reference an existing
    `media_item_id` only (attach from the session's own already-uploaded
    photos) — no new upload/storage path. A default image-block-first
    ordering for a "linked photo" is implemented structurally
    (`getLinkedMediaItemId()`) but has no live trigger — no field on
    `MemoryRow` represents a linked photo yet (that's the still-unbuilt
    photo-bookmark work below), and none was invented to force it.
    **The per-upload "photo bookmark" gap this left is now fixed — see the
    Photo Bookmark entry directly below, shipped later the same day.** Image
    blocks in this panel remain a separate, manual workaround for
    viewing/attaching an already-known photo — unaffected by, and not a
    duplicate of, the photo bookmark's own creation path. Still unaffected
    by: add-to-memory (`PhotoUploadActions.tsx`'s "+" and
    `MemorySavedReceipt`'s own "+" are both stubs — no `photo_artifacts`
    write path exists) and memory canvas sorting/filtering — both still
    unbuilt. Stage F (mobile slide-up panel) is no longer blocked on this
    note; it shipped 2026-08-09, see the sprint-close pointer entry above.
    **GPS
    indicator — no longer a gap, closed same night via GPS Extraction (PR
    #316):** the badge's structural support referenced here is no longer
    just structural — `media_items.latitude`/`longitude` are now live-written
    on every photo upload (`services/media/processor.ts`'s
    `extractGpsCoordinates`, see `System Docs/Database Schema.md`'s
    `media_items` row) and the badge genuinely renders whenever a photo's own
    EXIF carried GPS data (`MessageList.tsx`'s `gpsFound` prop into
    `PhotoUploadActions.tsx`) — absent only for the common case of a photo
    with no GPS EXIF (screenshots, downloads, location services off), not
    because the pipeline is missing.
  - **Photo Bookmark shipped 2026-08-08 (same day as Memory Canvas V1
    above, later in the day).** `PhotoUploadActions.tsx` renders a Bookmark +
    "+" action row below every ready photo thumbnail in the transcript
    (`MessageList.tsx`'s upload map) — placement corrected mid-build from an
    overlay-on-the-photo spec (`Design Handovers/design_handoff_memory_canvas_08_2026/PhotoUploadActions.tsx`)
    to a separate row below it, per a second, more recent reference
    (`chat-widget-canvas.jsx`'s `UploadThumb`). Bookmark calls a new
    creation path, `createPhotoMemoryFromMedia` (`services/crm/memories.ts`,
    `Utilities/CRM.md`'s `memories.ts` row) — sibling to
    `createMemoryFromAnchor`, not a branch inside it — which titles/bodies
    the memory from the photo's own AI-generated caption
    (`media_items.derived_content`, never trusted from the client) rather
    than the anchor message's text, fixing the standing gap where a
    caption-less photo message had no bookmark control anywhere (the old
    whole-message bookmark only rendered alongside caption text). This also
    fixes the **anchor-collision bug** the "still not built" note above
    flagged: `artifacts.media_item_id` (see `Database Schema.md`'s
    `artifacts` row — corrected the same day from a wrong "likely leftover"
    guess once this wired it up for real) is now populated alongside
    `anchor_message_id`, and `useMemories.ts` composes both into a lookup
    key, so two photos on the same chat message resolve to two independent
    memories instead of colliding. "+" (add to a memory) on the photo row,
    and a new stubbed "+" on `MemorySavedReceipt` (add to a story, same
    pattern as `MemoryCardView`'s own header "+"), both fire the existing
    "coming soon" toast — neither is real; `photo_artifacts` (the actual
    many-to-many write path either would need) is still unbuilt.
    **Found and fixed same day, live-preview testing:** the pre-existing
    whole-message bookmark was never gated off for a message that also has
    a photo — it still renders right alongside the new per-photo Bookmark
    on any photo message with caption text, by design (confirmed with
    Jeff — both stay). Clicking it (rather than the per-photo one) routes
    to `createMemoryFromAnchor`, which used to leave the raw
    `[MEDIA_UPLOAD: ...]` marker sitting in that memory's title and body,
    since the shared marker registry had never learned that marker type —
    fixed by registering it (`MEDIA_UPLOAD_MARKER`/
    `MEDIA_UPLOAD_FAILED_MARKER`, `services/chat/ui/v1/registry.ts`; see
    `System Docs/Marker Syntax.md`'s own entry). `getLinkedMediaItemId`,
    `buildDefaultBlocks`, `BlockCanvas`, `PhotoUploadActions`, and
    `createPhotoMemoryFromMedia` were all confirmed correct in isolation —
    the bug was entirely upstream, in what a message's raw content still
    contained by the time the OLD path read it.
  - **`ScrollToLatestButton`'s 48px visibility threshold and
    `ChatThread.tsx`'s pre-existing 100px auto-follow band can disagree,
    2026-08-08 (PR #310).** The button (own threshold, 48px from bottom)
    and `ChatThread.tsx`'s own near-bottom auto-scroll tracking (a separate,
    pre-existing `NEAR_BOTTOM_PX = 100` constant, unrelated to this feature)
    are two independent measures of "has the visitor left the bottom." In
    the 48–100px window, new content still auto-scrolls the visitor back
    down even though the button has already appeared — a brief flash, not a
    stuck state, since the button then correctly hides again once the
    auto-scroll lands. Low impact, not fixed — previously only documented in
    PR #310's own description; pulled in here so it doesn't require digging
    through PR history to find. **Fix if ever done:** either widen the
    button's threshold to match `ChatThread.tsx`'s 100px, or thread
    `ChatThread.tsx`'s own near-bottom state out to drive the button instead
    of a second, independent measurement.
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

- **Full System Docs audit found doc-vs-code drift across six files —
  2026-08-09, recorded here but not fixed (only the one gap directly caused
  by that day's earlier marker-pattern-unification work was fixed in the
  same pass — see `System Docs/Utilities/Chat UI.md`'s `registry.ts` row).**
  Three parallel research passes compared `Database Schema.md`,
  `API Routes.md`, `Pages.md`, `Shared Primitives.md`, `Design System.md`,
  and `Marker Syntax.md` against the actual code. None of these are
  functional bugs — every item below is a documentation-accuracy gap, not a
  runtime one — but each is detailed enough here that picking one up later
  doesn't require re-running the audit.
  1. **`Database Schema.md`:**
     - `prompt_conversations` has no documented table row despite active use
       (`services/prompt/conversations.ts`'s list/create/get/update/delete,
       all `.from('prompt_conversations')`) — only mentioned in passing as an
       FK target on the `blocks` and `prompt_sets` rows.
     - `chat_sessions.title`/`starred` are documented (line 23) as *"no
       application code reads or writes this column yet"* — false. Both are
       actively read/written (`services/crm/sessions.ts`,
       `app/api/sessions/[id]/route.ts`, and
       `app/api/sessions/[id]/title/route.ts`'s AI session-title generator).
       **`API Routes.md` already documents this correctly** (its
       `/api/sessions/[id]` PATCH row explicitly says "Also accepts `title`
       and `starred`, written straight to their like-named `chat_sessions`
       columns") — the two docs directly contradict each other;
       `Database Schema.md` is the stale side.
     - `do_not_engage` has zero code references anywhere (confirmed via
       repo-wide search) but isn't flagged as orphaned the way
       `tenant_features`/`session_tokens` are on the same page.
  2. **`API Routes.md`:** roughly 20 real `route.ts` files are undocumented,
     including the entire member-chat media API (`app/api/media/**` —
     `upload-url`, `[id]/url`, `[id]/retry`, the base GET), `.../feedback`,
     `.../conversion-events`, `.../title`, `.../memories/[memoryId]`,
     `app/api/webhooks/media-process`, `app/api/events/media`,
     `app/api/transcribe`, `app/api/members/sync`, `app/api/auth/magic-link`,
     the appearance/branding admin API (`app/api/admin/appearance` +
     `.../history`), `app/api/admin/prompt-chat`,
     `app/api/admin/members/search`, `app/api/admin/sessions/[id]/transfer`,
     `app/api/admin/prompt/preview`, both `.../prompt-sets/[id]/compiled`
     routes (admin + platform), `app/api/platform/prompt-types`, and the
     entire platform tenant-management API (`app/api/platform/tenants` +
     `[id]`). No documented route was found missing its file.
  3. **`Pages.md`:** only 3 of the 10 real `app/admin/**/page.tsx` files are
     listed (Settings, Members, Blocks). Undocumented: `app/admin/page.tsx`
     (the Inbound Chats dashboard), `app/admin/prompt-builder/page.tsx` (the
     Composer editor), `app/admin/prompt/page.tsx` (the legacy editor), and
     all three `app/admin/prompt-studio/{assets,history,prompt}/page.tsx`
     files, plus `app/admin/sessions/[id]/page.tsx`.
  4. **`Shared Primitives.md`:**
     - States `app/admin/members/page.tsx` lacks the sticky header/scroll-body
       split that `app/admin/page.tsx`/platform members has — it's since
       been added (`HEADER_FRAME_STYLE`/`SCROLL_AREA_STYLE`, `pt={0}` scroll
       `Box`; the code's own comment says it mirrors the other two pages).
     - `UnifiedAdminShell` (`components/admin/shell/UnifiedAdminShell.tsx`) —
       the component actually wrapping every admin/platform page
       (`app/admin/layout.tsx`, `app/(platform)/layout.tsx`) — isn't
       documented under any name; the doc's companion (`Admin Overview.md`)
       still references a deleted `components/admin/layout/AdminShell`
       (confirmed gone from the filesystem).
  5. **`Design System.md`:**
     - The text-muted token is documented as `rgba(26,25,23,0.55)`; the
       actual value in `app/(jefflougheed)/globals.css` is `0.70`.
     - The documented selector `html[data-palette="inkwell"]` doesn't exist
       anywhere in code (confirmed: zero `.tsx` matches repo-wide) — the real
       selector actually used throughout `app/(jefflougheed)/globals.css` is
       `html[data-brand="jefflougheed"]`.
     - A fourth brand, "Legacy" (the `app/legacy/` storefront, with its own
       `--lg-*` token set in `tailwind.config.js`/`app/legacy/globals.css`),
       isn't mentioned at all — the doc covers only jefflougheed/inkwell,
       SBL, and Heirloom.
  6. **`Marker Syntax.md`:**
     - The EMAIL section (line 59) attributes marker emission to
       `DEFAULT_SYSTEM_PROMPT` (`services/prompt/sage-prompt.ts`) — that
       constant is now just a one-line generic fallback string ("You are a
       helpful assistant... experiencing a brief technical issue...") with no
       marker instructions at all. The real mechanism is
       `member-context.ts`'s `markerInstruction` (`getMemberContext`, gated
       on `isFirstTurn`) — which this same doc describes correctly two
       sections later under MEMBER CONTEXT, so this is a
       **self-contradiction within the file**, not just staleness against
       code.
     - The retired-CONTACT section (line 169) claims the claim-session
       infrastructure (`POST /api/sessions/[id]/claim`, `claimSession`,
       `ensureClerkUser`) is "client-orphaned — no surface calls it." False:
       `MessageList.tsx`'s `handleAuthSuccess` (wired as `MagicLinkCard`'s
       `onSuccess`) calls `claimCurrentSession()` (`chatStore.tsx`), which
       hits that exact route — it's the live path behind `[ACCOUNT_CREATE:]`
       → `MagicLinkCard`. **The identical stale "client-orphaned" claim also
       appears in `API Routes.md`'s own `/api/sessions/[id]/claim` row** —
       so fixing this needs both docs touched, not just `Marker Syntax.md`.

- **Hardcoded hex color values found in shipped code — 2026-08-09, found
  during the same docs audit, NOT fixed. A real code violation, not
  documentation drift — tracked as its own entry, distinct from the
  doc-drift entry above.** CLAUDE.md's design-quality principle and
  `System Docs/Admin Overview.md`'s explicit rule ("No hardcoded hex
  values — all visual values flow through Mantine's theme system") are both
  violated in shipped files:
  - **Admin/Mantine side** (should flow through
    `components/admin/theme/mantine-theme.ts`): `app/admin/page.tsx:17`,
    `app/admin/members/page.tsx:28`,
    `app/(platform)/platform/members/page.tsx:26`,
    `app/admin/prompt-studio/blocks/page.tsx:18`,
    `app/admin/prompt-builder/page.tsx:1030-1031` (all `background: '#fff'`);
    `app/admin/settings/ThemePreview.tsx:132`,
    `app/admin/settings/AdminPreview.tsx:67,82,99,114` (`color: '#fff'`);
    `components/admin/lib/badges.tsx` (confirmed 40 raw hex occurrences
    across the file, e.g. `#2d6a4f`/`#1c7ed6`/`#fa5252` as Mantine badge
    colors).
  - **Public/Tailwind side** (should reference the jefflougheed CSS vars,
    e.g. `var(--color-accent)`): `components/shells/widget/sage/BookingCard.tsx:92,97,99,117`
    (`bg-[#2d6a4f]`, `text-[#1a1917]` ×3) and
    `components/shells/widget/WidgetShell.tsx:366` (`background: '#2d6a4f'`)
    — both hardcode the literal value that happens to match the documented
    jefflougheed accent/text tokens instead of referencing them, defeating
    the token indirection `Design System.md` describes.
  Not fixed in this pass — recorded as backlog per explicit scope
  instruction. The fix itself is mechanical (swap each literal for its
  Mantine theme color / CSS var) but touches ~10 files across both design
  systems, so it's its own task, not a drive-by.

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

- **RESOLVED 2026-08-09 — `processDocument`'s classification pass was
  vulnerable to the same class of risk as the image-vision fence-wrapping
  bug, identified and fixed the same day.** `services/media/processor.ts`
  used to ask Claude Haiku to classify extracted document text in one word
  via a plain free-text instruction (`'Classify this document in one word
  (e.g. letter, memoir, ...). Respond with only the single classification
  word.'`), then stored `content[0].text.trim().toLowerCase()` directly as
  `media_items.classification` — no validation, nothing stripping a
  markdown fence or extra prose the model might prepend. It never hit the
  exact bug the image-vision call did (no `JSON.parse()` involved, so
  nothing threw), but the underlying exposure was the same: an
  unconstrained free-text response with no defense before being persisted
  verbatim. Found while documenting `callVisionTool` (the fix for the
  image-vision bug, see `System Docs/Utilities/Media.md`'s tool-use
  section) as a candidate second caller, then confirmed and fixed same-day
  rather than left as a flagged-but-unaddressed note — the recurrence of
  the same risk class was the signal this was worth generalizing and
  closing immediately, not deferring. **Fix:** migrated the classification
  call to the same forced-tool-use mechanism, via a new `callTextTool`
  wrapper (`services/media/vision-tool.ts`) sharing its internal fetch/
  parse/fallback core with `callVisionTool` — the response schema now
  constrains the model's output at the API level, same as the image path.
  Behavior preserved exactly: still best-effort, still defaults to
  `'document'` on any failure, never a hard-failure path for this
  sub-call.

- **RESOLVED 2026-08-09 — `processImage`'s no-tool-use-block edge case
  was wrongly treated as a soft-degrade instead of a real failure;
  reversed the same day.** When `callVisionTool` returns `null` (no
  `tool_use` block, and its own internal fence-stripped-JSON fallback also
  failed — a genuine API-level anomaly), `processImage` initially fell
  back to a fixed placeholder caption (`'A photo.'`) and still marked the
  item `status: 'ready'`, deliberately avoiding a `'failed'` status. The
  reasoning: `createPhotoMemoryFromMedia`'s 409 "not ready" gate treats
  empty `derived_content` as still-processing, so an empty caption would
  make the photo permanently unbookmarkable. That premise was wrong —
  `POST /api/media/[id]/retry` (`app/api/media/[id]/retry/route.ts`)
  already existed and re-runs the whole pipeline, including this vision
  call, from scratch, so a `'failed'` item was never actually stuck. The
  real, and only, problem the placeholder was guarding against was "ready
  with empty content forever," which correctly failing the item does not
  recreate. Hiding the failure behind a placeholder was worse than the
  alternative: the member got a memory with a generic, silently-wrong
  caption forever, with no signal anything went wrong and no prompt to
  retry. **Fix:** the `null` branch now throws
  (`'Vision tool call returned no usable output'`) and flows through the
  same failure path (`processMediaItem`'s outer catch → `status:
  'failed'`, `MEDIA_PROCESS_FAILED` with `pipeline_step: 'claude_vision'`)
  every other failure in this function already uses.
  `processDocument`'s classification `null` handling is unchanged and
  intentionally different — a missing one-word classification staying at
  the `'document'` default remains a reasonable soft-degrade, since it
  isn't core content the member sees directly the way a photo's caption
  is.

- **RESOLVED 2026-08-10 — follow-up: retry generalized into a reprocess
  capability, closing the gap the fix above left for pre-existing bad
  rows (PR #327).** The 2026-08-09 fix immediately above stopped *new*
  corrupted captions from ever landing as `'ready'`, but did nothing for
  `media_items` rows already marked `'ready'` with bad `derived_content`
  from before that fix shipped — the retry route's gate
  (`item.status !== 'failed'`) rejected them outright, since they were
  never `'failed'` to begin with, just wrong. `POST /api/media/[id]/retry`
  (`app/api/media/[id]/retry/route.ts`) now accepts any **settled**
  status (`'ready'` or `'failed'`), rejecting only `'pending'`/
  `'processing'` (already in-flight — a second concurrent
  `processMediaItem` run would race the one already running).
  `MediaGallery.tsx`'s action button follows suit, now rendering on
  `'ready'` items too, labeled "Reprocess" rather than reusing "Try
  again" — re-running analysis on something that already succeeded reads
  as a different user intent than recovering a failure. See
  `Utilities/Media.md`'s "The pipeline" section and `Public Site.md`'s
  `MediaGallery` row for the current behavior.
