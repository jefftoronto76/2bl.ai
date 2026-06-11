# Auth Boundary — Pre-Merge Test Plan

Branch: `06-10-26_auth0-migration` · Plan: Clerk as first adapter behind
`services/auth` (see `docs/auth-service-rebuild.md` + session plan).
**Nothing merges to main until every section below passes on the Vercel
preview deployment for this branch.**

How to use this document: each section corresponds to one commit and lists the
exact manual checks for that change. Sections marked **[regression-only]**
should show *zero behavior change* — the check is that everything works exactly
as it did before. The final sections (10–12, 15) are behavior-sensitive and
need the most attention. Run the full end-to-end suite (§ E2E) last.

Preview URL placeholder: `https://<preview>` = the Vercel preview deployment
for the latest push to `06-10-26_auth0-migration`. Hosts below assume preview
aliasing; where a check is host-specific and the preview can't resolve it, run
the check on the path-equivalent (e.g. `/heirloom` instead of
`heirloom.2bl.ai`).

## Blocking items for morning review

(Items land here if a commit hits a problem or needs a decision. Empty = none.)

- **Pre-existing failures inherited from main (NOT caused by this branch —
  verified on the clean tree):**
  1. `npx tsc --noEmit` → 1 error in `components/admin/content/BlockCard.test.tsx`
     (optional `onRename` prop passed to a required prop type).
  2. `npm test` → 2 failures: `services/chat/ui/v1/registry.test.ts` (an
     `ACCOUNT_CREATE` marker is registered in `createDefaultRegistry()` but the
     test still expects only BOOKING/EMAIL/NAME/PHONE — the marker landed on
     main without a test update) and
     `components/admin/content/BlockCard.test.tsx` (duplicate-icon click
     assertion).
  Decide: fix on main separately, or fold into this branch before merge.

- **§15 — `users.role` column must be confirmed in Supabase Studio before the
  DB-role flip is trusted.** Run in Studio SQL editor:
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role';`
  - If it returns a row: verify your own row —
    `SELECT id, email, role FROM users WHERE email = 'lougheedjeff@gmail.com';`
    must show `role = 'platform_admin'`. If not:
    `UPDATE users SET role = 'platform_admin' WHERE email = 'lougheedjeff@gmail.com';`
  - If it returns nothing, run (and log to DB_CHANGELOG.md):
    `ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'member';`
    then the UPDATE above.
  - The code ships with a **loud fallback**: if the `users.role` lookup fails,
    it logs `[auth] users.role lookup failed — falling back to publicMetadata`
    (Vercel function logs) and uses the old Clerk publicMetadata path so you
    are never locked out. **The §15 check is only green when admin access works
    AND that log line does NOT appear.**

---

## §3 — Root layout: ClerkProvider → AuthProvider [regression-only]

Change: `app/layout.tsx` imports `AuthProvider` from `@/services/auth/ui`
(a pure re-export of ClerkProvider — runtime-identical).

1. Open `https://<preview>/heirloom` → landing renders, palette correct
   (dark Heirloom, not inkwell).
2. Open `https://<preview>/` (jefflougheed.ca equivalent) → renders with
   inkwell palette.
3. Sign in on Heirloom (chat → gate → sign-up modal or existing account)
   → completes; **hard-refresh** (Cmd+Shift+R) → still signed in
   (SSR session hydration — proves the provider re-export kept SSR auth state).
4. `https://<preview>/admin` → loads for your admin account.

## §4 — Middleware via the boundary [regression-only]

Change: `middleware.ts` imports `createAuthMiddleware`/`createRouteMatcher`
from `@/services/auth/middleware` (passthrough wrapper — the provider's
middleware still runs outermost). Handler body and matcher unchanged.

1. **Admin protection:** open `https://<preview>/admin` in a private window
   (signed out) → redirected to sign-in, NOT a 500/404.
2. **Domain rewrites:** `https://<preview>/secondbrainlabs` renders the SBL
   storefront; `https://<preview>/heirloom` renders Heirloom. (On production
   domains post-merge: `2bl.ai` and `heirloom.2bl.ai` roots.)
3. **Admin palette:** `https://<preview>/admin` (signed in) shows the light
   Mantine admin, not dark inkwell text-on-white.
