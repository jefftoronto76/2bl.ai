# Identity System

How a person's name, email, and phone move through Heirloom — as-built today,
where the defects are, and the direction of travel.

**Scope:** the identity fields only — `users.name/email/phone`,
`members.name/email/phone/invited_name`, `chat_sessions.visitor_name/email/phone`.
Roles, status transitions, invite lifecycle, and session ownership are covered in
`System Docs/Utilities/Members.md` and `System Docs/Database Schema.md`.

**Companion docs:** `Database Schema.md` (column semantics), `Known Gaps.md`
(historical incidents), `Utilities/Members.md` and `Utilities/Auth.md` (service
internals), `Contact Capture Architecture.md` (visitor-side capture design).

> Live figures in this doc were measured against the `natural-resource` Supabase
> project on **2026-08-16**, Heirloom tenant `20767f1d-1148-4e43-ab73-f6da88f0ac56`
> (41 member rows: 19 active, 15 invited, 6 deleted, 1 pending). They are a
> snapshot, not an invariant — re-run the queries in "Diagnostic queries" below
> rather than trusting the numbers.

---

## 1. Current state (as-built)

### 1.1 Three stores, no owner

Identity lives in three tables that are written independently and never
reconciled:

| Table | Holds | Written by | Read by |
|---|---|---|---|
| `users` | `name`, `email`, `phone` | Clerk webhook, `syncUser`, `ensureClerkUser`, `linkInvitedMember`, `/api/members/sync` | Admin surfaces, `invited_by` joins |
| `members` | `name`, `email`, `phone`, `invited_name` | `syncMember`, `createMemberInvite`, `linkInvitedMember`, `acceptInvite`, `acceptStoryInvite`, `claimMembership`, waitlist route | Admin members list, transfer stamp, **MEMBER CONTEXT** |
| `chat_sessions` | `visitor_name`, `email`, `phone` | `[NAME:]`/`[EMAIL:]`/`[PHONE:]` markers, `updateSession`, `transferSessions` | Admin CRM/session views |

There is **no propagation between them**. A value written to one store does not
reach the other two. `users` and `members` are kept loosely in sync only because
most paths happen to write both in the same request — not by design, and not
consistently (see D1, where one path writes `users` correctly and `members` wrong
in the same handler).

The de-facto identity key is `members.clerk_id` (unique). See §4.

### 1.2 Write paths

Every path that mutates an identity field. "Guard" describes what stops a bad
write; **✗** marks a path with a confirmed defect (§5).

#### Into `members`

| # | Path | File | Writes | Guard |
|---|---|---|---|---|
| 1 | `syncMember` | `services/auth/sync-member.ts:83-98` | `name`, `email`, `phone` | `if (x !== undefined)` — **lets `null` through** ✗ D1 |
| 2 | `POST /api/members/sync` | `app/api/members/sync/route.ts:47` | via `syncMember` | passes `null` for an empty name ✗ D1 |
| 3 | Clerk webhook → `syncMember` fallback | `app/api/webhooks/clerk/route.ts:221-227` | `name`, `email`, `phone` | `name ?? undefined` — correct here ✗ D3 (latent) |
| 4 | `linkInvitedMember` | `services/members/members.ts:360-371` | `name` | `name && !invitedRow.name` — correct |
| 5 | `acceptInvite` (orphan-name rescue) | `services/members/members.ts:478-542` | `name` | `deletedCount === 1 && name && !row.name` — correct |
| 6 | `acceptStoryInvite` | `services/crm/story-invites.ts:570-584` | `name`, `primer` | insert-only; 23505 → existing-member branch — correct |
| 7 | `createMemberInvite` | `services/members/members.ts:107-138` | `invited_name`, `email`, `phone`, `primer` | insert-only, each field length-guarded — correct |
| 8 | `claimMembership` | `services/auth/claim-membership.ts:53-61` | `name`, `email`, `phone` | create-only, no-op if row exists ✗ D6 |
| 9 | Waitlist self-register | `app/api/heirloom/members/waitlist/route.ts:38-44` | `email` | insert-only, email-exists check — correct |

