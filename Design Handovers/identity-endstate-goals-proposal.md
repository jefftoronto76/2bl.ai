# Heirloom Identity — Four End-State Goals: Status & Proposal

**Status:** investigation + proposal, nothing implemented at the time this was
written. **Re-graded 2026-09-04** against `System Docs/Identity System.md`
(itself corrected the same day) — see the "Re-graded" note under each Goal
below for what's shipped since. Short version: Goal 1's Layer 2 is built,
Goal 2's confirmed gap is closed, Goal 3 is unchanged (its one loose end is
still open), Goal 4's identity-write-tracing scope is built and live
(Gate 3) — its broader "navigation traceability" scope question is still
unanswered, not decided either way.
**Builds on:** the D1/D2 fixes (`b4fbfb9`, `e87379b`, `3cde3ed` on
`claude/heirloom-identity-audit-htyd8g`, not yet merged to `main`) and the
four-gate audit (`System Docs/Identity System.md`,
`Design Handovers/identity-tracking-proposal.md`,
`Design Handovers/test-plans/identity-test-plan.md`).
**Date:** 2026-08-16. `tenant_users` out of scope, not investigated.

All findings below were re-verified against the current state of this branch —
not assumed from the earlier audit's snapshot.

---

## Goal 1 — Sign-up requires a name, everywhere

**Status: partially done, and weaker than the current code makes it look.**

