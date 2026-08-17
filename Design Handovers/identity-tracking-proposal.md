# Identity Write Tracking — Proposal

**Status:** proposal, not built. Gate 3 of the Heirloom identity audit.
**Companion:** `System Docs/Identity System.md` (defect register D1–D10).
**Date:** 2026-08-16

---

## The problem this solves

D10: there is no `AuditAction` for a successful identity-field write. D9: what
logging exists writes raw PII to `console.log`, which is ephemeral and
unqueryable. Between them, **none of D1–D8 left a trace.**

The four damaged rows behind D1 were found by joining `members` to `users` and
noticing a fingerprint. We know *that* it happened. We do not know when, how
often, via which path, or whether it is still happening. That is the gap.

The goal is narrow and diagnostic: if a name goes missing again, answer *which
path did it, when, and what was the transition* — from a query, in minutes, not
from a forensic join and a code read.

---

## 1. Design decisions

### 1.0 Capture mechanism: a `BEFORE UPDATE` trigger, not app-level select-then-log

**This reverses the first draft of this proposal, which captured `before` with an
application-level `select` at each of six call sites. That was wrong. Two
objections killed it, and both are correct.**

**Objection 1 — it's a race.** Between the `select` and the write, another caller
can write the same row, so the logged `before` may already be stale. This is not
theoretical in this codebase. `Known Gaps.md` documents the exact race in the
exact flow we are instrumenting: `MagicLinkCard`'s `/api/members/sync` and
`chatStore`'s `acceptInvite` fire off the same Clerk session-activation event
"with no ordering between them," and that race caused **active data loss** until
the orphan-name-rescue fix (PR #368). A second documented race exists between the
`user.created` webhook and the client's own `acceptStoryInvite` (handled via
23505). An audit trail whose `before` value is unreliable precisely when writes
are concurrent is unreliable precisely when it matters most.

**Objection 2 — it's a convention, not a guarantee.** It requires every current
and future call site to remember select-then-log. That is structurally the same
failure that produced D1: `syncMember` held a `!== undefined` guard whose
implications its callers didn't reason through. Rebuilding the audit layer on
per-call-site discipline reproduces the defect class it exists to catch.

**Recommendation: a `BEFORE UPDATE` trigger on `members` and `users`** capturing
`OLD`/`NEW` and inserting into `audit_events`. Transactionally consistent — no
window. Unbypassable — covers write paths nobody has written yet, including ones
added by a future session that never reads this document. Both objections are
structural, and only a structural answer closes them.

#### Honest cost of the trigger

Four real costs, none of which I think outweigh race-freedom and unbypassability:

1. **The trigger cannot see `source`.** Every write arrives as a fresh PostgREST
   request on the service-role key — `getAdminClient()`
   (`services/auth/supabase-admin.ts:3`) creates a new client per call, and
   `services/crm/sessions.ts:16` shadows it with a second local copy. `current_user`
   is `service_role` for all six paths, and no transaction spans the app's intent
   and the write. So the trigger knows *what changed*, not *who changed it*.
   **This is the cost I weighted most heavily, because §2's D3 tripwire was
   specified to depend on `source` — see §2 for how that query degrades.**
   Recoverable later via a `db-pre-request` hook reading a custom header into a
   GUC; deliberately not in the first increment.
2. **Not visible in git.** `Database Schema.md` records that RLS policies are
   "Studio-managed and not tracked in git" — a trigger inherits that. The audit
   mechanism becomes unreviewable in PRs and invisible to future sessions.
   **Mitigated:** the trigger's full DDL is specified in this document and
   belongs in `System Docs/Database Schema.md` when applied. That keeps it
   reviewable as *documentation* without CC writing a migration file
   (CLAUDE.md rule 3). Visibility is a convention problem, not an inherent one.
3. **Not unit-testable.** plpgsql cannot be exercised by the Vitest suite Gate 4
   is meant to establish. This is a genuine, unmitigated loss — Gate 4 must cover
   it with an integration assertion (perform a write, assert the audit row
   appeared) against a preview deploy instead of a unit test.
4. **Failure mode inverts.** `logEvent` is deliberately fire-and-forget
   (`void logEvent(...)`) everywhere; a trigger makes audit a *hard dependency* of
   the identity write, so a throwing trigger fails a sign-up. **Mitigated:**
   wrap the trigger body in `EXCEPTION WHEN OTHERS THEN RETURN NEW` so audit
   failure degrades to silence rather than blocking authentication — matching the
   fail-open posture `getMemberContext` already uses.

#### What I got wrong, stated plainly

