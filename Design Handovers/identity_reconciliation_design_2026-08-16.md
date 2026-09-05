# Design — single identity reconciliation path

**Status:** Gate 1 proposal. No code written. Awaiting review.
**Date:** 2026-08-16
**Precedes:** `Design Handovers/member_context_system_audit_2026-08-15.md`,
`Design Handovers/signup_signin_path_inventory_2026-08-16.md`

---

## 0. Findings that changed the design

Three things surfaced while grounding this proposal that weren't in the audit
reports and that shape the design.

### 0.1 `members.clerk_id` is UNIQUE **globally**, not per tenant

```sql
members_clerk_user_id_key  UNIQUE (clerk_id)     -- no tenant_id
users_clerk_id_key         UNIQUE (clerk_id)
users_clerk_id_unique      UNIQUE (clerk_id)     -- duplicate of the above
users_email_unique         UNIQUE (email)
```

There is **no unique constraint on `(tenant_id, clerk_id)`**. One Clerk user can
therefore hold exactly one `members` row across the entire platform.

`syncMember` upserts with `onConflict: 'clerk_id'` and a `tenant_id` **in the
payload**. If the same Clerk user ever authenticates against a second tenant,
that upsert does not create a second membership — it **silently moves the
existing row to the new tenant**, taking their role, status, and primer with it.

Live data says this has not fired yet: only Heirloom has members with a
`clerk_id` (26 of them); the Jeff Lougheed tenant has 3 members, all with
`clerk_id IS NULL`; 0 clerk_ids appear in more than one tenant. **Latent, not
active.** But a reconciliation function keyed on "clerk user + tenant" cannot be
written correctly against this constraint, so it has to be resolved first.

### 0.2 `users.email` is UNIQUE — reconciliation can 23505 on a field write

Two Clerk users sharing an email (a real possibility across sign-up methods)
means the second `users` write fails. Today that failure is swallowed by a
`console.error` in three of the four functions. The reconciliation function must
treat a unique violation on a *field* as a per-field skip, not a total failure.

Related: this is also why finding 9's `linkInvitedMember` empty-email hazard has
never materialised — only one row could ever hold `''`.

### 0.3 The sign-in-transfer name drop — confirmed, with an important nuance

Confirmed in `services/auth/providers/clerk/client.ts`. `sendCode` attaches the
typed name via `signUp.update({firstName, lastName})` **only inside the
`if (!createErr)` branch** (genuine sign-up). On the `form_identifier_exists`
branch it goes straight to `signIn.emailCode.sendCode(...)` — the name never
reaches Clerk. That is deliberate; the `AuthFlowContact.firstName` doc comment
says so: *"Ignored for sign-ins: an existing user's profile is never overwritten
from this flow."*

**The nuance that matters for this design:** the name is *not* lost. Both
surfaces fire `onSuccess(nameValue)` on `flow.stage === 'success'` regardless of
which branch ran, and that reaches `POST /api/members/sync {name}` → `syncMember`
→ Supabase. So on the sign-in branch the typed name **reaches Supabase but never
Clerk**.

This is the single most important input to the design. A reconciliation function
that takes "the Clerk user object" as its source of truth for name would
**regress** this behaviour — it would discard a name the system currently keeps.
The function therefore needs two distinct name channels, not one.

---

## 1. Signature and inputs

### 1.1 Shape

```
services/auth/reconcile-identity.ts

reconcileIdentity(input: IdentityReconcileInput): Promise<ReconcileResult>
```

