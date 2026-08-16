# Sign-up / sign-in path inventory — 2026-08-16

**Scope:** investigation only. Nothing fixed or changed.

**Method:** walked the code fresh from entry points outward — `middleware.ts`,
every `app/api/**/route.ts`, `services/auth/**`, `services/members/members.ts`,
`services/crm/story-invites.ts`, and the Heirloom membership shell components.
Live production counts (read-only) used to confirm which paths have actually
fired.

**Tenants covered:** `heirloom.2bl.ai` (Heirloom), `2bl.ai` / `www.2bl.ai`
(Second Brain Labs), `jefflougheed.ca` / `legacy.2bl.ai` (Jeff Lougheed).

---

## A. Authentication paths (create or use a Clerk account)

**On the "Sign-up or sign-in?" column:** rows 1–4 all run the same
`useAuthFlow` → `providers/clerk/client.ts` `sendCode` state machine, which is
**not** a sign-up form or a sign-in form — it is one form that decides for
itself. It calls `signUp.create()` first; an existing identifier comes back as
`form_identifier_exists` and the attempt is routed to `signIn` instead. The
resolved branch is returned as `flowType: 'signin' | 'signup'`, which is why
`SaveChatCTA` can render "Welcome back — your story is saved." vs "You're now a
member." off the same submit. So the honest answer for those four is **both,
auto-detected at submit time** — the visitor never chooses, and the UI has no
"already have an account?" affordance because it doesn't need one.

Rows 5–8 are the prebuilt Clerk surfaces, where the sign-up/sign-in split is
whatever Clerk's own modal offers. Rows 9–10 are neither — they are `users`
writes that happen around an existing session.