The first draft led with "zero schema work — nothing for Jeff to do in Studio"
as a headline benefit. That was reasoning from convenience, not correctness. The
trigger **does** require Jeff to apply plpgsql in Studio, and that scheduling
dependency is a real cost — it is simply a smaller cost than an audit trail that
can race and that every future call site can forget. Correctness wins.

**Where the app-level approach would still be right:** if `source` attribution
were load-bearing enough that losing it defeated the purpose. It isn't, at this
data volume — see §2. If Heirloom were at 10,000 members with continuous
identity churn, `identity.overwrite` without `source` would be too noisy to read
and the calculus would flip back.

### 1.1 No new table — `audit_events.changes` already exists

`audit_events` has a `changes jsonb` column documented as `{before, after}`,
`AuditEventInput` already exposes it (`services/audit/types.ts:198`), and
`logEvent` already writes it (`services/audit/audit.ts:25`). Six call sites use
it today; the closest precedent is
`app/api/platform/members/status/route.ts:96` —
`changes: { before: { status: m.status }, after: { status } }`.

The table is append-only (BEFORE UPDATE/DELETE triggers raise), RLS'd (tenant
admins read own, platform admins read all), and already carries `actor_id`,
`clerk_user_id`, `tenant_id`, `correlation_id`, `outcome`, and `created_at`.

**Consequence: no new table, and no change to `audit_events` itself.** The
trigger writes into the existing structure using the existing column semantics.
The schema work in §1.0 is confined to the trigger function and its two
`BEFORE UPDATE` bindings — additive, reversible with a `DROP TRIGGER`, and
touching no existing column or constraint.

### 1.2 Three actions, not one — make the dangerous transitions queryable by name

The transition class goes in the **action name**, not in metadata. Querying
`action = 'identity.cleared'` is a cheap indexed lookup and is what an alert
would key on; parsing a metadata field to find the dangerous subset is not.

| New `AuditAction` | Transition | Tripwire for |
|---|---|---|
| `IDENTITY_WRITE: 'identity.write'` | absent → value | Normal fill. High volume, low signal. |
| `IDENTITY_OVERWRITE: 'identity.overwrite'` | value → **different** value | **D3** (see §2) |
| `IDENTITY_CLEARED: 'identity.cleared'` | value → absent (`null` or `''`) | **D1, D4, D5** |
| — | value → same value | **Not logged.** See §1.4 |

Dot-separated lowercase, matching the existing `member.*` / `block.*` convention
in `services/audit/types.ts:92-107`.

`outcome: 'failure'` carries write errors on any of the three, so the existing
success/failure column does that job — no fourth action needed.

**Why `cleared` is separate from `overwrite`:** D1 nulls a value; D3 replaces it.
Different root causes, different fixes, different urgency. Collapsing them into
one action means the D1 signal is buried in D3 volume and vice versa.

### 1.3 What gets logged

```
action:         identity.write | identity.overwrite | identity.cleared
outcome:        success | failure
tenant_id       ─┐
clerk_user_id    ├─ already on AuditEventInput, no new plumbing
actor_id         │
correlation_id   │  ← ties a write to the HTTP request that caused it
created_at      ─┘     (x-correlation-id middleware header)
target_type:    'member' | 'user'
target_id:      the row id

changes: {
  before: { name: { present: true,  len: 11, hash: 'a3f91c2e' } },
  after:  { name: { present: false, len: 0,  hash: null } }
}

metadata: {
  field:  'name' | 'email' | 'phone' | 'invited_name',
  store:  'members' | 'users',
  source: null,        // ← see below; deferred to increment 2
}
```

`actor_id` / `clerk_user_id` / `correlation_id` are populated by `logEvent` today
but **not available to a trigger** — same root cause as `source` (§1.0 cost 1).
In the trigger-based first increment they are null; `target_id` (the row id),
`created_at`, and the `changes` hashes carry the diagnosis. `clerk_id` is
available on the row itself, so the trigger can populate `clerk_user_id` from
`NEW.clerk_id` — the one attribution field that survives, and the one that
matters most for correlating against `auth_events`.

**`source` in increment 2.** A Supabase `db-pre-request` hook can read a custom
HTTP header into a transaction-local GUC (`set_config('app.identity_source', …)`)
which the trigger then reads via `current_setting('app.identity_source', true)`.
That needs a header threaded through `getAdminClient` — which today is two
divergent copies (`services/auth/supabase-admin.ts:3` and the shadowing local at
`services/crm/sessions.ts:16`), so consolidating those is a prerequisite. Worth
doing; not worth blocking increment 1 on.

### 1.4 How this avoids the PII problem — and why the hash is load-bearing