```ts
type IdentitySource =
  | 'webhook:user.created'
  | 'webhook:user.updated'
  | 'route:members-sync'
  | 'route:session-claim'
  | 'route:member-claim'
  | 'route:invite-accept'
  | 'route:story-invite-accept'
  | 'route:admin-page-load'
  | 'route:session-create'

interface IdentityReconcileInput {
  /** Clerk user id. The only provider-specific value; the natural key. */
  clerkUserId: string

  /** Which tenant this reconciliation is scoped to. Never inferred. */
  tenantId: string

  /** Which call site — drives audit metadata AND the name precedence rule. */
  source: IdentitySource

  /**
   * Authentication facts, as asserted by Clerk. Provider-normalised by the
   * caller (AuthUser from mapClerkUser, or the webhook's own payload
   * extraction) — this function never imports @clerk/*.
   *
   * `undefined` means "this call has no opinion". `null`/'' means "Clerk
   * reports no value" — which is NOT an instruction to delete.
   */
  verified: {
    email?: string | null
    phone?: string | null
    name?: string | null      // already joined firstName + lastName
  }

  /**
   * Identity the *app* collected directly, which Clerk may never have seen.
   * Exists because of §0.3: on the sign-in-transfer branch the typed name
   * never reaches Clerk, and dropping it would be a regression.
   */
  supplied?: {
    name?: string | null
  }

  /**
   * Path-specific membership intent. Deliberately narrow — reconciliation
   * decides identity fields; it does not decide business outcomes.
   */
  intent?: {
    /** Status to use *when creating a new members row only*. Default 'active'.
     *  GateView's self-service path is the only caller that passes anything
     *  else. Never applied to an existing row. */
    statusOnCreate?: MemberStatus
    /** Stamped on insert only, never overwritten. Fixes the null-source gap. */
    sourceOnCreate?: string
  }
}
```

### 1.2 What it deliberately does NOT take

- **A Clerk SDK `User` object.** The webhook has a snake_case JSON payload, not a
  `User`; server routes have the boundary's `AuthUser`. Taking a normalised
  struct keeps `@clerk/*` inside `services/auth/providers/clerk/**` (the Golden
  Rule) and makes the function trivially testable with plain objects.
- **An existing member/user row.** The function reads its own current state
  inside the same call. Passing a pre-read row would let a caller hand it stale
  data and would break the idempotency argument in §3, which depends on the read
  and the write being in one logical operation.
- **A Supabase client.** It resolves `getAdminClient()` itself, like every other
  function in `services/auth`.

### 1.3 Return

```ts
type ReconcileResult =
  | { ok: true; data: {
        userId: string
        memberId: string | null       // null when tenant membership was not requested
        createdUser: boolean
        createdMember: boolean
        applied: FieldWrite[]          // which fields changed, and why
        skipped: FieldSkip[]           // which fields were skipped, and why
      } }
  | { ok: false; status: number; error: string; stage: string }
```

`applied` / `skipped` are what makes the migration verifiable (§5.2) and what
gets logged to `audit_events` — every call emits one event with the field-level
decision record, presence-only (never raw PII, per `CLAUDE.md` rule 6).

---

## 2. Precedence rules — per field

The governing principle, from the brief: **Clerk owns authentication;
Supabase owns identity.** That splits the fields cleanly, and they do *not* all
behave the same way.

Two rules apply to every field and are stated once:

- **R0 — Absence is not deletion.** `undefined` (caller has no opinion) and
  `null`/`''` (source reports nothing) never overwrite an existing non-empty
  value. This single rule kills finding 4 (`MagicLinkCard` nulling `members.name`)
  and finding 9's `''` writes.
- **R1 — Empty string normalises to null on write.** Nothing ever persists `''`.
  Fixes the two live `users.name = ''` rows at the write path.

| Field | Table | Owner | Rule |
|---|---|---|---|
| `email` | `users`, `members` | **Clerk** | Clerk wins whenever it asserts a non-empty value, overwriting a different existing value. Absent/empty → no-op (R0). On 23505 (`users_email_unique`) → skip this field, log, continue. |
| `phone` | `users`, `members` | **Clerk** | Same as email. No unique constraint, so no collision case. |
| `name` | `users`, `members` | **Supabase** | Four-step ladder, see §2.1. |
| `status` | `members` | **Supabase** | Monotonic, see §2.2. Never set on an existing row by reconciliation except `invited → active`. |
| `role` | `members` | **Supabase** | **Never touched.** Admin-managed only. Not in the write set at all. |
| `tenant_id` | `members` | **Supabase** | Set on insert only. **Never updated** — see §2.3. |
| `user_id` | `members` | derived | Always set to the reconciled `users.id`. Fixes the historical null-`user_id` orphans. |
| `clerk_id` | `users`, `members` | **Clerk** | The natural key. Set on insert; never updated (a change means a different person). |
| `source` | `members` | **Supabase** | `intent.sourceOnCreate` on insert only. First-write-wins, never overwritten. |
| `invited_name` | `members` | — | **Never read, never written.** Out of scope by instruction. |
| `primer`, `token`, `used_at`, `auto_open`, `expires_at`, `revoked_at`, `opened_at`, `opens`, `invited_by`, `deleted_reason` | `members` | — | **Not in the write set.** These are invite-lifecycle fields owned by layer 2 (§4.1). |