| # | Path name | **Sign-up or sign-in?** | Entry point | Trigger | Identifier | Handler(s) | Writes `members`? | Writes `users`? | Name captured? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Admin invite link → chat OTP** | **Both — auto-detected.** New invitee → sign-up. A returning member re-clicking their own link → sign-in (and `acceptInvite` then 404s on the already-used token) | `app/invite/[token]/route.ts` → `/?invite=TOKEN` → `app/heirloom/page.tsx` → `MessageList.tsx` → `MagicLinkCard.tsx` | Admin-created invite link, clicked | Email **or** phone (visitor picks tab) | `useAuthFlow` → `providers/clerk/client.ts` `sendCode` (`signUp.create` + `signUp.update({unsafeMetadata:{heirloom_invite_token}})`) → Clerk `user.created` webhook → `linkInvitedMember()`; **racing** client `POST /api/heirloom/invites/accept` → `acceptInvite()` | **Yes** — updates the pre-existing invited row: `clerk_id`, `user_id`, `status='active'`, `source='invite'`, `used_at`, and `name` **only if currently null** | **Yes** — `linkInvitedMember` upserts `clerk_id`,`email`; webhook also upserts `clerk_id`,`name`,`email`,`phone`; `acceptInvite` path uses `ensureClerkUser()` (`clerk_id`,`email`,`name`,`phone`) | **Yes** — name field is required in `MagicLinkCard` (submit disabled without it) → Clerk `firstName`/`lastName` → webhook → `users.name` + `members.name` (null-guarded). `members.invited_name` is separate, set at invite creation |
| 2 | **Story invite link → chat OTP** | **Both — auto-detected.** Sign-in is a first-class case here, not an edge: the link is durable and multi-use, so an existing member joining a story hits `acceptStoryInvite`'s existing-member branch (`isNewMember: false`, subscriber grant only) | `app/join/[token]/route.ts` → `/?join=TOKEN` → `app/heirloom/page.tsx` → `MagicLinkCard.tsx` | Durable, multi-use story link (`story_invite_links`), clicked | Email **or** phone | Same `useAuthFlow` (`unsafeMetadata.heirloom_story_invite_token`) → webhook `acceptStoryInvite()`; **racing** client `POST /api/heirloom/story-invites/accept` → `acceptStoryInvite()` | **Yes** — **inserts a new row**: `tenant_id`, `clerk_id`, `user_id`, `role='member'`, `status='active'`, `source='story_invite'`, `primer` (copied from the link), `name`. Also inserts `artifact_subscribers` | **Yes** — webhook upsert + `ensureClerkUser()` | **Yes** — `MagicLinkCard` name field → Clerk → `name` param on `acceptStoryInvite` → `members.name` on insert |
| 3 | **Chat self-serve — `[ACCOUNT_CREATE:]` marker** | **Both — auto-detected.** Named for sign-up, but a signed-out returning member who gets the marker signs in through the identical form | `MessageList.tsx` (marker-triggered) → `MagicLinkCard.tsx` | Sage emits `[ACCOUNT_CREATE: reason]` mid-conversation; no invite token | Email **or** phone | `useAuthFlow` (no tokens in metadata) → webhook: `linkInvitedMember()` by **email fallback** → if no match, `syncMember()`. Client: `handleAuthSuccess` → `claimCurrentSession()` + `POST /api/members/sync` → `syncMember()` | **Yes** — `syncMember` upserts on `clerk_id`: `tenant_id`, `user_id`, `status='active'`, `name`, `email`, `phone`. `source` left null | **Yes** — `syncMember` upserts `clerk_id`,`name`,`email`,`phone`; `/api/members/sync` separately upserts `clerk_id`,`name`,`email` when a name was supplied | **Yes** — required name field → Clerk + `POST /api/members/sync {name}` → both `users.name` and `members.name` |
| 4 | **Chat self-serve — `SaveChatCTA` turn-count fallback** | **Both — auto-detected, and it says so.** The only surface that visibly branches on the result: `flow.flowType === 'signin'` → "Welcome back — your story is saved."; otherwise "You're now a member — your story is saved." | `components/shells/membership/SaveChatCTA.tsx` | `messages.length >= 4` **and** not yet a member — fires independently of any marker | Email **or** phone | `useAuthFlow` (**does not pass `inviteToken`/`storyInviteToken`**) → webhook cascade as row 3. Client: `claimAllSessions(name)` → `POST /api/members/sync` → `syncMember()` | **Yes** — same as row 3 | **Yes** — same as row 3 | **Yes** — required name field; pre-filled by re-scanning the transcript for `[NAME:]` at click time |
| 5 | **GateView prebuilt Clerk modal** | **Sign-up primary, sign-in reachable.** Opened via `openSignUp()`. `heirloomClerkAppearance` **styles** `footerActionText`/`footerActionLink` rather than hiding them, so Clerk's "Already have an account? Sign in" link is live in the modal | `components/shells/membership/GateView.tsx` → `openSignUp()` | Invite gate is on and the visitor has no valid token — "Claim a free membership" button (also the invalid/expired-token screen) | Whatever the Clerk dashboard enables (email, phone, OAuth/social) | Clerk hosted modal → `user.created` webhook → `linkInvitedMember()` (email) → else `syncMember()`. Client: `false→true` transition → `POST /api/heirloom/members/claim` → `claimMembership()` | **Yes** — `claimMembership` inserts `clerk_id`, `tenant_id`, **`status='pending'`**, `name`, `email`, `phone` — but only if no row exists; the webhook's `syncMember` may get there first with `status='active'` | **Yes** — `ensureClerkUser()` + webhook upsert | **Yes, indirectly** — whatever name Clerk's own modal collects → `AuthUser.name` → `claimMembership` `name` → `members.name` + `users.name`. No app-owned name field |
| 6 | **ChatHeader "Sign in" prebuilt modal** | **Sign-in primary, sign-up reachable.** Opened via `openSignIn()`, same appearance object as row 5 — the footer cross-over link to sign-up is not suppressed. A sign-up completed here creates a Clerk account but fires **no** `members` claim, since `chatStore`'s transition effect only runs `claimSessionsOnly()` | `components/shells/membership/ChatHeader.tsx` → `openSignIn()` | Signed-out visitor uses the account dropdown | Clerk-configured | Clerk hosted modal. No app-side claim call fires from here; `chatStore`'s `false→true` effect runs `claimSessionsOnly()` (+ invite/story-invite accepts if tokens are present) | **No** — membership writes only happen if a token-accept branch fires | **Indirectly** — `POST /api/sessions/[id]/claim` → `ensureClerkUser()` | **No** — no name collection on this path |
| 7 | **SBL platform admin sign-in page** | **Sign-in only.** The one surface in the whole inventory that genuinely cannot sign anyone up: `elements: { footerAction: 'hidden' }` suppresses Clerk's sign-up link. Platform admin accounts are provisioned out of band | `app/secondbrainlabs/sign-in/[[...sign-in]]/page.tsx` (`SignInPanel`) | `2bl.ai/sign-in` (middleware rewrite), **or** `app/(platform)/layout.tsx` redirecting an unauthenticated hit on `/platform` | Clerk-configured | Clerk `<SignIn>` → redirect to `/platform/admin`. Platform routes then use `getCurrentUser()` / `isPlatformAdmin` | **No** | **No** on this page itself — `users` is read by `getAuthContext()`, written only once an `/admin` page loads (row 8) | **No** |
| 8 | **`/admin` middleware-protected redirect** | **Both — and off-app.** No `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is configured (stated in `app/(platform)/layout.tsx:17`), so `auth.protect()` redirects to **Clerk's hosted Account Portal**, not to the branded `/secondbrainlabs/sign-in` page. Whatever that portal offers — sign-in, sign-up, OAuth — is dashboard config, not app code | `middleware.ts` `auth.protect()` on `/admin(.*)`; host-driven, works on every product host | Unauthenticated hit on any `/admin` path | Clerk-configured | Clerk hosted portal → back to `/admin` → `app/admin/layout.tsx` calls `syncUser()` | **No** | **Yes** — `syncUser()` upserts on `clerk_id`: `email`, `name`, `clerk_id`. Returns null (no write) when Clerk has no email | **Yes** — `users.name` from Clerk `firstName + lastName` |
| 9 | **Anonymous chat session creation (identity side-effect)** | **Neither.** No auth surface — a `users` write that piggybacks on an existing session, or a no-op when there is none | `app/api/sessions/route.ts` `POST` | Any first message in a chat, signed in or not | Clerk session if present | `syncUser()` → `chat_sessions.user_id` | **No** | **Yes** — `syncUser()` (`clerk_id`, `email`, `name`) | **Yes** — `users.name` only |
| 10 | **Post-auth session claim** | **Neither.** Runs strictly *after* one of rows 1–8 has already established the session | `app/api/sessions/[id]/claim/route.ts` | `chatStore` `claimCurrentSession` / `claimSessionsOnly` / `claimAllSessions` after sign-in | Clerk session | `ensureClerkUser()` → `claimSession()` | **No** | **Yes** — `ensureClerkUser()` upserts `clerk_id` + `email`/`name`/`phone` **only when present** (phone-only safe) | **No** — writes `users.name` only if Clerk already has one |

## B. `members` row creation with no Clerk account

| # | Path name | Entry point | Trigger | Identifier | Handler(s) | Writes `members`? | Writes `users`? | Name captured? |
|---|---|---|---|---|---|---|---|---|
| 11 | **Tenant-admin invite creation** | `app/api/admin/members/invite/route.ts` (from `app/admin/members/InviteMemberModal.tsx`) | Admin fills the invite form | Email and/or phone, both optional | `getAuthContext()` → `createMemberInvite()` | **Yes** — inserts `tenant_id`, `status='invited'`, `role='member'`, `token`, `expires_at`, `invited_by`, and optionally `invited_name`, `email` (lowercased), `phone`, `auto_open`, `primer` (falls back to `tenants.default_primer`) | **No** | **Yes** — the admin types it → **`members.invited_name`**, never `members.name` |
| 12 | **Platform-admin invite creation** | `app/api/platform/members/invite/route.ts` (from `app/(platform)/platform/members/page.tsx`) | Platform admin invites into an arbitrary tenant (`tenant_id` in body) | Email and/or phone, both optional | `getCurrentUser()` + `isPlatformAdmin` → `createMemberInvite()` | **Yes** — identical shape to row 11 | **No** — reads `users` only to resolve `invited_by` | **Yes** — → `members.invited_name` |
| 13 | **Member-facing collaborator invite** | `app/api/heirloom/invites/route.ts` (from `SidebarV2` → `InviteCollaboratorsModal.tsx`) | A signed-in Heirloom member mints a shareable link for their story | **None** — deliberately generic, no recipient identity fields | `getCurrentUser()` → `members` lookup by `clerk_id` → `createMemberInvite(…, null, null, null, …, primer, storyId)` | **Yes** — `status='invited'`, `token`, `primer`, `invited_by`; **no** `invited_name`/`email`/`phone` | **No** | **No** — this invite carries no name at all |
| 14 | **Waitlist self-registration** | `app/api/heirloom/members/waitlist/route.ts` (from `GateView.tsx` `WaitlistView`) | Gate is on, visitor has no invite token, submits the waitlist form | **Email only** (required) | Inline in the route — no service function | **Yes** — inserts `tenant_id`, `email`, `status='waitlist'`, `role='member'`. No `clerk_id`, no `user_id`, no token | **No** | **No** — the form collects email only |

## C. Identity mutation after the fact

| # | Path name | Entry point | Trigger | Identifier | Handler(s) | Writes `members`? | Writes `users`? | Name captured? |
|---|---|---|---|---|---|---|---|---|
| 15 | **Clerk "Manage account" profile edit** | `ChatHeader.tsx` → `openUserProfile()` (Heirloom); `UserButton` in `UnifiedAdminShell.tsx` (admin) | Member edits name / email / phone in Clerk's hosted profile UI | Email, phone, name | Clerk `user.updated` webhook → `users` upsert → `linkInvitedMember()` → else `syncMember()` | **Yes, indirectly** — `syncMember` upsert overwrites `members.name`/`email`/`phone` from the new Clerk values | **Yes** — `clerk_id`, `name`, `email`, `phone` | **Yes** — a rename here propagates to both `users.name` and `members.name` (but never to `members.invited_name`) |
| 16 | **Invite resend / token rotation** | `app/api/admin/members/invite/resend/route.ts` | Admin re-sends an invite | n/a | Direct `members` update | **Yes** — new `token`, new `expires_at` (identity fields untouched) | **No** | **No** |
| 17 | **Platform status / role change** | `app/api/platform/members/status/route.ts`, `.../roles/route.ts` | Platform admin bulk-edits from the members table | n/a | Direct `members` update | **Yes** — `status` (+ `deleted_reason`) or `role`. Identity fields untouched | **No** | **No** |
| 18 | **Hard delete** | `app/api/platform/members/[userId]/route.ts` → `hardDeleteMember()`; and Clerk `user.deleted` webhook | Admin hard-deletes, or the Clerk account is deleted | n/a | `hardDeleteMember` deletes the `users` row (DB cascade removes `members`); webhook instead soft-deletes: `users.deleted_at`/`status='deleted'` + `members.status='deleted'` | **Yes** — cascade delete, or `status='deleted'` | **Yes** — row deleted, or `deleted_at`/`status` stamped | n/a |

---

## Live production counts (Heirloom tenant, read-only, 2026-08-16)

`members` by `status` / `source`:

| status | source | count |
|---|---|---|
| invited | null | 15 |
| active | null | 12 |
| active | `invite` | 7 |
| deleted | null | 6 |
| **pending** | null | **1** |
| _waitlist_ | — | **0** |
| _any_ | `story_invite` | **0** |

`users`: 26 total — 2 with `name = ''`, 4 with `name IS NULL`, 1 with neither
email nor phone.

---

## What looks inconsistent or surprising

**1. `status = 'pending'` is written by a path that no other code recognizes.**
`claimMembership()` (`services/auth/claim-membership.ts`, the GateView
self-service path) inserts `status: 'pending'`. Every other place that
enumerates member statuses lists only `active | invited | waitlist | suspended
| deleted` — including `VALID_STATUSES` in
`app/api/platform/members/status/route.ts:13`, which will reject `'pending'` as
an input, and `PROTECTED_STATUSES`, which doesn't shield it. There is exactly
**1 such row in production** today. That member is in a status the admin tooling
cannot reason about.

**2. There are four separate `users`-upsert implementations with four different
field sets.** `syncUser`, `ensureClerkUser`, the Clerk webhook's inline upsert,
and `linkInvitedMember`'s own upsert. They disagree on real things:
- `syncUser` **returns null when Clerk has no email**, so a phone-only member
  gets no `users` row and their chat session is never linked (`app/api/sessions/route.ts`).
  `ensureClerkUser` exists specifically to fix this — but only the routes that
  happen to call it are fixed.
- `syncUser` writes `name` unconditionally as `[firstName, lastName].filter(Boolean).join(' ')`,
  which is `''` when Clerk has no name. `ensureClerkUser` guards with `|| null`
  and omits the field. **Two `users` rows in production have `name = ''`** rather
  than null — the `syncUser` signature.
- `linkInvitedMember` upserts `email: email?.toLowerCase() ?? null` where the
  webhook passes `email ?? ''` — so a phone-only invited sign-up would write
  `users.email = ''` over a row the webhook just created without an email.
  *No production row shows this yet* (0 empty emails), so it's a code-path
  observation, not an observed defect.

**3. Name lands in three different columns depending on which door you came
through, and they never reconcile.** Admin/platform invites write
`members.invited_name`. Every Clerk-backed path writes `members.name`. The
member-facing collaborator invite writes neither. Nothing ever copies
`invited_name` → `name` or vice versa, and MEMBER CONTEXT (documented
separately) reads only `invited_name` — so the 12 `source=null` active members
who signed up self-serve have a name the chat prompt structurally cannot see.

**4. Every invited sign-up runs two independent handlers that race.** The Clerk
webhook (`linkInvitedMember` / `acceptStoryInvite`) and the client's own accept
call (`acceptInvite` / `acceptStoryInvite`) both fire for the same event with no
ordering guarantee. The code is visibly scarred by this: `acceptInvite` has an
orphan-row delete step *plus* a name-rescue step for the row it's about to
delete, and `acceptStoryInvite` has an explicit `23505` unique-violation
re-fetch branch. It works, but the reconciliation logic is now larger than the
happy path.

**5. `source` is null for 18 of 41 rows, including 12 active members.** Only
`acceptInvite` and `linkInvitedMember` stamp `source='invite'`; `syncMember` and
`claimMembership` stamp nothing. So "how did this person get here" is
unanswerable for most of the member base. `source='story_invite'` has **never
been written** — the story-invite sign-up path (row 2) has zero production rows
despite being fully built and merged.

**6. The waitlist path has never fired.** Zero `status='waitlist'` rows. It's the
only path in the entire inventory that collects an identifier with no Clerk
account behind it, and it's dead in practice.

**7. `SaveChatCTA` and `MagicLinkCard` are the same flow with different
plumbing.** Both wrap `useAuthFlow`, both require a name, both end at
`/api/members/sync`. But `SaveChatCTA` calls `flow.sendEmail(val, nameValue)` —
**omitting `inviteToken` and `storyInviteToken`**. If an invite holder's CTA
fires before the marker does, the sign-up completes with no token in Clerk
`unsafeMetadata`, so the webhook falls back to email matching and the invite
row's `primer` / `invited_name` / `auto_open` are silently orphaned. Whether the
client-side accept call rescues it depends on which handler wins the race in
finding #4.

**8. `MagicLinkCard`'s "already signed in on mount" branch can null out a
name.** `MagicLinkCard.tsx:127-132` fires `onSuccess(nameValue)` where
`nameValue` is `initialName ?? ''`. That reaches `POST /api/members/sync` as
`{name: null}`, and `syncMember` treats `null` (unlike `undefined`) as "write
this column" — so `members.name` is overwritten with null. Reachable whenever a
signed-in member gets an `[ACCOUNT_CREATE:]` marker with no `[NAME:]` marker or
`invited_name` to pre-fill from. *Inferred from the code path; I did not
reproduce it against a live session.*

**9. `jefflougheed.ca` / `legacy.2bl.ai` have no member auth surface at all.**
The widget shell (`components/shells/widget/`) contains zero auth imports — no
sign-up, no sign-in, no `members` writes. Those hosts are anonymous-visitor only.
Their sole authenticated surface is `/admin`, which middleware passes through
un-rewritten on every host (row 8). Worth stating explicitly since the request
listed them as tenants to cover.

**10. Two invite mechanisms that look alike share no code.** `members.token` +
`/invite/[token]` + `acceptInvite` (single-use, identity-bound) versus
`story_invite_links.token` + `/join/[token]` + `acceptStoryInvite` (durable,
multi-use, generic). Separate tables, routes, service files, and accept
endpoints — deliberate, and documented as such in both files. The one asymmetry:
`/join` enforces `expires_at`; `/invite` reads it and **does not enforce it**.

**11. `members.clerk_id_dev` has zero code references.** The column exists in the
schema but nothing reads or writes it anywhere in the repo. Whatever dev/preview
identity path it was meant for does not exist in production code.

**12. "Sign-up vs sign-in" is barely a real distinction in this app.** Of ten
authentication paths, exactly **one** (`SignInPanel`, row 7) can only sign
someone in, and **zero** can only sign someone up. The four chat paths
(rows 1–4) resolve the branch themselves at submit time and never ask; the two
prebuilt modals (rows 5–6) each expose the other mode through Clerk's footer
link. That is mostly a good thing — it's why an invite holder who already has
an account doesn't hit a dead end — but it means any reasoning of the form
"this is the sign-up path, so the user must be new" is unsafe. Two places
already depend on that assumption: `acceptInvite` 404s when a returning member
re-clicks a used invite link, and `GateView`'s claim call fires on the
`false→true` transition regardless of whether the visitor just signed up or
just signed in.

**13. `/admin` and `/platform` disagree about where unauthenticated users go.**
`/platform` is gated in `app/(platform)/layout.tsx`, which redirects to the
branded `/secondbrainlabs/sign-in` page — with an explicit code comment saying
it does this *because* no `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is set and middleware
would otherwise dump the user on Clerk's hosted Account Portal. `/admin` is
gated in `middleware.ts` via `auth.protect()` and gets exactly that unbranded
Account Portal. The workaround was applied to one surface and not the other.

**14. A sign-up completed from the ChatHeader modal creates a Clerk account with
no `members` row.** Rows 5 and 6 open the same Clerk component with the same
appearance object, but only `GateView` calls `/api/heirloom/members/claim` on
the sign-in transition — `ChatHeader` runs `claimSessionsOnly()`, which
deliberately does not touch `members`. So a visitor who opens "Sign in" from the
account dropdown, follows Clerk's footer link to sign up, and completes it ends
up with a `users` row and no membership until the `user.created` webhook's
`syncMember()` fallback catches them. *Inferred from the two components' code;
I did not exercise the modal's footer link against a live Clerk instance to
confirm it is rendered.*