4. **Correlation IDs:** in Vercel function logs, confirm any API request row
   still carries a `correlation_id` (or check a fresh `auth_events` /
   `audit_events` row in Studio:
   `SELECT correlation_id FROM auth_events ORDER BY created_at DESC LIMIT 5;`
   — non-null values prove header propagation survived the wrapper).
5. **Handshake:** complete one full sign-in — no redirect loop (proves the
   provider handshake routes still work under the wrapper).

## §5 — Prebuilt UI via the boundary [regression-only]

Change: `AdminShell.tsx` / `PlatformShell.tsx` import `UserButton` from
`@/services/auth/ui`; the SBL sign-in page uses `SignInPanel` (re-export of
the provider's `<SignIn />`, props unchanged).

1. `https://<preview>/admin` (signed in) → avatar button renders in the
   sidebar footer (desktop) AND in the mobile drawer (narrow the window
   below the Mantine breakpoint). Click → menu opens → **Sign out** works
   and lands on `/`.
2. `https://<preview>/platform/admin` (as platform admin) → same UserButton
   checks in PlatformShell.
3. `https://<preview>/secondbrainlabs/sign-in` → branded sign-in card
   renders with SBL theming (terracotta primary button, white card), and a
   full sign-in from this page redirects to `/platform/admin`.

## §6 — Server presence checks → getSession() [regression-only]

Change: `app/api/transcribe/route.ts` and `app/heirloom/page.tsx` use the
boundary's `getSession()` (JWT-only — same cost as the old bare `auth()`).

1. **Transcribe 401:** signed out,
   `curl -X POST https://<preview>/api/transcribe` → `401 {"error":"Unauthorized"}`.
2. **Transcribe happy path:** signed in on the SBL admin, use any
   voice-input surface that hits `/api/transcribe` → transcription still
   returns text (or, with DevTools, replay a signed-in POST → 200).
3. **Heirloom invite gate, signed out:** private window →
   `https://<preview>/heirloom` → chat shows the "By invitation only." gate.
4. **Heirloom invite gate, member:** sign in as an **active** member →
   gate is bypassed, chat usable. DB cross-check in Studio:
   `SELECT id, status FROM members WHERE clerk_id = '<your user_... id>' AND tenant_id = '20767f1d-1148-4e43-ab73-f6da88f0ac56';`
   → `status = 'active'` for the account you tested with.
5. **Invite token path:** `https://<preview>/heirloom?invite=<unused token>`
   (mint one at `https://<preview>/admin` → Invites) → gate bypassed without
   signing in.

## §7 — Member sync + claim → getCurrentUser() [regression-only]

Change: `app/api/members/sync` and `app/api/heirloom/members/claim` read
identity from the boundary's `getCurrentUser()` (normalized AuthUser) instead
of raw `currentUser()`. Same fields, same writes.

1. **Fresh sign-up sync:** in a private window on `https://<preview>/heirloom`,
   complete a brand-new sign-up (email or phone OTP) **with a name**. Then in
   Studio:
   `SELECT clerk_id, name, email, phone FROM users ORDER BY created_at DESC LIMIT 1;`
   → the new row has the contact you signed up with and the name you typed.
   `SELECT clerk_id, name, email, phone, status FROM members ORDER BY created_at DESC LIMIT 1;`
   → matching members row, `status = 'pending'` (claim path) with the same
   name/email/phone.
2. **Idempotency:** sign out and back in with the same account → repeat the
   queries → still exactly one members row for that `clerk_id`
   (`SELECT count(*) FROM members WHERE clerk_id = '<user_id>';` → 1) and its
   `status` did NOT change.
3. **Audit row:** `SELECT action, clerk_user_id, outcome FROM audit_events
   WHERE action = 'member.claim' ORDER BY created_at DESC LIMIT 1;` → row
   exists for the new sign-up's `user_...` id.

## §8 — Platform-admin gates → AuthUser.isPlatformAdmin [regression-only]

Change: `(platform)/layout.tsx`, `platform/admin/page.tsx`, and both
`/api/platform/tenants` routes gate on the boundary's
`user.isPlatformAdmin` (still resolved from Clerk publicMetadata until §15).

1. **Admin in:** as your platform_admin account, open
   `https://<preview>/platform/admin` → tenant list renders.
2. **Signed out:** private window → `https://<preview>/platform/admin` →
   redirected to `/secondbrainlabs/sign-in`.
3. **Non-admin (if you have a member test account):** sign in with it →
   `https://<preview>/platform/admin` → redirected to `/admin`.
4. **API 401:** signed out,
   `curl -X POST https://<preview>/api/platform/tenants -H 'Content-Type: application/json' -d '{}'`
   → `401 {"error":"Unauthorized"}`.
5. **API as admin:** from a signed-in admin browser session (DevTools →
   copy a request as fetch, or use the platform admin UI) create a throwaway
   tenant → 201; then delete it via the UI → audit rows:
   `SELECT action, clerk_user_id, outcome FROM audit_events WHERE action IN ('tenant.create','tenant.delete') ORDER BY created_at DESC LIMIT 2;`
   → both rows carry your `user_...` id.

## §9 — Client components → useAuthUser / useAuthActions

Change: `MessageList`, `prompt-builder`, `LandingNav`, `GateView`,
`ChatHeader` consume the boundary hooks. `AuthUser` gained `imageUrl`;
ChatHeader's display fields map `fullName→name`,
`primaryEmailAddress→email`. Mostly regression, but the account menu and
greeting render from mapped fields — eyeball them.

1. **Landing nav Sign Up:** signed out on `https://<preview>/heirloom` →
   "Sign Up" button visible → click → provider modal opens **with Heirloom
   theming** (dark card, gold accent — not default white).
2. **Gate sign-up:** open chat while gated → "Claim a free membership" →
   same themed modal; complete a sign-up → gate clears.
3. **ChatHeader account menu (signed in):** open the chat → avatar/initials
   button → dropdown shows your **name** and **email** correctly (these now
   come from the mapped AuthUser — wrong/blank values here mean a mapping
   bug). "Manage account" opens the themed profile modal. "Sign out" works,
   chat returns to signed-out state.
4. **Admin debug pills:** as platform_admin, in Heirloom chat send a message
   that triggers a marker (e.g. tell Sage your email) → grey `debug` pill
   under the assistant reply. As a non-admin member → no pills, ever.
5. **Prompt-builder greeting:** `https://<preview>/admin/prompt-builder` as
   admin → "Welcome back, <first name>." renders with your first name.

## §10 — chatStore → useAuthUser (HIGH ATTENTION)

Change: the Heirloom conversation store's signed-in gates consume the
boundary hook. Only `isLoaded`/`isSignedIn` are read; the tri-state passes
through verbatim. Everything below is existing behavior that must still work
exactly:

1. **Signed-in DB recovery:** as a signed-in member with at least one saved
   conversation, open `https://<preview>/heirloom`, open the chat → your most
   recent conversation hydrates (when its DB `updated_at` is newer than any
   local buffer). The "Recent" sidebar section lists your sessions; clicking
   one loads it; the active one is highlighted.
2. **Anonymous unaffected:** private window → chat works, localStorage-only,
   no Recent section.
3. **Sign-in transition claims sessions:** start a conversation anonymously
   (≥1 full turn), then sign in from the chat (gate or header) → after
   sign-in, in Studio:
   `SELECT id, user_id, updated_at FROM chat_sessions ORDER BY updated_at DESC LIMIT 3;`
   → the anonymous session you just created now has your `user_id` (non-null).
4. **First-observation guard (no spurious claim):** hard-refresh while
   ALREADY signed in → no duplicate claim calls in the network tab
   (`/api/sessions/<id>/claim` should NOT fire on a plain reload).
5. **Exit warning:** mid-stream (while Sage is typing), try closing the tab →
   browser "leave site?" dialog appears. After the turn completes and with no
   conversation, no dialog.
6. **isMember gates:** signed in → member-only UI (e.g. SaveChatCTA absence /
   presence rules) behaves as before sign-in vs after.

## §11 — useAuthFlow refactor onto the adapter (HIGHEST ATTENTION)

Change: all Clerk OTP mechanics moved into `useAuthFlowAdapter`
(providers/clerk/client.ts); `useAuthFlow` is now a provider-agnostic stage
machine with an unchanged public API; MagicLinkCard renders `CaptchaSlot`
(same `#clerk-captcha` div). Detection heuristic UNCHANGED in this commit.
9 new unit tests cover both error channels and terminal/retryable mapping.

Run each of these end-to-end on `https://<preview>/heirloom` (the MagicLink
card surfaces — e.g. SaveChatCTA / claim flows that mount it):

1. **New user, email OTP:** enter a never-used email + name → code arrives →
   enter code → success stage → signed in. Studio:
   `SELECT event_type, outcome, failure_reason, metadata->>'step' AS step, metadata->>'flowType' AS flow FROM auth_events WHERE metadata->>'auth_surface' = 'custom_otp' ORDER BY created_at DESC LIMIT 6;`
   → expect (newest-first) `finalize/signup`, `otp_sent/signup`, and a
   `sendCode_returned` or `sendCode_threw` failure row for the sign-in
   attempt — **identical step strings to pre-refactor rows.**
2. **Existing user, email OTP:** repeat with the same email → flow goes
   `otp_sent/signin` → `finalize/signin` (no signUp_create row).
3. **New user, phone OTP:** same as (1) with a fresh phone number → SMS
   code → success. Check the same query shows `contactType: phone` rows.
4. **Existing user, phone OTP:** repeat → signin path.
5. **Wrong code:** enter a wrong 6-digit code → inline error, input stays on
   the code screen (retryable — NOT the terminal error state) → correct code
   then succeeds.
6. **Resend:** on the code screen, request a new code → second `otp_sent`
   row → new code works.
7. **Captcha present:** view-source/inspect on the card's idle stage →
   `<div id="clerk-captcha">` exists (sign-up silently fails without it).
8. **Rate-limit gate:** submit the send form 6+ times rapidly → the
   validation gate's error shows inline (`sendEmail_outer_catch` /
   `sendPhone_outer_catch` row in auth_events) — gate still runs BEFORE any
   provider call.