### 2.1 `name` — the ladder

Name is the field where "Supabase owns identity" actually has teeth, and where a
blanket policy would be wrong. In precedence order:

1. **`supplied.name` non-empty → wins unconditionally.** The user typed it into
   our UI on this request. Highest-confidence signal we have, and the only way
   §0.3's sign-in-branch name survives.
2. **`verified.name` non-empty AND `source === 'webhook:user.updated'` → wins.**
   A `user.updated` event is a *deliberate rename* in Clerk's Manage Account UI.
   The brief says keep that UI, so renames through it must propagate. This is the
   one case where Clerk overwrites an existing Supabase name — and it is scoped
   to exactly the event that means "the human just changed this on purpose."
3. **Existing value is empty AND `verified.name` non-empty → fill.** First-write
   from a Clerk profile that already had a name. Not an overwrite.
4. **Otherwise → no-op.**

Rule 2 is the reason `source` is a required input rather than audit-only. Without
it, `user.created` and `user.updated` are indistinguishable, and every routine
webhook replay would clobber a name the member set through our own UI.

> **Note on `members.name` vs `invited_name`.** This design writes `members.name`
> and never touches `invited_name`, exactly as instructed. It therefore does not
> by itself fix the 27% invisible-name finding — `member-context.ts` still reads
> only `invited_name`. That is a **separate, deliberate follow-up** on the read
> side, and is called out in §7.2 so it does not get lost.

### 2.2 `status` — monotonic ladder

Reconciliation must never resurrect a member an admin removed. The permitted
transitions are the only ones it may make:

```
(no row) ──► intent.statusOnCreate ?? 'active'
invited  ──► active          (an invite was genuinely claimed — layer 2 asserts this)
```

Everything else is a no-op. In particular: `deleted`, `suspended`, and
`waitlist` are **terminal to reconciliation** — a signed-in user whose membership
was revoked does not get silently reactivated by logging in. `active → pending`
never happens.

> **Decision needed (§8.1):** `pending` — GateView's `claimMembership` writes it
> and nothing else recognises it (1 live row). This design can either keep it as
> a legal `statusOnCreate` or normalise it away. Needs your call; I have not
> assumed one.

### 2.3 `tenant_id` — never updated, and why that needs a schema change

Reconciliation resolves the member row by **`(clerk_id, tenant_id)`** and, on
miss, inserts a new one. It never updates `tenant_id` on an existing row.

That is the correct semantics, but it cannot be implemented safely today: with
only a global `UNIQUE (clerk_id)`, inserting a second membership for an existing
Clerk user in a different tenant raises 23505, and the current
`upsert(onConflict: 'clerk_id')` would instead silently relocate the row (§0.1).

**Prerequisite, and it is Jeff's to run in Studio** (`CLAUDE.md` rule 3 — CC does
not write migrations):

```sql
-- Replace the global constraint with a per-tenant one.
ALTER TABLE members DROP CONSTRAINT members_clerk_user_id_key;
CREATE UNIQUE INDEX members_tenant_clerk_unique
  ON members (tenant_id, clerk_id)
  WHERE clerk_id IS NOT NULL;

-- Optional tidy-up: users has two identical clerk_id constraints.
ALTER TABLE users DROP CONSTRAINT users_clerk_id_unique;   -- keep users_clerk_id_key
```

The partial `WHERE clerk_id IS NOT NULL` preserves today's behaviour for the 18
invited/waitlist rows that legitimately share a null `clerk_id`.