CLAUDE.md is explicit: *"Never log raw PII … category/length/presence only,
following the pattern in `resolveMediaContext`'s `sanitizeFailureReason`."*
That pattern's principle is a **bounded classifier, not string scrubbing** —
regex-stripping an open-ended value is inherently incomplete, so you map to a
known-safe shape instead. Applied here: no name, email, or phone value is ever
written, to `audit_events` or to `console.log`.

But presence-and-length alone is not sufficient, and this is the one place the
obvious design fails:

> Every Clerk webhook delivery re-writes `members.name` with the Clerk-derived
> name. Almost always it is **the same name** — a harmless no-op. Shape-only
> logging cannot tell that apart from a real clobber: two 11-character names are
> identical by shape. So `identity.overwrite` would fire on every delivery,
> the real clobber would be one row in hundreds of benign ones, and we would have
> rebuilt the silent-failure pattern with extra steps.

**Therefore: an 8-hex-char prefix of `SHA-256(value.trim().toLowerCase())`.**
Not reversible, not PII, but *equality-comparable*. That single property is what
makes the whole scheme work:

- same hash before/after → no-op → **not logged at all** (kills the volume problem)
- different hash → a real change → logged as `identity.overwrite`
- `present: false` after → logged as `identity.cleared`

In the trigger this is
`substring(encode(digest(lower(trim(NEW.name)), 'sha256'), 'hex') for 8)`,
which is why `pgcrypto` is a prerequisite (§3).

`console.log` keeps its role for live debugging but is scrubbed to the same
shape-only output — **that part stays in application code**, since it is about
what the app prints, not what the DB records. It closes **D9** in the same pass.
The two are complementary, not redundant: `audit_events` is the durable,
queryable, RLS-protected record; `console.log` is the ephemeral tail-the-deploy
view.

---

## 2. D3 mitigation — explicit

D3 is a confirmed code defect that is **not reachable today** only because
`user.updated` is not subscribed on the `heirloom.2bl.ai` Clerk endpoint. That is
a dashboard checkbox. Whoever ticks it — months from now, for an unrelated reason,
possibly not us — turns D3 live instantly, and under today's instrumentation it
would be exactly as silent as D1 was.

**The tripwire.** A Clerk-derived write that replaces an existing non-null
identity value has a unique, precise signature:

```sql
select created_at, clerk_user_id, target_id, metadata->>'field'
from audit_events
where action = 'identity.overwrite'
order by created_at desc;
```

Today that query returns zero rows and **must keep returning zero rows.** The
first row it ever returns is D3 going live, timestamped, attributed to the member
via `clerk_user_id`, naming the field — surfaced on the first occurrence rather
than discovered later by a forensic join.

**This is where losing `source` costs us, and it is survivable.** The original
query filtered `source = 'clerk_webhook_sync_member'` to separate the webhook's
overwrite from a legitimate user-typed correction. Without it the query returns
both classes. At current volume that is fine — 41 members, 2 with any name
divergence at all, tens of identity writes per week — so `identity.overwrite` is
a low-single-digit signal that a human can read directly. Distinguishing the two
classes takes one correlation step: join `clerk_user_id` + `created_at` against
`auth_events`, which records every webhook delivery with its `svix_event_id`. A
webhook-caused overwrite lands within milliseconds of a `user.updated` delivery;
a user-typed one does not.

So the degradation is **automatic attribution → one join away**, not
**detected → undetected**. That is an acceptable trade for closing the race and
the bypass, and it reverses cleanly once increment 2 lands `source`.

Two properties remain hard requirements:

1. **`identity.overwrite` is its own action**, so the query needs no metadata
   parsing and an alert can key on the action name alone.
2. **Hash equality suppresses no-ops** (§1.4). Without it this query returns a
   row per webhook delivery and is worthless — and note this matters *more* under
   the trigger, which sees every write including the many that change nothing.

**Under the trigger this stops being a scoping decision at all** — which is an
argument in the trigger's favour that the app-level draft could not make. The
first draft had to argue for deliberately instrumenting
`app/api/webhooks/clerk/route.ts:221-227` despite D3 being latent, on the grounds
that skipping it would reintroduce the blind spot. A trigger covers that path
whether or not anyone remembers it exists, along with every other path that ever
writes `members.name`. The judgment call disappears.

Worth stating plainly: this does not *fix* D3. The fix is either subscribing
`user.updated` deliberately and making the write precedence-aware, or writing
sign-in names back to Clerk (`services/auth/providers/clerk/client.ts:162-178`
currently does this on the sign-up branch only). Tracking makes it **loud instead
of silent**, which is the goal of this gate.

---

