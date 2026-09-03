# Identity Write Tracking — Proposal

**Status:** proposal, not built. Gate 3 of the Heirloom identity audit.
**Companion:** `System Docs/Identity System.md` (defect register D1–D10).
**Date:** 2026-08-16 (rev 3 — source attribution built into increment 1)

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

## Revision history

**rev 1** proposed capturing `before` with an application-level `select` at each
of six call sites. Rejected: it races, and it depends on every future call site
remembering the pattern.

**rev 2** replaced that with a `BEFORE UPDATE` trigger, and accepted losing
`source` attribution (deferred to a second increment) as the price.

**rev 3 (this document)** builds `source` into the first increment. Deferring it
meant knowingly shipping a design that degrades at scale and then redoing it.

---

## 1. Design decisions

### 1.0 Capture: a `BEFORE UPDATE` trigger, not app-level select-then-log

**Objection 1 — app-level capture is a race.** Between the `select` and the write,
another caller can write the same row, so the logged `before` may already be
stale. Not theoretical here: `Known Gaps.md` documents the exact race in the exact
flow we are instrumenting — `MagicLinkCard`'s `/api/members/sync` and `chatStore`'s
`acceptInvite` fire off the same Clerk session-activation event "with no ordering
between them," and that race caused **active data loss** until PR #368. A second
documented race exists between the `user.created` webhook and the client's own
`acceptStoryInvite` (handled via 23505). An audit trail whose `before` is
unreliable under concurrency is unreliable exactly when it matters.

**Objection 2 — app-level capture is a convention, not a guarantee.** It requires
every current and future call site to remember select-then-log. That is
structurally the same failure that produced D1: `syncMember` held a
`!== undefined` guard whose implications its callers didn't reason through.

**Therefore: a `BEFORE UPDATE` trigger on `members` and `users`,** capturing
`OLD`/`NEW` and inserting into `audit_events`. Transactionally consistent — no
window. Unbypassable — covers write paths nobody has written yet.

Scope decisions, carried from review:
- **`BEFORE UPDATE` only.** A new row has no prior value to clobber, so `INSERT`
  traffic is volume with no diagnostic content for D1–D8.
- **All tenants.** `members`/`users` are shared; the defect class is not
  Heirloom-specific. `tenant_id` comes from `NEW.tenant_id` so the existing
  per-tenant RLS on `audit_events` scopes reads correctly.
- **Fail-open.** The trigger body is wrapped in
  `EXCEPTION WHEN OTHERS THEN RETURN NEW`, so audit failure degrades to silence
  rather than blocking authentication — matching `getMemberContext`'s posture and
  preserving `logEvent`'s existing fire-and-forget semantics.

### 1.1 Attribution: the trigger reads request headers directly

rev 2 claimed the trigger cannot know `source`, because every write is a fresh
PostgREST request on the service-role key with no application context. That was
too pessimistic — **there is application context, it just isn't the connection.**

PostgREST sets a small set of **transaction-local GUCs** at the start of every
request transaction, including `request.headers` (the full request header set as
JSON). A trigger firing inside that transaction can read them:

```sql
current_setting('request.headers', true)::json ->> 'x-identity-source'
```

**No `db-pre-request` hook is needed.** I floated one in rev 2; it turns out to be
an unnecessary indirection, and a costly one — `db_pre_request` is a *project-level*
PostgREST setting, so one function would run before **every** request to the API
for every table and role. Reading the header directly in the trigger keeps the
blast radius to the two tables we are instrumenting. Fewer moving parts, no global
config, and nothing for a future unrelated change to trip over.

**Version check before building.** PostgREST exposes headers as
`request.headers` (a JSON object) in v9+; older versions used per-header GUCs
(`request.header.x-identity-source`). Confirm which form this project's PostgREST
serves before writing the function — a one-line
`select current_setting('request.headers', true);` from the SQL editor settles it.

### 1.2 Getting the header there: one consolidated `getAdminClient`

There are currently **two** implementations:

| Where | Shape | What it does |
|---|---|---|
| `services/auth/supabase-admin.ts:3` | `getAdminClient()` | `createClient(url, key)` — no params |
| `services/crm/sessions.ts:16` | `getAdminClient(label: string)` | local shadow; `label` only feeds a `console.log` env check |

The shadow's `label` argument is a dead convention — it names the caller and then
throws that away. Consolidating gives it a real job.

**Consolidated shape:**

