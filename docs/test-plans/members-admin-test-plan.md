# Members Admin UI — Test Plan

Branch: `Admin-UI-Updated-06-12-26`

This plan covers the Members admin UI, the invite-on-members migration, the
Heirloom gate changes (waitlist + invite token), and the Clerk webhook update.
Nothing merges until every section below passes on the Vercel preview.

Preview URL placeholder: `<preview>` = the Vercel preview deployment for
`Admin-UI-Updated-06-12-26`. On preview hosts the `PREVIEW_TENANT_ID` fallback
is needed for tenant resolution — see the Blocking items section.

---

## Blocking items

- **PREVIEW_TENANT_ID env var required** (same as the auth-boundary plan).
  Preview hosts (`*.vercel.app`) never match `tenants.domain`, so any surface
  that resolves a tenant from the host (Heirloom gate, waitlist) will break.
  Vercel → Project → Environment Variables → `PREVIEW_TENANT_ID` =
  `20767f1d-1148-4e43-ab73-f6da88f0ac56`, **Preview ONLY**, then redeploy.

- **Schema must be live.** The `members` table needs the columns added on
  2026-06-11: `user_id`, `role`, `token`, `used_at`, `invited_name`, `clerk_id`
  (renamed from `clerk_user_id`). Verify in Studio:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'members'
  ORDER BY column_name;
  ```
  Must include: `clerk_id`, `invited_name`, `role`, `token`, `used_at`, `user_id`.

- **Clerk webhook endpoint must point to the preview host** (or production)
  for `§7 — Webhook linkage` to be testable. If it only points to production,
  skip §7 on preview and run it on production post-merge.

---

## Static checks (run before any manual section)

```bash
pnpm tsc --noEmit        # 1 pre-existing SBL error unrelated to this branch
pnpm vitest run          # services/members/members.test.ts must pass (18 tests)
pnpm next lint           # 0 errors; pre-existing warnings ok
```

---

## §1 — Members service unit tests

The service layer is covered by `services/members/members.test.ts` (18 tests):

| Test group | What's covered |
|---|---|
| `createMemberInvite` | status/role payload, invited_name trim + omit, token format, audit fire, DB error → ok:false |
| `validateMemberToken` | valid token → row, empty/whitespace → null, no match → null, DB error → null |
| `linkInvitedMember` | empty email guard, matching invite → update with clerk_id/user_id/status=active, no invite → no-op, user upsert fail → early return, find fail → early return |
| `hardDeleteMember` | audit before delete, ok:true on success, ok:false on DB error |

Run: `pnpm vitest run services/members/members.test.ts` — all 18 must pass.

---

## §2 — Admin sidebar nav

Change: "Invites" nav entry replaced with "Members" linking to `/admin/members`.

1. Open `<preview>/admin` (signed in as any admin) → left sidebar shows
   **Members** (not "Invites"). Clicking it navigates to `/admin/members`.
2. **Regression:** `/admin/invites` should 404 (the route is deleted). Open it
   directly → Next.js 404 page.

---

## §3 — Members page: display and filtering

1. Open `<preview>/admin/members`.
2. **SegmentedControl:** tabs for All / Active / Invited / Waitlist / Suspended /
   Deleted. "All" is default and shows every status in the combined list.
3. **Invite-only rows** (members.user_id IS NULL): render with "Invite pending"
   italic label in the email column, no plan badge, checkbox disabled.
4. **Signed-up rows** (user_id NOT NULL): render with real email, plan badge,
   checkbox enabled.
5. **Search:** typing in the search box filters by name or email in real time.
6. **Waitlist filter:** switch to the Waitlist tab — only `status='waitlist'`
   rows appear. If none exist, the tab count badge shows 0 and the table is
   empty (no error state).
7. **Status badge colours** match the design: active = green, invited = blue,
   waitlist = yellow, suspended = orange, deleted = red.

---

## §4 — Members page: bulk actions

Bulk actions require at least one signed-up row (user_id NOT NULL) to be
selectable — invite-only rows are excluded from selection.

1. Check one or more signed-up rows → **Suspend** button appears in the toolbar.
   Click Suspend → confirmation → rows update to `status='suspended'` (refresh
   the page or watch the row badge change).
2. Switch to Suspended tab → check those rows → **Reactivate** → rows flip back
   to `active`.
3. **Delete:** check one or more rows → Delete → confirmation → rows move to
   `status='deleted'`.
4. Invite-only row checkboxes are **disabled** — clicking one does nothing and
   does not add it to the selection count.
5. Studio cross-check after each bulk action:
   ```sql
   SELECT id, status, updated_at FROM members
   WHERE id IN ('<id-1>', '<id-2>')
   ORDER BY updated_at DESC LIMIT 5;
   ```

---

## §5 — Row menus: invite-only rows

For a row with `isInviteOnly = true` (user_id IS NULL):

1. Open the row's kebab / three-dot menu.
2. **Copy invite link** — clicking it writes the invite URL
   (`<origin>?invite=<token>`) to the clipboard. Paste to verify the URL is
   well-formed.
3. **Send/Resend invite** — triggers `POST /api/platform/members/invite/resend`.
   A notification appears directing you to the drawer to copy the new link.
4. **Remove from waitlist / Revoke invite** — triggers
   `DELETE /api/platform/members/invite/<memberId>`. The row disappears from
   the table. Studio: `SELECT id FROM members WHERE id = '<memberId>';` → no row.

---

## §6 — Row menus: signed-up members with an invite token

For a signed-up member whose membership has a non-null token (i.e. was invited,
has signed up, but token hasn't been cleared):

1. Row menu shows **Copy invite link** and **Resend invite** (and status-specific
   actions like Suspend).
2. **Resend invite:** sends `POST /api/platform/members/invite/resend` with
   `{ member_id }`. Notification appears. Studio:
   ```sql
   SELECT token, updated_at FROM members WHERE id = '<member-id>';
   ```
   → `token` has a new value (the regenerated one).

---

## §7 — MemberDrawer: invite link section

Open a member's drawer by clicking their row.

**Invite-only member (no users row):**
1. Drawer title shows "Invite pending".
2. No Plan, Joined, Last active fields in the SimpleGrid.
3. No Role dropdown and no Save button.
4. Invite link section shows the token URL in a read-only TextInput.
5. Copy icon writes the URL to the clipboard.
6. **Regenerate link** button: click it → spinner → TextInput updates to the
   new URL without closing the drawer.

**Signed-up member with a token:**
1. Drawer shows real name, role, plan, joined date.
2. Invite link section shows the URL.
3. Regenerate link updates the URL in the TextInput.
4. Role dropdown + Save: change role, click Save → Studio:
   ```sql
   SELECT role FROM members WHERE id = '<memberId>';
   ```
   → new role value.

**Signed-up member without a token:**
1. No invite link section rendered.

---

## §8 — InviteMemberModal

1. Click **Invite member** (top-right on the Members page).
2. Modal opens with optional **Invited name** field and a **Tenant** select.
3. Fill in an invited name, select a tenant, click **Send invite**.
4. Success stage shows the invite URL in a read-only TextInput + copy button.
5. Copy button → paste → URL is `<origin>?invite=<32-char-token>`.
6. Click **Done** → modal closes; the new invited row appears in the Members
   table under the Invited tab.
7. Studio:
   ```sql
   SELECT id, invited_name, status, token, created_at
   FROM members ORDER BY created_at DESC LIMIT 1;
   ```
   → `status='invited'`, `invited_name` matches what you typed, `token` is
   the 32-char base64url string shown in the modal.

---

## §9 — Heirloom gate: waitlist flow (no invite token)

Use a private window (signed out, no `?invite=` param).

1. Open `<preview>/heirloom` → chat panel → gate shows **"By invitation only."**
   heading + an email input form ("Request access" button).
2. Enter a valid email → click **Request access**.
3. Button shows "Requesting…" spinner → success copy: **"You're on the list."**
   + "We'll be in touch when your invitation is ready."
4. Studio:
   ```sql
   SELECT id, email, status, created_at FROM members
   WHERE email = '<your-email>'
   AND tenant_id = '20767f1d-1148-4e43-ab73-f6da88f0ac56';
   ```
   → one row with `status='waitlist'`.
5. **Idempotency:** submit the same email again → returns 200 (no error shown);
   Studio still shows exactly one row for that email.
6. **Invalid email:** submit `"not-an-email"` → inline error "Enter a valid
   email address." — no network request fired.

---

## §10 — Heirloom gate: invite token flow

1. Create an invite in the admin Members page for the Heirloom tenant.
2. Open the invite URL (`<preview>/heirloom?invite=<token>`) in a private window.
3. Gate shows **"By invitation only."** with an optional personalized heading
   if `invited_name` was set (`"Welcome, <name>."` / `"Sign up below to claim
   your membership."`).
