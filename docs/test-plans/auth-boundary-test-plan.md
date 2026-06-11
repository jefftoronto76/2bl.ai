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

- **DO NOT run the §11/§12 verification on production (heirloom.2bl.ai) before
  merge.** Production runs main, which still has the OLD signIn-first
  detection — `signUp_create_transferable` cannot appear there, and old-style
  `sendCode_returned` / signup-flow rows on production are main's heuristic,
  NOT a bug in this branch. The §12 query is only meaningful against the
  preview deployment of this branch.
- **§11/§12 preview blocker FIXED — one Vercel env var needed (Jeff).**
  Preview hosts (`*.vercel.app`) never match `tenants.domain`, so
  `POST /api/sessions` 400'd ("Unable to resolve tenant for this domain") and
  the OTP E2E was untestable. `getTenantFromRequest` now supports a
  `PREVIEW_TENANT_ID` fallback — honored only outside production
  (`VERCEL_ENV !== 'production'` guard; a real domain match always wins;
  unit-tested in `services/auth/get-tenant-from-request.test.ts`). To arm it:
  Vercel → Project → Settings → Environment Variables → add
  `PREVIEW_TENANT_ID` = `20767f1d-1148-4e43-ab73-f6da88f0ac56` (Heirloom),
  **Preview environment ONLY**, then redeploy this branch. After that, run
  §11 + §12 on `https://<preview>/heirloom` exactly as written — including the
  existing-user sign-in check: the auth_events query must show
  `signUp_create_transferable` + `otp_sent/flowType: signin` for the existing
  user; an `otp_sent/flowType: signup` row for an existing user = detection
  bug, stop before PR.
- **PR is NOT drafted yet** — gated on the §11/§12 preview E2E passing
  (Jeff's call after the env var + manual flow above).

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

## §13 — In-boundary rewire [regression-only]

Change: `get-auth-context`, `get-current-user-id`, `sync-user`,
`ensure-clerk-user` import `clerkAuth`/`clerkCurrentUser` from
`providers/clerk/server` instead of `@clerk/nextjs/server` (pure aliasing —
identical runtime). `services/auth/providers/clerk/**` is now the only Clerk
import site in the codebase.

1. `https://<preview>/admin` (signed in) → loads with correct tenant name in
   the sidebar (getAuthContext path).
2. Heirloom Recent sidebar still lists sessions when signed in
   (getCurrentUserId via GET /api/sessions).
3. One sign-in to `/admin` → no `[get-auth-context]` errors in Vercel logs.

## §14 — Lint flip to error + docs [static-only]

Change: the Golden Rule is now an ESLint **error**; the override narrowed to
`services/auth/providers/clerk/**`. CLAUDE.md documents the boundary (Stack
entry + Auth service section).

1. `npm run lint` → zero `no-restricted-imports` findings.
2. Sanity: add `import { auth } from '@clerk/nextjs/server'` to any app file
   → lint fails with the Golden Rule message → revert.

## §15 — isPlatformAdmin from users.role (BEHAVIOR CHANGE — gated on Studio)

Change: server-side admin authorization now reads the Supabase `users.role`
column (`resolveIsPlatformAdminFromDb`); Clerk publicMetadata is only the
loud fallback (and the client-side display mapping). **Do the Studio
verification in the Blocking Items section at the top of this file FIRST.**

1. **Column + backfill confirmed** (blocking item) — then redeploy/re-test.
2. **Admin in via DB role:** `https://<preview>/platform/admin` as your
   account → tenant list renders, AND Vercel function logs show **no**
   `[auth] users.role lookup failed` line for the request. Both conditions
   required — access via the fallback is a missing-migration signal, not a
   pass.
3. **Member blocked via DB role:** with a test member account
   (`SELECT role FROM users WHERE clerk_id = '<test user_... id>';` →
   `'member'`) → `https://<preview>/platform/admin` redirects to `/admin`;
   `POST /api/platform/tenants` returns 403.
4. **DB is authoritative:** flip your test member's row —
   `UPDATE users SET role = 'platform_admin' WHERE clerk_id = '<test id>';`
   → that account now passes the platform gates WITHOUT touching Clerk
   publicMetadata. Flip it back after
   (`UPDATE users SET role = 'member' WHERE clerk_id = '<test id>';`).
5. **Client display gates** (admin debug pills in chat, prompt-builder
   greeting) still key off Clerk publicMetadata — unchanged. Known
   limitation, documented in CLAUDE.md: they are display-only; privileged
   actions are all server-gated.
6. **Member routes unaffected:** one fresh sign-up → members/claim flow
   still completes (these routes call getCurrentUser, which now does one
   extra single-row DB read; no behavioral change expected).

## E2E — Full pre-merge suite (run LAST, after all sections pass)

Adapted from the spec's §6 checklist. One uninterrupted pass on the preview:

1. Private window → `https://<preview>/heirloom` → chat → gate → sign up as a
   brand-new user (email OTP, with name) → success.
2. Studio: new `users` row (name/email correct) + new `members` row
   (`status='pending'`, same contact) + the anonymous chat session claimed
   (`chat_sessions.user_id` set) + `auth_events` rows for the full flow with
   `auth_surface='custom_otp'`.
3. Sign out (ChatHeader) → sign back in with the same email → signin flow
   (transferable path) → conversation recovers from DB.
4. **Hard refresh** with the active session → still signed in (SSR
   hydration).
5. Repeat 1–4 once with a phone number (SMS OTP).
6. Your admin account: `https://<preview>/admin` (tenant admin, host-derived
   name) and `https://<preview>/platform/admin` (platform admin via
   users.role — no fallback log line).
7. jefflougheed.ca surfaces unaffected: `https://<preview>/` renders, Sage
   chat streams, booking cards render.
8. `npm run lint` clean · `npm test` (only the 2 pre-existing main failures)
   · `npx tsc --noEmit` (only the 1 pre-existing main error) · build green.

## Commit map (this branch)

| Commit | § | Change |
|---|---|---|
| `ab4e957` | — | docs: auth-service-rebuild spec (markdown conversion) |
| `c2895c8` | — | docs: dual error channel + known limitations (CLAUDE.md + skills) |
| `cee02b6` | — | boundary scaffold (types, errors, providers/clerk, entry points) |
| `3387a74` | — | ESLint Golden Rule at warn |
| `31dc45e` | §3 | root layout → AuthProvider |
| `9cd9a32` | §4 | middleware → boundary edge entry point |
| `44ef8c9` | §5 | UserButton ×2 + SBL sign-in → boundary UI |
| `d84df3d` | §6 | transcribe + heirloom gate → getSession() |
| `5f0a072` | §7 | members sync/claim → getCurrentUser() |
| `b4bf782` | §8 | platform gates → isPlatformAdmin |
| `3032fc0` | §9 | five client components → boundary hooks |
| `a0b7791` | §10 | chatStore → useAuthUser |
| `196d94b` | §11 | useAuthFlow → stage machine over adapter |
| `8145110` | §12 | transferable detection fix |
| `5164e49` | §13 | in-boundary rewire |
| `81f7d15` | §14 | lint → error; CLAUDE.md boundary docs |
| `841b897` | §15 | isPlatformAdmin from users.role |

## §16 — tenant_id on every auth/audit log write

Change (Jeff directive, 2026-06-11; requires the `auth_events.tenant_id`
column Jeff added in Studio — log it to DB_CHANGELOG.md per convention):
every `logAuthEvent` write now stamps `tenant_id` — `/api/auth/log` and the
Clerk webhook via `getTenantFromRequest(req)`, the `get-auth-context`
admin_access_failed path via the same host resolution — and the platform
tenants routes' `logEvent` calls now stamp the host-resolved id too (null
still possible = platform-level). No function signatures changed; `tenant_id`
was already a first-class column on both input types.