**This is safe to run before any code change** — it is strictly more permissive
than the current constraint for inserts and identical for the existing 26 rows
(0 cross-tenant clerk_ids today, §0.1). It is Phase 0 in §5.

---

## 3. Idempotency

The claim to prove: **for any input `x`, `f(f(x)) = f(x)`, and for two calls
`f(a)` and `f(b)` derived from the same underlying Clerk event, the final state
is the same regardless of order or interleaving.**

### 3.1 Every field rule is absolute or conditional-fill — never relative

Each rule in §2 is one of exactly two shapes:

- **Absolute:** "write `V`", where `V` is a pure function of the input. Applying
  it twice writes the same `V`. Idempotent by definition.
- **Conditional-fill:** "write `V` only if the current value is empty". After the
  first application the guard is false, so the second is a no-op — and even if it
  did run, `V` is unchanged.

**No rule is relative.** There are no increments, appends, toggles, or
read-modify-writes anywhere in the write set. This is the invariant that makes
the whole argument hold, and it is the rule any future field must obey. (For
contrast: `members.opens` in the invite-redirect route *is* relative — which is
exactly why invite-lifecycle fields are excluded from this write set, §4.1.)

### 3.2 The status ladder is a strict partial order

`invited → active` is the only transition, and `active` has no outgoing edge in
this function. A directed acyclic ladder with no cycles reaches a fixed point
after one application. Repeated calls cannot oscillate.

### 3.3 Row creation converges under concurrency

Both `users` and `members` resolution use the same three-step shape:

1. `SELECT` by natural key (`users.clerk_id`; `members (tenant_id, clerk_id)`).
2. On miss, `INSERT`.
3. **On 23505, re-`SELECT` and proceed down the update branch.**

Step 3 is what makes two simultaneous first-calls converge instead of one
failing: the loser of the insert race reads the winner's row and applies its
field rules to it, which by §3.1 produces the same result. This is not a novel
pattern — `acceptStoryInvite` already does exactly this and is proven in
production.

### 3.4 Interleaving is safe because of R0

The one case where ordering could matter: call A carries `supplied.name = 'Sarah'`
and call B carries `supplied.name = null` (the webhook, which has no supplied
name).

- A then B: A writes `'Sarah'`; B's null hits **R0** and is a no-op. → `'Sarah'`.
- B then A: B is a no-op; A writes `'Sarah'`. → `'Sarah'`.
- Interleaved: each field write is independent and the only non-no-op write in
  either order carries the same value. → `'Sarah'`.

**R0 is therefore load-bearing for idempotency, not merely for correctness.** It
is what makes the racing-handlers problem *harmless* rather than merely fixed —
which is the property the brief asks for. Without R0, the two orderings give
different answers and the race is still a race, just a tidier one.

### 3.5 What this does and does not guarantee

- **Guaranteed:** final row state converges regardless of order, interleaving, or
  repeat delivery. Clerk webhook retries become free.
- **Not guaranteed, and not claimed:** that both calls observe the same
  *intermediate* state, or that `applied`/`createdMember` are identical between
  the two callers. The loser of an insert race correctly reports
  `createdMember: false`. Callers must not branch business logic on
  `createdMember` — layer 2 (§4.1) determines "is this a new member" from its own
  token state, not from reconciliation's return. This is an explicit contract,
  and it is a change from how `acceptStoryInvite` currently derives `isNewMember`.

---

## 4. Where it gets called from

### 4.1 Two layers, and why scope is slightly wider than four functions

The brief names four functions. Walking the code, those four are the **identity**
half of a system that also has an **invite-claim** half — `acceptInvite`,
`acceptStoryInvite`, and `linkInvitedMember`'s lookup/stamp logic — which *also*
writes `members`. Leaving those untouched would not deliver "exactly one place
that decides what gets written to `members`."

The proposal is therefore a clean two-layer split:

- **Layer 1 — `reconcileIdentity`.** Owns `users` and the identity columns of
  `members` (`name`, `email`, `phone`, `user_id`, `clerk_id`, `tenant_id`,
  `status` per §2.2). One function, one write set.