**Re-graded 2026-09-04: Layer 2 is built, exactly as proposed below.**
`NameCompletionGate` (built 2026-09-03 as "item 3b") is the server-side
name-completion gate this section proposes — same shape (a one-field
interstitial reusing `SaveChatCTA`'s form), same gating logic
(`resolveMemberName` returns null **and** `created_at >= NAME_REQUIRED_SINCE`,
the cutover this section calls for), same explicit grandfathering of every
pre-existing account. **Layer 1 (the Clerk Dashboard "require name" toggle)
is still unconfirmed** — this is Jeff's side, not code, and hasn't been
verified either way; see `heirloom-signup-signin-fixes-proposal.md`'s §3a
status note. This section's own closing line — "Both are proposed; neither
alone is sufficient" — still holds: Layer 2 alone catches every account
after the fact, but doesn't stop `signUp.create()` succeeding without a name
in the first place at the two prebuilt-modal paths (#3, #4 in the table
below), which only Layer 1 can do.

### The actual set of account-creation entry points

The "~18-20 paths" in the Gate 1 inventory was every identity-*write* path —
invite acceptance, webhook fallbacks, session transfer, admin edits. Most of
those don't create a new account; they write a name onto one that already
exists. The set that can bring a **brand-new Clerk account** into existence is
much smaller — five UI entry points, all funnelling into one of two mechanisms:

| # | Entry point | Mechanism | Name enforcement today |
|---|---|---|---|
| 1 | `MagicLinkCard` (in-chat, invite/story-invite/generic `ACCOUNT_CREATE`) | `useAuthFlow.sendEmail/sendPhone` → `signUp.create()` | Send button disabled while `!nameValue.trim()` |
| 2 | `SaveChatCTA` (post-4-message save prompt) | same `useAuthFlow` mechanism, its own form | Same disabled-button pattern |
| 3 | `LandingNav` (`app/heirloom/components/landing/LandingNav.tsx:76`) | Clerk's **prebuilt** `openSignUp()` modal | **None at the app level** |
| 4 | `GateView`'s invalid-token branch (`GateView.tsx:90`) | Clerk's prebuilt `openSignUp()` modal | **None at the app level** |
| 5 | Clerk's own account-management flows (password reset, OAuth, etc.) | Clerk-native | Out of this codebase's control |

**#3 is the one that matters most, and it is not a corner case.** `LandingPage`
is rendered unconditionally underneath the chat drawer by `HeirloomApp.tsx:31` —
it is not gated, not conditional on invite state, and is the actual Heirloom
marketing homepage. Anyone who signs up from the "Start Your Story" nav button
goes through Clerk's bare prebuilt modal with zero application-side name
requirement. Whatever the Clerk Dashboard has configured for that modal's
fields is invisible to this codebase and unverifiable in a PR review.

**#4 is narrower but real, and contradicts what `Known Gaps.md` currently
claims.** The doc states `/api/heirloom/members/claim` (which this button
triggers) is "effectively orphaned." Tracing the gate logic
(`chatStore.tsx:1462`, `bypassGateForExpiredInvite = tokenExistsButUnauthorized
&& isLoaded && !isSignedIn`) shows the bypass only fires for a token that is
*real but expired/revoked* (`memberTokenExists()` true). A **garbage or
mistyped** `?invite=` string — never a real token — leaves
`tokenExistsButUnauthorized` false, so the bypass doesn't apply, `GateView`
still mounts, and its `openSignUp()` button is reachable. This should be
corrected in `Known Gaps.md` when this work lands.

### The deeper problem: even the "enforced" paths aren't actually enforced

#1 and #2 use a **disabled button**, not the `required` HTML attribute, and
either way it is client-side only. It stops nothing:

- A direct call to `signUp.create()` (dev tools, a scripted client, a future
  code path that reuses `useAuthFlow` differently) bypasses it entirely.
- Even through the UI, the flow is: `signUp.create({emailAddress})` first
  (`client.ts:144`), **then** `signUp.update({firstName, lastName})`
  afterward — and that update is explicitly non-fatal
  (`client.ts:161`: *"Non-fatal by design: a name failure … is logged but
  never blocks the sign-up itself"*). So even a visitor who typed a name can
  end up with a fully verified Clerk account holding no name at all, if that
  second call fails for any reason (rate limit, network blip, a disabled
  Clerk attribute). Nothing downstream would ever know.

So "the one form that currently has `required` on it" undersells the problem
in one direction (two forms enforce it, not one) and overstates it in the
other (neither actually guarantees the name reaches Clerk, let alone Supabase).

### Proposal: two layers, matching the pattern this codebase already uses

**Layer 1 — Clerk Dashboard config for name, on the prebuilt modal (#3, #4).**
No code change: Clerk's own sign-up form supports marking `firstName` as
required. This closes the two prebuilt-modal paths at the source, with no
app-level enforcement possible to bypass because the field never reaches
`signUp.create()` unfilled. **This is Jeff's lane** — Clerk Dashboard
configuration, not a code change.

**Layer 2 — a server-side name-completion gate as the backstop for
everyone.** This is the actual enforcement point, and it should follow the
**same shape as CLAUDE.md's marker fallback principle** already governs this
codebase: *"Never make a business-critical outcome dependent solely on a
[client-side mechanism] firing… a fallback must exist that completes the
operation."* A disabled button is exactly that kind of client-only mechanism.

Concretely: on session resolution (the same place `getCurrentUser()` /
`getMemberContext()` already run), check whether the resolved account has no
usable name (`resolveMemberName` returns null) **and** was created after a
cutover timestamp. If both are true, block entry to the product behind a
one-field "What should we call you?" interstitial — the same UI shape as
`SaveChatCTA`, reused rather than reinvented — before the chat surface (or
any authenticated route) renders. Once submitted, it writes through
`/api/members/sync` (already fixed, already routes through the shared rule)
and never appears again for that account.

**Grandfathering — explicit, per your constraint.** The gate must key on
*account creation time*, not on *presence of a name*. Gating on "no name" alone
would also catch the 10 existing null-name members and the 4 D1-damaged rows,
which is exactly what you ruled out. The interstitial should check
`created_at` (on `members`, or `users`) against a fixed cutover — the ship date
of this change — and only apply to accounts created after it. Every existing
account, named or not, is permanently exempt. Backfilling or prompting the
grandfathered 10 is a separate, later decision, not part of this gate.

**What this does not attempt:** blocking `signUp.create()` itself. That call
is Clerk's, not ours, and the codebase has no hook into it before the fact —
enforcement can only happen after an account exists (Layer 2) or by
configuring Clerk not to allow it in the first place (Layer 1). Both are
proposed; neither alone is sufficient.

---

## Goal 2 — name written to both `users` and `members`

**Status: mostly true post-D1/D2, with one confirmed live gap and one
inconsistency.**

**Re-graded 2026-09-04: the confirmed gap is closed, the inconsistency is
not.** `acceptInvite` now takes `name` as its 4th parameter
(`services/members/members.ts`, fixed 2026-08-18, PR referenced as "Fix Path
2" in `Known Gaps.md`/the sequencing doc) — exactly the fix this section
proposes, closing the race this section traces in detail. The
`acceptStoryInvite` insert-not-routed-through-the-helper inconsistency
(§"Inconsistency, not a live gap" below) is confirmed **still open** —
`services/crm/story-invites.ts:580` still writes `name: name ?? null`
directly, not through `setIdentityField`. Still harmless for the same reason
this section already gives (insert-only, nothing to overwrite) — flagged
here as unchanged, not re-litigated as newly urgent.

### Confirmed gap: `acceptInvite` has no name fallback

Traced every account-creation-adjacent path's users/members pairing. Four are
sound:

- `syncMember` — one function, both tables, same call, same rule (D1 fix).
- `linkInvitedMember` (webhook-only caller) — always runs after the webhook's
  own `users` upsert in the same request, so `users.name` is set first;
  `members.name` fills on the same rule, fill-only-when-null.
- `acceptStoryInvite` — takes `name` as a parameter and writes it directly on
  insert; both its callers (`story-invites/accept/route.ts:53`,
  `webhooks/clerk/route.ts:187`) pass Clerk's resolved name.
- `ensureClerkUser` + `claimMembership` pairing
  (`/api/heirloom/members/claim/route.ts:27-29`) — sequential, both write
  name, both now routed through the shared helper.

**`acceptInvite` is the exception.** Its signature
(`services/members/members.ts:422-426`) is
`acceptInvite(token, clerkUserId, supabaseUserId)` — **no `name` parameter at
all**, unlike its two siblings above. The only way a name reaches
`members.name` through this path is the orphan-rescue mechanism (PR #368):
rescuing a name from a `syncMember`-created orphan row before deleting it.

That mechanism depends on timing. `/api/heirloom/invites/accept/route.ts:44`
calls `ensureClerkUser()` — which sets `users.name` from Clerk directly,
unconditionally — **before** calling `acceptInvite`. Meanwhile,
`MagicLinkCard`'s `/api/members/sync` call fires independently off the same
sign-in-transition event, with **no ordering guarantee between the two**
(this exact race is what `Known Gaps.md` already documents for the *other*
symptom the rescue mechanism was built for). If `acceptInvite`'s orphan lookup
runs before `/api/members/sync` has created the orphan row, it finds zero
orphans, and `members.name` stays null — while `users.name` has already been
set from Clerk. **`users` gets the name; `members` doesn't, for this specific
path, on this specific race outcome.**

It self-heals: the member's *next* authenticated visit will call
`/api/members/sync` again, which now resolves `user.name` from Clerk (already
set) and writes it to `members.name`. But it is not resolved on account
creation, and `getMemberContext` (D2's fix) will show this member as nameless
in the interim — on every turn until that next visit.

**Proposal:** give `acceptInvite` the same `name` parameter its two siblings
already have. `/api/heirloom/invites/accept/route.ts` already resolves
`user.name` before calling `acceptInvite` (it's on the `AuthUser` returned by
`getCurrentUser()`) — pass it through, and use it as the fallback in the same
`fill-only-when-null` shape the orphan-rescue already uses:

```
...(identityValue(name) && !invitedRow.name && !rescuedName ? { name: identityValue(name) } : {})
```

This closes the race at the root instead of depending on delete-step timing,
and matches the pattern `linkInvitedMember`/`acceptStoryInvite` already use —
so `acceptInvite` stops being the one sibling with different logic (also
relevant to Goal 3 below).

### Inconsistency, not a live gap: `acceptStoryInvite`'s insert

`services/crm/story-invites.ts:580` writes `name: name ?? null` directly on
insert — not routed through `setIdentityField`. Harmless today (a fresh
insert has nothing to overwrite, so the D1-class risk doesn't apply), but it
is a second hand-rolled implementation of "write this value or don't," which
is the exact pattern that produced D1/D4/D5 in the first place. Proposal:
route it through the helper anyway, for the same reason `createMemberInvite`
and `ensureClerkUser` were routed through it even though they were already
correct — one implementation, not several that happen to agree today.

### Everything else: confirmed consistent

Swept every file touching `from('users')`/`from('members')` in the repo for a
direct (non-helper) `name` write. None found beyond the two above. `Known
Gaps.md`'s claim that `/api/heirloom/members/claim` is "effectively orphaned"
should be corrected — it's low-traffic, not dead, per Goal 1's #4 finding —
but the route itself writes both tables correctly.

---

## Goal 3 — a name is never overwritten to blank

**Status: done for the paths that route through the shared helper. Two loose
ends, both low-risk.**

**Re-graded 2026-09-04: unchanged, except Gate 3 (referenced below as future
work) is now built and live.** The `acceptStoryInvite` insert loose end is
still open — see Goal 2's re-grade note above, same line, same reasoning.
The `acceptInvite`/`linkInvitedMember` fill-only-when-null behavior is
unchanged (still the intentional, stricter-than-required design this section
already describes as correct). The one thing that's moved: the paragraph
below says "that is what D3 and the Gate 3 trigger's `identity.overwrite`
action exist to catch" — Gate 3 is no longer future work, it's deployed and
has already logged a real `identity.overwrite` row. D3 itself (the
`user.updated`-webhook overwrite risk this rule structurally cannot cover)
remains open but dormant, unchanged.

`identityValue`/`setIdentityField`/`setIdentityEmail`
(`services/shared/identity.ts`) is imported by 11 files:
`ensure-clerk-user.ts`, `claim-membership.ts`, `sync-member.ts`,
`sync-user.ts`, `member-context.ts`, `members.ts`, `TransferModal.tsx`,
`transfer/route.ts`, `members/sync/route.ts`, `webhooks/clerk/route.ts`, plus
the module itself. That is every write path this session's D1/D4/D5 work
touched, and a full sweep (§Goal 2) found no `name`-writing `.insert`/
`.upsert`/`.update` call outside that set except the two already named:

1. **`acceptStoryInvite`'s insert** — not routed through the helper (see
   Goal 2). Not a live overwrite risk (insert-only), but should move to the
   helper for the same consistency reason.
2. **`acceptInvite`/`linkInvitedMember`'s members-row updates** — these
   *are* routed through `identityValue` (as of the D1/D4/D5 commit) but use a
   **stricter** rule than the shared invariant requires: fill-only-when-null,
   never overwrite at all, even with a real value. This is intentional
   (PRs #368/#371) and correct — never-overwrites trivially satisfies
   never-overwrites-to-blank — noted here only so it isn't mistaken for a gap
   in a future audit.

**What this rule does not, and cannot, cover** — restating from the Gate 3
doc since Goal 3's phrasing could be read as broader than it is: application
code is the only thing `identityValue` governs. Direct Studio/SQL writes and
Clerk-driven overwrites via the (currently unsubscribed) `user.updated`
webhook are outside its reach by construction — that is what D3 and the Gate
3 trigger's `identity.overwrite` action exist to catch, and it's a different
problem (overwritten to a *different real value*, not blanked).

**Net assessment: Goal 3 requires no new code change** beyond the
consistency cleanup in the two items above, which can ride along with Goal 2's
`acceptInvite` fix in the same commit.

---

## Goal 4 — full traceability of sign-up and subsequent navigation

**Status: not built. Confirmed against current code, not assumed from the
proposal doc's age.**

**Re-graded 2026-09-04: the identity-write-tracing scope is built and live;
the broader navigation-tracing scope question below is still unanswered.**
Gate 3 shipped 2026-09-03 exactly as designed — the three `AuditAction`
values, `getAdminClient` consolidated with header-based `source`
attribution, and the `BEFORE UPDATE` trigger on `members`/`users` all exist
now, confirmed live via a real logged `identity.overwrite` row. That closes
"what changed, from what to what, via which path, when" for identity data —
the scope this section's own "Scope check" paragraph confirms Gate 3 was
always meant to cover. **The scope-check's flagged ambiguity was never
resolved either way:** if Goal 4 also meant broader activity/session
navigation tracking (page views, chat panel opens, which routes a member
visits), that is still new, unscoped, undecided work — nobody chose an
answer, it just wasn't revisited. Flagging again rather than assuming it's
covered by Gate 3's identity-only scope.

Checked directly:

```
$ grep -n "IDENTITY_WRITE\|IDENTITY_OVERWRITE\|IDENTITY_CLEARED" services/audit/types.ts
(no matches)
$ grep -n "IdentitySource" services/auth/supabase-admin.ts services/crm/sessions.ts
(no matches)
$ cat services/auth/supabase-admin.ts
export function getAdminClient() {
  return createClient(url, key)   ← still the original, unconsolidated version
}
$ find . -iname "*trigger*" (excluding node_modules/.git)
(no SQL trigger artifacts anywhere in the repo)
```

Nothing has changed since `Design Handovers/identity-tracking-proposal.md`
(rev 3, approved) was written. It is still exactly a design: three
`AuditAction` values, a consolidated `getAdminClient` with header-based
`source` attribution, and a `BEFORE UPDATE` trigger on `members`/`users` —
none of it exists in code or in Supabase. **This is the concrete next
implementation step**, unchanged from what was already approved.

### Scope check — and this is a real flag, not a formality

Gate 3, as designed, covers exactly one thing: **mutations to identity
columns** (`name`/`email`/`phone`/`invited_name`) on `users` and `members`,
captured by a DB trigger. It answers "what changed, from what to what, via
which path, when."

**"Full traceability of sign-up and subsequent navigation" reads as asking
for something else — a person's *journey* through the product, not just their
*identity data*.** If that's the intent, Gate 3 does not cover it, and closing
that gap is a materially different piece of work:

- Gate 3 fires on a Postgres row mutation. Navigation — page views, chat
  panel opens, which routes a member visits — produces no row mutation on
  `users`/`members` at all, so no trigger can see it.
- That would mean a new event stream (most likely enriching `audit_events`
  with a `navigation.*` or `session.*` action family, written from application
  code at each significant transition — not from a trigger, since there's no
  table write to hang it on).
- It carries different tradeoffs than Gate 3's identity work: volume (every
  page view vs. tens of identity writes a week), retention policy (Gate 3
  explicitly declined one, reasonably, given its low volume — that reasoning
  doesn't hold at navigation-event volume), and privacy scope (Heirloom's
  "Privacy by Design" principle — collecting granular navigation trails needs
  its own justification, separate from diagnosing identity bugs).

**I'm flagging this rather than scoping it myself:** if "subsequent
navigation" means "trace an identity write to the request that caused it"
(which the Gate 3 trigger's `correlation_id` already does — see the tracking
proposal §1.2), Gate 3 as designed is sufficient and the answer is simply
"build what's already approved." If it means broader activity/session
tracking, that is new work, outside this four-goal pass, and deserves its own
investigation before a design is proposed — not something to fold into Gate 3
silently.

---

## Summary table

| Goal | Status (2026-08-16) | Status (re-graded 2026-09-04) | Gap remaining |
|---|---|---|---|
| 1. Name required at sign-up | Partial | Layer 2 (server-side gate) **built** | Layer 1 (Clerk Dashboard toggle) still unconfirmed |
| 2. Name in both tables | Mostly done | Confirmed gap **closed** (`acceptInvite` name param) | `acceptStoryInvite`'s insert still not routed through the shared helper (harmless, cosmetic) |
| 3. Never overwritten to blank | Done | Unchanged | Same loose end as Goal 2, above |
| 4. Full traceability | Not built | Identity-write-tracing scope (Gate 3) **built and live** | Broader navigation-tracing scope still an open, undecided question |

Goals 2 and 3's fixes shipped together, same shape as the D1/D2 work. Goal 1's
Layer 2 shipped as its own gated pass (item 3b); Layer 1 is Jeff's side, still
open. Goal 4's Gate 3 portion is done; the navigation-tracing question raised
in this doc was never answered — it wasn't rejected, it just was never
revisited. Worth a deliberate yes/no before it's assumed closed by omission.
