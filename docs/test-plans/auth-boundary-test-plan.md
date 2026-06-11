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

## Static checks (every commit)

Run locally or trust CI: `npx tsc --noEmit` (one pre-existing error in
`components/admin/content/BlockCard.test.tsx` is on main and unrelated),
`npm run test` (vitest), `npm run build`. Each commit on this branch was
pushed only after all three passed in the sandbox.