- **Layer 2 — invite claim.** Owns token validation and the invite-lifecycle
  columns only (`token`, `used_at`, `revoked_at`, `source`, `primer`,
  `artifact_subscribers` grants). Calls layer 1 for the identity portion and
  stops writing identity fields itself.

This is a slightly larger scope than the literal four functions and I am flagging
it rather than assuming it. If you'd rather keep layer 2 exactly as-is for now,
the design still works — but the "single write path" claim would be qualified,
and `acceptInvite`'s orphan-delete/name-rescue logic would have to stay.

### 4.2 Path-by-path map

All 18 paths from the inventory report.

**Table A — authentication paths**

| # | Path | Calls `reconcileIdentity`? | Notes |
|---|---|---|---|
| 1 | Admin invite link → chat OTP | **Yes ×2** (webhook + client accept) — this is the racing pair §3.4 makes safe | Layer 2 (`acceptInvite`/`linkInvitedMember`) keeps token logic, delegates identity |
| 2 | Story invite link → chat OTP | **Yes ×2** (webhook + client accept) | Same; `acceptStoryInvite` keeps the subscriber grant |
| 3 | Chat `[ACCOUNT_CREATE:]` | **Yes** — via `/api/members/sync`, `source: 'route:members-sync'`, carries `supplied.name` | Replaces `syncMember` |
| 4 | `SaveChatCTA` | **Yes** — same route, same source | Replaces `syncMember` |
| 5 | GateView prebuilt modal | **Yes** — `/api/heirloom/members/claim`, `intent.statusOnCreate` per §8.1 | Replaces `claimMembership` + `ensureClerkUser` |
| 6 | ChatHeader sign-in modal | **Yes** — via path 10's claim call | Also closes finding 14 (see §7.1) |
| 7 | SBL admin sign-in page | **No** | Writes nothing; identity happens on the next `/admin` load (path 8) |
| 8 | `/admin` protected redirect | **Yes** — `app/admin/layout.tsx`, `source: 'route:admin-page-load'` | Replaces `syncUser`; **fixes the phone-only null return** |
| 9 | Anonymous session creation | **Yes, conditionally** — only when a Clerk session exists | Replaces `syncUser`; users-only (no `tenantId` → `memberId: null`) |
| 10 | Post-auth session claim | **Yes** | Replaces `ensureClerkUser` |

**Table B — `members` rows with no Clerk account**

| # | Path | Calls `reconcileIdentity`? | Notes |
|---|---|---|---|
| 11 | Tenant-admin invite creation | **No** | No Clerk user exists. `createMemberInvite` writes `invited_name`/`token`/`primer` — out of scope by instruction |
| 12 | Platform-admin invite creation | **No** | Same |
| 13 | Member collaborator invite | **No** | Same |
| 14 | Waitlist self-registration | **No** | No Clerk user; writes `email` + `status='waitlist'` only |

**Table C — identity mutation after the fact**

| # | Path | Calls `reconcileIdentity`? | Notes |
|---|---|---|---|
| 15 | Clerk "Manage account" edit | **Yes** — `source: 'webhook:user.updated'`, the one source where Clerk's name wins (§2.1 rule 2) | Replaces the webhook's inline upsert |
| 16 | Invite resend | **No** | Token rotation only; no identity fields |
| 17 | Status / role change | **No** | Admin authority, deliberately outside reconciliation (§2, `role` never touched) |
| 18 | Hard delete / `user.deleted` | **No** | Deletion is not reconciliation. Stays as-is; §2.2's terminal statuses ensure reconciliation can't undo it |

### 4.3 Confirmation: the four old functions do not survive

| Function | Callers today | Fate |
|---|---|---|
| `syncUser()` | `app/admin/layout.tsx`, `app/api/sessions/route.ts` | Both switched (paths 8, 9) → **file deleted** |
| `ensureClerkUser()` | 4 routes: story-invite accept, members/claim, invites/accept, sessions/[id]/claim | All switched (paths 1, 2, 5, 10) → **file deleted** |
| Webhook inline upsert | `app/api/webhooks/clerk/route.ts` | Replaced in place (paths 1, 2, 15) → **code deleted** |
| `linkInvitedMember()`'s upsert | called once, from the webhook | Identity half delegated; token-lookup half retained → **upsert deleted from the function** |
| `syncMember()` | `/api/members/sync`, webhook | Both switched (paths 3, 4, 15) → **file deleted** |
| `claimMembership()` | `/api/heirloom/members/claim` | Switched (path 5) → **file deleted** |