#### Into `users`

| # | Path | File | Writes | Guard |
|---|---|---|---|---|
| 10 | `syncMember` (users leg) | `services/auth/sync-member.ts:55-64` | `name`, `email`, `phone` | `if (x !== undefined)` — same `null` hole as D1 |
| 11 | `POST /api/members/sync` (users leg) | `app/api/members/sync/route.ts:30-42` | `name`, `email` | `if (suppliedName)` — **correct**, and the asymmetry that creates D1 |
| 12 | Clerk webhook (users leg) | `app/api/webhooks/clerk/route.ts:129-138` | `name`, `email`, `phone` | `if (x != null)` — correct, but writes email **raw-cased** |
| 13 | `linkInvitedMember` (users leg) | `services/members/members.ts:257-261` | `email` | unconditional; `'' ` written for phone-only signups ✗ D5. Also **lowercases**, contradicting #12 in the same request |
| 14 | `ensureClerkUser` | `services/auth/ensure-clerk-user.ts:20-26` | `name`, `email`, `phone` | `if (name)` / `if (email)` / `if (phone)` — correct |
| 15 | `syncUser` | `services/auth/sync-user.ts:19-29` | `name`, `email` | `name` written **unconditionally** — `''` clobbers ✗ D4 |

#### Into `chat_sessions`

| # | Path | File | Writes | Guard |
|---|---|---|---|---|
| 16 | `persistVisitorName` / `Email` / `Phone` | `services/crm/session.ts:155-201+` | `visitor_name`, `email`, `phone` | select-before-write, write-once — correct |
| 17 | `updateSession` (PATCH) | `services/crm/sessions.ts:250-253` | same | writes only non-empty trimmed values — correct |
| 18 | `transferSessions` contact stamp | `services/crm/sessions.ts:358-359` | `email`, `visitor_name` | truthy-guarded; correct `name ?? invited_name` precedence at `app/api/admin/sessions/[id]/transfer/route.ts:117` |

#### Into Clerk

| # | Path | File | Writes | Note |
|---|---|---|---|---|
| 19 | Custom OTP sign-up | `services/auth/providers/clerk/client.ts:162-178` | `firstName`, `lastName` | **Sign-up branch only** (`if (!createErr)`). A name typed on a *sign-in* never reaches Clerk — the asymmetry behind D3 |
| 20 | Manage Account | `components/shells/membership/ChatHeader.tsx:125` | full Clerk profile | Clerk's prebuilt `openUserProfile` modal. Clerk is the source of truth here; propagates back via webhook |

### 1.3 Trigger map — what actually fires a write

