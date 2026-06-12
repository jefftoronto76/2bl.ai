# Members Admin UI — Feature Spec
**2BL.AI Platform · June 2026 · v2 (reviewed)**

> **Reviewer:** Claude · **Status:** redlined for handoff to Claude Code. Every change from
> your v1 is listed in *Reviewer Adjustments* below, with rationale, so you can accept or
> veto each one. Inline edits are tagged **[Adj]**. Nothing here changes intent silently.

---

## Reviewer Adjustments (read first)

1. **Bulk actions — reconciled with the prototype.** v1 said *"No bulk actions in V1."* But
   bulk select + actions were just prioritized and built in the prototype. **Resolution:**
   bring **bulk status actions** (suspend / reactivate / deactivate) into V1 scope; keep
   **role changes per-user** (role is per-tenant, so a bulk role change is ambiguous — see §
   *Multi-tenant model*). Each bulk op writes **one audit row per affected membership**. If you
   want to hold the line on "no bulk in V1," revert this and move bulk to V1.1.
2. **Role edit happens in a drawer, not an inline dropdown.** The platform uses a right-side
   **detail drawer** elsewhere; the prototype now does too. Role edit flow updated to match.
3. **Defined the Role enum** (was "admin, member, viewer, etc." — not canonical). See open Q1.
4. **Defined the Status enum + soft-delete semantics.** v1 mentioned active/inactive/suspended
   but the prototype also has *invited* and *deleted*. Mapped these explicitly (deleted = the
   *deactivated*/inactive state; invited = pending-invite). See open Q2.