4. **"Claim a free membership"** button → Clerk sign-up modal opens (Heirloom
   theming).
5. Complete sign-up (email OTP or phone OTP).
6. Gate clears → chat is accessible.
7. Studio:
   ```sql
   SELECT clerk_id, user_id, status, used_at FROM members
   WHERE token = '<token>';
   ```
   → **Wait for the Clerk webhook** — then: `status='active'`, `clerk_id` set,
   `user_id` set, `used_at` is non-null.

   If the webhook hasn't fired yet (preview endpoint timing), check:
   ```sql
   SELECT clerk_id, status FROM members ORDER BY updated_at DESC LIMIT 3;
   ```

---

## §11 — Heirloom gate: signed-in active member

1. Sign in as an existing active Heirloom member.
2. Open `<preview>/heirloom` → chat panel opens → chat is immediately accessible
   (no gate view rendered).
3. **Regression:** sign out → gate reappears showing the waitlist form (no
   invite token in the URL).

---

## §12 — Heirloom gate: signed-in non-member (pending/waitlist)

1. Sign in with an account that has a `pending` or `waitlist` members row.
2. Open chat → gate shows **"You're on the list."** + "We'll let you know when
   your membership is ready." — no email form, no sign-up button.
3. `POST /api/heirloom/members/claim` fires once (check Network tab on the
   false→true sign-in transition) and NOT on subsequent hard refreshes while
   already signed in.

