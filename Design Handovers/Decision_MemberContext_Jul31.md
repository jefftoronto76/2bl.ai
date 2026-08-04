# Decision — MEMBER CONTEXT injection, always-on vs. one-shot

**Decided:** Jul 31, 2026

## The problem found

Heirloom's compiled prompt has instructed the model, for a while, to treat a "MEMBER CONTEXT" block as present whenever it's talking to an authenticated member — skip re-asking for name/email/phone, silently emit the corresponding markers on first reply. This instruction assumed the block would reliably show up any time `memberId` resolves.

It didn't. The actual implementation (`getMemberPrimer`, `services/chat/server/member-context.ts`) fires **once per member, ever** — gated by `primer_used_at`, which self-locks after first use. Every returning member, from their second session onward, silently gets nothing — the prompt's "skip asking, they're known" instruction never actually fires for them.

This went unnoticed because `member-context.ts`, `primer`, and `auto_open` were completely undocumented — absent from both `CLAUDE.md` and `DB_CHANGELOG.md`.

## Two options considered

**Option A — make it always-on.** Change the gate to fire on every request where `memberId` resolves, matching the existing `getBookingCardSection` pattern (computed unconditionally, fail-open on no data). Simplest fix, matches what the prompt already assumes, no new mechanism.

**Option B — keep two mechanisms.** Leave the one-shot primer as a distinct "genuinely first real conversation" moment, and add a second, lighter, persistent identity block for every session after that.

## Decision: Option A

The compiled prompt's language was clearly written assuming "member" and "MEMBER CONTEXT present" are the same condition. Cleanest fix is making that actually true, rather than building a second mechanism to reconcile a gap that shouldn't exist in the first place. Also simpler to reason about and maintain — one code path, one behavior, matches an already-proven pattern elsewhere in the same file.

**Real thing to verify during implementation, not skipped:** the prompt's "emit markers in your very first reply" instruction was accidentally safe under the old one-shot design, since MEMBER CONTEXT only ever appeared once, period — "first time ever" and "first reply this conversation" were the same thing by coincidence. Under always-on, the model needs a genuinely reliable "is this turn 1 of this conversation" signal, not just "first time I've seen this block," or it risks re-emitting `[NAME:]`/`[EMAIL:]`/`[PHONE:]` markers every single turn. Confirmed as part of the implementation plan before shipping.

## Option B — parked, not rejected

Worth revisiting if a real product reason emerges for treating a member's genuinely-first conversation differently from their hundredth — e.g., a richer "welcome back after a while" moment distinct from ordinary session context. Nothing in Option A precludes adding this later; it would sit alongside the always-on block as a separate, additive injection, not a replacement.

## Also fixed alongside this

`CLAUDE.md` gets `member-context.ts`, `primer`, and `auto_open` documented for the first time — this gap existing silently for as long as it did is directly attributable to this being unwritten anywhere.