`syncMember` and `claimMembership` are not on your list of four but are members-
writing siblings of the same problem; leaving them would defeat the goal. Listed
explicitly so the scope is visible rather than assumed.

**Enforcement after cutover:** an ESLint `no-restricted-imports` rule making
`getAdminClient().from('users' | 'members')` outside
`services/auth/reconcile-identity.ts` an **error** — the same mechanism already
policing `@clerk/*` outside the provider boundary. Without this, path five
reappears in six months. (Layer-2 invite-lifecycle writes get a narrow, named
exemption.)

---

## 5. Migration plan — no big-bang

The ordering principle: **prove correctness against live data before changing any
write path**, then cut over in ascending order of blast radius, one path per PR,
each independently revertable.

### Phase 0 — schema prerequisite (Jeff, Studio)

§2.3's `(tenant_id, clerk_id)` unique index. Strictly more permissive than
today's constraint; zero code depends on it yet; safe to run in isolation and
safe to sit unused. **Blocks Phase 3 onward, not Phases 1–2.**

### Phase 1 — build it, unused

`reconcileIdentity` + full unit tests. Zero call sites. Cannot affect production
because nothing imports it. Merged and deployed on its own.

### Phase 2 — prove it against live data, read-only

A verification script that, for every one of the 26 clerk-linked members and 26
`users` rows, replays the current row through the new precedence rules **in dry-
run mode** and reports the diff it *would* apply. Expected output: a short,
explainable list — the 2 `name = ''` rows normalising to null, and nothing else.
Any unexplained diff is a design bug caught before a single production write.

This is the step that makes the rest of the migration safe, and it is why the
function returns `applied`/`skipped` rather than just `ok`.

### Phase 3 — lowest blast radius: `users`-only paths

Path 10 (`/api/sessions/[id]/claim`) first — it writes only `users`, has no
`members` involvement, and already degrades gracefully on failure by design.
Then path 9 (`/api/sessions` POST) and path 8 (`/admin` layout).

Ends with `syncUser` and `ensureClerkUser` having no callers.

### Phase 4 — `members`-writing routes, still synchronous

Paths 3 and 4 (`/api/members/sync`) — the highest-traffic member write, but
synchronous and client-observable, so a regression surfaces immediately on a
preview URL rather than silently in a webhook.

Then path 5 (`/api/heirloom/members/claim`), which needs §8.1 decided first.

### Phase 5 — the webhook

Highest risk and therefore last of the identity paths: asynchronous, retried by
Clerk, and the partner in every race. By this point its racing counterparts are
already on the new function, so cutting it over is what actually *closes* the
race rather than merely tidying it.

### Phase 6 — layer 2 (only if §4.1 is approved)

`acceptInvite` / `acceptStoryInvite` / `linkInvitedMember` delegate identity and
retain token logic. This is where `acceptInvite`'s orphan-delete and name-rescue
can finally be deleted — they exist solely to clean up after the racing writes
that no longer happen.

### Phase 7 — delete and enforce

Remove the six now-unused functions; add the ESLint rule; update
`System Docs/Utilities/Auth.md` and `CLAUDE.md`.

### Rollback posture

Every phase is one route swapping one function call. Revert is a one-line
revert per path, and because `reconcileIdentity` is strictly additive until
Phase 7, an old function is always still present to revert *to*. There is no
point in the sequence where both the old and new paths are writing the same
row concurrently — each path flips atomically.

---

## 6. What does NOT change

Explicitly confirmed in scope-out:

- **`invited_name`** — never read, never written by reconciliation. Remains
  write-once historical data set at invite creation. Unchanged in
  `createMemberInvite` and unchanged in `member-context.ts`.