- **Sign-up (custom OTP):** name → Clerk (#19) → `user.created` webhook → `linkInvitedMember` (#4/#13) or `acceptStoryInvite` (#6) or `syncMember` (#3/#10); client independently calls `/api/members/sync` (#2/#11) and `acceptInvite` (#5). These race with no ordering guarantee — `acceptInvite`'s orphan-rescue exists specifically to survive that race (see `Known Gaps.md`, PR #368).
- **Sign-in (existing user):** name typed into `MagicLinkCard`/`SaveChatCTA` → `/api/members/sync` **only**. Never reaches Clerk.
- **Already signed in, card remounts:** `MagicLinkCard.tsx:127-132` fires `onSuccess('')` → `/api/members/sync` with `name: null` → **D1**.
- **Admin invite:** `createMemberInvite` (#7) writes `invited_name` — the only writer of that column, ever.
- **In-chat capture:** `[NAME:]`/`[EMAIL:]`/`[PHONE:]` markers → `chat_sessions` only (#16). Never reaches `members` — **D7**.

### 1.4 Observability

There is effectively none for identity writes.

- `services/audit/types.ts:92-107` defines `MEMBER_CLAIM`, `MEMBER_INVITE_*`,
  `MEMBER_ORPHAN_*`, and three `*_FAILED` actions — but **no action for a
  successful identity-field write**. Paths 1, 2, 3, 10, 11, 15 emit nothing on success.
- `user.updated` is structurally invisible: `EVENT_TYPE_MAP['user.updated'] = null`
  (`app/api/webhooks/clerk/route.ts:14`) makes the `if (mappedType)` guard at
  `:105` skip `auth_events` logging entirely.
- What logging exists writes **raw PII to `console.log`** — see D9.

Net effect: none of D1–D8 leaves a queryable trace. The damaged rows in §5 are
detectable only by joining `members` to `users` after the fact, with no record of
when the damage happened or which path caused it.

---

## 2. Read paths

| Consumer | File | Reads | Correct? |
|---|---|---|---|
| **MEMBER CONTEXT** (every chat turn) | `services/chat/server/member-context.ts:91,114` | `invited_name` **only** | ✗ **D2** — never reads `members.name` |
| Session transfer stamp | `app/api/admin/sessions/[id]/transfer/route.ts:117` | `name ?? invited_name` | ✓ correct precedence |
| Admin members list | `app/admin/members/page.tsx:115,139` | `invited_name ?? 'Unnamed…'` | Partial — invited rows only, acceptable for that surface |
| Transfer modal | `app/admin/TransferModal.tsx:81` | `name ?? invited_name` | ✓ correct precedence |
| MagicLinkCard prefill | `components/shells/membership/MessageList.tsx:962-975` | `[NAME:]` marker `?? invitedName` | ✓ marker wins, invite falls back |

**The mismatch that matters.** Two independent surfaces (`transfer/route.ts`,
`TransferModal.tsx`) both use `name ?? invited_name`. MEMBER CONTEXT — the one
surface that feeds the AI on every single turn — uses `invited_name` alone. That
is not a deliberate divergence; it is D2.

---

## 3. Target state

> **Provenance.** The parked design referenced as
> `Design Handovers/identity_reconciliation_design_2026-08-16.md` is **not present
> in this repo** (verified against `main` and all branches). This section is a
> reconstruction from the defect inventory, agreed as a placeholder direction on
> 2026-08-16. Reconcile it against the real design if that document resurfaces.
> **This section commits us to nothing** — the full reconciliation redesign is
> parked as a separate, later decision.

### 3.1 Direction

1. **One write path.** A single `writeIdentity()` in `services/members/` (or
   `services/auth/`) is the only thing that mutates an identity field on `users`
   or `members`. Paths 1–15 above become callers, not writers.
2. **An explicit precedence contract**, stated once and tested once, rather than
   re-derived per call site. Provisional ordering, highest first:
   user-typed → Clerk-sourced → invite-time (`invited_name`) → absent.
   Today this contract exists in three places and disagrees with itself (§2).
3. **`null` and `undefined` disambiguated at the boundary.** The single most
   valuable change in this list. `undefined` = "caller has no opinion, leave the
   column alone"; `null` = "explicitly clear this". Today `syncMember` conflates
   them (D1). Empty string is never a valid identity value (D4, D5).
4. **`invited_name` demoted to a pure fallback.** It is invite-creation metadata,
   frozen at write time by design. Nothing should read it as the member's current
   name without first checking `members.name` (D2, D8).
5. **Chat-captured identity promoted.** `[NAME:]`/`[EMAIL:]`/`[PHONE:]` should
   reach `members` via the same single write path, subject to the same
   precedence, instead of dead-ending in `chat_sessions` (D7).
6. **Every write audited, no PII.** See `Tracking` (Gate 3) — a prerequisite for
   trusting any of the above, not a follow-up to it.

### 3.2 Explicitly out of scope for now

Cross-method identity dedup (one person, two Clerk identities, two `members`
rows) — a product/design gap with no shared identity key to dedupe on. Already
recorded in `Known Gaps.md` (2026-08-13, not addressed). Reconciliation does not
solve it and should not be blocked on it.

---

## 4. Clerk is for authentication only

**Constraint (target state).** Clerk's role is to answer one question per
request: *is this session valid, and who does it belong to?* It is not an identity
store, not a join key, and not a source of profile truth on the hot path. The
provider-agnostic boundary at `services/auth/` (the Golden Rule — see
`Design Handovers/auth-service-rebuild.md`) already enforces this at the *import*
level; this constraint extends it to the *data* level.

### Current violations

| Location | Violation | Severity |
|---|---|---|
| `app/api/sage/route.ts:8-32` | `resolveMemberId` runs a `members.clerk_id = user.providerUserId` lookup **on every chat turn** | Highest — hot path, per-turn DB round trip on an auth identifier |
| `services/auth/sync-member.ts:96` | `onConflict: 'clerk_id'` — makes `clerk_id` the primary identity key for `members` | Structural |
| `app/api/webhooks/clerk/route.ts:246` | `clerk_id` used as the soft-delete selector | Structural |
| `services/crm/story-invites.ts:551-556` | `clerk_id` lookup on invite accept | Moderate |
| `services/auth/claim-membership.ts:32-35` | `clerk_id` lookup for the existence check | Moderate (path near-dead — D6) |

`members.user_id` (FK → `users.id`) is the identity key the system should be
joining on. It exists, and as of the 2026-08-13 `syncMember` fix it is reliably
populated (see `Known Gaps.md`). **Flagged, not scheduled** — no fix in this pass.

---

## 5. Defect register

Established by the Gate 1 audit, 2026-08-16. Reachability verified against live data.

| ID | Defect | Location | Status |
|---|---|---|---|
| **D1** | `/api/members/sync` nulls `members.name` — `null` passes `syncMember`'s `!== undefined` guard | `app/api/members/sync/route.ts:28,47` + `services/auth/sync-member.ts:90` | **Confirmed, live — 4 rows damaged** |
| **D2** | `getMemberContext` reads `invited_name`, never `name` | `services/chat/server/member-context.ts:91,114` | **Confirmed, live — 12 members, every turn** |
| **D3** | `user.updated` webhook would clobber a name set outside Clerk | `app/api/webhooks/clerk/route.ts:221-227` | Confirmed code defect — **not reachable**; `user.updated` is not subscribed on the `heirloom.2bl.ai` endpoint (dashboard-verified 2026-08-16) |
| **D4** | `syncUser` writes `users.name = ''` unconditionally | `services/auth/sync-user.ts:19,26` | Confirmed, live — 2 rows damaged |
| **D5** | `linkInvitedMember` writes `users.email = ''` on phone-only signups | `services/members/members.ts:259` | Confirmed code defect — 0 rows today, unguarded |
| **D6** | `claimMembership` writes undocumented `status='pending'`; never updates an existing row | `services/auth/claim-membership.ts:45-53` | Confirmed — **1 row, created 2026-06-10, none since**. Route effectively orphaned |
| **D7** | Chat-captured `[NAME:]`/`[EMAIL:]`/`[PHONE:]` never propagate to `members` | `services/crm/session.ts:155-201+` | Confirmed, by design-gap |
| **D8** | A Clerk-side rename never reaches `invited_name`, so the AI keeps the old name | same root cause as D2 | **Closed by decision, 2026-09-03** — see below |
| **D9** | Raw PII in `console.log` | `member-context.ts:143-151`, `session.ts:176-180,195`, `members.ts:243-246,264-268,285,328-332,347-351`, `webhooks/clerk/route.ts:156-159` | Confirmed — violates CLAUDE.md logging convention |
| **D10** | No `AuditAction` for a successful identity write | `services/audit/types.ts:92-107` | Confirmed |

**Priority.** D1 and D2 are live and actively damaging data. D4 is live but
low-volume. D9/D10 are the reason D1–D8 went undiagnosed and are addressed by the
Gate 3 tracking proposal. D3, D5, D6 are latent — real code defects with no
current trigger; fix them when touching the surrounding code, not as standalone work.

### D8 — decision: `invited_name` stays frozen at invite time, by design

**Decided 2026-09-03.** `invited_name` (`members`) has exactly one writer —
`createMemberInvite` (`services/members/members.ts:107-138`), insert-only —
and no code path anywhere in the codebase ever updates an existing row's
value, enforced structurally by `services/shared/identity.ts`'s
`resolveMemberName`, whose own doc comment already states this plainly:
*"`members.invited_name` is invite-creation metadata, written once by
`createMemberInvite` and never updated by anything, so it is only ever a
fallback."* D8 as originally registered was about a *consequence* of that
immutability — before the D2 fix, `member-context.ts` read `invited_name`
alone, so a stale invite-time name kept reaching the AI after a real Clerk
rename. That consumer-side bug is what D2 fixed: `resolveMemberName` now
resolves `name` first, `invited_name` only as a fallback for a member who
was never renamed. With that fixed, `invited_name` going stale is no longer
user-visible anywhere — it's inert metadata once a real `name` exists.

**No refresh mechanism will be built.** Adding one would mean either (a) a
new write path into `invited_name` after invite creation — undermining its
value as a fixed record of "what the admin named this person at invite
time," which other surfaces (`MembersList.tsx`, `TransferModal.tsx`) still
read directly for that historical meaning, not as a live display name; or
(b) deleting the column's write-once guarantee entirely, which is larger,
unscoped work with no live symptom driving it. Freezing it is the accepted
tradeoff, not an oversight — this entry exists so a future audit doesn't
re-open D8 as a live defect.

### Verified-correct paths

Checked and found sound, recorded so a future audit does not re-litigate them:
`acceptInvite` orphan-name rescue (`members.ts:478-542`), `linkInvitedMember`'s
members update (`members.ts:369`), `acceptStoryInvite` (`story-invites.ts:570-615`),
`updateSession` (`sessions.ts:250-253`), `persistVisitorName/Email/Phone`
(`session.ts:155+`), `transferSessions` stamp (`sessions.ts:358-359`),
`createMemberInvite` (`members.ts:107-138`), the webhook ghost-row guard
(`route.ts:86-99`), and `ensureClerkUser` (`ensure-clerk-user.ts:20-26`).

**Ruled out:** "webhook replay clobbers a name set via Manage Account" — cannot
happen. Manage Account edits Clerk, which is the webhook's own source, so replay
is idempotent. The real (latent) variant is D3.

---

## 6. Diagnostic queries

Re-runnable probes for the damage classes above. Heirloom tenant is
`20767f1d-1148-4e43-ab73-f6da88f0ac56`.

```sql
-- D1 fingerprint: members.name nulled while users.name survived
select count(*) from members m join users u on u.id = m.user_id
where m.tenant_id = '20767f1d-1148-4e43-ab73-f6da88f0ac56'
  and m.name is null and u.name is not null and u.name <> '';

-- D2 blast radius: members the AI cannot name, or names wrongly
select
  count(*) filter (where name is not null and invited_name is null)            as ai_sees_no_name,
  count(*) filter (where name is not null and invited_name is not null
                     and name <> invited_name)                                as ai_sees_stale_name,
  count(*) filter (where name is null and invited_name is null)                as no_name_anywhere
from members where tenant_id = '20767f1d-1148-4e43-ab73-f6da88f0ac56';

-- D4 / D5 fingerprint: empty-string identity values
select count(*) filter (where name = '')  as user_name_empty,
       count(*) filter (where email = '') as user_email_empty
from users;

-- D6 blast radius
select status, count(*) from members
where tenant_id = '20767f1d-1148-4e43-ab73-f6da88f0ac56' group by status;

-- D3 reachability re-check (note: user.updated is NOT logged here by design —
-- absence proves nothing. Confirm via the Clerk dashboard's endpoint config.)
select metadata->>'clerk_event_type' as event, count(*), max(created_at)
from auth_events where metadata->>'clerk_event_type' is not null group by 1;
```

---

## 7. Change log

- **2026-08-16** — Created. Gate 1 defect inventory (D1–D10) and Gate 2 current/
  target state. D3 closed as not-reachable after Clerk dashboard verification.
- **2026-09-03** — D8 closed by decision: `invited_name` stays frozen at
  invite time, no refresh mechanism planned. See §5's D8 decision note.
