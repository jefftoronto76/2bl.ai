# Identity System — Test Plan & Baseline

**Status:** proposal, no tests written. Gate 4 of the Heirloom identity audit.
**Companions:** `System Docs/Identity System.md` (defects D1–D10),
`Design Handovers/identity-tracking-proposal.md` (Gate 3 trigger + attribution).
**Date:** 2026-08-16

---

## 1. Existing coverage — corrected

The brief referred to "the 40 existing tests on `member-context.ts`/`index.test.ts`."
That attribution is off, and it matters, because it points at the wrong module:

| File | `it()` | Covers |
|---|---:|---|
| `services/members/members.test.ts` | **40** | `createMemberInvite`, `validateMemberToken`, `linkInvitedMember`, `acceptInvite`, `hardDeleteMember` |
| `services/chat/server/member-context.test.ts` | 14 | `getMemberContext` |
| `services/chat/server/index.test.ts` | 8 | stop detection, `isFirstTurn` computation |
| `services/auth/sync-member.test.ts` | 4 | `syncMember` users-row resolution + failure paths |

The 40 belong to **`members.ts`**, not `member-context.ts`. `member-context.ts`
has 14 and `index.test.ts` has 8 — 22 between them. Total identity-adjacent
coverage today is 66 cases across four files.

### The blind spot that let D2 ship

`member-context.test.ts` has 14 tests and all 14 pass against the defective code.
Every fixture in the file sets `invited_name` and **not one sets `name`**:

```
:73   { id: 'member-1', primer: '…', invited_name: 'Sarah', email: …, phone: … }
:90   { …,              primer: null, invited_name: 'Sarah', … }
:105  { …,              primer: '…',  invited_name: 'Sarah', … }
:122  { …,              primer: null, invited_name: null,    email: '…' }
:138  { …,              primer: null, invited_name: null,    email: null, phone: null }
:164  { …,              primer: null, invited_name: 'Sarah', … }
```

**The fixtures encode the bug.** They were written from the implementation rather
than from the intended behaviour, so they assert that the code does what it does.
Adding cases without retrofitting these six fixtures leaves the trap in place —
so fixture repair is a required part of D2's work, not a tidy-up.

This is the single most useful lesson in this plan and it generalises: for every
new case below, the fixture must be able to *distinguish* correct from current
behaviour. A test that passes before and after a fix has tested nothing.

### What is genuinely well covered

`acceptInvite`'s orphan-name rescue has 4 dedicated tests (rescue, existing name
not overwritten, null orphan name, multiple orphans). That is the standard the
rest of this plan aims at, and it is why `acceptInvite` is on Gate 1's
verified-correct list rather than its defect list.

---

## 2. Per-defect coverage

Priority follows Gate 1: **D1 and D2 are live and actively damaging data.**

### D1 — `syncMember` lets `null` through (4 rows damaged)

**Where:** `services/auth/sync-member.test.ts` — the existing harness already
captures upsert payloads via `getMembersUpsertCalls()` / `getUsersUpsertCalls()`,
so no new scaffolding is needed. This is the highest-value single test in the plan.

| # | Input | Assertion |
|---|---|---|
| 1 | `syncMember({ name: null })` | members payload **omits** `name` |
| 2 | `syncMember({ name: undefined })` | members payload omits `name` |
| 3 | `syncMember({ name: '' })` | members payload omits `name` |
| 4 | `syncMember({ name: 'Bob' })` | members payload has `name: 'Bob'` |
| 5 | same four, users leg | identical semantics on `users` |

Cases 1–3 fail today; 4 passes. Test 1 is the defect.

**Route level** (`app/api/members/sync/route.ts`): body `{ name: '' }` and
`{ name: null }` must reach `syncMember` as `undefined`, not `null`. Also assert
the users/members asymmetry is gone — today `if (suppliedName)` guards `users`
while `members` is written unconditionally, which is the fingerprint that found
the 4 damaged rows.

**Trigger level** (the two reachable callers, both of which send an empty name):
- `MagicLinkCard.tsx:127-132` — mounting while already signed in must not POST a
  name-clearing body. Precedent exists for this component shape
  (`MessageList.invitePrefill.test.tsx`, `ChatHeader.profileDropdownOutsideClick.test.tsx`).
- `SaveChatCTA.tsx:48` → `chatStore.tsx:1150` — `claimAllSessions(undefined)` must
  not serialise to `{ name: null }`.

### D2 — `getMemberContext` reads `invited_name`, never `name` (12 members)

**Where:** `services/chat/server/member-context.test.ts`, plus the fixture repair above.

| # | Row | Assertion |
|---|---|---|
| 1 | `{ name: 'Sarah', invited_name: null }` | "Member's name is Sarah." — **fails today** |
| 2 | `{ name: 'Sarah Chen', invited_name: 'Sarah' }` | uses `Sarah Chen` (precedence) — **fails today** |
| 3 | `{ name: null, invited_name: 'Sarah' }` | uses `Sarah` (fallback preserved) |
| 4 | `{ name: null, invited_name: null }` | returns null (unchanged) |
| 5 | case 2, first turn | `[NAME: Sarah Chen]` — marker uses the same resolved value |
| 6 | select-list assertion | the query requests `name` at all |

