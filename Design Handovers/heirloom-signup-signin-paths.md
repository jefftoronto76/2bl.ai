# Heirloom: Complete Sign-Up / Sign-In Path Documentation

## Context

This is a pure investigation/documentation task — no code changes. It builds on
the four-gate identity audit and the D1/D2 fixes already on
`claude/heirloom-identity-audit-htyd8g`, and supersedes the "5 entry points"
framing from `Design Handovers/identity-endstate-goals-proposal.md` (Goal 1),
which only covered account-*creation* — not sign-in, not the passive
"already-have-a-session" cases, and not the admin/platform surfaces.

The need: one place that answers, for every way a person reaches an
authenticated state in this product, what identity data is available, what
gets written where, what fires downstream, and whether it's already a known
issue. Nothing here is proposed to be fixed — this is the map the next round
of fixes will be prioritized against.

**Everything below was independently verified against current code** — every
file:line cited was read directly, not inferred. `tenant_users` and
jefflougheed.ca/`app/legacy/` are out of scope, per the request and because
both ride passively on the single root `ClerkProvider`
(`app/layout.tsx`) with zero Clerk code of their own (confirmed by a
repo-wide grep for `useUser|useAuth|SignedIn|SignedOut|ClerkProvider|useClerk`
in both trees — zero matches).