## 3. Scope and effort

**Smaller than the app-level version in application code, larger in Jeff's lane.**

| Work | Where | Owner | Size |
|---|---|---|---|
| Trigger function — classify transition, hash, insert | Supabase Studio (plpgsql) | **Jeff** | ~50 lines |
| `BEFORE UPDATE` bindings on `members`, `users` | Supabase Studio | **Jeff** | 2 statements |
| Confirm `pgcrypto` is enabled (`digest()`) | Supabase Studio | **Jeff** | prerequisite check |
| Three `AuditAction` values (for the read side / typing) | `services/audit/types.ts` | CC | trivial |
| Document the trigger DDL | `System Docs/Database Schema.md` | CC | small |
| Scrub raw-PII `console.log`s (D9) | 4 files, ~12 call sites | CC | mechanical |
| Integration test — write a row, assert the audit row | Gate 4 | CC | see §1.0 cost 3 |
| **Application call sites** | — | — | **zero** |

The headline change: **no call sites.** The six write paths
(`syncMember` and its users leg, `/api/members/sync`, the webhook's `syncMember`
fallback, `linkInvitedMember`'s users upsert, `syncUser`, `claimMembership`) are
instrumented without being touched, along with any path added later.

The read-before-write cost from the first draft is gone entirely — the trigger has
`OLD` in hand for free, so there is no extra round trip anywhere. **Still not on
the chat hot path**: `/api/sage` reads identity but never writes it, so CLAUDE.md's
per-turn performance budget is untouched either way.

`BEFORE UPDATE` only. Inserts are excluded deliberately: a new row has no prior
value to clobber, so `INSERT` traffic is pure volume with no diagnostic content
for D1–D8. Worth revisiting only if a defect ever turns on insert-time values.

### Does this want the reconciliation function to be worth doing?

**No — and the trigger makes that answer stronger than the app-level version could.**

The first draft argued this should ship before the D1/D2 fixes so those fixes are
verifiable against production traffic. That still holds. But it also conceded that
the helper would be written against six messy call sites and later collapse into
`writeIdentity()` — throwaway work. The trigger has no such disposal cost: it sits
below the application entirely, so it survives reconciliation unchanged and will
instrument `writeIdentity()` on day one without modification.

That inverts the sequencing argument in the trigger's favour. Ship it first,
watch `identity.cleared` for `members.name` go from non-zero to zero as D1 is
fixed, and keep the same instrument through reconciliation.

---

## 4. What this deliberately does not do

- **No alerting or dashboard.** Queries only, at this stage. The admin health
  panel is a reasonable later home; wiring it now is scope creep, and the
  diagnostic value is already there without it.
- **No backfill.** The four rows damaged by D1 predate this and cannot be
  reconstructed from it. Repair is a separate decision — and recoverable, since
  D1's fingerprint is precisely that `users.name` survived.
- **No retention policy.** `audit_events` is append-only with no TTL today;
  identity writes are low-volume (tens per week) and do not change that calculus.
- **No `chat_sessions` instrumentation.** Those three write paths are all
  write-once guarded and verified correct (`System Docs/Identity System.md` §5).
  Adding them would be volume without signal.

---

## 5. Open questions for review

1. **Hash prefix length.** 8 hex chars (32 bits) makes an accidental collision
   between two different names on the same member row negligible while keeping
   rows readable. 16 is free if we would rather not think about it again.
2. **Does `invited_name` need tracking?** Written once by `createMemberInvite`
   and never updated (that immutability *is* D2/D8). Under the trigger this is
   free — it is a column on a table already being watched, so including it costs
   one more branch in the function and proves the invariant rather than assuming
   it. Recommend yes.
3. **Should `identity.cleared` be `outcome: 'failure'`?** It is a successful DB
   write of a bad value. Recording it as `success` is literally accurate but makes
   "show me identity problems" a two-clause query. Leaning `success` + the
   distinct action name, but flagging it as a genuine judgment call.
4. **Does the trigger also cover non-Heirloom tenants?** `members` and `users` are
   shared tables. A trigger fires for every tenant, not just Heirloom. That is
   almost certainly what we want (the defect class isn't Heirloom-specific), but
   it means volume and RLS visibility extend to tenants whose identity flows we
   have not audited. Recommend covering all tenants and setting `tenant_id` from
   `NEW.tenant_id` so the existing per-tenant RLS on `audit_events` scopes reads
   correctly.
5. **Is `BEFORE UPDATE` alone sufficient, or do we want `BEFORE INSERT` too?**
   Argued for update-only in §3. Flagging it because it is the one scoping
   decision the trigger does *not* make automatic.
