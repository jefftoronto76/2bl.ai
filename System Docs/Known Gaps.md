# Known Gaps

## Known Gaps

Tracked, not yet addressed. See `System Docs/ARCHITECTURE_OVERVIEW.md` and
`Backlog/SERVICEMIGRATION.md` for the full picture.

## Auth, Members & Security

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

- **`x-preview-tenant` forwarded for API paths but not page requests —
  found and fixed 2026-08-17 (PR #411).** `middleware.ts` set the header
  only inside a block gated on `isApiPath`, so a preview *page* render had
  no way to resolve a tenant: `*.vercel.app` never matches `tenants.domain`,
  so `getTenantFromRequest` fell through to `PREVIEW_TENANT_ID` and returned
  null when that wasn't set. `app/heirloom/page.tsx` wraps its entire member
  lookup in `if (tenantId)`, so `isAdmin` and `members.role` silently
  resolved false/null for **every** visitor on preview, making any
  owner/admin-gated UI untestable there. Fixed by setting the header in each
  recognized `?preview=` branch, from the param those branches already hold.
  **Note the fix that was deliberately not taken:** widening the API block by
  dropping its `isApiPath` guard. That block ends in an early
  `return NextResponse.next(...)`, so covering page requests there would
  short-circuit them ahead of the host-rewrite blocks *and* ahead of
  `auth.protect()` on `/admin` — leaving the admin surface unauthenticated
  on preview. `middleware.test.ts` (the first tests this file has had) pins
  that: the `auth.protect()` case fails if the guard is removed.
  **Lesson:** a request header set on one path class and not another fails
  asymmetrically and quietly — the API-driven parts of the page worked
  perfectly while the server-rendered parts silently degraded, which is
  precisely why it survived so long. When adding a header for tenant/identity
  resolution, ask which path classes need it, not just the one in front of
  you. Consequence to be aware of: `gateEnabled`/`isAuthorized`/`isAdmin` now
  resolve for real on preview pages, so a tenant with
  `invite_gate_enabled: true` will genuinely gate there. Remaining caveat
  (pre-existing, unchanged): the forwarded value is the raw param/cookie
  string matched against `tenants.slug`, so the alias values `sbl` and
  `jefflougheed` only resolve if a tenant carries that exact slug.

- **`ChatState.isMember` means signed-in, not role.** `isMember`
  (`chatStore.tsx`) is `isLoaded && !!isSignedIn` — pure Clerk sign-in state,
  so it is true for **every** signed-in role (`owner`, `admin`, `member`,
  `viewer`). That is correct behaviour, not a defect: every consumer — voice
  access, uploads, `SaveChatCTA`, the sidebar sign-in nudge — wants exactly
  that boundary, and an owner or admin genuinely is a member, so they should
  get member features. The name matches how it is used; no rename is called
  for. The one rule it carries: **don't use `isMember` to tell roles apart.**
  It cannot distinguish a `member` from an `admin`, `owner` or `viewer` — use
  `ChatState.memberRole` (the real `members.role`) for anything role-shaped.
  `isAdmin` is a second, partial signal (`role === 'admin' || role ===
  'owner'`) that likewise cannot separate a `member` from a `viewer`. See
  `System Docs/Public Site.md`'s `ChatInput`/`chatStore` rows and
  `System Docs/Utilities/Members.md`'s `MemberRole` entry. Worth documenting
  only because of one historical near-miss: the composer caption gate's first
  draft (2026-08-17, PR #409) assumed `isMember` specifically excluded
  admin/owner/viewer. That assumption was wrong, not the variable; it was
  corrected within the same PR, and prompted plumbing `memberRole` through.
  **Open question (raised 2026-08-17, not yet investigated):** `isMember` is
  true for the `viewer` role too, so a viewer currently gets the same voice
  and upload access as a full member. Nobody has decided whether that is
  intentional or whether viewers should be scoped out of those features —
  flagged for a decision, not filed as a bug. Separate trap on `memberRole`
  itself: it is null both for a genuinely anonymous visitor and for one whose
  role the server couldn't resolve, so pair it with `isMember` rather than
  reading null as "anonymous".

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

- **Admin/member invite acceptance had the same reliability gaps already
  fixed for story invites on 2026-08-10/11 (see the entry above) — found
  and fixed 2026-08-13 (PR #367).** Unlike the story-invite path,
  `?invite=TOKEN` acceptance relied entirely on the model organically
  noticing a pre-auth invite holder and deciding, conversationally, to
  prompt account creation — no deterministic trigger existed. Three fixes:
  1. **`autoOpenChat` was opt-in, not guaranteed.** `page.tsx` read
     `members.auto_open` (admin-set per invite, defaulting `false`) instead
     of forcing the chat panel open for any valid pre-auth token, so most
     admin invites never opened the chat automatically at all. Fixed:
     `autoOpenChat = true` unconditionally when a valid admin/member token
     authorizes the visitor. The `auto_open` column and its
     `InviteMemberModal.tsx` toggle are left in place for other consumers;
     this path just stops reading it.
  2. **No deterministic account-creation prompt.** Even when the chat did
     open, nothing told the visitor they needed to sign up — same shape as
     story-invite gap #344 above. Fixed with a new branch in `chatStore.tsx`'s
     auto-greet effect: a personalized (`invitedName`, when the admin set
     one) or generic greeting, immediately followed by an injected
     `[ACCOUNT_CREATE: admin invite]` message when not signed in. Mutually
     exclusive with the story-invite branch both structurally and via an
     explicit `!storyInviteTokenRef.current` guard.
  3. **Accept-call failures were silent.** The `/api/heirloom/invites/accept`
     fetch on the sign-in transition was pure fire-and-forget — no
     `res.ok` check, no fire-once guard, no user-facing message on failure.
     Same shape as story-invite gap #348 above. Extracted into
     `acceptMemberInviteToken`, matching `acceptStoryInviteToken`'s pattern
     exactly.

  **Separately found during the same pass: `AuditAction.MEMBER_INVITE_ACCEPTED`
  was being logged, but invisibly.** `app/api/heirloom/invites/accept/route.ts`
  called it with `tenant_id: null` (the route doesn't have the real value in
  scope) — every acceptance was logged, but any query scoped by `tenant_id`
  (the standard pattern everywhere else in this codebase) silently missed
  every row. Confirmed live: a real member's acceptance (active status,
  `used_at` stamped) produced zero matching rows under a tenant-scoped
  query. Fixed by moving the `logEvent` call inside `acceptInvite()`
  (`services/members/members.ts`), which already has `row.tenant_id` in
  scope for its cross-tenant guard, and removing the now-duplicate call
  from `route.ts`.

- **`members.name` was not guaranteed to be set on most signup paths —
  found 2026-08-13, closed 2026-08-14.** Of the paths that create/activate
  a `members` row, originally only two (the OTP card itself, and
  `SaveChatCTA`, both of which require a name field to submit) reliably
  set `name`. Confirmed via live query: 7 rows with `name IS NULL`,
  including one real member (not a test account) who activated via
  `GateView`'s Clerk-prebuilt-modal path — that path calls
  `/api/heirloom/members/claim`, which only sets `name` conditionally (if
  Clerk's own signup UI happened to collect first/last name).

  **A second, worse bug compounded this:** `acceptInvite`'s orphan-cleanup
  (step 3) actively discarded a captured `name` on every occurrence it
  triggered. The setup: an invited `members` row starts with `clerk_id =
  null`. On real signup, two independent effects fire off the same
  Clerk-session-activation event with no ordering between them —
  `MagicLinkCard`'s `onSuccess` (calls `/api/members/sync`, which upserts
  *by `clerk_id`* and, finding no match yet, inserts a fresh row with the
  real name) and `chatStore.tsx`'s sign-in-transition effect (calls
  `acceptInvite`, which finds the original invited row *by token* and
  deletes any other row sharing that `clerk_id` as an "orphan" before
  stamping the invited row active). Whichever order those two calls
  resolved in, the orphan-cleanup path deleted the freshly-named row and
  stamped a nameless one — active data loss, not just a missing field, on
  every occurrence, independent of which invite mechanism triggered it.

  **Fixed 2026-08-13 (PR #368):** `acceptInvite` now rescues the orphan's
  `name` before deleting it — selects `name` alongside `id` in the orphan
  query, and if exactly one orphan is deleted with a non-null `name` and
  the invited row's own `name` is still null, includes it in the same
  update that stamps the row active. Never overwrites an existing name.
  Verified via 4 new unit tests covering the rescue case and its edge
  cases (existing name not overwritten, null orphan name, multiple
  orphans).

  **Closed 2026-08-14 (PR #371):** `acceptStoryInvite`
  (`services/crm/story-invites.ts`) and `linkInvitedMember`
  (`services/members/members.ts`, the Clerk webhook path) previously never
  set `name` at all, regardless of signup path — this entry originally
  flagged both as still open. Both now take an optional trailing `name`
  param, derived from Clerk's `firstName + lastName` the same way
  `syncMember`'s webhook-fallback caller already does. Neither needed
  rescue logic like `acceptInvite`'s above — neither has a delete step, so
  a losing race against `/api/members/sync` just leaves whatever that
  other write already set alone (`acceptStoryInvite` falls through to its
  existing-member branch on a 23505; `linkInvitedMember`'s UPDATE surfaces
  a unique-constraint failure already handled by the existing
  `MEMBER_LINK_UPDATE_FAILED` path). `GateView`'s Clerk-modal bypass
  itself is unrelated to this fix and untouched.

- **Admin invite email/phone/name only ever reached the greeting text, not
  the sign-up form itself — found and fixed 2026-08-14 (PR #372).**
  `createMemberInvite` already accepted all three, and `invited_name`
  reached `chatStore.tsx`'s deterministic greeting (see the PR #367 entry
  above), but none of it pre-filled `MagicLinkCard`'s actual form fields —
  `initialName`/`initialEmail`/`initialPhone` were only ever populated by
  scanning the model's own `[NAME:]`/`[EMAIL:]`/`[PHONE:]` markers in
  `MessageList.tsx`, a completely separate mechanism from the invite data.
  Separately, `validateMemberToken()`'s select string and the
  `MemberInviteRow` interface were missing `phone` entirely, even though
  `createMemberInvite` already wrote it — the invited row's phone number
  was unreachable to any caller. Fixed by threading `phone` through
  `validateMemberToken`, then `invitedEmail`/`invitedPhone` down through
  `page.tsx` → `HeirloomApp.tsx` → `chatStore.tsx`'s `ChatProvider` →
  `MessageList.tsx`, where the `visitorName`/`visitorEmail`/`visitorPhone`
  marker-scan derivations now fall back to the invite's own value when no
  marker has fired yet — a marker emitted mid-conversation still wins,
  since it's checked first. Story invites are unaffected by design: a
  story invite link is durable and multi-use, with no specific invitee's
  contact info to fall back to.

- **No identity dedup across signup methods — found 2026-08-13, not
  addressed.** `members` rows are matched only by `clerk_id`; nothing
  cross-checks name/phone/email against existing rows. A person who signs
  up once via email and again via phone (two separate Clerk identities)
  gets two fully separate, both-`active` `members` rows with no merge path
  and no product-level way to detect or reconcile it. Confirmed live: one
  real member has two active rows six weeks apart, one per contact method.
  This is a product/design gap (no shared identity key exists to dedupe
  on), not a code defect — no fix scoped yet.

- **`primer` (free-text field on both `members` and `story_invite_links`)
  is injected into the chat system prompt with zero delineation from real
  instructions — found 2026-08-13, not addressed.**
  `services/chat/server/member-context.ts` concatenates `primer` directly
  into the `MEMBER CONTEXT` block with no wrapper distinguishing
  user-supplied text from instructions, immediately adjacent to the
  marker-emission instruction that tells the model to silently append
  `[NAME:]`/`[EMAIL:]`/`[PHONE:]` tags. Admin-set `primer` (on `members`)
  is lower risk — only tenant admins can set it. **Story-invite `primer`
  is member-wide risk**, not admin-only: any Heirloom member who owns a
  story can set it via `POST /api/heirloom/story-invites`, up to 500
  chars, no sanitization beyond trim/length. Compounded by `autoOpenChat`
  behavior: story invites force the chat open unconditionally, and fall
  through to an automatic `sendHidden('Hi')` LLM call (not the deterministic
  greeting) whenever the story-title or inviter-name lookup fails — a path
  not controlled by the story owner, meaning a hostile primer could reach
  the model automatically without the visitor typing anything. **Fix not
  yet scoped:** wrap `primer` with explicit delineation before it reaches
  the system prompt; separately, decide whether story invites should keep
  forcing `autoOpenChat=true` with no opt-out (product decision, not just
  security).

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

- **`/api/heirloom/members/claim` (`claimMembership`) is effectively
  orphaned — expired-invite chat-first signup pass, 2026-08-14.** The
  invalid/expired `?invite=` token branch of `GateView.tsx` (previously:
  static "Claim a free membership" button → `openSignUp()`) was replaced
  with the same deterministic chat-first `[ACCOUNT_CREATE: expired invite]`
  pattern already used for admin/story invites — signup now happens via
  `MagicLinkCard` → `/api/members/sync` (`syncMember`, `status: 'active'`),
  not this route. The route's only caller, `GateView.tsx`'s own top-level
  `useEffect` watching the Clerk false→true sign-in transition, is shared
  plumbing across all three `GateView` branches and was left in place (not
  deleted) — but `GateView` no longer mounts at all for the
  invalid/expired-token population (`isGated` bypasses it), so the one
  realistic path that used to trigger this effect's sign-up transition is
  gone. The only way it could still fire is a signed-out visitor on the
  no-token `WaitlistView` branch signing in through some other UI element
  while `GateView` stays mounted — not a real trigger path today
  (`WaitlistView` has no sign-in UI of its own). **Left in place pending a
  decision to remove it** — not deleted without confirming nothing else
  depends on it.

- **Expired/invalid `?invite=` token now gets the same chat-first
  deterministic signup flow as valid admin/story invites — built
  2026-08-13, NOT YET LIVE-VERIFIED.** GateView's old path
  (`openSignUp()`'s Clerk-prebuilt modal, only reachable when a visitor's
  invite token fails validation) never guaranteed name capture and
  violated the marker-fallback principle. Replaced with the same pattern
  already proven for admin/story invites tonight: a new
  `memberTokenExists(token, tenantId)` check (services/members/members.ts)
  distinguishes a genuinely-issued-but-now-invalid token from a garbage
  `?invite=` string; only the former bypasses the gate. The bypass also
  requires `isLoaded && !isSignedIn` client-side (and `!session`
  server-side for `autoOpenChat`), so a signed-in-but-pending member with a
  stale link still sees GateView's "You're on the list." branch, not an
  unsolicited chat pop-open. `GateView.tsx` itself is unchanged — its three
  branches just become unreachable for this one case.
  `/api/heirloom/members/claim` + `claimMembership` are now effectively
  orphaned (no realistic remaining trigger) but left in place, not deleted.
  **Not yet done:** the four manual verification cases this fix specifically
  requires (real-expired-token, garbage-token, cross-tenant-token,
  signed-in-with-stale-token) haven't been run against a live preview —
  `tsc`/`next build` are clean but that doesn't substitute for the actual
  behavior check. Do this before trusting the fix in production.

- **`primer` (`members`/`story_invite_links`) still has zero delineation in
  the system prompt — flagged 2026-08-13, still not fixed as of
  session-context-service (2026-08-13).** See the entry above this one
  (same date) for the full gap. Explicitly NOT touched by
  session-context-service — that change built the reusable delineation
  mechanism (XML tags + `escapeForTag`, `services/chat/server/session-
  context.ts`, see `System Docs/Utilities/Chat Server.md`) for a *new*
  block (`<session_context>`), scoped deliberately to leave `member-
  context.ts`'s existing `primer` concatenation untouched rather than
  bundle an unrelated retrofit into that change ("One Change at a Time,"
  `CLAUDE.md`). **The fix is now more clearly scoped than it was on
  2026-08-13:** wrap `primer` the same way — `<member_context>` (or a
  `<primer>` sub-tag) plus `escapeForTag()` on the interpolated value —
  reusing the exact pattern that now has a second, real precedent in this
  codebase (`services/prompt/composer.ts`'s `<document_context>` was the
  only one before this). Still needs: the `autoOpenChat`-forced,
  no-owner-control auto-greet path decision flagged in the original entry.
  Not scheduled — still a separate, later task.

## Prompt & AI

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

*Cross-reference: the `primer` (member/story-invite free text injected into the system prompt with no delineation) gap is tracked in the `Auth, Members & Security` section, since the data source is member/invite-supplied text, not prompt-compiler internals.*

## Chat UI

- **No visual distinction between closing the chat drawer and closing the
  memory panel — found during Stage C live-preview review, 2026-08-08.**
  Both close actions look and feel similar enough that which one just
  happened isn't immediately obvious. Cosmetic, not functional — revisit
  only if real usage shows it's actually confusing, not preemptively.

- **Heirloom chat-widget V2 is UI-first; most of its backends do not exist
  yet.** The V2 pass (branch `06-11-26_mvp-ui-update`, 2026-06-12) shipped
  the presentation layer only. Story creation/read/delete are real now
  (2026-08-09 — see "Real story creation and persistence" below); still
  outstanding: Writing Prompts copy review (the 4 static prompts in
  `ChatHero`'s `WRITING_PROMPTS` are still placeholder-grade, own
  comment says "Writing Prompts have no backend yet"). **Share Heirloom —
  resolved 2026-08-15** (wire-share-heirloom-modal): `ShareHeirloomModal`
  is mounted by `ChatHero.tsx` and both entry points are live — the
  `SidebarV2` nav row and the `ChatHeader` icon are no longer inert.
  (**Narrowed 2026-08-16** by the mobile chat header redesign: the header
  icon is desktop-only now, so on mobile the sidebar nav row is the sole
  entry point and a phone shows no Share affordance until the drawer is
  opened. Both entry points remain live on desktop.) The
  sidebar row needed a real fix, not just the prop it had never been fed:
  its `onShareHeirloom?.()` call was already wired but sat behind a
  hardcoded `opacity-40 pointer-events-none` (the same leftover-inert-
  classes bug as the Stories "Create" button below, which that entry
  already flags as a pattern worth grepping for). Its default `shareUrl`
  is now the real `heirloom.2bl.ai` domain plus share UTMs, replacing the
  `heirloom.life` placeholder — **no analytics tool reads those UTMs
  yet**, they're on the URL so links shared now stay attributable once
  something does. There is still no share *backend* (no counts, no
  per-share records) — the modal is client-only by design. The v1
  `Sidebar.tsx` is superseded and unmounted — delete after preview
  verification. **Uploads removed 2026-08-12**
  (`sidebar_uploads_scrim_stories_2006` handover) — the sidebar's Uploads
  nav row was a permanently-disabled stub with no backing feature; rather
  than build one, the dead row was deleted outright (uploads already
  surface inside Media). **Mobile drawer tap-outside-to-close — regressed
  2026-08-12 by that same handover, resolved 2026-08-16
  (`mobile-sidebar-tap-outside`).** Dropping the drawer's `bg-black/40`
  scrim also deleted the only tap-outside dismiss target, which the
  handover flagged as an open question ("decide which before shipping")
  rather than resolving — it shipped undecided, leaving the Close-X as
  the sole touch-reachable way out of the drawer for four days. Fixed
  the way that handover proposed: an invisible `absolute inset-0 z-20`
  tap-catcher in `ChatHero.tsx`'s mobile branch, carrying no background
  and no fade, so the deliberate no-dimming decision stands untouched.
  See the `ChatHero` row in `System Docs/Public Site.md`.
  **The catcher now depends on the drawer NOT being full-bleed —
  2026-08-16 (`mobile-sidebar-drawer-width`), same day.** That change
  widened the mobile drawer from `w-64` to `w-[86%]`, so the catcher is
  `inset-0` but only its uncovered ~14% strip is actually reachable (it
  sits at `z-20`, under the drawer's `z-30`). The remaining strip is
  therefore load-bearing, not slack: taking the drawer to 100% would
  leave the catcher fully covered and silently re-open this same
  regression, with no test failing on width alone — which is why
  `ChatHero.mobileSidebarWidth.test.tsx` asserts the `z-30`/`z-20`
  ordering and tap-outside dismissal alongside the width. **Still open,
  and deliberately not decided by that fix:** the same handover's
  broader question of whether the app standardizes on scrim-everywhere
  (matching Media's bottom sheets) or scrim-nowhere (matching this
  drawer and the full-screen mobile overlays). Note the scope of that
  open question is narrower than the `sidebar_uploads_scrim_stories_2006`
  handover implies. It warns the change also affects
  `handover_mobile_memory_panel_scrim` — an earlier handover that asked
  the mobile memory panel to copy the sidebar's (now-deleted) scrim.
  **That handover is not in this repo** — grep finds the name only inside
  the sidebar handover's own prose, with no matching file or directory
  under `Design Handovers/`, so it is unreachable as a reference and may
  never have been checked in. It is also moot in practice: the mobile
  memory panel shipped as a fully opaque `inset-0`/`h-[100dvh]` overlay,
  which settles its own scrim question on independent grounds (nothing is
  left visible behind it to dim or catch a dismiss-tap on — see the
  comment above that block in `ChatHero.tsx`). So the standardization
  question is live only for surfaces that leave a visible strip behind
  them, which today means this drawer and Media's `85vh` sheets. **Per-story collaborator invites — resolved
  2026-08-10**, see "Invite — real as of 2026-08-10" and
  "Superseded, same day — reusable-story-invite-links" below for the full
  mechanics (`story_invite_links`, `InviteCollaboratorsModal`). **Conversation
  search — resolved (Aug 2026 "Search and Collapse Bar" work, commit
  `a79b295c`, landed by 2026-08-13, doc gap only — corrected here
  2026-08-14).** The sidebar field was a visible stub when this bullet was
  first written; it is not one anymore — `SidebarV2`'s `SearchField` now
  drives a real, live, title-only filter (Phase 1: conversations by title,
  stories by name; memory content is a separate later phase per the
  handover) via `query`/`handleSearch`/`filteredSessions`/`filteredStories`
  in `SidebarV2.tsx`. The doc previously never recorded this as shipped —
  it was only discoverable indirectly via the "Collapsed-rail search icon
  does nothing" bug entry below, which describes a real bug in the
  *collapsed-icon* variant of an otherwise-working search feature, not a
  stub.

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
  remain deliberate no-ops (now conversation-only in the menu — see the
  2026-08-13 entry immediately below), and `star` / `rename` remain no-ops
  for story rows specifically (only ever wired for conversations). `invite`
  is no longer a kebab item at all — see "Invite — real as of 2026-08-10"
  below for its own dedicated entry point.

  **`RowMenu` is now target-aware, and a new story-only `admin` item was
  added — story-admin-menu-item (2026-08-13).** Before this pass,
  `MENU_ITEMS` was one flat, unfiltered array rendered identically at both
  `RowMenu` call sites — `moveToChapter`/`removeFromChapter` showed on
  story rows too, purely by omission (no evidence of intentional design;
  they're chapter-related, not story-related, and were already deliberate
  no-ops for stories per the paragraph above). `RowMenu` now takes a
  `target: RowTarget` prop (threaded from each call site's own known
  `'conversation'`/`'story'` value) and each `MENU_ITEMS` entry carries a
  `targets: RowTarget[]` array it's filtered against — `moveToChapter`/
  `removeFromChapter` are now `['conversation']`-only, `star`/`rename`/
  `delete` stay on both. New entry: `{ key: 'admin', icon: Shield, label:
  'Admin', targets: ['story'] }`, positioned between Rename and the delete
  divider, matching the `Design Handovers/ Aug 2026 Atomic Updates/Updated
  Story Kebabs/` handover's spec. `'admin'` was added to `RowAction`
  (`types.ts`). The click is wired end to end — `ChatHero.tsx`'s
  `handleRowAction` sets a new `adminStoryId: string | null` state on
  `action === 'admin'`.

  **`StoryAdminPanel` built and mounted — story-admin-panel (2026-08-13),
  closing the gap above.** New `components/shells/membership/v2/
  StoryAdminPanel.tsx`, mounted as a third pane in `ChatHero.tsx` exactly
  like `MediaGallery`/`MemoryCardView` (same clamped `MEDIA_PANEL_WIDTH`
  desktop slot — a *preferred* 400px width, not fixed as of PR #379, see
  `Public Site.md`'s `ChatHero` row — same full-screen mobile overlay treatment, mutually
  exclusive with `openMemory`/`mediaOpen` via the same wrapping-handler
  pattern, not a shared enum). Two real pieces:
  - **Description** — the story's `body` column, editable for the first
    time since creation. Commits on blur, only when the trimmed value
    actually changed, via a new `updateStoryDescription`
    (`services/crm/stories.ts`) and `PATCH /api/stories/[id]` (the `[id]`
    route previously only had `DELETE`) — owner-scoped identically to
    `discardStory`. The parent (`ChatHero.tsx`'s `handleUpdateStoryDescription`)
    owns the mutation and updates its own `stories` state on success, same
    shape as `MemoryCardView`'s `onRetitle` — not a self-contained write,
    since the description is also shown elsewhere (`SidebarV2`'s row
    tooltip).
  - **Members** — closes the "no UI calls `revokeStoryCollaborator`" gap
    noted in the collaborator-removal pass below. The panel self-fetches its
    own roster (`GET /api/heirloom/story-invites?story_id=`, same route
    the invite modal already uses, self-contained like `MediaGallery`'s own
    fetch) and Remove opens a real confirm dialog before calling the real
    `DELETE /api/heirloom/story-invites/collaborators`. Success drops the
    row from local state directly (no re-fetch); failure keeps the dialog
    open with an inline error rather than silently dropping the row or
    closing without explanation. Deliberately **no memory count per row**
    even though the prototype reference shows one — story ↔ memory linking
    is still unwired (see "Real story creation and persistence" below),
    fabricating a number nothing tracks was already rejected in the
    collaborator-removal pass, and this pass didn't revisit that call.

  **Story kebab is now owner-only (2026-08-13).** The OR-subscribed
  widening in `listStories` (see "Real story creation and persistence"
  below) means a story-scoped collaborator now sees stories they don't
  own in their own sidebar. `SidebarV2`'s story rows previously rendered
  the kebab trigger unconditionally, which — combined with the no-op
  actions above — meant a collaborator could reach a menu of dead buttons
  plus a live, owner-scoped `delete` that would 404 silently-ish (toast
  only) rather than succeed. `listStories`/`createStory` now return
  `isOwner` per row (`row.user_id === caller`), threaded through `GET`/
  `POST /api/stories` and `Story.isOwner` (`types.ts`); `SidebarV2` hides
  the story-row kebab trigger entirely — not a filtered/empty `RowMenu` —
  when `isOwner` is false. One check (`story.isOwner`), no per-action
  gating: every current and near-term row action (star/rename/invite/
  delete/admin) is owner-only by the same reasoning, and there's no
  inter-member chat for a collaborator to coordinate one of these actions
  with the owner anyway. Scoped to the kebab only — the separate
  `onInviteStory` icon (own dedicated entry point, see "Invite — real as
  of 2026-08-10" below) is untouched by this pass; its own `createInviteLink`
  is already owner-scoped server-side (`services/crm/story-invites.ts`),
  same as `discardStory`, so a non-owner's click already fails server-side
  today — hiding it client-side too is a reasonable follow-up, not done
  here.

  **Collapsed-rail search icon does nothing, and a related chevron symptom
  needs a live look — found in testing (2026-08-13), Search and Collapse
  Bar combined header row.** When the sidebar is collapsed to its icon
  rail (`isExpanded=false`, desktop only — the mobile drawer never renders
  the collapse toggle at all, see the `SidebarV2` row above), `SearchField`'s
  collapsed branch renders a bare `<button aria-label="Search">` with no
  `onClick` at all — confirmed by reading the component: the collapsed
  early-return has no click handler whatsoever, so clicking it is a genuine
  no-op, not a stub that logs or defers. **Reported, not yet
  root-caused:** clicking that search icon also makes the collapse-toggle
  chevron `IconButton` — which sits directly below it in the collapsed
  vertical stack — visually disappear. Nothing in the file supports a
  mechanism for this: `expanded` (the only state either button could
  plausibly touch) has exactly one setter call in the whole component, the
  chevron's own `onClick={() => setExpanded((v) => !v)}`; the search
  button has no `onClick` prop at all, so it cannot be the one flipping
  `expanded`. This needs an actual browser/devtools reproduction, not a
  guess from a static read — flagged as unconfirmed rather than inventing
  a cause. **Net effect and recovery-path check:** once collapsed, there
  is no way back to the expanded rail via either control in the header
  row — the search icon does nothing, and the chevron (the only other
  affordance there) becomes invisible per the report above. Checked for
  any other way to re-expand: `expanded` is local `useState` inside
  `SidebarV2`, never lifted to a prop, and `setExpanded` is called from
  exactly one place in the file — no other button, keyboard shortcut, or
  `ChatHero.tsx`-side control can set it. `forceCollapsed` (`ChatHero.tsx`'s
  memory-panel/media-pane/admin-panel gate) only ever forces `isExpanded`
  to `false` on top of whatever `expanded` already is — it never sets
  `expanded` back to `true`, so toggling it off doesn't recover a
  stuck-collapsed sidebar either. The only confirmed recovery found is a
  hard reload/remount, which resets `expanded` back to its
  `useState(true)` default.

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

- **Share links carry UTM params that nothing reads — 2026-08-15
  (wire-share-heirloom-modal).** `ShareHeirloomModal`'s default `shareUrl`
  is `https://heirloom.2bl.ai/?utm_source=share&utm_medium=social&utm_campaign=withlove`.
  Those params were added deliberately ahead of any consumer, so links
  shared now stay attributable once something can read them — but **there
  is no analytics tool in this codebase at all**: no GA/Plausible/PostHog
  dependency in `package.json`, no tag in any layout, and no server-side
  landing handler that reads `utm_*` off the query string. A visit from a
  shared link is currently indistinguishable from any other visit. Two
  things follow. **First, whoever wires analytics up should know these
  already exist** — grep `utm_` before inventing a second, differently-named
  scheme; this file and the `ShareHeirloomModal` row in
  `System Docs/Public Site.md` are the only records that they do.
  **Second, the params are unvalidated by anything downstream**, so a typo
  in them would be silent — the component's own test
  (`ChatHero.shareHeirloom.test.tsx`) asserts each param by name against a
  literal spelled out in the test file, deliberately not imported from the
  component, precisely because nothing else would catch a drift.
  Related: one `utm_medium=social` covers every channel including Email and
  the plain copied link, neither of which is social. That is a consequence
  of one default URL shared by all four channels — per-channel mediums would
  require the `ShareChannel` contract to build URLs rather than receive one
  already built. Worth revisiting if per-network attribution ever matters;
  today the campaign is "someone passed this on", which one medium covers.

- **The conversation-switcher dropdown still has the blur-only dismissal
  bug the Account dropdown was just fixed for — 2026-08-16.** `ChatHeader`'s
  Account menu closed only on an explicit in-menu action, because its sole
  outside-close mechanism was an `onBlur` on its wrapper `div` — which fires
  only if the trigger actually held focus, and Safari (desktop and iOS)
  doesn't focus a `<button>` on click/tap. That one is fixed (document
  `pointerdown` + `Escape`; see the `ChatHeader` row in
  `System Docs/Public Site.md`). The story-switcher dropdown a few lines
  above it in the same file — `storyDropdownOpen` / `handleStoryBlur` —
  still has the identical `onBlur`-only pattern and was deliberately left
  untouched, because `SHOW_STORY_SWITCHER` is `false` and the whole block is
  unreachable, so the fix could not have been verified against anything.
  **If that flag is ever flipped back to `true`, this must be fixed in the
  same change** — copy the `dropdownOpen`-gated effect the Account menu now
  uses; it is a dozen lines directly below. A grep confirmed these two were
  the only `onBlur`-based *dismissal* handlers in the app (every other
  `onBlur=` in `components/` is commit-a-rename-on-blur on a text input,
  which is a different and legitimate pattern), so there is no third
  instance of this to hunt down.

- **`ChatHeader`'s Account trigger duplicates `IconButton` instead of using
  it — 2026-08-16.** Every other button in that header's icon cluster is an
  `IconButton`. **Which buttons are in that cluster is breakpoint-dependent
  as of the mobile chat header redesign, same day:** desktop still renders
  all five (Media, Memories, Share, Fullscreen, Close), mobile renders Close
  plus whichever of Media/Memories this session's own content earns — Share
  and Fullscreen are not passed at all there. The Account trigger is the
  constant in both — a raw `<button>` whose className today still reads
  `flex items-center justify-center w-10 h-10 rounded-lg transition-all
  duration-200 focus:outline-none focus-visible:ring-2
  focus-visible:ring-accent text-text-muted hover:bg-text-primary/10
  hover:text-text-primary` (plus its own `relative` + `before:` hit-area) —
  **that string used to be a byte-for-byte copy of `IconButton`'s
  inactive-branch classes; it no longer is**, and quoting `IconButton`'s
  current classes here would only go stale again the next time either file
  changes, so see `ui/IconButton.tsx` directly for the live comparison.
  **This drift is no longer hypothetical — it happened on 2026-08-16**,
  the same day the entry was written: the
  mobile single-tap fix below guarded `IconButton`'s hover behind
  `[@media(hover:hover)]:` and, being scoped to the sidebar, did not touch
  either copy in `ChatHeader.tsx` — the Account trigger (line ~341) or the
  `md:hidden` nav toggle (line ~209), which is mobile-only and so is the
  copy that actually pays for it. Both still arm hover on a first tap where
  their `IconButton` siblings no longer do. (Line numbers refreshed
  2026-08-16 after the mobile chat header redesign shifted them; the
  sibling count is no longer a fixed five either — see the note above.) Folding them in is a
  two-token edit per line; it was left out only to keep that fix inside the
  sidebar. The original cost still stands too: a future restyle of
  `IconButton` would silently skip these buttons, and the drift would show
  up as odd-looking controls in an otherwise-updated cluster. Not folded into the
  dismissal fix above deliberately (one change at a time, and that change
  needed a `ref` on this button, which would have made the swap a
  behavioral change rather than a cosmetic one). `IconButton` spreads
  `...props`, so `aria-haspopup`/`aria-expanded` already pass through; under
  React 19 `ref` is an ordinary prop, so the swap is likely a small typing
  change to `IconButtonProps` rather than a rewrite.

- **Re-opening the mobile drawer mid-close snaps back before sliding in —
  2026-08-17 (mobile sidebar exit animation).** The drawer's exit is a
  keyframe (`hl-animate-sheet-left-out`), and `useAnimatedPresence` cancels
  the pending unmount when the user re-opens before it finishes, so the node
  is continuously mounted and the state always settles correctly — the
  element ends open, `isExiting` false, no timer pending. What it does *not*
  do is interpolate: swapping back to `hl-animate-sheet-left` restarts from
  that keyframe's own `from` (`translateX(-100%)`), so a re-open caught
  mid-flight jumps back to fully-off-screen and slides in from there instead
  of reversing smoothly out of wherever it had reached. Purely cosmetic, and
  only visible inside the 240ms window. **The fix, if it ever reads badly, is
  to swap both keyframes for a `transition` on `transform`** — transitions
  interpolate from the current computed value, so an interrupted exit
  reverses in place. That was not done here because the entrance animation is
  shared, working, and untouched by this change, and converting it would mean
  the mount-then-next-frame dance a transition needs to animate on first
  paint. Covered (as a state guarantee, not a visual one) by
  `useAnimatedPresence.test.tsx` and
  `ChatHero.mobileSidebarExitAnimation.test.tsx`.

- **Only the mobile sidebar drawer got an exit animation — the other
  conditionally-rendered overlays still vanish — 2026-08-17.** The same
  bug the drawer had applies to every `{open && <Overlay/>}` in this shell:
  the mobile Media bottom sheet, the mobile memory overlay, and the session
  memories sheet all mount with `hl-animate-sheet`/`hl-animate-fade` and
  unmount instantly. `useAnimatedPresence` is deliberately general enough to
  serve them (it takes only `isOpen` + a duration and knows nothing about the
  animation), but they were left alone to keep this change to the one surface
  that was reported. Each would additionally need its own `-out` keyframe
  added to `app/heirloom/globals.css` and to the `prefers-reduced-motion`
  block there.

- **The mobile breakpoint is defined two ways, and they disagree at exactly
  768px — pre-existing, surfaced 2026-08-16.** Two mechanisms decide "is
  this mobile" in the chat drawer and they are off by one pixel:
  Tailwind's `md:` prefix applies at `min-width: 768px` (so `md:hidden`
  hides *at* 768), while `ChatHero.tsx`'s `useMediaQuery('(max-width:
  768px)')` is true *at* 768. At exactly 768px CSS says desktop and JS says
  mobile. The consequence predates the mobile chat header redesign and is
  worse than cosmetic: `isMobile` renders the sidebar as an overlay instead
  of the docked `SidebarV2`, but the hamburger that opens that overlay is
  `md:hidden` and therefore *not rendered* at 768 — so a viewport exactly
  768px wide has no way to open navigation at all. (`onMenuOpen` is
  additionally `isMobile`-gated, so the two agree everywhere except this one
  pixel.) The redesign added one more consequence at the same width: the
  "Legacy" wordmark is `hidden md:inline`, so it shows, while Share and
  Fullscreen — gated on `isMobile` — do not. **The fix is to pick one
  source of truth**, most cheaply by changing the query to `(max-width:
  767.98px)` so JS matches Tailwind's boundary rather than straddling it;
  but it moves behaviour at a real width, so it wants its own change and its
  own verification rather than riding along with unrelated work. **There are
  two callers, not one** — `ChatHero.tsx` (line ~843) and `ChatInput.tsx`
  (line ~218) each construct the query independently, so a fix has to touch
  both or they will disagree with each other on top of disagreeing with
  Tailwind. That duplication is itself the underlying gap: the breakpoint is
  a magic string in two components rather than one shared constant. Verified
  2026-08-16 by grep; the only other `max-width: 768px` hits are the
  jefflougheed CSS blocks (`Nav`/`Problem`/`Session`), which are a separate
  isolated surface, and test-file comments.

- **The mobile chat header's brand mark has no accessible name —
  2026-08-16, deliberate.** In the `SHOW_STORY_SWITCHER`-false branch the
  feather `<img>` is `alt="" aria-hidden="true"` (decorative, because the
  visible "Legacy" wordmark beside it carried the name), and the mobile
  redesign hid that wordmark with `hidden md:inline` — `display:none`
  removes it from the accessibility tree, not just from view. So on mobile
  a screen reader gets nothing at all from the brand slot. This is
  acceptable and was chosen knowingly: the mark is neither a link nor a
  control, so no interactive element lost its name, and an icon-only logo
  announcing nothing is ordinary. Recorded because the *reason* it is
  acceptable is not visible from the markup — someone auditing the header
  later will see an `aria-hidden` image next to a `display:none` label and
  reasonably read it as an oversight. **If the mark ever becomes
  interactive** (a link home, a menu trigger), it needs a real accessible
  name at that point. The tempting fix today — `sr-only md:not-sr-only` to
  keep the wordmark in the a11y tree while hiding it visually — was
  rejected because `not-sr-only` resets `overflow`/`white-space` and would
  fight the span's existing `truncate` on desktop, i.e. it risks a desktop
  regression to solve a non-problem on mobile.

- **Mobile transcript could get stuck horizontally scrolled after closing
  the sidebar — found and fixed 2026-08-17 (#433).** Reported as "content
  shifted right, text clipped mid-word on the left" after closing the
  mobile sidebar drawer. Investigated as a possible regression in the
  mobile sidebar push-transform animation (`mobileSidebarPushClass` in
  `ChatHero.tsx`) first — ruled out with confidence: that value is a plain
  inline `const` re-derived from `state.isSidebarExpanded` on every
  render, with no memoization and no stale-closure path to go wrong
  against, and a diff across both of that day's earlier sidebar fixes
  (#431, #432) showed neither touched the mechanism at all. The reported
  symptom also doesn't match a stuck rightward push in the first place — a
  `translate-x-[30%]` stuck open would show a blank gap on the *left* edge
  and clip the *right*, not truncate text at the start of lines.
  **Real root cause:** `MessageList.tsx`'s transcript scroll container had
  `overflow-y-auto` with no explicit `overflow-x`. Per the CSS Overflow
  spec, a non-`visible` overflow-y with overflow-x unset computes
  overflow-x to `auto` too — the exact mechanic `SidebarV2.tsx`'s
  `<aside>` already pairs `overflow-x-hidden overflow-y-auto` to avoid,
  and `MemoryCard.tsx` documents directly elsewhere in this codebase (see
  that row in `System Docs/Public Site.md`). That implicit `auto` gave the
  transcript a real, if unintended, ability to develop a horizontal
  scroll offset — most plausibly from `ChatThread.tsx`'s
  `scrollAnchorRef.scrollIntoView()` (default `inline: 'nearest'`) firing
  while its ancestor content column was mid-transform from the sidebar's
  own 240ms push-back transition, misjudging horizontal visibility
  against the live painted (transform-shifted) bounding rect and
  "correcting" by scrolling the transcript sideways. Nothing ever reset
  that `scrollLeft` afterward, so it stuck the whole transcript
  off-center. **Fixed** by pairing `overflow-x-hidden` with the
  transcript's `overflow-y-auto`, same as `SidebarV2.tsx`'s `<aside>` —
  the container never legitimately needs horizontal scroll (messages wrap
  via `whitespace-pre-wrap`, nothing renders wide unwrapped content), so
  this removes the mechanism outright with no loss of capability.
  `happy-dom` has no layout engine and doesn't implement `scrollIntoView`'s
  viewport-visibility math, so the dynamic mechanism itself can't be
  reproduced in a test — `MessageList.transcriptOverflowX.test.tsx` is a
  structural regression guard instead, asserting the container carries
  `overflow-x-hidden`, the same "assert the durable class contract"
  convention `SidebarV2.touchTapTargets.test.tsx` uses for a CSS-only fix
  jsdom can't otherwise exercise.

- **Mobile sign-in did nothing on tap — found and fixed 2026-08-18.**
  Reported as mobile-only (desktop unaffected): tapping "Sign in" in
  `ChatHeader`'s Account dropdown produced no modal, no error, nothing.
  First suspected `openSignIn`/Clerk's portal itself — ruled out by reading
  `@clerk/react`'s source directly: `useClerk().openSignIn()` delegates to
  `clerkjs.openSignIn()` with no `getContainer` override, so Clerk mounts
  its modal on `document.body` exactly as `clerkAppearance.ts`'s own header
  comment already documented, a DOM *sibling* of the whole app tree, never
  a descendant of anything inside it — no ancestor CSS can reach it. The
  click was never getting that far anyway. **Real root cause:** the same
  mobile sidebar push-transform this file's #433 entry above already
  cleared of one bug (`mobileSidebarPushClass` in `ChatHero.tsx`) had a
  second, unrelated one. `transform` — present on `chat-header-push-wrapper`
  on every mobile render, even at rest (`translate-x-0` is still a
  non-`none` value) — makes the element establish its own stacking context.
  `chat-column-push-wrapper` gets the same class and does the same. Neither
  wrapper nor either one's ancestors (`<section>`, the `memory-panel-row`
  flex container) sets an explicit `position`/`z-index`, so both wrappers'
  stacking contexts land at the same implicit level and paint in DOM order
  — the chat column, declared after the header, painted **over** the
  header's entire stacking context wherever the two visually overlap. The
  Account dropdown (`absolute top-full`, `z-50`) overlaps exactly there: its
  `z-50` only wins against siblings *inside* the header's own now-isolated
  context, not against the chat column outside it, so the column silently
  absorbed every tap on the dropdown — visually invisible, since the column
  itself renders nothing there. Confirmed with `elementFromPoint` against a
  minimal static repro of the same two-wrapper structure, both with and
  without the transform. **Fixed** by adding `relative z-10` to
  `chat-header-push-wrapper` only (mobile-only, alongside the existing push
  class) — `relative` is required even though `transform` alone creates the
  stacking context, because Chromium leaves the computed `position` at
  `static`, and `z-index` has no effect on a `static` element regardless of
  its stacking context, confirmed the same way. `z-10` sits under the
  mobile sidebar drawer's `z-30` and its `z-20` tap-catcher/scrim (same
  z-index regression guard `ChatHero.mobileSidebarPushAnimation.test.tsx`
  already asserted for #433), so both still cover the header while open,
  exactly as before. `happy-dom` can't run layout/paint, so — same
  convention as #433's fix above — the new test pins the class contract
  (`relative z-10` present on the header wrapper, absent from the chat
  column, at rest and pushed) rather than the hit-testing behavior itself.

## Sidebar

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

- **Stories "Create" button rendered permanently disabled — fixed 2026-08-10
  (PR #335, branch `2026-08-10-fix-create-story-button-styling`).**
  `SidebarV2`'s Create button was built inert in the original V2 UI-first
  pass (2026-06-12), alongside the then-inert Uploads/Share Heirloom nav
  buttons and Writing Prompts section, via two unconditional
  `opacity-40 pointer-events-none` classes. (**The Share Heirloom row had
  the identical bug and it survived until 2026-08-15** — see the
  chat-widget-V2 entry above. Same shape: real handler wired, inert
  classes left hardcoded rather than made conditional on the handler's
  presence, so the button looked disabled and swallowed every click.
  Worth grepping `pointer-events-none` for unconditional occurrences
  before assuming any V2-era control is actually live.) When real
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

- **Sidebar row hover feedback is background-tint-only since the row-copy
  darkening — 2026-08-15 (PR #397).** Before that change, all three row
  groups in `SidebarV2.tsx` (the shared `navBtn` base, conversation titles,
  story rows) signalled hover two ways at once: a colour shift
  (`text-text-muted` → `hover:text-text-primary`) **and** a background wash
  (`bg-text-primary/10`, `/[0.05]` on story rows). Moving the rest state to
  `text-text-primary` made the colour half a no-op, so it was dropped and
  only the wash remains. This is not a contrast regression — the rest state
  got darker, not lighter — and focus-visible rings are untouched, so
  keyboard affordance is unchanged. But it is strictly less hover signal
  than these rows carried before, on a tint that is only 10% (5% on story
  rows) against `--color-background` (`#FAF6EE` on Heirloom). **If the rows
  read as unresponsive in use, the fix is a hover treatment that still works
  from a full-ink base** — a deeper wash, or an accent-tinted underline —
  **not** restoring the muted rest state, which is the thing the change
  deliberately removed. Untested against the mobile drawer, where there is
  no hover state at all and the wash never fires either way.

- **Sidebar row controls are unreachable on touch until long-press lands —
  2026-08-16 (mobile single-tap fix), closed 2026-08-17 (long-press).**
  Sidebar rows used to need two taps
  on iOS Safari: the first only armed the hover state (row background
  highlight plus the kebab/invite/start-chat reveal), the second fired the
  real `loadSession`/`onSelectStory`. Cause was unguarded `hover:`/
  `group-hover:` utilities — this repo is on Tailwind v3, where
  `hoverOnlyWhenSupported` is opt-in and `tailwind.config.js` does not
  enable it, so they compile to bare `:hover` pseudo-classes, and WebKit
  suppresses a tap's click when the synthesized hover repaints what is under
  the finger. A row did that twice over. The fix prefixes every hover
  utility in `SidebarV2.tsx` (and in `ui/IconButton.tsx`, which renders the
  drawer's own Close-X) with `[@media(hover:hover)]:`.
  **The deliberate consequence:** the three hover-revealed row controls —
  kebab, invite, start-chat — no longer appear on touch at all, so they are
  unreachable there until the follow-up long-press gesture ships. That
  sequencing was the explicit intent, not an oversight, and the follow-up is
  the thing that closes it. They keep their DOM slot at `opacity-0`, so they
  also carry `[@media(hover:none)]:pointer-events-none` — without it they
  would be invisible but still tappable, and a tap near a row's right edge
  would hit an unseeable control instead of selecting the row (28px of dead
  zone per control: 28px on conversation rows, 84px on story rows). Desktop
  hover behaviour is unchanged.
  **Scoped deliberately, not global.** Enabling `hoverOnlyWhenSupported` in
  `tailwind.config.js` is the one-line version and remains the better
  long-term answer, but it is sitewide: **282 hover utilities across 57
  files as of 2026-08-16** (re-grep before acting on this — that count only
  ever moves in one direction as the app grows, so treat it as a floor, not
  a current figure), of which 10 files drive *visibility* (not just colour)
  off hover. One is `SidebarV2.tsx` itself, already handled by this fix; the
  nine still unguarded are `Nav.tsx`, `SaveChatCTA.tsx`, `BlockCanvas.tsx`,
  `StoryPicker.tsx`, `MemoryCard.tsx`, `PhotoUploadActions.tsx`,
  `BookingCard.tsx`, `UserMessageActions.tsx`, `MessageActions.tsx`.
  Two of those
  (`MemoryCard`, `PhotoUploadActions`) already carry explicit
  `[@media(hover:none)]:opacity-100` overrides and would be fine; the rest
  were not audited control-by-control and some would go unreachable on
  touch. **If that flag is ever flipped on, those nine files are the audit
  list**, and the per-class guards in `SidebarV2.tsx`/`IconButton.tsx`
  become redundant and should be stripped in the same change.
  Regression coverage is `SidebarV2.touchTapTargets.test.tsx`, which walks
  every class token the sidebar renders (RowMenu's `document.body` portal
  included) and fails on any unguarded hover utility — jsdom cannot
  reproduce WebKit's tap heuristic, so the class contract is the guard.
  **Closed 2026-08-17.** A 450ms hold on a row now sets the same
  `menuId`/`menuRect` state the desktop kebab's `onClick` already drove —
  no new reveal mechanism, since kebab/invite/start-chat all already keyed
  their opacity off `isMenuOpen` (not just hover), so setting `menuId` from
  a long-press reveals all three at once and opens `RowMenu` in one gesture,
  mirroring desktop hover+click. isMobile-gated (`useMediaQuery('(max-width:
  768px)')`, same breakpoint `ChatHero.tsx` already uses) — desktop hover is
  untouched. Cancelled if the touch drifts past 10px before the timer fires,
  so a scroll doesn't also open a menu. A completed long-press calls
  `touchend.preventDefault()` to suppress the trailing synthetic click,
  which would otherwise either re-fire the row's own tap-to-select (#25a)
  or hit `RowMenu`'s outside-click listener and instantly close the menu
  that just opened; the row's `onClick` also carries a ref-based check as a
  fallback in case that suppression doesn't hold on some browser. Story rows
  with `storiesDisabled` are excluded — no kebab renders there either, so a
  long-press must not open one. Coverage is
  `SidebarV2.longPress.test.tsx`. First long-press implementation in this
  codebase.

*Cross-reference: the Heirloom chat-widget V2 UI-first entry in the `Chat UI` section documents several Sidebar-hosted features from that pass (Uploads removal, Share Heirloom nav row, tap-outside-to-close, drawer width) — see that section if a Sidebar-nav-row gap doesn't have its own entry here.*

*Cross-reference: the mobile sidebar drawer's exit animation (this section) and the follow-up gap generalizing it to every other conditionally-rendered overlay are tracked in the `Chat UI` section.*

## Memory Panel & Stories

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

  **One relationship remains explicitly deferred, not built:** story ↔
  media (via `media_items.story_id`, a column that already exists and is
  still always null). Story ↔ memory is real now — see "Story ↔ memory
  linking, real as of 2026-08-13" below. **A real story view now exists**
  (`components/shells/membership/v2/StoryView.tsx`, real-story-view-1a-
  static-list 2026-08-14; row-tap-to-editor added the same day, real-
  story-view-1b-row-tap-editor) — a story's memories in real,
  `artifact_containments.position`-column order, and tapping a row opens a
  correctly session-scoped editor via `StoryMemoryEditor.tsx` (its own
  `useMemories(memory's own session_id)` instance, NOT `ChatHero`'s
  chat-scoped one — a story's memories routinely come from other sessions
  than whichever chat is open). **Reordering is real too, as of the same
  day (real-story-view-1c-reorder)** — per-row up/down move buttons (not
  drag-and-drop, a deliberate simplification for this pass), PATCHing
  `/api/stories/[id]/memories` (`moveMemoryInStory`, `services/crm/
  story-containments.ts`). Every move renumbers the WHOLE story's positions
  to match its current effective order, then swaps the two being moved,
  then writes all of them in one batch upsert — never a two-`NULL` swap and
  never a "first move ever" special case, since every row started at
  `position: NULL` and this makes it correct regardless of how many prior
  moves (zero or many) already happened. Requires a signed-in account (the
  four anonymous-safe session-scoped memory actions on `PATCH
  /api/sessions/[id]/memories/[memoryId]` are NOT the model here — this
  writes against a story the caller owns/is subscribed to). **Real entry
  point wired as of the same day (real-story-view-1d-entry-point) —
  `ChatHero.tsx` now passes `onSelectStory={handleSelectStory}` to both
  `SidebarV2` instances** (desktop and mobile — the mobile one also
  dispatches `TOGGLE_SIDEBAR` first to close the overlay, matching the
  `onMedia` wrapper's existing pattern, since `SidebarV2`'s story row
  doesn't call `onClose` internally the way its New Chat/session rows do).
  The temporary `?storyView=<id>` query param (and its mount effect) is
  gone — replaced outright, not left alongside. `handleSelectStory` checks
  `GET /api/stories/[id]/memories` on click (there is still no
  `contentCount`/`memoryCount` field on `Story` anywhere in this codebase —
  that field only ever existed on the discarded `2026-08-13-story-click-
  routing` WIP, see the session-context-service entry elsewhere in this
  file for why that branch was never resumed) and branches: non-empty opens
  `StoryView`; empty calls the real `newChat()` +
  `setSessionContextToAttach({ contextType: 'story', contextRefId,
  contextFrequency: 'every_turn' })` — closing the session-context-service
  gap documented below. Any check failure (network, non-2xx) defaults to
  opening `StoryView` rather than silently starting an unrelated chat —
  `StoryView`'s own already-built error state is the fallback, not a new
  one. No Share/"+"-add-existing-memories/Publish buttons exist in this
  view either — none of those three has a real production counterpart
  anywhere yet (only a design-handover mockup has them); each is its own
  separate, later scoping pass.

  **Story ↔ memory linking, real as of 2026-08-13 (assign-memory-to-story).**
  `artifact_containments` (schema-only since 2026-08-08 — see above) is now
  wired: `services/crm/story-containments.ts`'s `assignMemoryToStory`
  writes it, via a new `assign_story` action on `PATCH
  /api/sessions/[id]/memories/[memoryId]`. Sequential delete-then-insert,
  not an RPC — the existing `publish_compiled_prompt` RPC
  (`services/prompt/compile.ts`) solves a genuinely harder cross-request
  exclusivity problem this doesn't have; this instead follows
  `revokeStoryCollaborator`/`acceptStoryInvite`'s (`services/crm/
  story-invites.ts`) own plain-sequential-write precedent. Single-story-
  per-memory is an application-layer rule only — `artifact_containments`'s
  unique constraint is on the pair `(parent_artifact_id,
  child_artifact_id)`, not `child_artifact_id` alone, so the schema stays
  genuinely many-to-many; a future multi-story-per-memory UI would need no
  schema change, only a different application rule. The target story must
  be accessible to the caller — owned OR subscribed, reusing `listStories`'
  own access shape — not owner-only, so a collaborator can add their own
  memories to a story they were invited into. UI: `MemoryCardView.tsx`'s
  "+" (previously a "coming soon" stub) now opens `StoryPicker.tsx`, a
  popover matching `BlockCanvas.tsx`'s `BlockInserter` dismissal mechanics
  exactly (backdrop + Escape). **`MemorySavedReceipt.tsx`'s own in-transcript
  "+" (memory-receipt-story-picker, 2026-08-14)** is wired to the same
  `StoryPicker`/`assignMemoryToStory` path now too — `stories`/
  `onAssignStory` thread down from `ChatHero.tsx` through `MessageList.tsx`
  the same way `sessionImages` already does, reusing `ChatHero`'s own
  `useMemories(state.sessionId)` instance (no second scoped hook needed,
  unlike `StoryMemoryEditor.tsx` below — this receipt only ever renders a
  memory belonging to the currently-open session's own transcript). **Still
  not built:** a per-collaborator
  memory count in `InviteCollaboratorsModal.tsx`'s roster — the design
  mockup's "Joined `[date]` · `N` memories" still shows no `N` (see the
  "roster gap" paragraph below); computing it needs a `member_id` ->
  `user_id` -> `memories.user_id` -> `artifact_containments` join
  `listStoryCollaborators` doesn't do yet, a distinct piece of work from
  the linkage existing at all.

  **Remove-from-story + trigger assignment state, real as of
  remove-memory-from-story (2026-08-14).** Closes the gap `Design
  Handovers/ Aug 2026 Atomic Updates/New Story Label on Memories/README.md`
  flagged (its own "Known unknowns" section was stale — written before
  `storyId`/`StoryPicker` existed — corrected in place rather than trusted
  as-is; that file's own investigation before this pass also confirmed its
  "Featured in [Story]" label ask was already shipped, as part of
  session-memories-panel, 2026-08-14, PR #385 — a coincidence of timing, not
  something this pass built). Three pieces: (1) `StoryPicker.tsx`'s trigger
  button now reflects assignment state — a green filled Check circle
  (`bg-[#2E7D4F]`, the handover's own reference color; no Heirloom-scoped
  "positive"/"success" design token exists to prefer instead — checked
  `System Docs/Design System.md`, SBL's `--color-pos` is SBL-route-scoped
  only) when `currentStoryId` resolves against `stories`, the ordinary
  accent Plus circle otherwise — visual-state only, still opens the same
  popover, not a second control. (2) `removeMemoryFromStory`
  (`services/crm/story-containments.ts`) + a new `remove_story` action on
  `PATCH /api/sessions/[id]/memories/[memoryId]` (same signed-in gate
  `assign_story` already has) delete the memory's current containment row —
  owner-scoped on the memory only, **unlike** `assignMemoryToStory`, this
  does **not** check `hasStoryAccess`: detaching a memory from a story
  doesn't depend on whether the caller can still reach that story. Not
  finding a containment row is a no-op success, not a 404 — removing an
  already-unassigned memory is the caller's intended end state either way.
  New `AuditAction.MEMORY_REMOVED_FROM_STORY`. (3) `StoryPicker.tsx` gained a
  "Remove from '[Story]'" item at the top of its popover, rendered only
  while `currentStoryId` is set — same single-click-no-confirm posture the
  existing story-assign items already have.

  **Correction, same pass, found on rebase.** This branch was built before
  `MemorySavedReceipt.tsx` was wired to a real `StoryPicker` (PR #391,
  memory-receipt-story-picker, 2026-08-14, merged to `main` while this
  branch was in flight) — at the time, `MemoryCardView.tsx` had exactly two
  real callers (both `ChatHero.tsx` render sites), and the initial pass here
  added a required `onRemoveFromStory: () => void` prop threaded to those
  two plus `StoryMemoryEditor.tsx` (a third caller found while wiring it,
  not mentioned in this pass's own task briefing). Rebasing onto `main`
  after PR #391 landed surfaced a real, not just mechanical, consequence:
  `MemorySavedReceipt` is now a **fourth** real caller — its own "+"
  (assign) was already real via PR #391, so requiring `onRemove` on
  `StoryPicker` broke its build until this pass threaded `onRemoveFromStory`
  the rest of the way, mirroring exactly how PR #391 already threaded
  `onAssignStory`: `MessageListProps`/`MemorySlotHandlers` gained the same
  optional `onRemoveFromStory?: (memory: MemoryRow) => void`, and
  `MemorySavedReceiptProps` gained `onRemoveFromStory?: () => void` —
  defaulted to a no-op (`() => {}`) rather than left `undefined`, since
  `StoryPicker.tsx`'s own `onRemove` is required (unlike `onAssignStory`/
  `onPick`, which the caller can omit to suppress the trigger entirely).
  `ChatHero.tsx` passes its existing `handleRemoveMemoryFromStory` straight
  through to `<MessageList>`, shared as-is with both `MemoryCardView` render
  sites and `StoryMemoryEditor.tsx` — same posture
  `handleAssignMemoryToStory` already has. All four callers now call
  `memories.removeFromStory(memoryId)` (new method on
  `services/chat/ui/v1/useMemories.ts`'s returned hook, PATCH + optimistic
  local `storyId: null`), each with its own "Removed from X" toast/flash
  copy sourced from the memory's PRIOR `storyId` captured before the await,
  mirroring `handleAssignMemoryToStory`'s existing "Added"/"Moved" pattern
  exactly. The trigger-checkmark-state change (green `Check` vs. accent
  `Plus`) needed no equivalent fix — it lives entirely inside
  `StoryPicker.tsx` itself, so it applies automatically everywhere that
  component renders, `MemorySavedReceipt` included, with no separate
  wiring. Covered by `ChatHero.receiptRemoveFromStory.test.tsx` (mirroring
  PR #391's own `ChatHero.receiptAssignStory.test.tsx`) and new cases in
  `memory-saved-receipt.test.tsx`. Two existing PR #391 test files also
  needed a fix here, not a feature change: `ChatHero.assignMemoryToStory.test.tsx`
  and `ChatHero.receiptAssignStory.test.tsx` both located `StoryPicker`'s
  trigger by its `title`/label text ("Add to a story"), which now varies
  with assignment state — both switched to `StoryPicker`'s own stable
  `data-testid="story-picker-trigger"` instead, scoped to the relevant
  pane/transcript region so the panel's and the receipt's now-identical
  triggers never collide in a single query.

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
  view — was not built. A real story view now exists (see the "real story
  view now exists" paragraph above), but it has no Share button of its own
  yet — that's still a separate, later scoping pass (it would reuse this
  same real `InviteCollaboratorsModal`, not need a new one). (3) Whether the story picker's selection should ever change what
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
  particular UI path. (2) — a real story view to select into — is no
  longer accurate as written; see the "real story view now exists"
  paragraph above (it still has no Share button of its own, and still has
  no real nav entry point — both separate, later work). (3) is now moot for the
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
  yet. Story ↔ memory linking itself is real now (`artifact_containments`,
  wired 2026-08-13 — see "Story ↔ memory linking, real as of 2026-08-13"
  above), but `listStoryCollaborators` doesn't join it per-collaborator
  yet, so the gap here is narrower than it was: the relationship exists,
  the aggregation over it doesn't. Shipped as "Joined
  `[date]`" alone rather than fabricating a count; `Collaborator.memoryCount`
  is `number | undefined` (undefined ≠ 0) so a future per-collaborator
  join has a field ready without another prop-shape
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

  **Collaborator removal — real as of story-collaborator-removal
  (2026-08-13).** Until this pass, every write against `artifact_subscribers`
  was an insert/upsert (`acceptStoryInvite` above) — there was no way to
  revoke one already-joined person's access short of an owner deleting the
  whole story. `revokeStoryCollaborator` (`services/crm/story-invites.ts`)
  deletes the specific grant (`artifact_id` = storyId, `member_id` =
  memberId), owner-scoped the same way `listStoryCollaborators` already is —
  a collaborator cannot remove another collaborator, only the story's own
  creator can — and idempotent-*safe* rather than idempotent-*silent*: a
  grant that's already gone can't 500 (the delete's own `.select()` reports
  zero rows affected, not a DB error), but it's still reported back as a
  clear 404 (`'Collaborator not found'`) instead of a folded-in success, so
  the caller can tell "already removed" apart from "removed just now."
  New `AuditAction.STORY_COLLABORATOR_REMOVED`. Backed by a new sibling
  route, `DELETE /api/heirloom/story-invites/collaborators` — see
  `System Docs/API Routes.md`'s "Story Invite Links" section and `System
  Docs/Database Schema.md`'s `artifact_subscribers` row. **Wired to a real
  UI as of story-admin-panel (2026-08-13)** — see that entry above;
  `StoryAdminPanel`'s roster Remove button is the first (and, as of this
  pass, only) caller.

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
  not require a story to be saved. (Stories themselves are real
  now, as of 2026-08-09 — see "Real story creation and persistence" above
  — but still via `artifacts.type='story'`, not a dedicated `stories`
  table. Story-linking itself is real now too, as of 2026-08-13 — see
  "Story ↔ memory linking, real as of 2026-08-13" above — genuinely
  many-to-many at the schema level via `artifact_containments`'s
  `(parent_artifact_id, child_artifact_id)` pair constraint, with
  single-story-per-memory enforced only at the application layer, exactly
  as this paragraph anticipated.)
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
  - **Session memories panel — shipped 2026-08-14, PR #385.** Closes a real
    gap an investigation found (`Design Handovers/ Aug 2026 Atomic
    Updates/11_session_memory_icon_gap/README.md`): main had the single-memory
    `MemoryCardView` above and the sidebar's decorative `SidebarMemoryCount`
    badge, but no way to browse every memory kept during the active session
    and open one — only the prototype's own `SessionMemoriesPanel`
    (`chat-widget-canvas.jsx`) had that flow. Entry point is a new
    `ChatHeader` icon ("Memories from this chat," `Bookmark` glyph, same
    optional-prop-gated pattern as `onOpenMedia`) — the sidebar badge stays a
    plain non-interactive `<span>`, a locked decision, not an oversight.
    **Made conditional on mobile 2026-08-16** (mobile chat header redesign):
    `ChatHero` passes `onOpenSessionMemories` on mobile only when the active
    session actually has a memory, so the icon can't open an empty panel on a
    phone — desktop still passes it unconditionally, and `onOpenMedia` got
    the same treatment. Both gates read state `ChatHero` already holds
    (`currentSessionMemories`, `useChatStore().mediaItems`), so this added no
    fetch. Note this interacts with the stale-session-rows bug below: the
    icon's mobile visibility and the panel's contents are now driven by the
    *same* filtered array, so they cannot disagree. The
    new `SessionMemoriesPanel` component (`components/shells/membership/memory/SessionMemoriesPanel.tsx`)
    lists every memory for the session, **any status** — draft rows get a
    small "Draft" label, and the subtitle reads "N memories this session,"
    not "kept," since a draft isn't kept yet. Tapping a row opens it into the
    existing `MemoryCardView` editor, same as a transcript receipt click —
    not a separate read-only view. Joins `ChatHero.tsx`'s third-pane
    mutual-exclusion group as a fifth state (`sessionMemoriesOpen`, alongside
    `openMemory`/`mediaOpen`/`adminStoryId` and `storyViewId` — the latter
    landed the same day via a separate branch,
    `Design Handovers/ Aug 2026 Atomic Updates/01_real_story_view`/PR #384,
    merged into this one mid-flight; every shared condition and
    reciprocal-close handler was updated to account for all five states, not
    four) — same desktop resizable third-pane / mobile `85vh` bottom-sheet
    treatment Media already has, not the full-screen no-scrim treatment
    single-item editors (`MemoryCardView`/`StoryAdminPanel`/`StoryView`) use.
    See `System Docs/Public Site.md`'s `ChatHero`, `ChatHeader`, and new
    `SessionMemoriesPanel` rows for the mechanics.
    **Stale-session-rows bug — found by automated PR review, fixed same PR
    before merge.** `useMemories.ts`'s `memories` array is **not** cleared
    when `sessionId` changes — only `loadedForSessionId` (and therefore
    `isLoaded`) resets, see that hook's own doc comment — and nothing closes
    `sessionMemoriesOpen` on a session switch (New Chat, or picking a
    different conversation). Passing `memories.memories` straight through
    left the *previous* session's rows on screen under "this session" until
    the next fetch resolved, or indefinitely for a brand-new chat with no
    `sessionId` to ever fetch for. Fixed with a `currentSessionMemories`
    derivation in `ChatHero.tsx` (`memories.memories.filter(m => m.session_id
    === state.sessionId)`) — no extra fetch, just the guard every
    `MemoryRow`'s own `session_id` field already made possible — covered by
    a regression test in `ChatHero.sessionMemoriesPanel.test.tsx` (opens the
    panel, clicks New Chat, asserts the stale rows are gone and the empty
    state shows). Worth remembering for any other consumer that might read
    `memories.memories` directly in the future — this same gap is latent
    wherever that happens without the same filter or an `isLoaded`/session
    check.
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
    by: add-to-memory (`PhotoUploadActions.tsx`'s own "+" is still a stub —
    no `photo_artifacts` write path exists) and memory canvas sorting/
    filtering — both still unbuilt. (`MemorySavedReceipt`'s own, unrelated
    "+" — add to a *story*, not add-to-memory — is real now; see the
    Photo Bookmark entry below and the assign-memory-to-story entry above.)
    Stage F (mobile slide-up panel) is no longer blocked on this
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
    memories instead of colliding. "+" (add to a memory) on the photo row
    still fires the existing "coming soon" toast — not real;
    `photo_artifacts` (the many-to-many write path it would need) is still
    unbuilt. `MemorySavedReceipt` also gained a "+" the same night (add to a
    story, same pattern as `MemoryCardView`'s own header "+") — stubbed at
    first ship, then wired for real (memory-receipt-story-picker,
    2026-08-14; see the assign-memory-to-story entry above).
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

- **RESOLVED 2026-08-14 (real-story-view-1d-entry-point) — Session-
  context-service built (2026-08-13); the "click an empty story to start a
  chat in it" UI flow that exercises it is now wired too.**
  `services/chat/server/session-context.ts`
  (`getSessionContext`/`attachSessionContext`, `chat_session_context`
  table — schema DDL reported to Jeff, now live in Studio, see `System
  Docs/DB_CHANGELOG.md`), the route-layer attach-at-creation-time wiring
  (`app/api/sessions/route.ts`), and the client accessor plumbing
  (`getSessionContextToAttach`, `chatStore.tsx`/`useChatTurn.ts`) landed
  2026-08-13, already built and tested. The missing piece — the actual
  `SidebarV2` story-row click handler — is now real: `ChatHero.tsx`'s
  `handleSelectStory` calls `newChat()` then `setSessionContextToAttach({
  contextType: 'story', contextRefId: storyId, contextFrequency:
  'every_turn' })` on the empty-story branch (see the real-story-view entry
  above for the full branching logic). `onStartStoryChat` (a separate,
  always-visible per-row icon distinct from the row's own click) remains
  unwired — out of scope for this pass, which only wired `onSelectStory`.
  **A related-looking WIP existed on origin (`2026-08-13-story-click-
  routing`, commit `4b3aa9f9`, checkpointed mid-task, never merged) — it
  was NOT resumed, deliberately:** it wired `onSelectStory` via a
  completely different, discarded approach — a client-only
  `storyContextIdRef` used solely to auto-assign a Kept memory back to the
  story, plus a one-time deterministic *chat message* (rendered directly in
  the transcript via plain ReactMarkdown, explicitly NOT XML-delineated by
  that WIP's own doc comment, since raw tags would render as literal broken
  text there) naming the story/owner. It had no `chat_session_context` row,
  no `attachSessionContext` call, and nothing re-injected on later turns —
  a one-shot greeting, not persistent every-turn system-prompt context. It
  also predated and partially overlapped with the real, later, merged
  memory↔story linking (`assign-memory-to-story`, PR #377, the actual
  `StoryPicker` UI) — its own auto-assign-on-Keep half was already
  superseded by that. Its `contentCount`-branching idea for the click
  handler was NOT reused either — that field was never rebuilt anywhere
  (confirmed absent from `services/crm/stories.ts`'s `listStories`); the
  real click handler checks emptiness for real via `GET /api/stories/[id]/
  memories` instead (see the real-story-view entry above).

## Media Pipeline

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
  Originating investigation: `Backlog/media-pipeline-broader-sweep_2026-08-05.md`
  — **note that file is not in the repo** (`Backlog/` exists but has never
  contained it), so the six fixes below are the surviving record of that sweep.
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

- **Media delete is local-state only — no `DELETE /api/media/[id]` endpoint
  exists (Stage 3 of `media_stages_08_2026`, 2026-08-13).** `MediaCard`'s
  trash icon opens a real confirmation dialog (generalized
  `ConfirmDeleteModal`), but confirming only removes the item from
  `MediaGallery`/`MediaPage`'s local `items` state — nothing hits the
  server, and a page refresh brings the file back. This matches the design
  prototype's own spec exactly ("no backend call"), not a corner cut beyond
  it — investigated and confirmed no endpoint exists under `app/api/media/
  [id]/` (only `url`, `retry`, `start-processing`). The confirmation copy
  was written to avoid claiming permanence it doesn't have (no "permanently
  removed, can't be undone" wording, unlike the default chat/story/memory
  delete copy). **Needs, before this is production-real:** a real DELETE
  endpoint plus a soft-vs-hard-delete decision — not made here per CLAUDE.md
  (Jeff owns schema/backend-shape calls), and explicitly out of scope per
  this stage's own instructions ("stop and report rather than building
  one").

- **Media rename is local-state only — no `PATCH` endpoint exists for media
  items (Stage 3 of `media_stages_08_2026`, folding in the Aug 2026 Atomic
  Updates `09_media_metadata_lazyload` handover, 2026-08-13).** Clicking a
  file's name in `MediaCard` opens an inline `<input>`; committing (Enter or
  blur) only patches `original_filename` in the caller's local `items`
  array via a new `onRename` prop — same gap the handover itself flagged
  ("no rename API confirmed on main"). A page refresh reverts to the stored
  filename. **Needs a real endpoint before this is production-real** — no
  filename-validation/extension-preservation decision has been made either
  (the handover flagged this too; this pass accepts any non-empty trimmed
  string, same as the prototype).

- **"Add to memory" (MediaCard's "+" icon) is UI-only — there is no
  many-to-many mechanism to attach an existing media item to an existing
  memory (Stage 3 of `media_stages_08_2026`, 2026-08-13).** The panel
  (`media/AddToMemoryPanel.tsx`) lists the item's own originating chat's
  real saved memories (`useMemories(item.chat_id)`) and lets a member
  select one or more, but confirming only shows a toast and closes — no
  write, matching the design's own explicit spec. Investigated whether a
  real mechanism already existed to reuse instead of stubbing it (memories
  are a real feature, unlike Edit/Upload): the only real media↔memory
  relationship in this schema, `memories.media_item_id`, is a **1:1 FK set
  only at memory-creation time** (`createPhotoMemoryFromMedia` —
  "create a new memory from this photo"), not an attach-to-an-existing-
  memory operation. The many-to-many table that would support the latter,
  `photo_artifacts`, is confirmed schema-only — zero application code
  references it (`System Docs/Database Schema.md`). **Needs, before this is
  production-real:** either wiring `photo_artifacts` up for real, or some
  other real attach mechanism — a product/schema decision, not made here.

- **Image rotate is not implemented — placeholder only, so it doesn't get
  lost (media mobile-fix pass, 2026-08-13).** `MediaCard` has no rotate
  action of any kind today. Two flavors were discussed and both deferred,
  neither scheduled: **(a) display-only rotate** — a CSS `transform`
  applied client-side, no file change, same non-persistence posture as
  rename/delete above; and **(b) persisted rotate** — actually re-encoding
  and overwriting the stored file, which would need a new endpoint similar
  in shape to the missing delete/rename ones (own entries above). Neither
  is built here — this entry exists only so the idea isn't lost, not as a
  commitment to either flavor.

- **`GET /api/media` fetched and signed every matching item upfront, before
  anything rendered — found via live testing (not code review alone) and
  fixed with real pagination, 2026-08-14.** Confirmed no existing design
  handover covered this: the "Memories - Lazy Load" handover explicitly
  scoped itself to per-thumbnail `loading="lazy"` (already shipped, see the
  skeleton-loader entry this doc's git history documents alongside it) and
  never addressed the initial fetch itself. The real bottleneck was
  upstream of rendering entirely — `listByChat`/`listByMember`
  (`services/media/index.ts`) returned every matching row with no limit,
  and the route generated a signed display URL for every one of them
  (`Promise.all(ownItems.map(withDisplayUrl))`) before responding at all.
  `MediaPage.tsx` (account-wide, unbounded) was the more severely affected
  of the two consumers; `MediaGallery.tsx` (chat-scoped) shared the
  identical code path at a smaller, but still uncapped, scale.

  **Fix:** `listByChat`/`listByMember` gained a cursor-based paginated
  overload (`MediaPaginationParams`/`MediaPage`, cursor = the previous
  page's last row's own `created_at`, chosen over offset/limit because both
  lists are live — a mid-scroll insert shifts an offset window but can't
  retroactively land inside an already-fetched cursor range; see the doc
  comment on `MediaPaginationParams` for the full reasoning, including the
  accepted same-millisecond-tie edge case at a page boundary). The
  overload is strictly opt-in: omitting the new `pagination` argument keeps
  every existing caller — `services/crm/memories.ts`'s two session-
  membership checks, `chatStore.tsx`'s catch-up/poll fetches — on the exact
  original unpaginated behavior, since those need the complete list (a
  membership check must see every item, not just one page) and would
  silently break if only a page came back. `GET /api/media` mirrors this:
  `limit`/`cursor` query params are opt-in, and only signs URLs for the
  page actually requested; omitting `limit` preserves the original
  unpaginated response shape byte-for-byte.

  `MediaPage.tsx` and `MediaGallery.tsx` both now fetch incrementally via a
  new shared hook, `components/shells/membership/media/useMediaPagination.ts`
  — first page on open/session-select (still driving the existing 6-card
  skeleton), subsequent pages appended (not replacing) on an
  `IntersectionObserver` sentinel scrolling into view (same create-ref/
  observe/disconnect shape as `services/shared/useReveal.ts`, the only
  existing precedent — no other load-more/infinite-scroll pattern existed
  in this codebase to match instead). Applied to `MediaGallery.tsx` too,
  not just `MediaPage.tsx`, despite a single chat's media being naturally
  more bounded — nothing in this schema caps attachments per conversation,
  and the two surfaces share `MediaItemsGrid`/`MediaCard`, so leaving one
  unpaginated would be a real, easy-to-reintroduce inconsistency. See
  `Utilities/Media.md`'s `index.ts`/route rows for the mechanism.

  **Follow-up bug, found and fixed 2026-08-17 (PR #442):** the cursor-based
  pagination this entry describes shipped 2026-08-14 with a real defect in
  `GET /api/media`'s account-wide (no `chat_id`) paginated branch — it
  parsed `cursor` from the query string but never actually passed it into
  the `listByMember(memberId, tenantId, { limit })` call, so every "load
  more" scroll on `MediaPage.tsx` silently re-fetched the exact same first
  page forever instead of advancing. `listByChat` (the chat-scoped branch,
  `MediaGallery.tsx`) was unaffected — it already forwarded `cursor`
  correctly. Found while investigating the sort-toggle feature that shipped
  in the same PR (a working sort control depends on cursor pagination
  actually working) and fixed alongside it. See the `API Routes.md`
  `GET /api/media` row for the sort toggle itself — not yet reflected in
  `Public Site.md`'s `MediaPage` section, which still only covers the
  2026-08-14 pagination work above.

- **RESOLVED 2026-08-14 — Steps 5 and 6 of the original media upload plan,
  the last two open items (PR #380).**
  - **Step 5, client/server message mismatch — verified already closed,
    no code change.** Original observation: a member's client showed a
    local "upload failed" message (fired when the client's own `PUT` to
    Storage threw) while the `media_items` row was simultaneously at
    `status: 'processing'` — contradictory signals. Deferred pending the
    trigger-ordering fix (`start-processing` becoming the sole trigger for
    `processMediaItem`, only called after `uploadRes.ok`) on the theory it
    would resolve this as a side effect. Traced every `PUT`-failure path
    through `useMediaUpload.ts` against current code rather than assumed:
    confirmed `status='processing'` is structurally unreachable without a
    client-confirmed-successful `PUT`, across the ordinary fresh-upload
    path, the dedup "failed match, file missing" fallback, a genuine
    duplicate match (no `PUT` at all), and an `upload-url` rejection/error.
    See `Utilities/Media.md`'s "Client/server message mismatch" section for
    the full case-by-case trace, including the one explicitly out-of-scope
    residual (a `PUT` whose bytes landed but whose response was lost
    client-side — a display-lag gap of up to ~2 minutes on a separate UI
    surface, not the instantaneous contradiction originally reported).
  - **Step 6, raw marker syntax leaking into chat titles — real bug,
    fixed.** A chat's title could render literally as
    `[MEDIA_UPLOAD: IMG_1906.jpeg | 3180f20f-bae7-403f-b37a-3c90...]`
    instead of readable text. Root cause: both `chatStore.tsx`'s
    `deriveSessionTitle` (the DB-backed session title fallback — used
    whenever the fire-and-forget, no-retry AI title generation hasn't
    landed, which can be permanent) and `persistence.ts`'s `deriveTitle`
    (the shared local IndexedDB thread-index title, both chat surfaces)
    derived a title directly from the first user message's raw stored
    content, never stripping `[MEDIA_UPLOAD: ...]`/
    `[MEDIA_UPLOAD_FAILED: ...]`/`[MEDIA_UPLOAD_DUPLICATE: ...]` marker
    syntax — a media-only first message (attachment, no typed caption)
    produced exactly the observed bug. The same raw content was also sent
    as the literal quoted "user message" in the AI title-generation prompt
    (`POST /api/sessions/[id]/title`). **Fix:** added
    `titleSourceFromContent` to the canonical `mediaMarkerPatterns.ts` —
    strips all three marker types and, only when that empties the message
    out, falls back to a short type-aware label (`'Photo shared'` /
    `'Audio shared'` / `'Document shared'`, or `'Attachment shared'` for a
    bare failed-upload marker with no type field). Wired into both
    title-deriving call sites and into the payload sent to the AI
    title-generation route. See `Marker Syntax.md`'s `[MEDIA_UPLOAD: ...]`
    section for the full writeup and `mediaMarkerPatterns.test.ts` for
    coverage. Not the same bug as the whole-message-bookmark marker leak
    above (2026-08-08) — that one leaked into a memory's title/body via
    `createMemoryFromAnchor`; this one leaked into a chat session's own
    title.

## Services

- **`services/payments/` not created.** Stripe Connect work is deferred; not
  even a scaffold exists yet.

- **`services/transcription/`'s failure paths lose their diagnostics before
  they reach `audit_events` — documented 2026-08-16, corrected 2026-08-17.**
  **The original entry claimed there was no transcription `AuditAction` at
  all. That was already wrong when it was written:**
  `services/audit/types.ts` has carried `TRANSCRIPTION_REQUESTED` /
  `_SUCCEEDED` / `_EMPTY` / `_FAILED` (`transcription.requested` /
  `.succeeded` / `.empty` / `.failed`) since 2026-08-13, and
  `app/api/transcribe/route.ts` emits all four. **Do not add a
  `transcription.completed`** — the original entry suggested that name, and
  it collides with the real `transcription.succeeded`.
  **The real gap is narrower: the failure paths, and only those.** On
  success and on an empty transcript the provider *returns*
  `{ text, requestId, attempts }`, and the route puts `requestId`,
  `attempts` and `durationMs` straight into the audit row (plus `charCount`
  on the success event) — so the provider's own `console.log` on those two
  branches duplicates a durable record rather than being the only copy of
  it. On failure the provider *throws*, and a thrown `Error` carries only a
  message: the non-OK branch's `console.error` holds the HTTP status,
  Deepgram's `request_id`, the response body and the attempt count, but the
  only part of that reaching `TRANSCRIPTION_FAILED` is the status, carried
  incidentally inside the message string `Deepgram returned <status>`. The two
  fetch-level branches are worse — the rethrown error doesn't record whether
  the first attempt or the retry failed. Net effect: `request_id` and
  `attempts`, the two fields that make a Deepgram support ticket
  answerable, are durably recorded exactly when nothing went wrong.
  **Closing it needs a channel, not a new action.** Either attach the fields
  to the thrown error (a typed error carrying `status` / `requestId` /
  `attempts`) and widen the route's existing `TRANSCRIPTION_FAILED`
  metadata, or have the provider emit its own audit events. Either way this
  is a metadata change against an `AuditAction` that already exists. Two
  things to preserve: the retry path is what makes `attempts` the
  interesting field, and no existing log carries audio bytes or transcript
  text beyond a length (`chars` in the provider, `charCount` in the route),
  matching the media pipeline's counts-and-presence-only rule. The one field
  that would need sanitizing on the way in is the non-OK branch's raw
  `body` — Deepgram's own response text, unbounded and not currently
  truncated.

## jefflougheed Legacy Widget

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

- **Nine dead `.chat-overlay-*` CSS selectors sit interleaved with two live
  ones in `app/(jefflougheed)/globals.css:552-593` — found during the same
  documentation pass, 2026-08-07 (miscounted as "eight ... of ten" originally;
  corrected here to "nine ... of eleven" during the 2026-08-14 audit, matching
  the already-corrected count in `System Docs/jefflougheed Chat Widget.md`).**
  Of the eleven class selectors under the
  "Full-screen chat overlay" comment header — `.chat-overlay`,
  `.chat-overlay-inner`, `.chat-overlay-header`, `.chat-overlay-title`,
  `.chat-overlay-dot`, `.chat-overlay-actions`, `.chat-overlay-close`,
  `.chat-overlay-scroll`, `.chat-overlay-greeting`, `.chat-overlay-log`,
  `.chat-overlay-composer` — only the last two are referenced anywhere in
  `components/shells/widget/WidgetShell.tsx` (confirmed via grep: one match
  each; zero for the other nine). The other nine are an earlier,
  hand-rolled-class implementation of the overlay's chrome (header, close
  button, greeting text, etc.), superseded when that markup moved to inline
  Tailwind utilities directly in the JSX — the old CSS was never removed.
  They're visually indistinguishable from `.chat-overlay-log`/
  `.chat-overlay-composer`, the two selectors Bug 3's `--color-surface` fix
  actually touched (2026-08-06/07), which is exactly the kind of place this
  becomes a real hazard: a future edit restyling "the overlay" via one of
  the nine dead selectors would silently do nothing. **Suggested fix:**
  delete the nine dead selectors; keep `.chat-overlay-log`/
  `.chat-overlay-composer`. **Priority: minor cleanup debt**, not urgent —
  no functional impact today, purely a maintenance hazard for future edits.
  Full selector-by-selector accounting: `System Docs/jefflougheed Chat
  Widget.md`'s §6.

## Build & Tooling

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

## Documentation & Code Quality

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

