# Heirloom Identity: Remaining Work — Sequencing Proposal

## Context

**Status (updated 2026-09-04): Tiers 1–4 are all done.** Every item this doc
sequenced — D8 (Tier 1), the waitlist name field and D7 (Tier 2), item 3b
(Tier 3), and D3+Gate3 combined (Tier 4) — shipped 2026-09-03/04. Only Tier 5
("Clerk at the front door only") remains open, unchanged from its original
"needs its own dedicated scoping pass" recommendation below. See
`System Docs/Identity System.md` §5/§7 for the current defect-register state
this sequencing worked through. The rest of this doc is left as-written,
below, as the historical record of the sequencing decision — read the
Tier-by-tier notes added under "The list, sized and sequenced" for what
actually shipped per item.

This was originally a proposal only — **nothing here was built or scheduled by
this doc landing.** It follows the four-gate identity audit, the D1/D2/D4/D5 fixes
(`services/shared/identity.ts`, merged PR #448 and its predecessor), the
end-state goals investigation, the sign-up/sign-in path documentation, and
today's UI-CTA audit (`heirloom-signup-cta-audit-findings.md`). The ask: take
the confirmed remaining defects and open questions — D3, D7, D8, Gate 3
(D9/D10), Goal 2's Clerk-edit-sync gap, "Clerk at the front door only," item
3b (the name-completion interstitial), and the new waitlist name-capture
question — and propose an order, sized small/contained vs. genuinely bigger,
for Jeff to review and pick from one piece at a time.

Two research passes verified every item below against current code before
this sequencing was proposed. Several items didn't survive verification
exactly as originally framed — those corrections are called out rather than
silently absorbed, since precision was the explicit standard set for this
whole engagement.

---

## Corrections to the requested framing

- **"Goal 2's missing direction" isn't in Goal 2.** `identity-endstate-goals-proposal.md`'s
  Goal 2 is entirely the `acceptInvite` race (no `name` param, orphan-rescue
  timing) — already tracked correctly elsewhere. The Clerk-edit-sync-back
  topic ("Allie's original bug") actually lives in **Goal 3's closing
  caveat** (`identity-endstate-goals-proposal.md:227-231`), which names it as
  the same issue as **D3**. This is not a fifth, separate work item — it
  collapses into the D3 fix below.
- **"Goal 5" doesn't exist.** The goals doc only defines Goals 1–4. "Clerk
  used only at the front door, not a live lookup key elsewhere" is the
  framing of **Section 4 of `System Docs/Identity System.md`**, not a
  numbered goal. Its violations table names five call sites — worst is
  `app/api/sage/route.ts` re-resolving `members.clerk_id` on every chat turn.
- **D8 needs a decision, not code.** Current behavior is already correct:
  `invited_name` has exactly one writer (`createMemberInvite`, insert-only),
  enforced structurally by `services/shared/identity.ts`'s `resolveMemberName`.
  Closing D8 means writing the "frozen by design, no refresh mechanism, that
  is the accepted tradeoff" decision down — not building anything.
- **D1/D2/D4/D5 are already fixed** (commit `e87379b`). `System Docs/Identity System.md`'s
  defect register is dated 2026-08-16 and still lists them as "confirmed,
  live" — worth a note next time that doc is touched, not part of this pass.

---

## The list, sized and sequenced

| Tier | Item | Current status | Size | Depends on |
|---|---|---|---|---|
| 1 | **D8 decision** — formalize "frozen by design" | **Shipped 2026-09-03** (`fcc64b6`) | Trivial (doc-only) | Nothing |
| 2 | **Waitlist name-capture** | **Shipped 2026-09-03** (`9f91a3d`) — optional `name` field, fill-only-when-null at promotion, per the recommendation below | Small, contained | One framing decision (below) |
| 2 | **D7** — chat `[NAME:]` marker never reaches `members` | **Shipped 2026-09-03** (`abae794`) | Small–medium, contained | Nothing |
| 3 | **Item 3b** — name-completion interstitial | **Shipped 2026-09-03** (`75600f8`, `2c6d5b0`) | Moderate — new surface (`GET /api/members/me`, new component, one constant, one `ChatHero.tsx` conditional) | Nothing new |
| 4 | **D3 + Gate 3, combined** | **Shipped 2026-09-03** — Gate 3 built and deployed live (`ac5433a`, `ecb8e11`, `263e408`); D3's direction chosen as recommendation (b) below — see Tier 4 note | Larger — spans a precedence decision, an `AuditAction` addition, a PII-safe logging helper, and a DB trigger | Jeff's Studio work for the trigger DDL — **done**, confirmed live |
| 5 | **"Clerk at the front door only"** | Still open, unchanged | Biggest — architectural, not a discrete fix | Its own dedicated scoping pass |

### Tier 1 — trivial, doc-only

**D8.** Write the decision into `Identity System.md`'s decision log:
`invited_name` is intentionally write-once, no refresh mechanism, and that's
accepted — `resolveMemberName`'s fallback-only read already makes this safe
in practice. No code change.

**Shipped 2026-09-03** — see `System Docs/Identity System.md` §5's D8
decision note.

### Tier 2 — small, contained code changes

**Waitlist name-capture.** One framing decision first: does Goal 1 ("name
required at signup everywhere") apply to waitlist *entry*, or only to actual
account creation? Recommend: optional at waitlist (it creates no Clerk
account at all — there's no "signup" yet in the Goal 1 sense), enforced
later at promotion to a real invite, same as every other path already
enforces at the point an account actually forms. If agreed, the build is a
name field on `WaitlistView` + the route's accepted body/insert — contained.

**Shipped 2026-09-03, exactly as recommended** — optional at waitlist entry,
fill-only-when-null at promotion.

**D7.** Extend `persistVisitorName` to also write fill-only-when-null into
the caller's `members` row when one is resolvable at marker-capture time
(authenticated sessions only — an anonymous visitor has no `members` row to
write to). Same `identityValue`/`setIdentityField` primitives already used
everywhere else in the identity system. Single-function change.

**Shipped 2026-09-03, exactly as scoped** — see
`System Docs/Identity System.md` §1.2's `persistMemberName` row.

### Tier 3 — medium, already fully designed

**Item 3b.** Nothing new to scope — `heirloom-signup-signin-fixes-proposal.md`
already specifies the gate condition (`resolveMemberName` returns null AND
`members.created_at >= NAME_REQUIRED_SINCE`), the new read-only
`GET /api/members/me`, and the `ChatHero.tsx` conditional render reusing
`SaveChatCTA`'s name-input shape. Recommend building it as its own gated
pass, unchanged from the original parking decision — this tier is a "when,"
not a "what."

**Shipped 2026-09-03** — including a same-day correction (`2c6d5b0`) so the
interstitial's submit also writes the name to Clerk, not just Supabase; see
`heirloom-signup-signin-fixes-proposal.md`'s updated status header.

### Tier 4 — larger, needs a decision before scoping further

**D3 + Gate 3, combined rather than sequenced separately.** D3 is currently
safe — it only goes live if `user.updated` gets subscribed on the Clerk
dashboard, a config change outside this repo. Gate 3's audit trigger is
explicitly the proposed tripwire for exactly that event, so building one
without the other leaves either an unmonitored dormant defect or a trigger
watching for something that's still structurally possible to trip blind.
Recommend scoping together:
1. Decide the D3 fix direction — (a) subscribe `user.updated` and make the
   write precedence-aware, or (b) write sign-in-typed names back to Clerk
   too, closing the gap `services/auth/providers/clerk/client.ts`'s sign-up
   branch already closes for sign-up.
2. Build the Gate 3 pieces CC can build standalone: the three new
   `AuditAction` values (`identity.write`/`identity.overwrite`/`identity.cleared`),
   the hash-based PII-safe logging helper (same bounded-classification
   principle as `sanitizeFailureReason`, adapted per
   `identity-tracking-proposal.md`'s design), and the `getAdminClient`
   consolidation.
3. The trigger DDL itself is Jeff's Studio work, per the schema-migration
   rule in `CLAUDE.md` — a dependency, not something CC can build standalone.

**Shipped 2026-09-03.** Direction **(b)** was chosen — sign-in-typed and
chat-marker-captured names now also write to Clerk (`syncToClerk`/
`updateClerkUserFirstName`), not (a); `user.updated` stays unsubscribed and
D3 itself stays open but dormant, unchanged. All of steps 2 and 3 above
shipped: the three `AuditAction` values, the PII-safe logging helper
(`services/shared/log-safe.ts` — built slightly differently than "adapted
from `sanitizeFailureReason`" anticipated here, since a hash needs to stay
equality-comparable, which a fixed-phrase classifier can't do), the
`getAdminClient` consolidation, and the trigger DDL — confirmed live via a
real logged row.

### Tier 5 — biggest, not sequenced yet, needs its own pass

**"Clerk at the front door only."** An architectural change, not a discrete
fix: moving `members` lookups off `clerk_id` as a live join key (worst
offender: `app/api/sage/route.ts`, re-resolving on every chat turn) onto a
Supabase-native id resolved once per session and carried forward. Five call
sites total, ranging from hot-path to moderate severity. This is genuinely
bigger than everything above it — recommend it gets its own
investigation/design pass, same gated discipline as this whole engagement,
once Tiers 1–4 ship. Not something to fold into this doc as build-ready.

---

## Recommended order

1. ~~D8 decision (trivial, closes a doc gap same-day if approved)~~ **Done, 2026-09-03.**
2. ~~Waitlist name-capture decision + build (small)~~ **Done, 2026-09-03.**
3. ~~D7 (small–medium)~~ **Done, 2026-09-03.**
4. ~~Item 3b (moderate, already designed)~~ **Done, 2026-09-03.**
5. ~~D3 + Gate 3 scoping (larger, has an external dependency on Jeff's Studio work)~~ **Done, 2026-09-03 — trigger deployed live.**
6. "Clerk at the front door only" — separate scoping pass, after the above. **Still open — the one item left on this list.**

This was a proposal for review, not a build order already in motion when
written — items 1–5 were picked up and built, in this order, over
2026-09-03/04. Item 6 remains for its own dedicated pass.
