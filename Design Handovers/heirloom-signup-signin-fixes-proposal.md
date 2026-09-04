# Heirloom Sign-Up/Sign-In: Fix Proposal for Paths 2, 3, 6, 7

**Status (updated 2026-09-04):** §1 (Path 3), §2 (Path 2 — `acceptInvite`'s
direct `name` param), and §3b (the name-completion interstitial) are all
shipped — confirmed against current code. §3a (the Clerk Dashboard "require
name" toggle) is **unverified — Jeff, please confirm whether this toggle was
actually changed in the Dashboard**; it can't be checked from code, and this
doc previously said "nothing implemented" for all four items, which was
already stale by the time that line was last read. §4 (the `Known Gaps.md`
correction) was not independently re-checked in this pass.
**Builds on:** `Design Handovers/heirloom-signup-signin-paths.md` (the 12-path
inventory this proposal fixes four rows from) and
`Design Handovers/identity-endstate-goals-proposal.md` (Goals 1/2, which first
surfaced Paths 2/6/7's gaps).

Four independent items, each its own section, each implementable and
reviewable on its own. Nothing here depends on the others landing first.

---

## 1. Fix Path 3 — already-signed-in member, fresh admin/member invite link

### The gap, restated precisely

`acceptMemberInviteToken` (`chatStore.tsx:684-708`) is only ever *called* from
the `false→true` `isSignedIn` transition effect further down the file. There
is no mount-time counterpart for it — unlike its sibling
`acceptStoryInviteToken`, which has both:

- `chatStore.tsx:635-671` — the function itself (idempotent, guarded by
  `storyInviteAcceptFiredRef`, explicitly documented as callable from either
  trigger: *"The server independently determines new-vs-existing-member; this
  call site does not need to know or care which branch fires"*)
- `chatStore.tsx:724-744` — the mount-time effect that calls it for a visitor
  who was **already signed in** when the page loaded

`acceptMemberInviteToken` has the same idempotent shape (guarded by
`memberInviteAcceptFiredRef`, `chatStore.tsx:685`) — it is already safe to call
from a second trigger. It just has no second trigger.

### Proposed fix

Add one mount-time effect, placed near the existing story-invite mount effect,
mirroring it exactly:

```ts
useEffect(() => {
  if (!isLoaded) return;
  if (isSignedIn && inviteTokenRef.current) {
    acceptMemberInviteToken(inviteTokenRef.current);
  }
}, [isLoaded]);
```

Same dependency array (`[isLoaded]`, not `[isLoaded, isSignedIn]`) as the story
invite version — this matters: it means the effect runs once at mount and
doesn't re-fire on the `false→true` transition, so a brand-new signup still
goes through the transition effect exactly as today, and this new effect only
ever does anything for someone who was *already* signed in the moment Clerk
finished loading. No double-fire risk, because `memberInviteAcceptFiredRef` is
shared with the transition effect the same way `storyInviteAcceptFiredRef`
already is.

### A pre-existing risk this fix does not introduce, but does make more reachable

`acceptInvite` (the server function) does not verify the invite is *intended
for* the signed-in visitor — it only checks the token is unused and unrevoked.
That's true today, independent of this fix; a signed-**out** third party who
finds someone else's invite link and signs up fresh hits the exact same gap.
This fix makes the function reachable from one more trigger, not more
permissive than it already is.

What does change in practice: an *already-a-member* visitor who loads a stray
invite URL (their own forwarded link on a second device, most realistically)
will now have that acceptance attempted automatically. If they already hold an
active `members` row for this tenant, `acceptInvite`'s step 4 UPDATE hits the
unique constraint on `clerk_id` and fails — surfacing the existing generic
`MEMBER_INVITE_ACCEPT_FALLBACK_MESSAGE`, not a data-corruption risk, but worth
knowing the failure mode is "a visitor sees an unexpected error toast," not
silent. **Flagging this, not proposing a fix for it** — an identity/email-match
guard on `acceptInvite` would close it, but that's a change to the function's
trust model, not a mirror of an existing pattern, and is out of scope for this
specific ask.

---

## 2. Fix the Path 2 race — `acceptInvite` gets a direct name parameter

### Current shape vs. its siblings

`acceptInvite`'s signature (`services/members/members.ts:422-426`):
```ts
export async function acceptInvite(
  token: string,
  clerkUserId: string,
  supabaseUserId: string,
): Promise<MembersResult<{ memberId: string }>>
```
No `name` parameter. Its only path to a name is the orphan-rescue mechanism
(`rescuedName`, step 3) — which depends on winning a race against
`/api/members/sync`. Both siblings already take `name` directly:
`linkInvitedMember(clerkId, email, token?, name?)` and
`acceptStoryInvite(token, clerkUserId, supabaseUserId, tenantId, name?)`.

### Proposed fix

**Signature:** add a fourth, optional parameter —
```ts
export async function acceptInvite(
  token: string,
  clerkUserId: string,
  supabaseUserId: string,
  name?: string | null,
): Promise<MembersResult<{ memberId: string }>>
```

**Step 4's update payload** (`services/members/members.ts:529-541`) currently:
```ts
...(rescuedName ? { name: rescuedName } : {}),
```
becomes, using the already-imported `identityValue` from `services/shared/identity.ts`:
```ts
...(!identityValue(row.name) && (identityValue(rescuedName) ?? identityValue(name))
  ? { name: identityValue(rescuedName) ?? identityValue(name) }
  : {}),
```
(Revised from the original draft of this proposal, which normalized after
selecting via `??` — `identityValue(rescuedName ?? name)` treats a
whitespace-only `rescuedName` as present, since `??` only falls through on
`null`/`undefined`, silently discarding a real `name` fallback. Caught in
PR #448 review; each candidate is normalized independently before the
fallback now, and the guard reads `identityValue(row.name)` for the same
reason. Shipped as written here.)

**Precedence, and why this order:** `rescuedName` first, `name` (Clerk's own)
as fallback. `rescuedName` reflects the value the visitor *typed* into the
OTP form — the same reasoning the existing docstring already gives for
preferring it (*"the invited row being stamped in step 4 never has one"* on
its own). `name` is a strictly-better-than-nothing fallback for the case
where there's no orphan to rescue from at all — the exact case that
constitutes today's gap. `!row.name` keeps the existing never-overwrite
guarantee: this only ever fills a null, exactly like `linkInvitedMember`'s
`fill-only-when-null` pattern.

**Caller change** — `app/api/heirloom/invites/accept/route.ts:57`:
```ts
const result = await acceptInvite(token, user.providerUserId, supabaseUserId, user.name ?? null)
```
`user` (from `getCurrentUser()`, already resolved at the top of this route) is
the same `AuthUser` whose `.name` field `acceptStoryInvite`'s two callers
already pass through unchanged — no new resolution needed, purely wiring an
already-available value one call further.

**Net effect:** closes the Path 2 race at the root. `members.name` now lands
on first acceptance regardless of which of the two racing writes
(`/api/members/sync` vs. this route) finishes first, instead of depending on
losing gracefully via rescue.

---

## 3. Fix Paths 6/7 — the two doors with zero name enforcement

Two independent layers, as outlined in the endstate-goals proposal. Neither
depends on the other.

### 3a. Clerk Dashboard config (Jeff's side, no code)

In the Clerk Dashboard for this application: **Configure → User & Authentication
→ Personal Information → Name.** Currently this field is presumably set to
"Off" or "Optional" (application code never sets it, so whatever the default
is stands). Change it to **Required**.

This closes Paths 6 and 7 at the source: both go through Clerk's own prebuilt
`openSignUp()` modal, which renders exactly the fields the Dashboard configures.
Making name required there means `signUp.create()` cannot succeed without one
— no app code touches this at all. **Please verify the exact toggle label in
your Dashboard version** — Clerk's settings UI has moved this option between a
few different panels across versions; "Personal Information" is the current
name as of this writing, but if it's not there, it'll be under an "Attributes"
or similar section nearby.

One thing this layer does **not** reach: Path 1 (the custom OTP form) doesn't
render Clerk's own sign-up fields at all — it calls `signUp.create()` directly
with just an identifier, then separately calls `signUp.update({firstName,
lastName})` (`client.ts:161-178`). Making Clerk's *form field* required has no
effect on a direct API call that never uses that field. Path 1 is unaffected
by this change, for better and worse — its own client-side guard already
requires a name before submission (Section 1's finding), but that guard, and
this Dashboard setting, are two separate mechanisms covering two separate
entry points. This is exactly why layer 3b exists.

### 3b. Server-side name-completion interstitial (code, the real backstop)

**Scope decision, stated explicitly:** propose this as a **universal backstop**
— it checks "does this account have a resolvable name, and was it created
after the cutover" regardless of which of the 12 paths created it. This is
simpler to reason about than a per-path check, and it also catches any future
regression that reintroduces a D1-class defect on a new path nobody has
thought of yet — not just Paths 6/7, though those are what motivate it.

**Gating condition (both must hold):**
1. `resolveMemberName(member)` (`services/shared/identity.ts`) returns `null`
   for the signed-in visitor's `members` row.
2. `members.created_at >= NAME_REQUIRED_SINCE`, a single exported constant
   (e.g. `services/shared/identity.ts` or a small new
   `services/shared/rollout.ts`) set to this feature's ship date.

Condition 2 is what makes the grandfathering exact and permanent: the 10
already-existing nameless members (and the 4 rows D1 damaged, now fixed going
forward but not backfilled) all have a `created_at` before the cutover, so
they can never trip this gate, regardless of whether their name is ever
filled in later. No account created before the cutover is ever prompted,
full stop — this isn't a "for now" grandfather, it's permanent by construction
unless someone later deletes the constant.

**New minimal surface needed** — nothing today returns "the signed-in
member's own name + `created_at`" to the client. Propose one small addition:
`GET /api/members/me` → resolves the caller's `members` row (same
`clerk_id`-or-`user_id` lookup pattern `/api/sage`'s `resolveMemberId` already
uses) and returns `{ name: string | null, createdAt: string }`. Read-only,
no writes.

**UI:** a new component, reusing `SaveChatCTA`'s existing name-input shape
(name field + submit, no OTP step needed since the visitor is already
authenticated) rather than inventing new UI. Mounted in `ChatHero.tsx`
alongside `GateView`'s existing conditional-render pattern — when the gate
condition above is true, block the chat surface behind this prompt instead of
rendering it. On submit, it can reuse **the existing** `POST /api/members/sync`
endpoint — passing just `{ name }` in the body, exactly like `SaveChatCTA`
already does — since that endpoint already routes through the shared
`identity.ts` rule and already resolves the signed-in user server-side. No new
write path, only a new *trigger* for the existing one.

**What this does not do:** doesn't block `signUp.create()` itself (nothing in
application code can, per the endstate-goals proposal's finding — only 3a
does that, at the Clerk layer) and doesn't touch the 10 grandfathered rows in
any way, ever.

---

## 4. Correct `System Docs/Known Gaps.md`

### The error

The existing entry (`Known Gaps.md:1960-1978`) states
`/api/heirloom/members/claim` is *"effectively orphaned... no realistic
remaining trigger."* Its reasoning: *"GateView no longer mounts at all for the
invalid/expired-token population (`isGated` bypasses it)."*

That's true only for a **real-but-expired-or-revoked** token
(`memberTokenExists()` true → `bypassGateForExpiredInvite` true → `isGated`
false → `GateView` never mounts). It's false for a **garbage** token — a
string that was **never** a real token. `memberTokenExists()` returns `false`
for that case, so the bypass never applies, `isGated` stays `true`, `GateView`
mounts, and its `openSignUp()` branch (Path 7 in the paths inventory) renders
and is reachable. The entry conflated "invalid" with "expired" — the bypass
covers only the latter.

### Proposed replacement text

Replace the closing two sentences of the 2026-08-14 entry (currently *"Left in
place pending a decision to remove it — not deleted without confirming nothing
else depends on it"*) and the corresponding line in the following
2026-08-13 entry (*"`/api/heirloom/members/claim` + `claimMembership` are now
effectively orphaned (no realistic remaining trigger) but left in place, not
deleted"*) with:

> **Correction, [this pass's date]:** this route is not orphaned. A garbage or
> mistyped `?invite=` token (one that was never real — distinct from a
> genuinely-issued token that's since expired or been revoked) leaves
> `memberTokenExists()` false, so `bypassGateForExpiredInvite` never applies,
> `GateView` still mounts, and its `openSignUp()` button remains reachable —
> confirmed by tracing the gate logic in
> `Design Handovers/heirloom-signup-signin-paths.md` (Path 7). Low-traffic (it
> requires a visitor to arrive with a token string that never existed), but a
> real, live trigger. Left in place, correctly.

Small, additive, doesn't remove any of the existing reasoning (which is
correct for the expired-token case it was actually describing) — just
corrects the "orphaned" conclusion and the reason.

---

## Summary of what would change, if approved

| Item | Files touched | Size |
|---|---|---|
| 1. Path 3 fix | `chatStore.tsx` (+1 effect, ~6 lines) | Trivial |
| 2. Path 2 fix | `services/members/members.ts` (signature + 1 line), `app/api/heirloom/invites/accept/route.ts` (1 line) | Small |
| 3a. Dashboard config | None — Jeff, Clerk Dashboard only | Zero code |
| 3b. Interstitial | 1 new tiny route (`/api/members/me`), 1 new small component, 1 new constant, `ChatHero.tsx` (+1 conditional render) | Moderate — the only genuinely new surface in this batch |
| 4. Known Gaps correction | `System Docs/Known Gaps.md` (replace 2 sentences) | Trivial |

Items 1, 2, and 4 are small enough to implement and test together in one pass.
Item 3b is the one worth its own review pass given it's new surface, not a
fix to existing code — happy to split it out as its own gate if you'd rather
approve 1/2/4 and revisit 3b separately.
