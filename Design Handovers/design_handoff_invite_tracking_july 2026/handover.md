# Handover — Invite-link tracking in the Member drawer (Option B)

**2BL.AI Platform · target directory: `app/admin/members/`**
Mantine v7 · Next.js App Router · TypeScript strict. Status: **design approved (Option B).**

This is the chosen direction from `admin-mantine/Link Tracking — Explorations.html`
(**Option B — timeline in the detail drawer**). Options A and C are not being built.

---

## 1. What this adds

The Members list stays exactly as shipped. **One click deep**, the member detail
drawer (`MemberDrawer.tsx`) gains an **"Invite link"** section per tenant membership: a
vertical lifecycle timeline that answers *"did they click the link?"* — plus Resend /
Copy link / Revoke actions.

Scope is **invites only** (not shared reports or chats — that was Option C, out of scope).

| Area | Shipped drawer | After |
|---|---|---|
| Membership section | Status · Plan · Joined · Last active + Role | …+ **Invite link timeline** (when the membership has a tracked invite) |
| Invite visibility | none | stage **badge**, per-stage **timeline**, **Stalled** flag |
| Invite actions | none | **Resend · Copy link · Revoke** (with toasts) |

---

## 2. ⚠️ Data source — read this first (this is the real work)

You told me invites today are **copy-pasted**: an admin copies a link and sends it
themselves over their own email/SMS. **Nothing observes that**, so "delivered" and
"opened" are currently unknowable. To make this timeline truthful, the link itself has to
become trackable. Recommended, in order of effort:

### The lifecycle we can actually observe (copy-paste reality) — **ship this**
A **tokenised invite URL** through a redirect endpoint. Each invite gets an opaque token;
the recipient URL is `${INVITE_BASE_URL}/invite/<token>`. Three observable stages:

| Stage | How we know | Event source |
|---|---|---|
| **Sent** *(labelled "Created")* | The invite row / token is created when the admin generates + copies the link. We log creation — **not** the manual send, so the honest word is "Created". | your DB insert |
| **Opened** | The recipient hits `GET /invite/<token>`, which 302s to signup. **First hit ⇒ opened**; count subsequent hits for `opens`. | the redirect route |
| **Accepted** | The invitee completes signup and the membership goes `active`. | your existing accept flow |

That's why `INVITE_STAGES` defaults to `['sent', 'opened', 'accepted']` — **no
"delivered"**, because copy-paste gives no delivery signal. This needs:

1. An `invites` (or `invite_links`) table — see §4.
2. A public redirect route `app/invite/[token]/route.ts` that: looks up the token → if
   valid/unexpired/unrevoked, stamps `opened_at` (once) + increments `opens` → 302 to the
   signup page carrying the token → on signup completion, stamps `accepted_at` and links
   the membership.
