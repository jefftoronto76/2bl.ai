# Identity reconciliation — replan

**Status:** proposal. Nothing implemented. Supersedes the parts of
`identity_reconciliation_design_2026-08-16.md` (Gate 1) noted below —
that doc is not deleted, just partially overtaken by shipped work.
**Date:** 2026-09-14.
**Reads:** `identity_reconciliation_design_2026-08-16.md` (the original Gate 1
design), `System Docs/Identity System.md` (current state, defect register
D1–D10), `Design Handovers/identity-tracking-proposal.md` (Gate 3, the audit
trigger), `Design Handovers/identity-remaining-work-sequencing-proposal.md`,
`Design Handovers/identity-endstate-goals-proposal.md`,
`Design Handovers/heirloom-signup-signin-fixes-proposal.md`. All read in full
before writing this.

---

## 0. What changed, in one paragraph

Between 2026-08-16 and 2026-09-04, a separate engagement (branch
`claude/heirloom-identity-audit-htyd8g`, PRs #448–#461, all merged to `main`)
closed most of the concrete failures the Aug 16 design was built to fix — but
through a different mechanism than "one owning function." It built
`services/shared/identity.ts` (stateless null/undefined-disambiguating
primitives, used by the existing ~11 independent writers) and a
database-trigger-based audit system (Gate 3) that logs every `members`/`users`
write regardless of which code path caused it. Three of your four original
"known concrete failures" are now closed; the fourth is narrowed but not
closed. Full accounting in §1.

## 1. Where your four original failures actually stand

| Failure (your brief) | Status | Evidence |
|---|---|---|
| `member-context.ts` reads only `invited_name` | **Fixed** — D2, `3cde3ed` | `resolveMemberName()` — `name` first, `invited_name` fallback |
| `syncUser()` writes `''` instead of `null` | **Fixed** — D4, `e87379b` | Routed through `setIdentityField` |
| Sign-in-transfer branch drops the typed name before Clerk | **Fixed differently** | `syncToClerk` flag + `updateClerkUserFirstName()` now push the name to Clerk on that branch too — a bidirectional-sync strategy, not Gate 1's two-channel read strategy, but the loss itself is closed |
| Invited signup races two handlers | **Narrowed, not closed** | The *symptom* (name loss) is fixed — `acceptInvite` now takes `name` directly (confirmed live, `members.ts:428`, caller at `invites/accept/route.ts:62`), so the field lands regardless of which writer wins. The *structure* remains: `acceptInvite`'s orphan-delete-then-rescue and `acceptStoryInvite`'s 23505-retry are two different, independently-written patches for the same underlying race — two writers, not one |

## 2. The core question, and why it's already answered

Gate 1 asked: should there be a single function every identity write funnels
through? The Gate 3 design doc — written by the other engagement, independent
of this one — asked itself the identical question and answered it directly:

> *"Does this want the reconciliation function to be worth doing? No — and it
> should ship before the D1/D2 fixes... [the trigger] survives reconciliation
> unchanged and will instrument `writeIdentity()` on day one without
> modification. The `source` enum simply gains one value."*

Two things follow from that:

1. **A future single-write-path function is compatible with everything
   shipped**, not blocked by it. The trigger doesn't care which app code wrote
   the row, only that `x-identity-source` was set on the request.
2. **The specific defects that motivated "one function" in the first
   place — null/undefined ambiguity, inconsistent empty-string handling, no
   audit trail — are already closed**, by primitives and a trigger rather than
   consolidation. Rebuilding a repo-wide `reconcileIdentity()` now to close
   defects that are already closed would be refactor risk with no defect to
   show for it — the opposite of what `CLAUDE.md`'s Flexibility Over
   Convenience principle asks ("the test is whether a decision closes a real
   door, not whether a future scenario can be imagined").

**So I'm not proposing to build Gate 1's `reconcileIdentity()` as originally
scoped**, across all ten Table-A paths. I looked for a live defect it would
close beyond what's already closed, and didn't find one.

**What I am proposing** is narrower, targets the one thing that's still
genuinely open (§1's fourth row), and includes the one locked decision from
Gate 1 that nothing has touched (`status='pending'`).

## 3. Proposed plan — two independent pieces

### Piece A — `status='pending'`, per your locked decision

Unaffected by anything shipped. Confirmed still true in code: `VALID_STATUSES`
and `PROTECTED_STATUSES` in `app/api/platform/members/status/route.ts` (lines
13, 17) still don't include `'pending'`. One row in production holds it
(`claimMembership`, `services/auth/claim-membership.ts`).

**Steps:**
1. Add `'pending'` to `VALID_STATUSES`.
2. Decide whether `'pending'` belongs in `PROTECTED_STATUSES` alongside
   `'deleted'` — i.e., should a bulk status change be allowed to move a
   pending row without confirmation the same as any other, or does "pending"
   deserve the same guard "deleted" gets? My read: no — `'deleted'` is
   protected because it's a one-way door; `'pending'` isn't. Recommend
   leaving `PROTECTED_STATUSES` as-is and only widening `VALID_STATUSES`.
3. Test: the platform status route accepts `'pending'` as a target status and
   as a source row's current status.

Trivial, no dependencies, no interaction with the rest of this doc. Can ship
on its own.

### Piece B — atomic claim for `acceptInvite` and `linkInvitedMember`

**Corrected scope, 2026-09-14 — supersedes the "shared claim primitive"
framing above.** That framing was wrong, and it matters: a shared function
called from two request handlers does not close a race, because sharing code
is not the same as synchronizing execution. It would have reduced
duplication while leaving the actual concurrency hazard exactly as open as
it is today. Caught before any code was written, when asked directly whether
it would close the race.

**The real problem, verified against current code
(`services/members/members.ts`):** both `acceptInvite` (428–627) and
`linkInvitedMember` (230–410) do `SELECT` the invited row, then
`UPDATE ... WHERE id = <that id>` — unconditional, no re-check of `used_at`
at write time. Two concurrent callers can both pass the `SELECT`, both
believe they're the acceptor, both write. Worse: the code's own comment
(`members.ts:568`) already documents a live failure mode — if `syncMember`
creates an orphan row for this `clerk_id` in the gap between the orphan-
delete step and the final stamp, the stamp hits the `(tenant_id, clerk_id)`
unique index and fails outright, a real 500 to the user, in an unlucky but
reachable interleaving.

**The actual fix — an atomic conditional `UPDATE`, in both functions:**
fold the "is this still claimable" check into the `UPDATE`'s own `WHERE`
clause instead of a prior, separate `SELECT`:

```ts
const { data, error } = await supabase
  .from('members')
  .update({ clerk_id, user_id, status: 'active', source: 'invite', used_at, updated_at })
  .eq('token', token)          // or .eq('id', memberId) for linkInvitedMember,
  .eq('tenant_id', tenantId)   // which already resolved the row via its own
  .is('used_at', null)         // token/email lookup
  .is('revoked_at', null)
  .select('id, name')
  .maybeSingle()
```

Postgres's own row lock decides who wins a concurrent `UPDATE` to the same
row — no advisory lock, no RPC, no new mechanism. Whichever caller's
statement reaches Postgres first commits; the second blocks, re-evaluates
its `WHERE` against the now-committed row, matches zero rows, and `data`
comes back empty. **The loser then treats "zero rows" as "already claimed
elsewhere" — a success, not a failure** — instead of performing an
independent write. This is the actual close: not less code, but a different
kind of write.

**Two things stay separate, deliberately:**
- A cheap pre-check `SELECT` remains, but only to gate orphan cleanup (never
  delete another `clerk_id`'s row for a garbage or cross-tenant token) and
  to fail fast on an invalid token — it is never used to decide the claim
  itself. The claim's own `WHERE` is authoritative regardless of whether the
  pre-check's snapshot is stale by the time it's acted on.
- The name-fill (fill-only-when-null) runs as its own small guarded
  follow-up `UPDATE ... WHERE id = ? AND name IS NULL`, after the claim
  succeeds — not folded into the claim's `SET`, since the claim's own
  `RETURNING` needs to reflect the *pre-claim* name to decide correctly
  whether a fill is even needed.

**Symmetric orphan cleanup — the second real gap this closes.**
`linkInvitedMember` never had the orphan-delete step `acceptInvite` has;
only one of the two racing writers defended against the collision its own
comment describes. Adding it to `linkInvitedMember` is safe without an
`acceptInvite`-style `skipOrphanCleanup` escape hatch: `linkInvitedMember`'s
own lookup (`status = 'invited' AND used_at IS NULL`) can never match an
already-established member's row, so the "this might be a real, established
membership, not a race artifact" ambiguity `skipOrphanCleanup` exists for
doesn't arise here.

**A bounded, single retry on `23505`** (the orphan reappearing in the gap
between cleanup and the claim) in both functions — not a new pattern,
`acceptStoryInvite` already does exactly this for the identical error code.

**Explicitly not in scope:** `acceptStoryInvite` — not part of this pass.
`linkInvitedMember`'s email-fallback path stays as the same lookup logic,
just feeding the new atomic claim instead of an unconditional update.
`syncMember`/`/api/members/sync` — untouched; those defects are already
closed.

**Verification plan:** every existing behavioral assertion in
`services/members/members.test.ts`'s `acceptInvite`/`linkInvitedMember`
suites carries forward (mocks rewritten for the new call shape, not the
expectations), plus new tests specifically proving the race is closed: a
claim that matches zero rows returns success with
`claimed_by_concurrent_call: true` in the audit metadata rather than
attempting its own write, and a `23505` on the claim retries exactly once
before failing.

## 4. Explicitly not proposed

- **A repo-wide `reconcileIdentity()` replacing `syncUser`/`ensureClerkUser`/
  `syncMember`/`claimMembership`/the webhook's inline logic.** §2.
- **Re-deciding D3** (Clerk `user.updated` would clobber a Supabase-set name)
  — already registered, already decided dormant/not-scheduled by the other
  engagement, still correct. Not reopening it.
- **Tier 5** ("Clerk at the front door only") — explicitly flagged elsewhere
  as its own pass. Piece B above touches adjacent code but is not that pass.
- **Any change to `invited_name`, MEMBER CONTEXT's read side, or Clerk's
  hosted UI** — same scope-out as the original Gate 1 design, still correct.

## 5. Status

- **The `onConflict: 'clerk_id'` regression** (`services/auth/sync-member.ts:140`)
  — fixed and shipped separately, **PR #474**, its own branch
  (`claude/fix-sync-member-onconflict`), independent of this doc.
- **Piece A** (`status='pending'`) — approved 2026-09-14. Built, tested,
  **PR #478** (`claude/status-pending-widen`), open, awaiting review.
- **Piece B** — approved 2026-09-14, corrected scope above (atomic
  conditional `UPDATE`, not a shared function — that framing was wrong and
  wouldn't have closed the race; caught before any code was written). Built,
  tested, **PR #477** (`claude/invite-accept-atomic-claim`), open, awaiting
  review. Proceeded without deferring to Tier 5: this fix is small,
  self-contained to `acceptInvite`/`linkInvitedMember`, and closes a real,
  currently-reachable failure mode (the 500 the pre-fix code's own comment
  described) — worth doing regardless of when Tier 5's larger "Clerk at the
  front door only" pass happens.

All three PRs are independent and can merge in any order — none touch the
same code as another.