---

## §13 — Clerk webhook: linkInvitedMember on user.created

This section requires the Clerk webhook endpoint to be reachable.

Scenario: an invited member (status='invited', email set, user_id IS NULL)
completes sign-up via the Clerk modal.

1. Create an invite with an email address (`invited_name` optional).
   Studio confirms: `status='invited'`, `user_id IS NULL`.
2. Open the invite URL → sign up via Clerk with that exact email.
3. Clerk fires `user.created` → webhook calls `linkInvitedMember` BEFORE
   `syncMember`.
4. Studio (allow 5–10s for the webhook to arrive):
   ```sql
   SELECT clerk_id, user_id, status, used_at FROM members
   WHERE email ILIKE '<the-email>';
   ```
   → exactly **one row** (no duplicate), `status='active'`, `used_at` non-null,
   `clerk_id` + `user_id` both set.
5. **No duplicate row:** `SELECT count(*) FROM members WHERE email ILIKE '<the-email>';`
   → 1 (not 2). A second row would mean `linkInvitedMember` ran after
   `syncMember` and the upsert inserted a new row instead of updating the
   existing invited one.

---

## §14 — Retired routes: 404 checks

Confirm these deleted routes return 404:

```bash
curl -s -o /dev/null -w "%{http_code}" <preview>/api/admin/invites          # 404
curl -s -o /dev/null -w "%{http_code}" <preview>/api/admin/invites/fake-id  # 404
curl -s -o /dev/null -w "%{http_code}" <preview>/api/heirloom/invites/use   # 404
```

---

## §15 — Platform Members API: contract checks (curl / DevTools)

Signed in as a platform admin. All routes return 401 when signed out.

```bash
# Create invite
curl -X POST <preview>/api/platform/members/invite \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"20767f1d-1148-4e43-ab73-f6da88f0ac56","invited_name":"Test User"}'
# → 201 { token: "...", member_id: "..." }

# Resend invite (use member_id from above)
curl -X POST <preview>/api/platform/members/invite/resend \
  -H 'Content-Type: application/json' \
  -d '{"member_id":"<member_id>"}'
# → 200 { token: "..." } (new token)

# Delete invite-only row (use member_id from above)
curl -X DELETE <preview>/api/platform/members/invite/<member_id>
# → 204

# Role update (use a real user_id from members table)
curl -X PATCH <preview>/api/platform/members/roles \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"<user_id>","changes":[{"tenant_id":"20767f1d-1148-4e43-ab73-f6da88f0ac56","role":"admin"}]}'
# → 200 { ok: true }

# Bulk status (use real user_ids)
curl -X PATCH <preview>/api/platform/members/status \
  -H 'Content-Type: application/json' \
  -d '{"user_ids":["<user_id>"],"status":"suspended"}'
# → 200 { updated: 1 }
```

---

## §16 — Regression: Heirloom chat still works for active members

End-to-end smoke test:

1. Sign in as an active Heirloom member (or complete the invite flow from §10).
2. Open chat → send a message → Sage responds (streaming works).
3. Close and reopen the panel → conversation recovers from localStorage or DB.
4. New Chat button → returns to empty greeting, prior session visible in Recent.

---

## §17 — Regression: jefflougheed.ca and admin unaffected

1. `<preview>/` (jefflougheed public site) → renders, Sage chat sends/receives.
2. `<preview>/admin` → loads with correct tenant name, no console errors.
3. `<preview>/admin/members` route exists (we did NOT delete it — just expanded it).
4. `<preview>/secondbrainlabs` → SBL storefront renders.

---

## Commit map (this branch)

| Commit | § | Change |
|---|---|---|
| `ade7340` | §1 | feat: add member audit action constants |
| `cb9c0b7` | §1 | feat: add members service layer |
| `1fdb498` | §15 | feat: add platform members API routes |
| `26c8691` | §3–8 | feat: members admin UI |
| `1aa366a` | §9–13 | feat: migrate Heirloom gate + webhook to members.token |
| `8d63135` | §14 | chore: retire invites table infrastructure |
| `735c72a` | — | docs: CLAUDE.md updates |
| `c160ea8` | — | chore: pnpm-lock.yaml |
