# Handover — Members Admin UI

**2BL.AI Platform · target directory: `app/admin/members/`**
Mantine v7 · Next.js App Router · TypeScript strict. Status: **design complete & approved.**

---

## 1. What was built & what changed

A platform-admin view for managing every user across all tenants. It supersedes the earlier
single-tenant members list.

**Changed from the previous version:**

| Area | Before | Now |
|------|--------|-----|
| Row model | One row per **membership** (a user appeared once per tenant) | **One row per user** |
| Tenant display | A single tenant cell | **Pills** — up to 3 tenant names, then a `+N more` pill (tooltip lists the rest). Never collapses to "Multiple". |
| Detail view | Centered modal, single tenant block, one role | **Right-side drawer**, one **section per tenant**, each with its own Role dropdown |
| Saving roles | One role at a time | **One "Save changes"** writes all role edits across all tenants in a single request |
| Bulk actions | — | Select rows → **Suspend / Reactivate / Delete** (applied across each selected user's memberships) |

**Kept as-is:** status filter (All / Active / Invited / Suspended / Deleted with counts),
search (name / email / tenant), the **Invite member** button (top-right), and the admin shell.

---

## 2. Files & component structure

All under `app/admin/members/`:

| File | Type | Responsibility |
|------|------|----------------|
| `page.tsx` | Server | Gates platform admin, loads `users → members → tenants`, shapes `UserRow[]`, renders `MembersList`. |
| `MembersList.tsx` | Client | Toolbar (search + status `SegmentedControl` + invite), bulk-action bar, responsive **Table** (≥ md) / **Card** stack (< md), per-row actions `Menu`, owns selection + filter state, opens the drawer. |
| `MemberDrawer.tsx` | Client | Right `Drawer`; stacks one section per membership (`Divider` header + Status/Plan/Joined/Last-active + Role `Select`); single **Save changes** → `PATCH /api/platform/members/roles`. |
| `TenantPills.tsx` | Client | The "up to 3 + N more" pill group with tooltip. |
| `InviteMemberModal.tsx` | Client | The Invite button + modal (email + tenant + role). |
| `types.ts` | — | `UserRow`, `Membership`, `Role`, `MemberStatus`, `Plan`, `TenantOption`, `RoleChange`. |
| `constants.ts` | — | Role/Status/Plan → Mantine color maps, role options, status-filter list. |
| `utils.ts` | — | `formatMonthYear`, `formatRelative`, `primaryStatus`. |

These mirror the existing platform admin patterns (`app/(platform)/platform/admin/*` +
`components/admin/*`): server-component gating with `getCurrentUser` / `getAdminClient`, the
`Text` primitive, `@mantine/notifications`, `router.refresh()` after mutations, and the
`visibleFrom`/`hiddenFrom` table-vs-cards split from `TenantList.tsx`.

---

## 3. Mantine v7 components, props & patterns to know

- **`Avatar` auto-initials** — `<Avatar name={u.name} color="initials" radius="xl" />`. v7 feature; no manual initial/color logic needed.
- **`SegmentedControl`** drives the status filter; labels are ReactNodes so counts live inline.
- **`Table` compound API** — `Table.Thead/Tbody/Tr/Th/Td`, `striped highlightOnHover verticalSpacing="sm"`. Row opens the drawer via `Table.Tr onClick`; the checkbox cell and actions cell call `e.stopPropagation()` so they don't trigger it.
- **`Checkbox`** header uses `indeterminate` for the partial-selection state.
- **`Menu`** (row actions) and **`Select`** (role) both pass `withinPortal` / `comboboxProps={{ withinPortal: true }}` so they escape the table's/drawer's overflow clipping. **Keep this** — it's the production equivalent of the prototype's fixed-position menu fix.
- **`Drawer`** `position="right"` `size={440}`; avatar + name/email passed as the `title` node.
- **`Badge`** uses `variant="light"` + theme **color names** (not hex) — see `constants.ts`. Tweak the palette in `components/admin/theme/mantine-theme.ts`, not here.
- **Responsive**: `<Box visibleFrom="md">` table, `<Stack hiddenFrom="md">` cards — same breakpoint convention as the rest of admin.

---

## 4. Data requirements

### `page.tsx` query (shape, not literal)
One row per user with embedded memberships and resolved tenant names:

```
users:    id, name, email, created_at
members:  user_id, tenant_id, role, status, created_at   (joined to tenants for the name)
tenants:  id, name        // also fetched flat, for the Invite modal's tenant picker
```

Mapped to `UserRow`:

```ts
UserRow = {
  id, name, email,
  memberships: Membership[]   // sorted; [0] = "primary" used for collapsed list columns
}
Membership = { tenantId, tenantName, role, status, plan, joined, lastActive }
```

- `joined` / `lastActive` are **ISO strings (or null)**; the UI formats them
  (`formatMonthYear`, `formatRelative`).
- Sort memberships server-side if a specific primary is desired (e.g. owner-first, or
  most-recently-active) — the UI treats `memberships[0]` as primary for the Role/Plan/Status/Last-active columns.

### API endpoints the client calls (implement these)

| Action | Request | Notes |
|--------|---------|-------|
| Save roles | `PATCH /api/platform/members/roles` `{ user_id, changes: [{ tenant_id, role }] }` | **One transaction.** Write all rows or none. Also write one `audit_events` row per change + enqueue the role-change notification (async, post-commit). |
| Status change (row + bulk) | `PATCH /api/platform/members/status` `{ user_ids: string[], status }` | Applies across each user's memberships; resolve eligibility server-side (e.g. don't "suspend" an already-deleted membership). One audit row per affected membership. |
| Hard delete | `DELETE /api/platform/members/:userId` | Used by "Delete permanently" / "Revoke invite". See the **hard-delete** notes in the reviewed spec (typed acknowledgement + permission gate) — the UI here does **not** yet gate it. |
| Invite | `POST /api/platform/members/invite` `{ email, tenant_id, role }` | |
| Resend invite | `POST /api/platform/members/invite/resend` `{ email }` | |

