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

**Consequence: zero schema work.** Nothing for Jeff to do in Studio before this
ships — which matters, since schema migrations are his lane (CLAUDE.md rule 3)
and would otherwise gate the whole thing.

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
  source: 'api_members_sync' | 'clerk_webhook_sync_member'
        | 'link_invited_member' | 'sync_user' | 'accept_invite'
        | 'claim_membership' | 'accept_story_invite',
}
```

`source` is a bounded enum of path identifiers, not a free-text label — so
"which path did it" is a `group by` rather than a string match.

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

`console.log` keeps its role for live debugging but is scrubbed to the same
shape-only output, which closes **D9** in the same pass. The two are
complementary, not redundant: `audit_events` is the durable, queryable,
RLS-protected record; `console.log` is the ephemeral tail-the-deploy view.

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
  and metadata->>'source' = 'clerk_webhook_sync_member'
order by created_at desc;
```

Today that query returns zero rows and **must keep returning zero rows.** The
first row it ever returns is D3 going live, timestamped, attributed to the member,
naming the field — surfaced on the first occurrence rather than discovered later
by a forensic join.

Three properties make this work, and all three are requirements, not nice-to-haves:

1. **`identity.overwrite` is its own action**, so the query needs no metadata
   parsing and an alert can key on the action name alone.
2. **`source` distinguishes the webhook** from `/api/members/sync` and the other
   writers. Without it, legitimate user-typed overwrites (a member correcting
   their own name — a `value→value` transition we *want* to permit) would drown
   the signal.
3. **Hash equality suppresses no-ops** (§1.4). Without it this query returns a
   row per webhook delivery and is worthless.

**Instrumenting `syncMember`'s webhook-fallback call site
(`app/api/webhooks/clerk/route.ts:221-227`) is therefore in scope for the first
increment, even though D3 is currently latent.** It is the cheapest of the six
call sites — the value is already in hand — and skipping it because "D3 can't
fire today" reintroduces precisely the blind spot this gate exists to close.

Worth stating plainly: this does not *fix* D3. The fix is either subscribing
`user.updated` deliberately and making the write precedence-aware, or writing
sign-in names back to Clerk (`services/auth/providers/clerk/client.ts:162-178`
currently does this on the sign-up branch only). Tracking makes it **loud instead
of silent**, which is the goal of this gate.

---

## 3. Scope and effort

**Small, and deliberately independent of the reconciliation function.**

| Work | Where | Size |
|---|---|---|
| Three `AuditAction` values | `services/audit/types.ts` | trivial |
| `logIdentityWrite()` helper — classify transition, hash, emit | new file in `services/audit/` | ~60 lines |
| Shape-only hash/describe helper | same file, dependency-free like `errorCopy.ts` | ~20 lines |
| Call sites | 6 (see below) | 2–4 lines each |
| Scrub raw-PII `console.log`s (D9) | 4 files, ~12 call sites | mechanical |
| Unit tests | transition classification + no-PII assertion | ~10 cases |
| Schema | **none** | — |

Call sites: `syncMember` (`sync-member.ts:83-98` and its users leg `:55-64`),
`/api/members/sync` (`route.ts:30-47`), the webhook's `syncMember` fallback
(`webhooks/clerk/route.ts:221-227` — see §2), `linkInvitedMember`'s users upsert
(`members.ts:257-261`), `syncUser` (`sync-user.ts:19-29`), `claimMembership`
(`claim-membership.ts:53-61`).

A read-before-write is needed to know the `before` state. `syncMember`,
`syncUser`, and `linkInvitedMember` currently blind-upsert, so instrumenting them
adds one `select` per call. On the webhook path that is free (already
multi-query); on `/api/members/sync` it is one extra round trip on a
post-authentication call that is not latency-sensitive. **Not on the chat hot
path** — `/api/sage` reads identity, never writes it, so the per-turn budget in
CLAUDE.md's performance targets is untouched.

### Does this want the reconciliation function to be worth doing?

**No — and it should ship first, before the D1/D2 fixes.**

The reconciliation function would make this *easier* (one write path, one place to
instrument, no read-before-write since the function already holds both states).
But waiting for it inverts the dependency. This tracking is how we **verify the
D1 and D2 fixes actually worked**: ship it, watch `identity.cleared` for
`source = 'api_members_sync'` go from non-zero to zero, and the fix is proven
against production traffic rather than asserted from a unit test.

Ship-first also means the ~60-line helper is written against six messy call sites
rather than one clean one. That is the correct trade: the helper is small and
disposable, and when reconciliation lands it collapses to a single call inside
`writeIdentity()` with the six call-site invocations deleted.

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
   and never updated (that immutability *is* D2/D8). Instrumenting it would prove
   the invariant holds rather than assuming it — cheap, one extra call site.
   Recommend yes.
3. **Should `identity.cleared` be `outcome: 'failure'`?** It is a successful DB
   write of a bad value. Recording it as `success` is literally accurate but makes
   "show me identity problems" a two-clause query. Leaning `success` + the
   distinct action name, but flagging it as a genuine judgment call.