```ts
// services/auth/supabase-admin.ts
export type IdentitySource =
  | 'api_members_sync' | 'clerk_webhook' | 'sync_member' | 'link_invited_member'
  | 'accept_invite'    | 'accept_story_invite' | 'sync_user' | 'claim_membership'
  | 'members_admin'    | 'unattributed'

export function getAdminClient(
  source: IdentitySource = 'unattributed',
  ctx?: { correlationId?: string | null },
) {
  return createClient(url!, key!, {
    global: { headers: {
      'x-identity-source': source,
      ...(ctx?.correlationId && { 'x-correlation-id': ctx.correlationId }),
    }},
  })
}
```

Three things make this work:

1. **`source` is optional with a safe default.** ~60 existing call sites keep
   compiling and log as `'unattributed'`. Only the identity paths need updating.
2. **The client is created per call, not memoised.** That existing (mildly
   wasteful) pattern is what makes per-caller headers possible at all — a shared
   singleton could not carry a per-caller label. Worth preserving deliberately
   rather than "optimising" later.
3. **`correlationId` rides along**, which recovers a field rev 2 wrote off. The
   `x-correlation-id` middleware header already exists and already populates
   `audit_events.correlation_id` elsewhere; forwarding it lets the trigger tie an
   identity write to the HTTP request that caused it, and thence to every other
   audit event from the same request.

**`syncMember` must propagate, not stamp.** `/api/members/sync` writes `users`
itself and then calls `syncMember`, which writes both tables. If `syncMember`
hard-coded `'sync_member'`, the route's call and the webhook's call would be
indistinguishable — and telling those two apart is precisely what the D3 tripwire
needs. So `SyncMemberInput` gains a `source` field that its two callers set
(`'api_members_sync'`, `'clerk_webhook'`), defaulting to `'sync_member'`.

**What kind of guarantee this is.** Capture is *structural* — the trigger fires
whether or not anyone remembers it. Attribution is *best-effort with a safe
default* — a caller that forgets to pass `source` still produces a complete audit
row, just labelled `'unattributed'`. That is the right split: a forgotten label
degrades a query filter; it never loses the record. This is deliberately **not**
the same dependency rev 1 was rejected for, where forgetting lost the data.

**Writes that bypass PostgREST** — Studio SQL editor, `psql`, MCP `execute_sql` —
have no `request.headers`, so `source` resolves to `'direct_sql'`. That is a
feature: a manual data edit is exactly the kind of write worth labelling as such.

### 1.3 No new table — `audit_events.changes` already exists

`audit_events` has a `changes jsonb` column documented as `{before, after}`,
`AuditEventInput` already exposes it (`services/audit/types.ts:198`), and
`logEvent` already writes it (`services/audit/audit.ts:25`). Six call sites use it
today; the closest precedent is `app/api/platform/members/status/route.ts:96` —
`changes: { before: { status: m.status }, after: { status } }`.

The table is append-only (BEFORE UPDATE/DELETE triggers raise), RLS'd, and already
carries `actor_id`, `clerk_user_id`, `tenant_id`, `correlation_id`, `outcome`, and
`created_at`.

**No change to `audit_events` itself.** The schema work is confined to the trigger
function and its two bindings — additive, reversible with a `DROP TRIGGER`,
touching no existing column or constraint.

### 1.4 Three actions, not one — dangerous transitions queryable by name

The transition class goes in the **action name**, not in metadata. Querying
`action = 'identity.cleared'` is a cheap indexed lookup and is what an alert would
key on; parsing metadata to find the dangerous subset is not.

| New `AuditAction` | Transition | Tripwire for |
|---|---|---|
| `IDENTITY_WRITE: 'identity.write'` | absent → value | Normal fill. High volume, low signal. |
| `IDENTITY_OVERWRITE: 'identity.overwrite'` | value → **different** value | **D3** (§2) |
| `IDENTITY_CLEARED: 'identity.cleared'` | value → absent (`null` or `''`) | **D1, D4, D5** |
| — | value → same value | **Not logged.** See §1.6 |

Dot-separated lowercase, matching the existing `member.*` / `block.*` convention.
`outcome: 'failure'` carries write errors, so no fourth action is needed.

**Why `cleared` is separate from `overwrite`:** D1 nulls a value; D3 replaces it.
Different root causes, different fixes, different urgency. Collapsing them buries
the D1 signal in D3 volume and vice versa.

### 1.5 What gets logged