## §12 — Detection fix: transferable pattern (BEHAVIOR CHANGE — HIGH ATTENTION)

Change: new-vs-existing detection now follows Clerk's documented pattern —
`signUp.create()` first; existing user ⇒ `signUp.isTransferable` ⇒
`signIn.create({ transfer: true })` ⇒ bare `sendCode()`. Transient failures
(rate limits, network) surface as errors instead of misrouting to "new user".
Verified against the installed SDK's types (`SignInFutureCreateParams.transfer`,
`signUp.isTransferable` in @clerk/shared).

Re-run §11 checks 1–4 in full (new email, existing email, new phone, existing
phone). Then additionally:

1. **auth_events show the new detection steps.** Same query as §11 — for an
   EXISTING-user sign-in expect (oldest-first): `signUp_create_transferable`
   (event_type `sign_in`, outcome `success`), then `otp_sent` with
   `flowType: signin`, then `finalize`. The old `sendCode_returned` /
   `sendCode_threw` detection rows no longer appear for new attempts.
2. **New user unchanged:** `otp_sent` `flowType: signup` with NO
   transferable row before it.
3. **Captcha now applies to sign-ins too** (signUp.create runs for every
   attempt): existing user signs in via the card → no captcha-related
   console errors, flow completes. If Clerk's bot challenge appears
   (visible widget), it renders inside the card, not broken.
4. **Transient failure behavior (the fix itself):** trip the rate limit
   (6+ rapid sends) or kill the network mid-send → inline error shown, and
   in auth_events a `signUp_create` failure row — crucially NO
   `otp_sent/flowType: signup` row for an existing user (the old heuristic's
   misroute). Retry after a minute → correct signin flow.
5. **Sign-up modal surfaces unaffected:** GateView/LandingNav use the
   provider's prebuilt modal, not this flow — confirm one modal sign-up
   still works end-to-end.

## Static checks (every commit)

Run locally or trust CI: `npx tsc --noEmit` (one pre-existing error in
`components/admin/content/BlockCard.test.tsx` is on main and unrelated),
`npm run test` (vitest), `npm run build`. Each commit on this branch was
pushed only after all three passed in the sandbox.
