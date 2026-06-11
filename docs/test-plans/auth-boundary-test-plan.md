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

## Static checks (every commit)

Run locally or trust CI: `npx tsc --noEmit` (one pre-existing error in
`components/admin/content/BlockCard.test.tsx` is on main and unrelated),
`npm run test` (vitest), `npm run build`. Each commit on this branch was
pushed only after all three passed in the sandbox.
