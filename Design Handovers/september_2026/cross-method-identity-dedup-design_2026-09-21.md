**Status:** proposal, no code written. Not urgent as a general fix — low
volume (1–2 confirmed duplicate `members` rows to date) — but Allie's
specific account is a real, known instance and should be fixed for her
directly, independent of whether/when the general mechanism gets built.

**Companions:** `System Docs/Identity System.md` §3.2 (records this as an
explicit out-of-scope exclusion from the 2026-08/09 reconciliation work,
not a missed goal of it — "no shared identity key exists to dedupe on...
Reconciliation does not solve it and should not be blocked on it"),
`System Docs/Known Gaps.md`'s 2026-08-13 entry (the original finding — one
real member, two active `members` rows, six weeks apart, one per contact
method), `Design Handovers/test-plans/identity-test-plan.md` (Gate 4 — does
not cover this scenario; its 18 rows test the 8 defects that *were* fixed,
not cross-method dedup).

# Cross-Method Identity Dedup — Design Proposal

## The problem

A real person can end up with two separate `members` rows in the same
tenant if they sign up once via one contact method (email) and again via
another (phone) — Clerk issues two unrelated `clerk_id`s for what it has
no way to know is the same human, and nothing in this codebase's write
paths cross-checks name/email/phone against existing rows before creating
a new one. Confirmed live: Allie has two `active` `members` rows in the
Heirloom tenant (created six weeks apart), name split onto one row and
email onto the other, no chat activity on either since June/August.

**This is a known industry limitation, not a gap specific to this app.**
Checked directly: Clerk's own account-linking only auto-merges when the
*same* verified identifier is reused. Every provider surveyed (Clerk,
Auth0, dedicated identity-merge vendors) draws the identical line — same
identifier reused is safe to auto-merge; different identifier, same
person, is never automated by any of them. It always requires a human (or
a very deliberate, verified flow) to confirm. So the target design below
is not catching this codebase up to some baseline other systems already
solved automatically — it's building the manual-confirmation layer that
every comparable system also requires.

## Target design

### 1. Detection

Two complementary sources, not mutually exclusive:

- **A background check** — periodically compare `members` rows within a
  tenant for close matches on name/email/phone even when no single field
  matches exactly.
- **A Traffic Cop tool call** — the AI notices a signal mid-conversation
  (the member mentions having signed up before, a name/detail that doesn't
  match their current record, etc.) that a background scan would never
  catch. Proposes flagging a possible duplicate; does not act unilaterally.

### 2. Recording a candidate

A flagged pair is a candidate, not a decision. Minimal shape: the two
`members.id`s, why it was flagged, when. Could be a small dedicated table
or a specific `audit_events` action type — doesn't need much.

### 3. Admin review

Candidates surface in the admin members list (a badge, or a small review
queue). Jeff confirms or dismisses — never auto-merged.

### 4. Verified linking, member-initiated

Once a merge is confirmed as real: Traffic Cop, in conversation, asks the
member to add their missing contact method — and this step must run
through actual verification (a real OTP sent to the claimed email/phone,
entered back in chat), not just accept whatever the member types. Typing
an email into a chat box is not proof of ownership; skipping this step
would let anyone claim any identifier as their own.

### 5. Alias-forward merge, not row rewriting

Rejected: repointing every foreign key from the "loser" row to the
"survivor" row and retiring the loser. This leaves the *second* Clerk
identity with nowhere to go on its next login — it would either get
rejected or silently create a third row, defeating the merge.

Proposed instead: a small `identity_aliases` table (`clerk_id` →
`canonical_member_id`). The merge writes one row here; nothing about
existing data moves. Every lookup site that resolves "which member does
this Clerk login belong to" gets one additional check — not found
directly? check the alias table. This is the part that's genuinely
nontrivial: that lookup pattern is copy-pasted across a dozen-plus call
sites today (same sprawl already found and partially addressed by
tonight's `getSession()` work) and would need to be added consistently
everywhere, or a merged member would appear "merged" on some pages and not
others.

## Product angle — worth deciding before this ships, not after

Combining two accounts means combining two free-tier allowances into
one — if that crosses into paid territory, charge for it, same as plan/seat
consolidation works elsewhere. Real revenue opportunity, not just a bug
fix. **Framing matters**: position as "combining accounts combines their
allowances, which may cross into a paid tier" — not "pay us to fix our
bug." Same mechanism, very different member experience. Wording not yet
decided.

## Sequencing

This would be a third real use case for the tool-calling infrastructure,
alongside Memory and Story — the two use cases that infrastructure was
deliberately built to wait for and validate against first. Building this
before Memory/Story ship would mean building against unproven
infrastructure; worth sequencing honestly rather than jumping the line
because it surfaced first.

## What's NOT proposed here

- No automatic merging, ever, for the cross-identifier case — matches
  universal industry practice, not a limitation of this design.
- No device/browser fingerprinting — privacy-invasive, unreliable, and
  unnecessary given the verified-OTP approach above already solves
  ownership proof more directly.
- No retroactive fix for Allie's two rows *by this general mechanism* —
  her case is real and known today and doesn't need to wait for any of the
  above to be built. Worth a direct, one-off fix (manual review + verified
  link + a one-time alias row, or a manual Studio merge if simpler) done
  on its own, separately from whether/when the general tool gets built.

## Open questions, not yet decided

- What counts as "close enough to flag" for the background-check side of
  detection (exact match only, or fuzzy name matching too)?
- Exact wording for the paid-tier framing.
- Whether the verified-OTP linking flow reuses any part of Clerk's own
  verification primitives, or needs its own.