Case 6 is worth having explicitly: D2 is as much a *missing column in the select*
as a wrong variable, and a test that only checks the output could be satisfied by
a fix that reads a stale field.

**Precedence must match the two surfaces that already get it right** —
`transfer/route.ts:117` and `TransferModal.tsx:81` both use `name ?? invited_name`.
See §3 for making that a shared, single-source contract.

### D3 — Clerk-derived overwrite (latent, not reachable)

**Not unit-testable as a fix, because there is no fix.** D3's remedy (precedence-
aware webhook writes, or writing sign-in names back to Clerk) is unscoped. Testing
it now would assert behaviour nobody has decided on.

**Covered instead by the Gate 3 tripwire as a standing invariant:**

```sql
select count(*) from audit_events
where action = 'identity.overwrite' and metadata->>'source' = 'clerk_webhook';
```

Must return **0**. Added to the live-invariant set (§5) rather than the Vitest
suite. If `user.updated` is ever subscribed, this is what catches it — which is
exactly the design intent from Gate 3.

One unit test *is* worth writing: `syncMember` invoked with
`source: 'clerk_webhook'` propagates that label to `getAdminClient` (§4), since the
tripwire is worthless if the label doesn't arrive.

### D4 — `syncUser` writes `users.name = ''` (2 rows damaged)

**Where:** new `services/auth/sync-user.test.ts` (none exists).
Clerk user with no `firstName`/`lastName` → users upsert payload **omits** `name`.
Currently writes `''`. Mirror `ensure-clerk-user.ts:20-26`, which is the correct
implementation of the same logic and can serve as the expected-behaviour reference.

### D5 — `linkInvitedMember` writes `users.email = ''`