1. Run one OTP attempt on the Heirloom preview, then:
   `SELECT created_at, tenant_id, event_type, metadata->>'step' AS step FROM auth_events WHERE metadata->>'auth_surface' = 'custom_otp' ORDER BY created_at DESC LIMIT 5;`
   → fresh rows carry `tenant_id = '20767f1d-1148-4e43-ab73-f6da88f0ac56'`
   (on preview, via the PREVIEW_TENANT_ID fallback; on production post-merge,
   via the heirloom.2bl.ai domain match).
2. One Clerk webhook delivery (e.g. a sign-up's `user.created`):
   `SELECT tenant_id, event_type FROM auth_events WHERE svix_event_id IS NOT NULL ORDER BY created_at DESC LIMIT 3;`
   → `tenant_id` reflects the webhook endpoint's registered domain (may be
   null if that domain isn't in `tenants.domain` — expected, not a bug).
3. Hit `/admin` signed out → newest `admin_access_failed` row carries the
   host-resolved `tenant_id`.
4. **Flagged for veto:** the platform tenants routes previously wrote
   `tenant_id = null` BY DESIGN ("null = platform-level event"). They now
   stamp the host-resolved id when 2bl.ai maps to a tenants.domain row. If
   you want the old pure-null convention back for platform events, say so —
   one-line revert per call site.

## §17 — HOTFIX: error-code-driven existing-user detection (post-merge)

Production bug confirmed 2026-06-11 after PR #100: existing users on the
MagicLinkCard got "That email address / phone number is taken" — Clerk did
NOT set `signUp.isTransferable` on the create-error path (docs say it
flips; production says otherwise), so the transfer branch never fired.

Fix (branch `06-11-26_transferable-detection-hotfix`): detection keys on the
`form_identifier_exists` error code (both error channels), `isTransferable`
demoted to secondary belt, and existing users sign in via direct
`sendCode({ identifier })` — the pre-refactor production-proven shape.
`signIn.create({ transfer: true })` removed from the path. New/changed steps:
`signIn_sendCode_existing`, `signIn_sendCode_threw`;
`signUp_create_transferable` now logs `code` + `isTransferable` metadata.

Verify on production after merge (MagicLinkCard surface, both contact types):

1. Existing email → enters sign-in code screen (NOT "taken" error) → code →
   signed in. auth_events: `signUp_create_transferable` (with
   `code: form_identifier_exists`) → `otp_sent/flow: signin` → `finalize/flow: signin`.
2. Existing phone → same.
3. New email + new phone → signup flow unchanged (`otp_sent/flow: signup`).
4. Wrong-code retry + resend still work on both flows.

## Static checks (every commit)

Run locally or trust CI: `npx tsc --noEmit` (one pre-existing error in
`components/admin/content/BlockCard.test.tsx` is on main and unrelated),
`npm run test` (vitest), `npm run build`. Each commit on this branch was
pushed only after all three passed in the sandbox.