```
action:         identity.write | identity.overwrite | identity.cleared
outcome:        success | failure
tenant_id:      NEW.tenant_id
clerk_user_id:  NEW.clerk_id
correlation_id: from the x-correlation-id header  ← recovered, see §1.2
target_type:    'member' | 'user'
target_id:      NEW.id
created_at:     now()

changes: {
  before: { name: { present: true,  len: 11, hash: 'a3f91c2e' } },
  after:  { name: { present: false, len: 0,  hash: null } }
}

metadata: {
  field:  'name' | 'email' | 'phone' | 'invited_name',
  store:  'members' | 'users',
  source: 'api_members_sync' | 'clerk_webhook' | 'sync_member'
        | 'link_invited_member' | 'accept_invite' | 'accept_story_invite'
        | 'sync_user' | 'claim_membership' | 'members_admin'
        | 'unattributed' | 'direct_sql',
}
```

`source` is a bounded enum, not free text, so "which path did it" is a `group by`
rather than a string match. `actor_id` remains null in increment 1 — it could ride
a header the same way, but no current defect needs it.

### 1.6 How this avoids the PII problem — and why the hash is load-bearing

CLAUDE.md is explicit: *"Never log raw PII … category/length/presence only,
following the pattern in `resolveMediaContext`'s `sanitizeFailureReason`."* That
pattern's principle is a **bounded classifier, not string scrubbing** — regex-
stripping an open-ended value is inherently incomplete, so you map to a known-safe
shape instead. Applied here: no name, email, or phone value is ever written, to
`audit_events` or to `console.log`.

But presence-and-length alone is not sufficient, and this is the one place the
obvious design fails:

> Every Clerk webhook delivery re-writes `members.name` with the Clerk-derived
> name. Almost always it is **the same name** — a harmless no-op. Shape-only
> logging cannot tell that apart from a real clobber: two 11-character names are
> identical by shape. So `identity.overwrite` would fire on every delivery, the
> real clobber would be one row in hundreds of benign ones, and we would have
> rebuilt the silent-failure pattern with extra steps.

**Therefore: an 8-hex-char prefix of `SHA-256(value.trim().toLowerCase())`.** Not
reversible, not PII, but *equality-comparable*:

- same hash before/after → no-op → **not logged at all** (kills the volume problem)
- different hash → a real change → `identity.overwrite`
- `present: false` after → `identity.cleared`

In the trigger this is
`substring(encode(digest(lower(trim(NEW.name)), 'sha256'), 'hex') for 8)` — hence
`pgcrypto` as a prerequisite (§3). This matters *more* under a trigger than it did
app-side, since the trigger sees every write including the many that change nothing.

`console.log` keeps its role for live debugging but is scrubbed to the same
shape-only output — **that part stays in application code**, since it is about what
the app prints, not what the DB records. It closes **D9** in the same pass.

---

## 2. D3 mitigation — explicit

D3 is a confirmed code defect that is **not reachable today** only because
`user.updated` is not subscribed on the `heirloom.2bl.ai` Clerk endpoint. That is
a dashboard checkbox. Whoever ticks it — months from now, for an unrelated reason,
possibly not us — turns D3 live instantly, and under today's instrumentation it
would be exactly as silent as D1 was.

**The tripwire.** A Clerk-derived write replacing an existing non-null identity
value has a unique, precise signature — and with §1.1's attribution built in, the
query is exact from day one, with no `auth_events` correlation step:

```sql
select created_at, clerk_user_id, target_id,
       metadata->>'field', changes
from audit_events
where action = 'identity.overwrite'
  and metadata->>'source' = 'clerk_webhook'
order by created_at desc;
```

Today that returns zero rows and **must keep returning zero rows.** The first row
it ever returns is D3 going live — timestamped, attributed to the member, naming
the field, and separated from legitimate user-typed corrections rather than mixed
in with them.

Three properties make this work, all requirements:

1. **`identity.overwrite` is its own action** — no metadata parsing, and an alert
   can key on the action name alone.
2. **`source` distinguishes the webhook** from `/api/members/sync` and the other
   writers. Without it, legitimate overwrites (a member correcting their own name —
   a `value→value` transition we *want* to permit) drown the signal. This is the
   property rev 2 deferred and rev 3 restores.
3. **Hash equality suppresses no-ops** (§1.6). Without it the query returns a row
   per webhook delivery and is worthless.

**Under the trigger this stops being a scoping decision at all.** rev 1 had to
argue for deliberately instrumenting `app/api/webhooks/clerk/route.ts:221-227`
despite D3 being latent. A trigger covers that path whether or not anyone
remembers it exists, along with every other path that ever writes `members.name`.

This does not *fix* D3. The fix is either subscribing `user.updated` deliberately
and making the write precedence-aware, or writing sign-in names back to Clerk
(`services/auth/providers/clerk/client.ts:162-178` does this on the sign-up branch
only). Tracking makes it **loud instead of silent**, which is this gate's job.