**Where:** `services/members/members.test.ts`, existing `linkInvitedMember`
describe block (`:334`).
- called with `email: ''` (the webhook's `email ?? ''`) → users upsert omits `email`
- called with `email: 'A@B.com'` → written lowercased, once
- normalisation is consistent with the webhook's own users upsert
  (`route.ts:133` writes raw case; `members.ts:259` lowercases — two writes,
  two normalisations, one request)

### D6 — `claimMembership` undocumented status (1 row, path near-dead)

**Where:** new `services/auth/claim-membership.test.ts`.
Insert payload's `status` is a documented enum value; existing row → no-op
(characterisation, documenting that it never propagates a changed name).
Low priority — 1 row, created 2026-06-10, none since.

### D7 — chat-captured identity never reaches `members`

**Characterisation only for now.** Assert `persistVisitorName` writes
`chat_sessions` and nothing else, documenting the boundary. Becomes a real
behavioural test only if we decide to propagate (Gate 2 §3.1 point 5).

### D8 — Clerk rename never reaches `invited_name`

Same root cause as D2; covered by D2 cases 2 and 3. No separate tests.

### D9 — raw PII in logs

**Where:** a shared spy helper, applied across `member-context.ts`, `session.ts`,
`members.ts`, and the Clerk webhook.

Spy on `console.log`/`console.error`, run each function with fixture PII
(`'Sarah Chen'`, `'sarah@example.com'`, `'+15551234567'`), then assert **no logged
string contains any fixture value**. Cheap, high-coverage, and it fails loudly the
next time someone adds a convenient debug line — which is how D9 accumulated.

`member-context.ts:143-151`'s `resultPreview: result.slice(0, 200)` is the worst
case (name, email, phone *and* primer in one string) and should be its own case.

### D10 — no audit coverage

Integration, not unit — see §4.

---

## 3. Baseline suite

The thing to run before and after any future identity change. Two design rules:

**Assert the contract, not the call sites.** Table-driven cases over a shared
matrix, so a new writer is covered by adding a row rather than a file:

| Input value | Expected column behaviour |
|---|---|
| `'Sarah'` | written |
| `undefined` | untouched — caller has no opinion |
| `null` | untouched — **the D1 semantic** |
| `''` | untouched — never a valid identity value (D4, D5) |
| `'  '` | untouched after trim |

Run against every writer that touches an identity field: `syncMember` (both legs),
`linkInvitedMember`, `syncUser`, `ensureClerkUser`, `claimMembership`,
`createMemberInvite`, `acceptInvite`, `acceptStoryInvite`.

**One precedence source.** Extract the `name ?? invited_name` rule into a single
exported helper and have `member-context.ts`, `transfer/route.ts:117`, and
`TransferModal.tsx:81` all use it. Then the precedence tests attach to the helper,
and D2 becomes structurally unrepeatable rather than repeatedly caught. Today the
rule is written out three times and disagrees with itself once — which *is* D2.

**Where it lives:** `services/**/*.identity.test.ts`, runnable as
`npx vitest run identity` alongside the existing `npm test` (`vitest run`, 137 test
files today). No new tooling.

---

## 4. What is not unit-testable

Honest split. Vitest cannot reach any of the following.

### The Gate 3 trigger (plpgsql)

The single unmitigated cost of the trigger approach, flagged when it was chosen.
Covered by **integration assertions against a Vercel preview** (CLAUDE.md rule 2 —
runtime verification happens on preview, not local dev):

| # | Action | Expected `audit_events` row |
|---|---|---|
| 1 | Update a member's `name` null → `'Sarah'` | `identity.write`, correct `target_id`, `after.hash` set |
| 2 | Update `'Sarah'` → `'Sarah Chen'` | `identity.overwrite`, both hashes present and different |
| 3 | Update `'Sarah'` → `null` | `identity.cleared` |
| 4 | Update `'Sarah'` → `'Sarah'` | **no row** (no-op suppression, §1.6 of Gate 3) |
| 5 | Any of the above via `/api/members/sync` | `metadata.source = 'api_members_sync'` |
| 6 | Same write from Studio SQL editor | `metadata.source = 'direct_sql'` |
| 7 | Write with `x-correlation-id` set | `correlation_id` populated |
| 8 | Force the trigger to throw | write still succeeds (fail-open) |

Cases 4, 5 and 8 are the ones that would actually catch a broken build: no-op
suppression is what keeps the D3 tripwire readable, source attribution is what
makes it precise, and fail-open is what keeps a bad trigger from blocking sign-up.

### Application-side, *is* unit-testable (§3 of Gate 3)

- `getAdminClient(source)` sets `x-identity-source`; `correlationId` sets `x-correlation-id`
- the consolidated factory behaves identically to both implementations it replaces
- `SyncMemberInput.source` propagates from both callers rather than being stamped

### Genuinely needs live/manual verification

- **Webhook ordering and races.** The `/api/members/sync` ↔ `acceptInvite` race is
  real (it caused the PR #368 data loss) but is a timing property of two
  independent network calls. Mocked ordering proves nothing about production.
- **`user.updated` subscription state.** A Clerk dashboard fact. Re-check whenever
  webhook config changes; the §5 invariant is the backstop.
- **PostgREST `request.headers` GUC form** (Gate 3 §1.1) — one SQL-editor query,
  a build prerequisite rather than a test.

---

## 5. Live-data invariants

Unit tests cannot detect **already-damaged rows**, and every defect in Gate 1 was
found this way rather than by a test. These are the regression probe, run before
and after any identity change. Full SQL in `System Docs/Identity System.md` §6.

| Invariant | Today | Target |
|---|---:|---|
| `members.name` null while `users.name` set (D1) | **4** | 0, and non-increasing |
| `users.name = ''` (D4) | **2** | 0, non-increasing |
| `users.email = ''` (D5) | 0 | stays 0 |
| `members.status = 'pending'` (D6) | **1** | non-increasing |
| `identity.overwrite` from `clerk_webhook` (D3) | 0 | **stays 0** |
| `identity.*` with `source = 'unattributed'` | n/a | reviewed, not enforced |

**Removed from this table (PR #448 review):** the two D2 rows this list
originally carried — `name` set with `invited_name` null, and
`name <> invited_name` — were diagnostic queries for finding pre-fix damage,
not ongoing invariants. Once D2 shipped (`getMemberContext` reading `name`
correctly), both are the **expected, healthy** shape: the first is any
self-service member (never had an `invited_name` to begin with), the second
is exactly what a legitimate rename produces. A "target: 0" on either would
flag healthy rows forever and could never be satisfied. Cross-checking D2's
fix belongs in the read-path tests in §2, not here.

The last row is the review habit agreed in Gate 3 — a non-zero count means a write
path exists that nobody labelled, which is worth knowing even though it does not
block anything.

---

## 6. Sequencing

1. **Fixture repair on `member-context.test.ts`** — before any D2 code change, so
   the new cases genuinely fail first.
2. **D1 + D2 unit tests** — written to fail, then the fixes land against them.
3. **Gate 3 trigger + integration assertions** — per Gate 3, this ships *before*
   the D1/D2 fixes so those fixes are verifiable against production traffic. The
   §5 invariants are the proof: `identity.cleared` for `source = 'api_members_sync'`
   should go from non-zero to zero.
4. **Baseline matrix + precedence helper (§3)** — once D1/D2 are fixed, so the
   matrix encodes settled semantics rather than aspirational ones.
5. **D4, D5, D6, D9** — alongside whatever touches those files next; none is
   urgent on its own.

## 7. Estimate

| Group | Cases | Notes |
|---|---:|---|
| D1 unit | ~9 | reuses `sync-member.test.ts` harness |
| D1 component | 2 | established precedent for this shape |
| D2 unit + fixture repair | ~6 new, 6 repaired | repair is required, not optional |
| D4 / D5 / D6 | ~7 | two new files |
| D9 PII sweep | ~4 | shared spy helper |
| Baseline matrix | ~40 | table-driven, 8 writers × 5 inputs |
| Trigger integration | 8 | manual against preview, not Vitest |
| **Net-new unit** | **~66** | roughly doubles identity coverage |

Existing 66 cases stay, minus the 6 `member-context` fixtures which are repaired
rather than replaced.
