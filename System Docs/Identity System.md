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
| `members` | `name`, `email`, `phone`, `invited_name` | `syncMember`, `createMemberInvite`, `linkInvitedMember`, `acceptInvite`, `acceptStoryInvite`, `claimMembership`, waitlist route, `persistMemberName` (chat-marker capture, added 2026-09-03) | Admin members list, transfer stamp, **MEMBER CONTEXT** |
| `chat_sessions` | `visitor_name`, `email`, `phone` | `[NAME:]`/`[EMAIL:]`/`[PHONE:]` markers, `updateSession`, `transferSessions` | Admin CRM/session views |

There was **no propagation between them** as of the Gate 1 audit (2026-08-16).
A value written to one store did not reach the other two. That is still
mostly true — `users` and `members` are kept loosely in sync only because most
paths happen to write both in the same request, not by design — but two
narrow, deliberate exceptions were built 2026-09-03: `[NAME:]`-marker capture
now also reaches `members` (was D7, §1.2), and a name written to `members`
via `/api/members/sync`'s `syncToClerk` flag or a chat marker now also
reaches Clerk (§1.2, "Into Clerk" #21). Neither is the general reconciliation
described in §3 — both are single-field, single-direction, purpose-built
propagations, not a shared write path.

The de-facto identity key is `members.clerk_id` (unique). See §4.

### 1.2 Write paths

Every path that mutates an identity field. "Guard" describes what stops a bad
write; **✗** marks a path with a confirmed defect (§5).

#### Into `members`

| # | Path | File | Writes | Guard |
|---|---|---|---|---|
| 1 | `syncMember` | `services/auth/sync-member.ts:83-98` | `name`, `email`, `phone` | `setIdentityField`/`setIdentityEmail` (`services/shared/identity.ts`) — `null`/`undefined` disambiguated. Fixed 2026-08-17, was D1 |
| 2 | `POST /api/members/sync` | `app/api/members/sync/route.ts:47` | via `syncMember`; optional `syncToClerk: true` flag (added 2026-09-03) also pushes the name to Clerk via #21 below | Fixed 2026-08-17, was D1. Callers: `MagicLinkCard`/`SaveChatCTA`'s sign-in branch and `NameCompletionGate`'s submit both set `syncToClerk: true`; the returning-visitor mount effect does not |
| 3 | Clerk webhook → `syncMember` fallback | `app/api/webhooks/clerk/route.ts:221-227` | `name`, `email`, `phone` | `name ?? undefined` — correct here ✗ D3 (latent, still not reachable — `user.updated` unsubscribed) |
| 4 | `linkInvitedMember` | `services/members/members.ts:360-371` | `name` | `name && !invitedRow.name` — correct |
| 5 | `acceptInvite` (orphan-name rescue) | `services/members/members.ts:478-542` | `name` | `deletedCount === 1 && name && !row.name` — correct |
| 6 | `acceptStoryInvite` | `services/crm/story-invites.ts:570-584` | `name`, `primer` | insert-only; 23505 → existing-member branch — correct |
| 7 | `createMemberInvite` | `services/members/members.ts:107-138` | `invited_name`, `email`, `phone`, `primer` | insert-only, each field length-guarded — correct |
| 8 | `claimMembership` | `services/auth/claim-membership.ts:53-61` | `name`, `email`, `phone` | create-only, no-op if row exists ✗ D6 |
| 9 | Waitlist self-register | `app/api/heirloom/members/waitlist/route.ts:38-44` | `email`, optional `name` (added 2026-09-03) | insert-only, email-exists check — correct. `name` is fill-only-when-null at promotion to an active member, not required at waitlist entry — deliberately optional since waitlist entry creates no Clerk account |
| — | `persistMemberName` (in-chat `[NAME:]` capture) | `services/crm/session.ts` | `name` | fill-only-when-null into the caller's `members` row when resolvable at marker-capture time. Fixed 2026-09-03, was D7 (previously dead-ended in `chat_sessions` only — see #16) |
| — | `NameCompletionGate` submit | `components/shells/membership/NameCompletionGate.tsx` → `POST /api/members/sync` | `name` | reuses #2 above with `syncToClerk: true`; gates a signed-in, nameless, post-cutover (`NAME_REQUIRED_SINCE`) member behind an interstitial before the chat surface renders. Built 2026-09-03 |

#### Into `users`

| # | Path | File | Writes | Guard |
|---|---|---|---|---|
| 10 | `syncMember` (users leg) | `services/auth/sync-member.ts:55-64` | `name`, `email`, `phone` | `setIdentityField`/`setIdentityEmail` — same fix as #1. Fixed 2026-08-17, was D1's twin |
| 11 | `POST /api/members/sync` (users leg) | `app/api/members/sync/route.ts:30-42` | `name`, `email` | `if (suppliedName)` — correct, and no longer creates an asymmetry with #10 now that both sides disambiguate `null`/`undefined` the same way |
| 12 | Clerk webhook (users leg) | `app/api/webhooks/clerk/route.ts:129-138` | `name`, `email`, `phone` | `if (x != null)` — correct, but writes email **raw-cased** |
| 13 | `linkInvitedMember` (users leg) | `services/members/members.ts:257-261` | `email` | `setIdentityEmail` — normalises case and disambiguates `null`/`undefined`, consistent with #12 in the same request. Fixed 2026-08-17, was D5 |
| 14 | `ensureClerkUser` | `services/auth/ensure-clerk-user.ts:20-26` | `name`, `email`, `phone` | `if (name)` / `if (email)` / `if (phone)` — correct |
| 15 | `syncUser` | `services/auth/sync-user.ts:19-29` | `name`, `email` | routed through the shared identity helper — `''` no longer clobbers. Fixed 2026-08-17, was D4 |

#### Into `chat_sessions`

| # | Path | File | Writes | Guard |
|---|---|---|---|---|
| 16 | `persistVisitorName` / `Email` / `Phone` | `services/crm/session.ts:155-201+` | `visitor_name`, `email`, `phone` | select-before-write, write-once — correct. `persistVisitorName` also now writes into `members` — see the `persistMemberName` row above |
| 17 | `updateSession` (PATCH) | `services/crm/sessions.ts:250-253` | same | writes only non-empty trimmed values — correct |
| 18 | `transferSessions` contact stamp | `services/crm/sessions.ts:358-359` | `email`, `visitor_name` | truthy-guarded; correct `name ?? invited_name` precedence at `app/api/admin/sessions/[id]/transfer/route.ts:117` |

#### Into Clerk

| # | Path | File | Writes | Note |
|---|---|---|---|---|
| 19 | Custom OTP sign-up | `services/auth/providers/clerk/client.ts:162-178` | `firstName`, `lastName` | **Sign-up branch only** (`if (!createErr)`), unchanged — a name typed at sign-up still only reaches Clerk here. The *sign-in* asymmetry this row used to cause (D3's related gap) is closed by #21 below, a separate path, not a change to this one |
| 20 | Manage Account | `components/shells/membership/ChatHeader.tsx:125` | full Clerk profile | Clerk's prebuilt `openUserProfile` modal. Clerk is the source of truth here; propagates back via webhook |
| 21 | `updateClerkUserFirstName` | `services/auth/providers/clerk/server.ts` | `firstName` | Built 2026-09-03 ("D3 A/B/C"). Server-side Clerk write (mirrors `deleteClerkUser`'s async-factory pattern), non-fatal — logged, never blocks. Called from #2 (`POST /api/members/sync` when `syncToClerk: true`) and from `persistMemberName` (the `persistMemberName` row above, D7's chat-marker path) |

### 1.3 Trigger map — what actually fires a write

- **Sign-up (custom OTP):** name → Clerk (#19) → `user.created` webhook → `linkInvitedMember` (#4/#13) or `acceptStoryInvite` (#6) or `syncMember` (#3/#10); client independently calls `/api/members/sync` (#2/#11) and `acceptInvite` (#5). These race with no ordering guarantee — `acceptInvite`'s orphan-rescue exists specifically to survive that race (see `Known Gaps.md`, PR #368).
- **Sign-in (existing user):** name typed into `MagicLinkCard`/`SaveChatCTA` → `/api/members/sync` **and**, as of 2026-09-03, Clerk too (`syncToClerk: true` → #21). Previously reached `/api/members/sync` only — that gap was part of D3's related closure.
- **Already signed in, card remounts:** `MagicLinkCard.tsx:127-132` fires `onSuccess('')` → `/api/members/sync` with `name: null` — no longer damaging since D1's fix (`null` is disambiguated from "no opinion," so it no longer clobbers an existing name).
- **Admin invite:** `createMemberInvite` (#7) writes `invited_name` — the only writer of that column, ever.
- **In-chat capture:** `[NAME:]`/`[EMAIL:]`/`[PHONE:]` markers → `chat_sessions` (#16) **and**, as of 2026-09-03, `members` too (the `persistMemberName` row above) and Clerk too (#21). Previously dead-ended in `chat_sessions` only — that was D7, now fixed.
- **Nameless, post-cutover, signed-in member with no marker/sign-in-form capture yet:** gated by `NameCompletionGate` (the row above) before the chat surface renders — built 2026-09-03, the backstop for every path above that could otherwise leave a member permanently nameless.

### 1.4 Observability

**Updated 2026-09-04 — this section described a real gap that has since been
closed.** As of the Gate 1 audit (2026-08-16) there was effectively no
observability for identity writes: no `AuditAction` for a successful write
(D10), `user.updated` structurally invisible to `auth_events`, and what
logging did exist wrote raw PII to `console.log` (D9). None of that is still
true.

- **D10 is closed.** Gate 3 (§5) added a DB-trigger-based audit trail —
  `identity.write`/`identity.overwrite`/`identity.cleared` — that fires on
  every `members`/`users` update regardless of which of the write paths in
  §1.2 caused it, confirmed live via a real logged row. This makes the audit
  trail structural (a DB trigger on the table) rather than dependent on every
  call site remembering to log — the gap in the old bullet ("paths 1, 2, 3,
  10, 11, 15 emit nothing on success") no longer applies, since those paths
  no longer need to emit anything themselves for the write to be captured.
- `user.updated` is still structurally invisible to `auth_events` specifically
  (`EVENT_TYPE_MAP['user.updated'] = null` unchanged) — but that's `auth_events`
  (auth-event telemetry), a different table from the Gate 3 trigger above
  (which sits on `members`/`users` directly and fires regardless of which
  webhook event triggered the underlying UPDATE).
- **D9 is closed.** No identity-write path logs raw PII anymore — see D9's
  updated entry in §5 for the full three-pass fix (console logging,
  `audit_events` metadata, `auth_events.email`).

Net effect: every identity write is now captured in `audit_events` via the
Gate 3 trigger, with a real (non-PII) trace of what changed and, via
`x-identity-source`/`x-correlation-id`, which code path wrote it. The D1/D2/
D4/D5 rows damaged before their 2026-08-17 fixes are still not retroactively
traceable — the trigger only sees writes from 2026-09-03 onward — but any
future write of that shape now leaves one.

### 1.5 `members.source` — how a person originally joined (adjacent, not core scope)

Not one of this doc's three identity fields (see Scope above), but recorded
here since it was built by the same effort and hits the same
same-signup-races-the-webhook hazard class as §1.2/§1.3. `members.source`
(`services/shared/identity.ts`'s `MemberSource` type) is a permanent,
write-once-per-person record of *how* a member originally joined — a
completely different concept from Gate 3's `IdentitySource`
(`services/auth/supabase-admin.ts`, threaded through `getAdminClient`),
which is per-write audit attribution, not a fact about the person. Same
word, different table, different lifetime — do not conflate the two.

**Built 2026-09-04 (PR #461).** Populated by all 5 real member-creation
paths going forward:

| Value | Writer | File |
|---|---|---|
| `invite` | `linkInvitedMember`, `acceptInvite` | `services/members/members.ts` |
| `story_invite` | `acceptStoryInvite` | `services/crm/story-invites.ts` |
| `self_serve_chat` | `syncMember`, called with `memberSource: 'self_serve_chat'` | `services/auth/sync-member.ts`, `app/api/members/sync/route.ts` |
| `self_serve_clerk` | `syncMember`'s webhook-fallback call (when the marker below is absent), or `claimMembership` | `app/api/webhooks/clerk/route.ts`, `services/auth/claim-membership.ts` |
| `waitlist` | Waitlist self-register | `app/api/heirloom/members/waitlist/route.ts` |

`createMemberInvite` (writes `invited_name`, not `source`) is unchanged —
`source` is stamped only once an invite is accepted, by the two rows above.

**The race this needed to close.** `syncMember` is reachable two ways for
the *same* chat-form (custom OTP) signup — directly, from the three
chat-embedded `/api/members/sync` callers, and via the Clerk webhook's own
`user.created` fallback cascade — with no ordering guarantee between them
(the same race `heirloom-signup-signin-paths.md` already documents for
Path 1). Hardcoding "webhook fallback ⇒ `self_serve_clerk`" would have
mis-tagged a real custom-OTP signup purely on which side won the race.
Fixed the same way `heirloom_invite_token`/`heirloom_story_invite_token`
already solve this exact shape of problem: a
`heirloom_signup_surface: 'custom_otp'` marker, written into Clerk
`unsafeMetadata` by every custom-OTP sign-up attempt
(`services/auth/providers/clerk/client.ts`'s `sendCode`), read by the
webhook (`app/api/webhooks/clerk/route.ts`) to resolve `self_serve_chat`
vs. `self_serve_clerk` regardless of which side of the race actually wins.

**Immutability guard.** `syncMember` is called on every authentication, not
just first creation — including an already-`invite`- or `story_invite`-
sourced member's completely ordinary next login. To avoid silently
overwriting a correct value, it runs a pre-check
(`select id from members where clerk_id = X`) before its upsert and
includes `source` in the payload only when that check confirms this is a
genuine first-ever row creation. On an existing row, `source` is omitted
from the payload entirely — regardless of its current value, including
`NULL` (see next).

**Existing null rows are an accepted historical gap, not backfilled.**
34 of 41 live `members` rows (measured 2026-08-16, before this fix) had
`source IS NULL` — created before this column had a writer on every path.
A null row's true original source cannot be recovered by inference (the
same person could in principle have arrived via any bucket before this fix
shipped), so no bulk backfill and no "fill on next ordinary login" mechanism
was built — a null row stays null unless Jeff runs a one-time,
evidence-based `UPDATE` in Studio. This is the same tradeoff §5's D8 already
made for `invited_name` (frozen by design, not reopened as a live gap) —
consistent precedent, not a new exception.

---

## 2. Read paths

| Consumer | File | Reads | Correct? |
|---|---|---|---|
| **MEMBER CONTEXT** (every chat turn) | `services/chat/server/member-context.ts` | `resolveMemberName({name, invited_name})` — `name` first, `invited_name` fallback | ✓ fixed 2026-08-17, was **D2** |
| Session transfer stamp | `app/api/admin/sessions/[id]/transfer/route.ts:117` | `name ?? invited_name` | ✓ correct precedence |
| Admin members list | `app/admin/members/page.tsx:115,139` | `invited_name ?? 'Unnamed…'` | Partial — invited rows only, acceptable for that surface |
| Transfer modal | `app/admin/TransferModal.tsx:81` | `name ?? invited_name` | ✓ correct precedence |
| MagicLinkCard prefill | `components/shells/membership/MessageList.tsx:962-975` | `[NAME:]` marker `?? invitedName` | ✓ marker wins, invite falls back |
| `GET /api/members/me` (`NameCompletionGate`) | `app/api/members/me/route.ts` | raw `{name, invitedName, createdAt}`, resolved client-side via the same shared `resolveMemberName` | ✓ correct — one shared precedence function, not a second copy of the rule. Built 2026-09-03 |

**Historical note — the mismatch that made this D2.** Two independent surfaces
(`transfer/route.ts`, `TransferModal.tsx`) always used `name ?? invited_name`.
MEMBER CONTEXT — the one surface that feeds the AI on every single turn — used
`invited_name` alone, until the 2026-08-17 fix above brought it onto the same
`resolveMemberName` precedence every other consumer already used.

---

## 3. Target state

> **Provenance (corrected 2026-09-04).** This section previously claimed the
> parked design referenced as
> `Design Handovers/identity_reconciliation_design_2026-08-16.md` was "not
> present in this repo" — that was false; the file exists (605 lines,
> committed `f299a56`, present on `main`) and was simply never checked
> directly when this section was first written. What follows is still a
> reconstruction from the defect inventory, not a line-by-line summary of
> that design doc — the two have not yet been reconciled against each other.
> Read the real design doc directly for its findings (notably §0: `clerk_id`
> is UNIQUE globally, not per tenant, and `users.email` is UNIQUE, both of
> which constrain any reconciliation function) rather than trusting this
> section to already reflect them. **This section commits us to nothing** —
> the full reconciliation redesign is parked as a separate, later decision.

### 3.1 Direction

1. **One write path.** A single `writeIdentity()` in `services/members/` (or
   `services/auth/`) is the only thing that mutates an identity field on `users`
   or `members`. Paths 1–15 above become callers, not writers. **Not built.**
   `services/shared/identity.ts`'s helpers (item 3 below) are used *by* most
   call sites, which is a lighter-weight step toward this goal, not the goal
   itself — the write paths in §1.2 are still independent functions, not
   callers of one shared writer.
2. **An explicit precedence contract**, stated once and tested once, rather than
   re-derived per call site. Provisional ordering, highest first:
   user-typed → Clerk-sourced → invite-time (`invited_name`) → absent.
   Today this contract exists in three places and disagrees with itself (§2).
   **Partially built** for the read side — `resolveMemberName` is now the one
   shared precedence function every read path in §2 uses — but the write side
   (which of several racing writers should win) has no equivalent shared
   contract yet.
3. **`null` and `undefined` disambiguated at the boundary.** The single most
   valuable change in this list. `undefined` = "caller has no opinion, leave the
   column alone"; `null` = "explicitly clear this". Empty string is never a
   valid identity value. **Built 2026-08-17** — `services/shared/identity.ts`'s
   `setIdentityField`/`setIdentityEmail`, adopted by every write path in §1.2.
   This was D1, D4, D5.
4. **`invited_name` demoted to a pure fallback.** It is invite-creation metadata,
   frozen at write time by design. Nothing should read it as the member's current
   name without first checking `members.name`. **Built** (D2's fix,
   `resolveMemberName`) **and closed by decision** (D8 — frozen is the accepted
   end state, not a gap awaiting a refresh mechanism; see §5).
5. **Chat-captured identity promoted.** `[NAME:]`/`[EMAIL:]`/`[PHONE:]` should
   reach `members` via the same single write path, subject to the same
   precedence, instead of dead-ending in `chat_sessions`. **Built 2026-09-03
   for `name` only** (`persistMemberName`, was D7) — a purpose-built parallel
   write, not "the same single write path" this item originally envisioned
   (item 1 is still unbuilt). `email`/`phone` still dead-end in `chat_sessions`.
6. **Every write audited, no PII.** See `Tracking` (Gate 3). **Built and live,
   2026-09-03** — see §1.4 and §5's Gate 3 entry. This item is done; it was a
   prerequisite for trusting items 1–5, not a follow-up to them, and is the one
   item on this list that shipped as scoped.

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
| **D1** | `/api/members/sync` nulls `members.name` — `null` passes `syncMember`'s `!== undefined` guard | `app/api/members/sync/route.ts:28,47` + `services/auth/sync-member.ts:90` | **Fixed 2026-08-17** (`b4fbfb9`) — `services/shared/identity.ts`'s `setIdentityField`/`setIdentityEmail` disambiguate `null`/`undefined` at every write path; the 4 already-damaged rows were not backfilled by this fix (a code fix, not a data migration) |
| **D2** | `getMemberContext` reads `invited_name`, never `name` | `services/chat/server/member-context.ts:91,114` | **Fixed 2026-08-17** (`3cde3ed`) — resolves `name` first, `invited_name` only as fallback, via `resolveMemberName` |
| **D3** | `user.updated` webhook would clobber a name set outside Clerk | `app/api/webhooks/clerk/route.ts:221-227` | Confirmed code defect — **not reachable**; `user.updated` is not subscribed on the `heirloom.2bl.ai` endpoint (dashboard-verified 2026-08-16, unchanged). **Related gap closed 2026-09-03** (`6b1a66f`, `3ff8ed4` — "D3 A/B/C"): the asymmetry this defect sits alongside — a name typed at sign-in, or captured via chat marker, never reaching Clerk (§1.2 row #19's old caveat) — is now closed via `syncToClerk`/`updateClerkUserFirstName`. D3 itself (the webhook-clobber risk) stays open but dormant until `user.updated` is ever subscribed |
| **D4** | `syncUser` writes `users.name = ''` unconditionally | `services/auth/sync-user.ts:19,26` | **Fixed 2026-08-17** (`e87379b`) — routed through the same shared identity helper as D1 |
| **D5** | `linkInvitedMember` writes `users.email = ''` on phone-only signups | `services/members/members.ts:259` | **Fixed 2026-08-17** (`e87379b`) — `setIdentityEmail` now guards this write; 0 rows were ever damaged (unguarded, not yet triggered) |
| **D6** | `claimMembership` writes undocumented `status='pending'`; never updates an existing row | `services/auth/claim-membership.ts:45-53` | Confirmed — **1 row, created 2026-06-10, none since**. Route effectively orphaned (see `Known Gaps.md`'s expired-invite chat-first entry, 2026-08-14) |
| **D7** | Chat-captured `[NAME:]`/`[EMAIL:]`/`[PHONE:]` never propagate to `members` | `services/crm/session.ts:155-201+` | **Fixed 2026-09-03** (`abae794`) — `persistVisitorName` now also writes fill-only-when-null into the caller's `members` row when one is resolvable at marker-capture time |
| **D8** | A Clerk-side rename never reaches `invited_name`, so the AI keeps the old name | same root cause as D2 | **Closed by decision, 2026-09-03** — see below |
| **D9** | Raw PII in `console.log`, `audit_events` metadata, and `auth_events.email` | *(originally `member-context.ts`, `session.ts`, `members.ts`, `webhooks/clerk/route.ts` — exact lines omitted here since the fix touched and renumbered all of them; see the PR for current locations)* | **Fixed 2026-09-03/04** (`services/shared/log-safe.ts`'s `logSafeIdentity`/`identityHash`, PR #459) — full-repo sweep, three passes: (1) 20 `console.log`/`error`/`warn` call sites across 5 files, (2) `audit_events` metadata (1 real instance, `members.ts`'s `MEMBER_USER_RESOLVE_FAILED`), (3) `auth_events.email` (a first-class column, not metadata — now hashed at its one write site). The 20 pre-existing `auth_events` rows with a raw email were **not** redacted — both `audit_events` and `auth_events` carry `BEFORE UPDATE`/`BEFORE DELETE` triggers (`prevent_audit_mutation()`) enforcing append-only, which rejected the redaction attempt even from a service-role connection; redacting them requires Jeff to temporarily lift that trigger in Studio, deferred pending his own review |
| **D10** | No `AuditAction` for a successful identity write | `services/audit/types.ts:92-107` | **Closed 2026-09-03** — see Gate 3 below |

**Priority.** All of D1, D2, D4, D5, D7, D9, D10 above are now fixed — none of
D1–D9 (D10 was never data-damaging by itself) leaves damage undetectable going
forward. D3 and D6 remain open but dormant: D3 has no current trigger
(`user.updated` unsubscribed), D6's route is effectively orphaned. Neither is
scheduled as standalone work — fix if the surrounding code is touched again.

### Gate 3 — every write audited, no PII (closes D10)

**Built and deployed live, 2026-09-03.** A Postgres `BEFORE UPDATE` trigger on
both `members` (`identity_audit_members` → `trg_log_identity_write_members()`)
and `users` (`identity_audit_users` → `trg_log_identity_write_users()`) logs
`identity.write`/`identity.overwrite`/`identity.cleared` into `audit_events`
(the three `AuditAction` values Gate 3 added, `services/audit/types.ts`),
reading `x-identity-source`/`x-correlation-id` via PostgREST's
`current_setting('request.headers', true)`. Confirmed live via direct query:
a real `identity.overwrite` row exists, dated 2026-09-03. App-code side:
`getAdminClient(source, ctx)` consolidated into one source-attributed
factory (3 duplicate implementations folded into one), and every real
identity-write call site now threads its `IdentitySource` and
`correlationId` through it (11 writer functions covered — see
`services/auth/supabase-admin.ts`'s `IdentitySource` union for the full
list). The trigger DDL itself is Jeff's Studio work per `CLAUDE.md`'s
schema-migration rule — the app-code side above is what shipped through
this repo. See `Design Handovers/identity-tracking-proposal.md` for the
full design.

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

-- D9 regression check: any raw email/phone-shaped string reappearing in
-- audit_events metadata, or a non-hash value in auth_events.email. Both
-- should return zero rows going forward; a non-zero result means a new
-- write path reintroduced raw PII into permanent storage.
select count(*) from audit_events
where metadata::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
   or metadata::text ~ '\+?1?[0-9]{10,}';

select count(*) from auth_events
where email is not null and email !~ '^[0-9a-f]{8}$';
```

---

## 7. Change log

- **2026-08-16** — Created. Gate 1 defect inventory (D1–D10) and Gate 2 current/
  target state. D3 closed as not-reachable after Clerk dashboard verification.
- **2026-09-03** — D8 closed by decision: `invited_name` stays frozen at
  invite time, no refresh mechanism planned. See §5's D8 decision note.
- **2026-09-03/04** — Large batch of the remaining defect register closed.
  D1/D2/D4/D5 confirmed fixed (2026-08-17, previously undocumented here).
  D7 fixed: chat-marker name capture now also reaches `members`. D3's
  related sign-in/chat-marker-to-Clerk gap closed via `syncToClerk`/
  `updateClerkUserFirstName` (D3 itself — the `user.updated` webhook-clobber
  risk — stays open but dormant). Gate 3 built and deployed live, closing
  D10 and giving every identity write a real, non-PII audit trail. D9 fixed
  across three passes: `console.log`, `audit_events` metadata, and
  `auth_events.email` (20 pre-existing rows in the last of these were not
  retroactively redacted — blocked by an append-only DB trigger, deferred to
  Jeff). Also shipped in this window, outside the defect register: an
  optional waitlist name field, and `NameCompletionGate` — a server-verified
  interstitial that backstops every other name-capture path for a
  post-cutover signed-in member with no name on file. This entry also
  corrects several places this doc had gone stale relative to that work:
  §1.1's "no propagation" framing, §1.2's write-path tables, §1.4's
  observability section, §2's read-path table, §3.1's per-item status, and
  §3's provenance note (which wrongly claimed
  `identity_reconciliation_design_2026-08-16.md` didn't exist in this repo
  — it does). See `Design Handovers/identity-remaining-work-sequencing-
  proposal.md` for the sequencing this batch worked through, and PRs #448,
  #451, #452, #457, #459.
- **2026-09-04** — `members.source` populated consistently across all real
  signup paths (`invite`, `story_invite`, `self_serve_chat`,
  `self_serve_clerk`, `waitlist`), including the `heirloom_signup_surface`
  race-condition fix and `syncMember`'s new pre-check guard against
  clobbering an existing value on re-login. New §1.5 (adjacent to this
  doc's core name/email/phone scope, not part of it). Existing null rows
  left as an accepted historical gap, same precedent as D8. PR #461,
  merged to `main` at `654d337`.