**One genuinely new finding surfaced by this pass, not in the Gate 1 register
or the endstate-goals proposal:** an already-signed-in Heirloom member who
clicks a *fresh* admin/member `?invite=TOKEN` link has that invite silently
dropped — nothing ever accepts it. This is the exact gap that *was* found and
explicitly fixed for story invites (`chatStore.tsx:720-723`'s own comment:
*"an existing Heirloom member opening a story invite link while already
logged in has no sign-in transition to hook... the real gap identified
investigating this feature"*) but was never mirrored for admin/member
invites. See Path 3 below.

---

## The full path table

| # | Name | Entry point | Trigger | Sign-up or sign-in | Identity data available | What it writes | Downstream | Known gaps |
|---|---|---|---|---|---|---|---|---|
| 1 | **Custom OTP — email/phone** (shared engine behind MagicLinkCard & SaveChatCTA) | `services/auth/providers/clerk/client.ts:144-145` (`signUp.create`), `:243-244` (`signIn.emailCode/phoneCode.sendCode`). UI: `MagicLinkCard.tsx`, `SaveChatCTA.tsx` | `MagicLinkCard`: an `[ACCOUNT_CREATE: reason]` marker in the chat transcript (generic, admin-invite, story-invite, or expired-invite reasons — same component, same mechanism, reason text only changes the copy). `SaveChatCTA`: 4+ messages sent, visitor not yet a member | **Both**, auto-detected server-side. `signUp.create()` fails with `form_identifier_exists` → silently redirects to the sign-in branch (`client.ts:231-263`) — the same form serves returning members with no visible difference | Name — typed in-form, guarded in the submit handler (`!nameValue.trim()` blocks submission, `MagicLinkCard.tsx:168`, `SaveChatCTA.tsx:121`) — **client-side only, not server-validated**. Email or phone — typed | Unconditionally fires `POST /api/members/sync` on completion → `syncMember` (both `users`+`members`, shared `identity.ts` helper) | `claimCurrentSession`/`claimAllSessions` (session ownership). If an invite/story token is present in context, chatStore's **independent** `isSignedIn`-transition effect *also* fires (Paths 2/4) — no ordering guaranteed between the two | None on its own (D1 fixed). Becomes the racing party in Path 2's gap below |
| 2 | **Admin/member invite acceptance — new signup** | `app/api/heirloom/invites/accept/route.ts` → `acceptInvite` (`services/members/members.ts:422`) | `chatStore.tsx:679-682`: the `false→true` `isSignedIn` transition, while `inviteTokenRef` holds a valid `?invite=TOKEN` | New account (or reactivating a `status='invited'` row) | Clerk's resolved name is available (`ensureClerkUser` reads it) but **never passed into `acceptInvite`** — its signature has no `name` parameter, unlike its siblings | `users.name` via `ensureClerkUser` (unconditional, shared helper — reliable). `members.name` **only** via orphan-rescue (rescuing a name from a `syncMember`-created orphan row before deleting it) | Deletes Path 1's orphan row if one exists yet at this point in the race | **Confirmed live gap (Goal 2, endstate-goals proposal)** — when the orphan-rescue loses the race against Path 1's `/api/members/sync`, `users.name` lands and `members.name` doesn't. Self-heals on the member's *next* visit, not immediately |
| 3 | **Admin/member invite acceptance — already signed in** | Same `acceptInvite`, but **nothing calls it** in this scenario | An **existing, already-authenticated** Heirloom member clicks a fresh `?invite=TOKEN` link | Sign-in (existing account) — but the invite itself is never touched | N/A — the acceptance function never runs | **Nothing.** `acceptMemberInviteToken` (`chatStore.tsx:679-694`) fires only on the `false→true` transition, which never occurs — this visitor was already signed in | None | **New finding, this pass.** The invited `members` row (`status='invited'`) is never claimed — orphaned indefinitely. Structurally identical to a gap explicitly found and fixed for story invites (Path 5) but never mirrored here |
| 4 | **Story invite acceptance — new signup** | `app/api/heirloom/story-invites/accept/route.ts` → `acceptStoryInvite` (`services/crm/story-invites.ts:488`). Also independently reachable from the Clerk webhook (`app/api/webhooks/clerk/route.ts:187`), racing the client call — both are safe no-ops against each other via a `23505` unique-violation check | `chatStore.tsx`'s `false→true` transition with `storyInviteTokenRef` set | New account, or an existing member gaining access to a new story | Clerk's resolved name, passed **directly as a parameter** (unlike Path 2) | `members` insert with `name` included (fill-only-when-null semantics don't even apply — it's a fresh insert) | Subscribes the member to the story (`artifact_subscribers`) | None found — this is the invite-acceptance path that already does what Path 2 is missing |
| 5 | **Story invite acceptance — already signed in** | Same `acceptStoryInvite`, triggered from a **dedicated mount-time effect** (`chatStore.tsx:724-744`) | Existing member clicks a `?join=TOKEN` link while already logged in | Sign-in (existing account), gains story access | Same as Path 4 | Same as Path 4 | Same as Path 4 | None — this is the fix Path 3's gap should mirror |
| 6 | **LandingNav — Clerk prebuilt sign-up modal** | `app/heirloom/components/landing/LandingNav.tsx:76`, `openSignUp()` | "Start Your Story" CTA on the Heirloom marketing homepage — rendered **unconditionally** underneath the chat drawer (`HeirloomApp.tsx:31`), not gated on invite state or auth state | New account (Clerk's modal may itself offer a "sign in instead" toggle — Dashboard config, invisible to this repo) | Whatever Clerk Dashboard's own sign-up form is configured to collect — **not controlled or visible in application code** | **Nothing from this click directly.** Only `signUp.create()` fires, inside Clerk's own modal. The `user.created` webhook is what eventually creates `users`/`members` rows — and the webhook has no visitor-typed name to work with at all here, only whatever Clerk itself collected | `user.created` webhook (Path 12) | **Confirmed live gap (Goal 1, endstate-goals proposal)** — zero app-level name enforcement. This is the most-live, most-mainstream unenforced path in the product |
| 7 | **GateView — Clerk prebuilt sign-up modal (invalid/garbage invite token)** | `components/shells/membership/GateView.tsx:90`, `openSignUp()` | `?invite=` holds a string that was **never a real token** (`memberTokenExists()` false) — a genuinely expired/revoked-but-real token instead bypasses this entirely via `bypassGateForExpiredInvite` (`chatStore.tsx:1462`) and never reaches this branch | New account | Same as Path 6 — Clerk's own modal, uncontrolled | Same as Path 6 for the modal itself. On completion, `GateView`'s own guarded `false→true` effect (`GateView.tsx:20-38`) fires `POST /api/heirloom/members/claim` once → `ensureClerkUser` + `claimMembership` (both routed through the shared helper, correctly guarded) | `user.created` webhook (Path 12) + `/api/heirloom/members/claim` | Same Goal 1 gap as Path 6, narrower reachability. Also: `System Docs/Known Gaps.md` currently mislabels `/api/heirloom/members/claim` as "effectively orphaned" — this path proves it is not, just low-traffic. Worth correcting when this doc lands |
| 8 | **ChatHeader — explicit "Sign in"** | `ChatHeader.tsx:128-136`, `openSignIn()` | "Sign in" item in the account dropdown, visible when the chat surface is open and the visitor is signed out | Sign-in only (existing account) | N/A — Clerk's own modal handles credential entry | None directly | `session.created` webhook event (logged to `auth_events` only — no identity write, since `user.updated` is not subscribed) | None — plain re-authentication, nothing to enforce |
| 9 | **Returning visitor — session already valid** | `MagicLinkCard.tsx:127-132`'s mount effect: `if (isLoaded && isSignedIn && stage === 'idle')` — fires on **every mount** of this component while already signed in, with no guard against re-firing | A page reload / new tab with a live Clerk session cookie, **or** the actual magic-link email being clicked and redirecting back into the same tab | Sign-in — not even a fresh auth event; Clerk silently restores an existing session | Whatever is already resolvable from the restored session (name/email/phone via Clerk) | Fires `/api/members/sync` → `syncMember`, same as Path 1 | Same as Path 1 | This row **is** D1's original trigger (repeated, unguarded re-firing with an empty name). Now harmless — `identityValue` strips the empty name before it can overwrite anything — but the unguarded re-fire itself is unchanged and worth knowing about for future work |
| 10 | **`/admin` sign-in** | `middleware.ts:8,224-226` → `auth.protect()` → Clerk's default **hosted Account Portal** (no branded page — confirmed no `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is configured anywhere in the repo) | Any unauthenticated request to `/admin/*` | Both (Clerk's hosted UI supports either, subject to Dashboard config) | Whatever Clerk's hosted UI collects — fully outside this repo | `syncUser()` on every admin layout load (`app/admin/layout.tsx:17`) — **`users` only, never `members`**, by design (admin/tenant-staff, not Heirloom members) | None Heirloom-specific | Not a Heirloom-member path — noted for completeness only. `tenant_users` (role resolution) explicitly out of scope |
| 11 | **Platform admin sign-in** | `app/secondbrainlabs/sign-in/[[...sign-in]]/page.tsx` → `SignInPanel` (Clerk's prebuilt `<SignIn>`), gated by a `redirect()` in `app/(platform)/layout.tsx:24-27`, **not** middleware | Unauthenticated request to `/platform/*` (a layout-level check, since no `NEXT_PUBLIC_CLERK_SIGN_IN_URL` means middleware `auth.protect()` would otherwise bounce to the unbranded hosted portal) | Both | Same as Path 10 | Same `syncUser()` mechanism as Path 10 | None Heirloom-specific | Same as Path 10 — out of scope, noted for completeness. The one custom-branded `<SignIn>` component in the entire repo |
| 12 | **Clerk webhook — async side channel** | `app/api/webhooks/clerk/route.ts` | Fires asynchronously off **every** path above that produces a `user.created`/`user.deleted`/`session.created`/`session.revoked` Clerk event. Not itself a UI entry point | N/A — reactive, not a place someone "arrives" | Clerk's payload: `first_name`/`last_name`/email/phone at the moment of the event | `users` (shared helper, fixed) → then `linkInvitedMember`/`syncMember`/`acceptStoryInvite` fallback cascade for `members`, in that priority order | Is itself the downstream of Paths 1–9 | `user.updated` is **not subscribed** on the `heirloom.2bl.ai` endpoint (dashboard-verified) — D3 (Clerk-derived overwrite) is a real code defect but currently unreachable because of this. If that ever changes, this is the path that goes live |

---

## Plain-language summary

**Where names reliably land correctly today:** any path that goes through
the custom email/phone OTP form (Path 1) — including its "already existing"
sign-in branch — plus the door that closes it: `/api/members/sync`
(post-D1-fix) never blanks a name, and story-invite acceptance (Paths 4/5)
was already built with a direct name parameter, so it works whether the
person is brand-new or already signed in. That combination — custom form +
`/api/members/sync` + story invites — is the part of the system that's
solid.

**Where they don't, and why:**

1. **Two doors bypass the custom form entirely** (Paths 6, 7) and go straight
   into Clerk's own prebuilt sign-up modal. Application code has no
   visibility into what that modal collects, and the most heavily-trafficked
   one — the actual marketing homepage's "Start Your Story" button — is
   completely unguarded. This is Goal 1's finding, confirmed again here as
   the two paths with genuinely zero enforcement, not five.

2. **Admin/member invite acceptance has two independent problems, and
   they're different problems.** When a *new* person accepts one (Path 2),
   the name only reaches `members` via a rescue mechanism that depends on
   winning a timing race — it isn't broken, but it isn't guaranteed either,
   and it's the one invite-acceptance path built differently from its
   siblings. When an *already-signed-in* person clicks one (Path 3), nothing
   happens at all — the invite is silently dropped, permanently, with no
   error and no retry. That second one is new information from this pass: it
   isn't in the Gate 1 register, and it's the mirror image of a gap that was
   already found and fixed for story invites (Path 5 exists specifically
   because someone noticed this exact failure mode there). Admin/member
   invites never got the same fix.

3. **Two write paths exist purely to keep `users.name` fresh for internal
   staff** (Paths 10, 11 — admin and platform sign-in) and are correctly
   scoped to never touch `members` at all, since admin/platform accounts
   aren't Heirloom members. These are fine as-is; they're documented here
   only so the full picture is complete, not because they need anything.

4. **The webhook (Path 12) is the thing every other path eventually reports
   to**, and it's currently safe only because `user.updated` isn't
   subscribed — a Clerk Dashboard setting, not a code guarantee. That's the
   Gate 3/D3 finding, unchanged by anything in this pass: still a real code
   defect, still not reachable today, still worth the tripwire that's
   already been designed for it.

The overall shape: the system has one well-built mechanism (the custom OTP
form + `/api/members/sync` + story invites) and several side doors and edge
cases that were each patched individually as they were found — story invites
got their "already signed in" fix, admin/member invites didn't; the OTP
form's name field is enforced, the prebuilt-modal doors aren't. Nothing here
is silently broken in a way that loses data outright (aside from the D1 class
of bug, already fixed) — the remaining gaps are places where a name either
never arrives, or arrives late, or an invite is dropped rather than accepted.

---

## Verification for this pass

This is a documentation task — nothing to build or test. Verification is:
read the doc, check the table against the cited `file:line`s (all directly
verified, not inferred), and confirm the one new finding (Path 3) matches the
code at `chatStore.tsx:679-694` (has no already-signed-in branch) versus
`chatStore.tsx:720-744` (does).
