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

### Piece B — one arbiter for invite/story-invite acceptance

This is Gate 1's Layer 2, re-scoped to what's actually still needed. Not an
active-defect fix — the name-loss symptom is patched — but real architectural
debt: two independently-maintained reconciliation strategies
(orphan-delete-then-rescue vs. 23505-retry) for the same race shape. Worth
being honest that this is a "should we" question, not a "must we" one.

**What it would do:** give `acceptInvite` and `acceptStoryInvite` a shared,
single, tested claim primitive — something like
`claimMembershipRow(tenantId, clerkUserId, supabaseUserId, { name, ... })`
in `services/members/` — that both the webhook path and the client-accept
path call, so there's one race-resolution strategy instead of two. It would
use `services/shared/identity.ts`'s existing primitives internally (not
reinvent them), and thread `IdentitySource`/`correlationId` through
`getAdminClient` the same way every other writer already does, so Gate 3's
audit trail keeps working without modification — exactly what that doc
predicted.

**Explicitly not in scope:** `linkInvitedMember`'s email-fallback path
(paths 3/4 in the inventory — self-serve, no invite token) stays on
`syncMember` as-is. Those defects are closed; touching that code now would be
scope creep against a working, tested path.

**Steps, gated the same way as before — one at a time, your approval between
each:**
1. Write the shared claim primitive, unused, full test coverage against both
   the "webhook wins" and "client wins" orderings (mirroring the idempotency
   argument from the original Gate 1 §3, which still holds — R0/R1 are
   already true of `services/shared/identity.ts`, I'd just be composing them
   at a higher level).
2. Switch `acceptInvite` to call it, `linkInvitedMember`'s webhook-fallback
   role unchanged, test old vs. new behavior matches on current data shape.
3. Switch `acceptStoryInvite` to call it, same verification.
4. Delete the now-redundant orphan-rescue/23505-retry logic each function
   carried independently.

**Question back to you before I start on this piece specifically:** given
it's debt-reduction rather than a live fix, do you want it now, or deferred
alongside Tier 5 ("Clerk at the front door only" — moving `members` lookups
off `clerk_id` as a live join key), which the other engagement already
flagged as needing "its own dedicated scoping pass" and touches a lot of the
same invite-acceptance code? They're not the same piece of work, but they'd
conflict if built in parallel on separate branches.

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

## 5. Still pending from my last report, not part of this plan's numbering

The `onConflict: 'clerk_id'` regression in `services/auth/sync-member.ts:140`
— Postgres has no arbiter matching that column set since
`members_clerk_user_id_key` was dropped in favor of the tenant-scoped index.
You didn't address this in your last message. I haven't touched it. It's a
one-line fix (`onConflict: 'tenant_id,clerk_id'` plus adding `tenant_id` to
the pre-check), independent of everything above, and I'd recommend it happen
regardless of how Piece B is sequenced — every day it sits is a day
`syncMember`'s `members` leg silently fails. Say the word and I'll put it on
its own branch.

---

**Waiting on:** approval of Piece A, a decision on Piece B's timing (now vs.
deferred alongside Tier 5), and a yes/no on the regression fix. I'd suggest
Piece A and the regression fix can both go now, independently, regardless of
what you decide on Piece B.