- **The MEMBER CONTEXT read side.** `services/chat/server/member-context.ts` and
  `app/api/sage/route.ts`'s `resolveMemberId` read from Supabase, never Clerk —
  already the correct boundary. Not touched. (Its own separate findings —
  swallowed errors, missing `status` filter, no audit events — are unaffected by
  this work and remain open.)
- **`chat_session_context` / `getSessionContext`.** Unrelated mechanism, no
  identity involvement. Untouched.
- **Clerk's hosted UI.** Manage Account, sign-up/sign-in modals, `SignInPanel`,
  `UserButton` all stay. This is backend-only.
- **`useAuthFlow` and the Clerk OTP adapter.** No changes. §0.3's name behaviour
  is *preserved* by the `supplied.name` channel, not fixed in the adapter — the
  name still reaches Supabase and still doesn't overwrite an existing Clerk
  profile.
- **Invite minting, resend, revoke** (`createMemberInvite` and the admin routes),
  **role and status administration**, **hard delete**, **the waitlist**, and
  **marker/session-claim behaviour**.
- **Clerk as the source of truth for authentication** — session validity and
  verified email/phone. Reconciliation mirrors those into Supabase; it does not
  second-guess them.

---

## 7. Findings this does and does not close

### 7.1 Closed by this work

| Finding | How |
|---|---|
| 9 — four disagreeing `users` upserts | One function, one field set (the whole point) |
| 10 — racing handlers | §3.4 makes both orderings converge |
| 4 — `MagicLinkCard` nulls `members.name` | R0 — never overwrite non-empty with empty |
| `syncUser` writes `''` | R1 — empty normalises to null |
| `syncUser` returns null for phone-only users | Reconciliation has no email requirement |
| 12 (partial) — `source` null on most rows | `intent.sourceOnCreate` stamps self-serve paths |
| 14 — ChatHeader sign-up leaves no `members` row | Path 6 routes through reconciliation via path 10 |
| §0.1 — cross-tenant member relocation (latent) | Phase 0 constraint + never updating `tenant_id` |

### 7.2 Explicitly NOT closed — still open after this

- **The 27% invisible-name finding.** This is a *read-side* problem:
  `member-context.ts` reads `invited_name` and not `name`. Since `invited_name`
  is out of scope by instruction, that fix is a separate change. Flagging it here
  so it isn't assumed handled — reconciliation makes `members.name` reliably
  correct, which is a *precondition* for that fix, but not the fix.
- **`primer` prompt-injection delineation** (audit finding 2).
- **Missing `status` filter in `resolveMemberId`** (finding 3).
- **Swallowed errors and absent audit events in the sage path** (findings 6–8).
- **`/admin` vs `/platform` sign-in destination** (finding 13).
- **`/invite` not enforcing `expires_at`** (finding 15).
- **Vestigial: `primer_used_at`, `clerk_id_dev`, `getMemberId`** (finding 17).

---

## 8. Decisions I need from you before Gate 2

### 8.1 `status = 'pending'`

GateView's `claimMembership` writes it; nothing else recognises it; 1 live row.
Options:

- **(a) Keep it.** `intent.statusOnCreate: 'pending'` stays legal, and
  `VALID_STATUSES` / `PROTECTED_STATUSES` are widened to include it. Preserves
  current behaviour; formalises the gap.
- **(b) Normalise it away.** Self-service sign-ups create `status: 'active'` like
  every other path; the 1 live row is migrated by you in Studio. Simpler model,
  but it changes who is considered a member — a product decision, not a technical
  one.

I have not assumed either. **(a) is the lower-risk default** for a consolidation
change whose goal is "same behaviour, one path."

### 8.2 Layer 2 scope (§4.1)

Include `acceptInvite` / `acceptStoryInvite` / `linkInvitedMember` in the
delegation (Phase 6), or leave them writing identity fields for now? Including
them is what makes "exactly one write path" literally true and is what lets
`acceptInvite`'s orphan-reconciliation logic be deleted. Excluding them keeps the
change smaller.

### 8.3 Phase 0 timing

The schema change is yours to run in Studio. It is safe standalone and blocks
Phase 3 onward. Confirm you're happy with the constraint shape in §2.3 before I
start Phase 1, since the function's natural-key lookup is written against it.