5. **Pinned down what a table row represents** in the multi-tenant model (was "per tenant row
   or aggregated" — ambiguous). New § *Multi-tenant model & row semantics*.
6. **Added a performance contract for cost rollups.** Live-summing `media_items` /
   `chat_sessions` per user across all users will not scale — they must be precomputed. New §.
7. **Added Scale, Pagination & Sort**, **Loading / Empty / Error states**, and
   **Accessibility** — all missing from v1.
8. **Audit is transactional.** The audit row must commit in the same transaction as the change.
9. **Flagged the `plan` column.** The prototype shows Free/Pro/Team + an Upgrade action; this
   spec explicitly excludes billing. Decision needed (Q7) — drop it or show read-only.

---

## Purpose

A single admin view for managing the universe of users across all platform tenants. Scoped to
platform admins only. This is not a tenant-level view — it's the top of the tree.

---

## What This Page Does

1. **See all users** — who they are, when they joined, what they have access to
2. **Filter by platform** — a user can belong to multiple tenants; filter to see membership per product
3. **See role per platform** — what access level each user has on each tenant they belong to
4. **See cost per user** — storage used + token consumption, rolled up per user
5. **Update role** — change a user's role on a specific tenant; triggers a notification to the user
6. **Bulk status actions** — **[Adj]** suspend / reactivate / deactivate multiple memberships at once
7. **Full audit trail** — every change logged; hard deletes handled separately with their own audit record

---

## Multi-tenant model & row semantics  **[Adj — new]**

A user (`users`) can belong to many tenants via `members` (one row per user per tenant). The UI
is **user-centric**:

- **One table row = one user.** Not one membership.
- The **Platforms** column shows a pill per tenant the user belongs to (filtered by the platform
  filter).
- **Role** and **Status** are properties of a *membership*, not a user. So:
  - **No platform filter (or multiple selected):** the row shows an aggregate — e.g. a count
    (`3 tenants`) and, for status, the "most permissive/active wins" summary. Per-tenant roles
    and statuses are shown **in the detail drawer**, one editable row per membership.
  - **Exactly one platform selected:** each row resolves to that single membership — Role and
    Status show that tenant's values and are directly actionable.
- **Cost** (storage, tokens) is a per-**user** rollup across all their memberships, independent
  of the platform filter (or scoped to it — decide in Q6).

This removes the v1 ambiguity ("Per tenant row or aggregated if single platform selected").

---

## Data Sources

### Users table (`users`)
Platform-level identity. One row per person, regardless of tenant count.

| Field | Used for |
|-------|----------|
| `id` | Join key |
| `name` | Display name |
| `email` | Contact + notification target |
| `phone` | Secondary contact |
| `created_at` | "Member since" (platform-level) **[Adj]** |

### Members table (`members`)
The join between a user and a tenant. One row per user per tenant.

| Field | Used for |
|-------|----------|
| `user_id` | FK → users.id |
| `tenant_id` | Which platform/product |
| `role` | What they can do on that tenant |
| `status` | active / inactive / suspended (see enum below) |
| `created_at` | When they joined **that tenant** (shown per-membership in drawer) **[Adj]** |

**Role enum [Adj]:** `owner` · `admin` · `member` · `viewer` — confirm against the DB (Q1).
**Status enum [Adj]:** `active` · `suspended` · `inactive`. *Soft delete = set `inactive`*
(`member.deactivated`); *restore = set `active`*. A pending invite (`invited` in the prototype)
is a **separate pre-membership state** — confirm whether it lives on `members.status` or an
`invites` table (Q2).

### Tenants table (`tenants`)
Resolves tenant names for the platform filter and the Platforms pills.

| Field | Used for |
|-------|----------|
| `id` | Join key |
| `name` | Display label in filter + pills |

### Media items table (`media_items`) — storage rollup
| Field | Used for |
|-------|----------|
| `member_id` | Group by membership → roll up to user |
| `file_size_bytes` | Sum → total storage |
| `status` | Exclude failed items from the sum |

### Chat sessions table (`chat_sessions`) — token rollup
| Field | Used for |
|-------|----------|
| `user_id` | Group by user |
| token usage column | Sum → total tokens |

> ⚠️ **Open question (Q?):** confirm `chat_sessions` has a token-usage column. If not, the
> Tokens column shows "—" until it exists.

---

## Cost rollups — performance contract  **[Adj — new]**

Do **not** compute storage/token sums live per row on each page load — summing `media_items`
and `chat_sessions` across every user will not scale and will dominate page latency.

- Maintain a **precomputed per-user rollup** (materialized view or a `user_cost_rollup` table)
  refreshed incrementally (on write) or on a schedule (e.g. hourly/nightly).
- The page **reads the rollup**, never the raw tables, for the Storage/Tokens columns.
- Show the rollup's freshness (e.g. "as of 02:00") if it's not real-time.
- Storage excludes `media_items.status = failed`; tokens exclude failed/aborted sessions.

---

## UI Layout

### Filters (top of page)
- **Platform** — multi-select dropdown, populated from `tenants`
- **Role** — multi-select (`owner` / `admin` / `member` / `viewer`)
- **Status** — `active` / `suspended` / `inactive`
- **Search** — by name or email (server-side; see Scale)

### Table columns

| Column | Source | Notes |
|--------|--------|-------|
| Name | `users.name` | with avatar |
| Email | `users.email` | |
| Member since | `users.created_at` | platform-level |
| Platforms | `members` ⋈ `tenants` | pill per tenant, filtered by Platform filter |
| Role | `members.role` | resolved per row semantics (see Multi-tenant model) |
| Storage | rollup | KB / MB / GB |
| Tokens | rollup | K / M — "—" if column missing |
| Status | `members.status` | badge |
| Actions | — | row → opens detail drawer |

### Scale, pagination & sort  **[Adj — new]**
- **Server-side** filtering, search, and pagination (cursor or page-based). Never load all users
  client-side.
- **Sortable** columns: Name, Member since, Storage, Tokens, Status.
- Show a result count ("248 users") and page controls.

### States  **[Adj — new]**
- **Loading:** skeleton rows.
- **Empty:** "No users yet" vs "No users match these filters" (with a clear-filters action).
- **Error:** non-destructive retry; never a blank table.

### Bulk actions  **[Adj — new, reconciles v1]**
- Checkbox per row + select-all (with indeterminate). Selection scoped to the current filtered
  view.
- When ≥1 selected, a bulk bar exposes: **Suspend**, **Reactivate**, **Deactivate**. Each applies
  only to eligible memberships in the selection and writes **one audit row per membership**.
- **Role is intentionally not bulk-editable** (per-tenant, ambiguous across a multi-tenant
  selection).

### Role edit flow  **[Adj — drawer-based]**
1. Admin clicks a row → **detail drawer** opens (right side; matches platform pattern).
2. Drawer lists the user's memberships; each has a **role dropdown**.
3. Changing a role and pressing **Save** opens a **confirm dialog**:
   *"Change [name]'s role on [tenant] from [old] to [new]?"*
4. On confirm, **in a single transaction**:
   - Write `members.role`
   - Write to `audit_events` (see Logging)
   - Enqueue notification (see Notifications) — async, **after** commit
5. Notification failure is logged but does **not** roll back or surface as a save failure.

### Hard delete flow
Destructive, irreversible, scoped to privacy/compliance requests (GDPR etc.).

1. Behind an **additional permission gate** — not all platform admins (Q3).
2. Requires a **typed acknowledgement** — admin types an exact confirmation string
   (e.g. the user's email) before the action enables. **[Adj]**
3. On confirm:
   - Purge `users` row
   - Cascade to `members`, `media_items`, `chat_sessions` (per retention policy)
   - Write `user.hard_deleted` to `audit_events` — **never purged**
   - Log actor, timestamp, affected record counts, reason

---

## Logging

Every action on this page writes to `audit_events`, **in the same transaction as the change**
— there is never a mutation without its audit row. **[Adj]**

| Action | `action` value | `metadata` includes |
|--------|---------------|---------------------|
| Role change | `member.role_updated` | old_role, new_role, tenant_id |
| Status change | `member.status_updated` | old_status, new_status, tenant_id |
| Soft delete (deactivate) | `member.deactivated` | tenant_id, reason |
| Bulk status change | `member.status_updated` | one row per membership **[Adj]** |
| Hard delete | `user.hard_deleted` | affected_tables, record_counts, reason |
| Admin viewed user | `member.viewed` | optional — Q4 |

All audit rows include: `actor_id`, `target_type` (`user` | `member`), `target_id`,
`tenant_id`, `created_at`. Hard-delete audit records are **never** purged.

---

## Notifications

When a role is changed, the affected user is notified (async, post-commit).

**Channel:** TBD (Q5). Email is the safe default (no phone required; works when user is offline).
**Content:** *"Your access level on [tenant name] has been updated to [new role]."*
**Failure handling:** logged + retried via the queue; never blocks the role write. **[Adj]**

---

## Accessibility  **[Adj — new]**
- Full keyboard operability: rows openable via Enter/Space; drawer traps focus and closes on Esc.
- All icon-only controls (kebab, checkboxes, chevrons) carry `aria-label`s.
- Badge colors meet WCAG AA contrast; status is never conveyed by color alone (label + color).

---

## Open Questions for Jeff

1. **Role enum** — confirm canonical values. Proposed: `owner / admin / member / viewer`.
2. **Status + invites** — is `invited` a `members.status` value or a separate `invites` table?
   Confirm the soft-delete value is `inactive`.
3. **Hard-delete permission gate** — platform admin, or a separate super-admin role?
4. **Audit: view logging** — log admin views of a user, or only changes?
5. **Notification channel** — email, SMS, or in-app?
6. **Cost scope** — is the per-user cost global, or scoped to the active platform filter? And is
   storage + tokens enough for V1, or do we also want a dollar figure (needs a pricing model)?
7. **`plan` column** — the prototype shows Free/Pro/Team + Upgrade, but billing is out of scope
   here. Drop the column, or show plan **read-only** (sourced from billing)? **[Adj]**
8. **Token usage column** — does `chat_sessions` expose it? If not, ship Tokens as "—".

---

## What This Is Not (V1)

- Not a billing management page — no invoice history, no payment methods
- Not a support tool — no impersonation, no session replay
- Not a tenant management page — tenant CRUD lives elsewhere
- ~~No bulk actions in V1~~ → **[Adj]** bulk **status** actions are in V1; **role** changes stay
  per-user

---

*Second Brain Labs · 2bl.ai · Confidential*