---

## 3. Scope and effort

| Work | Where | Owner | Size |
|---|---|---|---|
| Confirm `pgcrypto` enabled; confirm `request.headers` GUC form (§1.1) | Studio | **Jeff** | prerequisite |
| Trigger function — classify, hash, read header, insert | Studio (plpgsql) | **Jeff** | ~60 lines |
| `BEFORE UPDATE` bindings on `members`, `users` | Studio | **Jeff** | 2 statements |
| Consolidate the two `getAdminClient`s; add `source` + headers | `services/auth/supabase-admin.ts`, `services/crm/sessions.ts` | CC | ~30 lines |
| Thread `source` through the identity paths | 6 call sites + `SyncMemberInput` | CC | 2 lines each |
| Three `AuditAction` values | `services/audit/types.ts` | CC | trivial |
| Document trigger DDL + `source` enum | `System Docs/Database Schema.md` | CC | small |
| Scrub raw-PII `console.log`s (D9) | 4 files, ~12 sites | CC | mechanical |
| Integration test (§4) | Gate 4 | CC | see below |

**Consolidation is the only non-trivial application change,** and it is worth doing
on its own merits — two divergent service-role client factories is a latent
inconsistency regardless of this proposal. The `console.log` env check in the
`sessions.ts` shadow either moves into the shared factory or is dropped; its
comment says it was kept only to "preserve the routes' env-check logging verbatim."

The read-before-write round trip from rev 1 is gone entirely — the trigger has
`OLD` for free. **Still not on the chat hot path:** `/api/sage` reads identity but
never writes it, so CLAUDE.md's per-turn performance budget is untouched.

### Does this want the reconciliation function to be worth doing?

**No — and it should ship before the D1/D2 fixes.**

This tracking is how we **verify those fixes actually worked**: ship it, watch
`identity.cleared` where `source = 'api_members_sync'` go from non-zero to zero,
and the fix is proven against production traffic rather than asserted from a unit
test.

Unlike rev 1's helper — which would have been written against six messy call sites
and then thrown away — the trigger sits below the application entirely. It survives
reconciliation unchanged and will instrument `writeIdentity()` on day one without
modification. The `source` enum simply gains one value.

---

## 4. Testing note (hands off to Gate 4)

plpgsql cannot be exercised by Vitest. This is the one unmitigated cost of the
trigger approach and Gate 4 owns it:

- **Integration:** perform a real identity write against a preview deploy, assert
  the expected `audit_events` row appears with the right action, `source`, and
  hash transition. This is the only way to prove the trigger and the header
  plumbing work end to end.
- **Unit (Vitest):** `getAdminClient` sets the expected headers for a given
  source; `SyncMemberInput.source` propagates from both callers. These are the
  parts that live in application code and *are* reachable.
- **Explicitly not unit-testable:** transition classification and hashing, since
  both now live in the trigger.

---

## 5. What this deliberately does not do

- **No alerting or dashboard.** Queries only. The admin health panel is a
  reasonable later home; wiring it now is scope creep.
- **No backfill.** The four rows damaged by D1 predate this. Repair is a separate
  decision — and recoverable, since D1's fingerprint is that `users.name` survived.
- **No retention policy.** `audit_events` is append-only with no TTL; identity
  writes are low-volume (tens per week) and do not change that.
- **No `chat_sessions` instrumentation.** Those three paths are write-once guarded
  and verified correct (`System Docs/Identity System.md` §5). Volume without signal.
- **No `actor_id`.** Could ride a header like `correlationId`; no current defect
  needs it.

---

## 6. Open questions for review

1. **Hash prefix length.** 8 hex chars (32 bits) makes an accidental collision
   between two different names on the same row negligible while keeping rows
   readable. 16 is free if we would rather not think about it again.
2. **Does `invited_name` need tracking?** Written once by `createMemberInvite` and
   never updated — that immutability *is* D2/D8. Under the trigger it is free (a
   column on a table already watched), and it proves the invariant rather than
   assuming it. Recommend yes.
3. **Should `identity.cleared` be `outcome: 'failure'`?** It is a successful DB
   write of a bad value. `success` is literally accurate but makes "show me
   identity problems" a two-clause query. Leaning `success` + the distinct action
   name, but it is a genuine judgment call.
4. **Should `'unattributed'` be allowed to persist?** The safe default keeps ~60
   call sites compiling, but it also means a forgotten label is invisible. An
   alternative is periodically querying `metadata->>'source' = 'unattributed'` on
   identity actions and treating any hit as a gap to close. Recommend that as a
   review habit rather than a build-time constraint.