3. Generating tokens at invite-create time and building the copy string from the token
   (the drawer's "Copy link" already does `${INVITE_BASE_URL}/invite/${token}`).

### The 4th stage, "Delivered" — **gated, later**
"Delivered" only becomes real if invites are sent **through an integrated email provider**
(Resend, Postmark, SES…) that posts a **delivery webhook**. When that exists: store
`delivered_at` from the webhook and change one line —
`INVITE_STAGES = ['sent','delivered','opened','accepted']` in `constants.ts`. The
components already understand the stage; nothing else changes. Until then it stays hidden
so the timeline never shows a stage we can't verify.

**Decided:** ship tracked-link (3 stages) now; email-provider "Delivered" is a follow-up.
The code is built for exactly that path (see §8).

---

## 3. Files (all under `app/admin/members/`)

| File | Change | Responsibility |
|---|---|---|
| `types.ts` | **drop-in replace** | Adds `InviteStage`, `InviteLink`, `InviteFetchState`; adds optional `invite` to `Membership`. Everything else unchanged. |
| `constants.ts` | **drop-in replace** | Adds `INVITE_STAGES`, `INVITE_STAGE_META`, `inviteStageIndex`, `INVITE_STALL_DAYS`, `INVITE_BASE_URL`. Existing maps unchanged. |
| `LinkTimeline.tsx` | **new** | The vertical timeline + `isStalled()`. Renders loading (skeleton), error (retry), revoked, and the staged timeline. |
| `MemberDrawer.tsx` | **drop-in replace** | The shipped drawer + the invite section (badge, timeline, Stalled flag, Resend/Copy/Revoke). Refetches live invite detail on open. |

`page.tsx` needs a **small** change (not included, one line of query shaping): embed an
`invite` snapshot on each `invited` membership so the timeline paints instantly before the
live refetch resolves. Shape in §4.

---

## 4. Data model

### Type additions (`types.ts`)
```ts
export type InviteStage = 'sent' | 'delivered' | 'opened' | 'accepted';

export interface InviteLink {
  token: string;                 // URL = `${INVITE_BASE_URL}/invite/${token}`
  reached: InviteStage;          // furthest stage reached
  sentAt: string | null;         // ISO — token created
  deliveredAt?: string | null;   // ISO — provider webhook only (gated)
  openedAt: string | null;       // ISO — first redirect hit
  acceptedAt: string | null;     // ISO — signup completed
  opens?: number;                // total redirect hits
  expiresAt?: string | null;     // ISO — link expiry
  revokedAt?: string | null;     // ISO — non-null ⇒ dead link
}
// Membership gains:  invite?: InviteLink | null   // present while 'invited'
```

### Storage — on the existing `members` table (NO new table)
**Update (from CC): the `invite_links` table is NOT being built.** Invite data lives
directly on the existing `members` row (a membership already is one user × one tenant).
`token`, `created_at`, `used_at`, and `status` already existed; the missing columns
(`opened_at`, `opens`, `expires_at`, `revoked_at`) were added there.

Map the `InviteLink` shape against `members` columns:

| `InviteLink` field | `members` column |
|---|---|
| `token` | `token` |
| `sentAt` | `created_at` |
| `openedAt` | `opened_at` |
| `acceptedAt` | `used_at` |
| `revokedAt` | `revoked_at` |
| `opens` | `opens` |
| `expiresAt` | `expires_at` |
| `deliveredAt` | *(none — gated stage, no column yet)* |

`reached` is **derived** server-side from the row:
`used_at ? 'accepted' : opened_at ? 'opened' : 'sent'` (no `delivered` — gated).

### `page.tsx` shaping (the embedded snapshot)
For each `invited` membership, build the `InviteLink` from that member row using the
mapping above (latest state; `revoked_at` ⇒ dead). Non-invited memberships omit `invite`.

---

## 5. API endpoints to implement

| Action | Request | Notes |
|---|---|---|
| Live invite detail | `GET /api/platform/members/:userId/invite?tenant_id=` → `InviteLink` | Drawer refetches on open for the freshest stage + `opens`. Falls back to the embedded snapshot on failure. |
| Resend | `POST /api/platform/members/invite/resend` `{ email, tenant_id }` | **Mints a fresh token** on the member row (overwrites the old); resets `opened_at`/`opens`/`revoked_at`. |
| Revoke | `DELETE /api/platform/members/:userId/invite?tenant_id=` | Stamps `revoked_at`; the token 410s at the redirect route thereafter. |
| Redirect (public) | `GET /invite/:token` | Not admin API — the tracking hinge. Stamps `opened_at` once, increments `opens`, 302 → signup. 404/410 invalid/revoked/expired. |
| Copy link | client-only | Builds `${INVITE_BASE_URL}/invite/${token}` — no request. |

All admin mutations `router.refresh()` on success and toast via `@mantine/notifications`
(the drawer optimistically updates first). Write one `audit_events` row per mutation
server-side — same convention as the members role/status writes.

---

## 6. States & actions — in scope (confirmed with CD)

- **No tracked invite** — membership isn't `invited` and has no `invite`: the section is
  **omitted entirely**. Do **not** design a placeholder/empty state for it — direct-added
  and already-active members simply have no "Invite link" section.
- **Stalled** — opened but not accepted for ≥ `INVITE_STALL_DAYS` (default **3**):
  an orange **Stalled** badge + a "consider resending" line, and **Resend** promotes to a
  filled button. `isStalled()` in `LinkTimeline.tsx`.
- **Revoked / expired** — a **dead link is its own state**. Revoked ⇒ the timeline shows
  "Invite link revoked." (actions hidden). Expired (if `expires_at` is set) reads the same
  way. The link no longer resolves at the redirect route (410).
- **Loading** — the on-open refetch shows skeleton rows (the embedded snapshot means this
  is usually invisible; it matters on a cold snapshot).
- **Error** — refetch fails with no snapshot to fall back to: inline red alert + **Retry**.
  With a snapshot, we silently keep showing it.
- **Actions (all in scope)** — **Resend · Copy link · Revoke**, each with a toast; Revoke
  is optimistic. "Copy link" is core — links are sent manually, so copying is the primary
  path, not an afterthought.

### Cumulative opens (data model)
Track an **`opens` counter + last-opened timestamp**, not just first click. The Opened row
renders **`Opened N× · last 2d ago`**. First open is the meaningful signal; repeat opens
are useful context. The redirect route increments `opens` on every hit and keeps
`opened_at` as the most recent.

### 3-stage spacing (Delivered absent) — design note for CD
When "Delivered" is skipped, the timeline is **three stages** (Created → Opened →
Accepted). The dots and connectors must **space evenly across the three** — no gap or stub
where Delivered would have been. It must read as an intentional 3-step timeline, not a
4-step one with a hole. See the "without Delivered" render.

---

## 7. Design tokens (all in the Mantine theme / admin palette)

- **Stage colors** (`INVITE_STAGE_META`): Sent `#a99e8b` · Delivered `#1c7ed6` · Opened
  **`#C8542E`** (terracotta accent) · Accepted **`#2d6a4f`** (forest green terminal).
- Timeline dots 12px, 2px connectors; done = filled + colored, ahead = `gray-2/3`.
- Stage badge: `variant="light"`, `color-mix(... 13%, #fff)` tint of the stage color.
- Stalled badge: Mantine `orange`, light. Neutrals/radii via `var(--mantine-*)`.
- Type: body Manrope, labels DM Mono where the section labels appear; headings Newsreader
  (drawer follows the shipped drawer — no new type).
- Icons (`@tabler/icons-react`): `IconSend`, `IconLink`, `IconX`, `IconAlertTriangle`
  (the only additions vs the shipped drawer).

---

## 8. Decisions — RESOLVED (build to these)

1. **Stages.** Ship the **3-stage** lifecycle now (Created → Opened → Accepted).
   "Delivered" is deferred to the email-provider integration — keep it gated in
   `INVITE_STAGES` (§2).
2. **Token + redirect route — BUILD IT.** Tokenised invite URLs through the public
   `GET /invite/:token` redirect are in scope; this is what makes "Opened" real (§5).
3. **Resend semantics — new token each resend.** A resend mints a **fresh token** on the
   member row (overwriting the old one) and resets `opened_at` / `opens` / `revoked_at` so
   the new link starts clean. Single-row model — no separate history rows; if a trail of
   prior tokens is wanted, capture it in `audit_events`.
4. **Expiry — column added.** `expires_at` now exists on `members`. **Expiry-enforcement
   logic (redirect 410 + drawer "Expired" treatment) lands later** — populate/leave it
   nullable; don't gate acceptance on it yet.
5. **Multiple opens — keep the count.** Persist the `opens` counter + last-opened
   timestamp; the Opened row renders **`N× · last 2d ago`**.
6. **Historical invites on accepted members — keep the timeline visible.** After accept,
   the fully-green timeline stays shown (don't hide once `active`). Page.tsx keeps
   embedding the `invite` snapshot on accepted memberships.

---

## 9. Reference

- `admin-mantine/Link Tracking — Explorations.html` → **Option B** is the approved design.
  Open it to see the exact timeline, drawer layout, and interactions. Design reference —
  the `.tsx` here is the production implementation of that same option.
- The `.tsx`/`.ts` files compile against Mantine v7 + the existing `app/admin/members/*`
  (`utils.ts` unchanged: `formatRelative`, `formatMonthYear`). Verify import paths and the
  Supabase select against your schema.