All mutations `router.refresh()` on success and surface errors via `notifications.show`.

---

## 5. Open decisions / things to handle in implementation

1. **`plan` column source.** The approved design shows a Plan badge (Free/Pro/Team), but the
   members data model has no plan field — it's a billing concept and was flagged out-of-scope in
   the reviewed spec. **Decide:** wire it read-only from billing, or drop the column. `page.tsx`
   currently defaults `plan: 'free'` with a `TODO`. *(Note: plan is intentionally **display-only**
   here — there is no "upgrade" action, since that's billing.)*
2. **`lastActive` source.** Not in the spec's tables. Likely `max(chat_sessions.created_at)` per
   membership, or a `last_seen` column. Defaults to `null` → renders "—".
3. **Primary-membership semantics.** Collapsed columns (Role/Plan/Status/Last active) show
   `memberships[0]`. Confirm the desired ordering (owner-first? most-active?) and sort server-side.
4. **Hard-delete gating.** "Delete permanently" / "Revoke invite" call `DELETE` directly. Per the
   reviewed spec, hard delete needs a separate permission gate + typed acknowledgement — add
   these before shipping if this view can hard-delete.
5. **Audit + notifications** are the **server's** responsibility on every mutation (same
   transaction as the change for audit; async after commit for notifications). The client only
   shows the toast.
6. **Invite flow** wasn't part of the approved design — fields (email + tenant + role) are a
   sensible default; confirm with product.
7. **Status enum.** UI uses `active / invited / suspended / deleted`. Confirm against the DB
   (`members.status`); the reviewed spec proposed `deleted` == the deactivated/`inactive` state
   and `invited` possibly living in a separate invites table.
8. **Scale.** This view loads all users client-side. Fine for now; for large datasets move
   filtering/search/pagination server-side (the reviewed spec covers this).

---

## 6. Reference files (in this bundle)

- `Platform Admin - Production.html` — the approved interactive prototype (HTML/React). Open it
  to see exact interactions, hover/empty states, and the drawer behavior. **Design reference, not
  code to copy** — the `.tsx` above is the production implementation.
- `members-admin-ui-spec-reviewed.md` — the redlined feature spec (data model, audit, notifications,
  hard delete, open questions). The `.tsx` implements the approved UI subset of it.

*The `.tsx` files are written to compile against Mantine v7 + the existing `@/components/admin`
and `@/services/auth` modules. Verify import paths and the Supabase select against your schema.*
