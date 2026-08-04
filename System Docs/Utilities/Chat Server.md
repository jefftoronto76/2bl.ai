# Chat Server — MEMBER CONTEXT

### Chat server — MEMBER CONTEXT (`services/chat/server/member-context.ts`)

Undocumented until 2026-07-31 — the gap that let a real bug ship silently for
weeks (see "Also fixed alongside this" in
`Design Handovers/Decision_MemberContext_Jul31.md`). `services/chat/server/` has
other files too (`booking.ts`, `media-context.ts`, `prompt.ts`, `stream.ts`)
referenced elsewhere in `System Docs/Marker Syntax.md` and
`System Docs/API Routes.md`; this entry
covers only `member-context.ts`, the one that was missing entirely.

`getMemberContext(sessionId, tenantId, memberId, isFirstTurn)` resolves the
authenticated (or pre-auth invite-holding) Heirloom member for the current
turn and returns the MEMBER CONTEXT text `streamChat()` (`services/chat/server/index.ts`)
injects into the system prompt as `MEMBER CONTEXT:\n${memberContext}` —
whenever the block is non-null, alongside the booking section and
question-mode context. **Always-on as of 2026-07-31** (previously a one-shot
primer, see below): computed unconditionally on every request where a member
resolves, matching `getBookingCardSection`'s pattern — fail-open, no lock.

Two resolution paths, same as before: `memberId` supplied directly (the
pre-auth invite-holder fast path — `app/api/sage/route.ts`'s `resolveMemberId`
resolves this via `validateMemberToken` when there's no Clerk session yet), or
`sessionId` → `chat_sessions.user_id` → `members.user_id` (the signed-in
path, resolved once per call, not cached on the session).

**What's in the block:** descriptive lines built from the member's
`invited_name`/`email`/`phone` ("Member's name is X. Email: Y. Phone: Z.")
plus the free-text `primer` column (see `System Docs/Database Schema.md`'s
`members` row) — all
unconditional every turn a member resolves; returns `null` only when none of
those four fields have data. **The `[NAME:]`/`[EMAIL:]`/`[PHONE:]`
marker-emission instruction is separate and gated on the caller-supplied
`isFirstTurn` flag** — it's appended only when `isFirstTurn` is true, never
based on anything stored per-member.

**`isFirstTurn` is computed deterministically in `streamChat()`, not inferred
by the model:** `!req.messages.some(m => m.role === 'assistant' && m.content.trim().length > 0)`
— true when this session's own message history (as sent on this request) has
no prior non-empty assistant turn. This exists because the model cannot be
trusted to reliably infer "is this my first reply in this conversation" from
re-reading its own prior turns in context, even though it technically can see
them (assistant content is passed through to the model unmodified turn to
turn — `services/chat/ui/v1/message.ts`'s `toModelMessages` only special-cases
`stopped: true` turns). The empty-content check exists so a failed first-turn
attempt (an empty assistant placeholder left in the stored transcript) doesn't
cause a retry to be misread as "already replied."

**History — one-shot primer → always-on (2026-07-31):** the original
implementation (`getMemberPrimer`) fired once per member, ever, gated by a
`members.primer_used_at` column that self-locked after first use. Heirloom's
compiled prompt was written assuming "member" and "MEMBER CONTEXT present"
were the same condition, but the one-shot gate meant every returning member,
from their second session onward, silently got nothing. `primer_used_at` has
been **removed entirely** — no read, no write, no column reference — rather
than kept as an unused diagnostic stamp; see `Design Handovers/Decision_MemberContext_Jul31.md`
for the full decision record (Option A vs. a parked Option B: a second,
separate "genuinely first-ever conversation" mechanism, revisit only if a real
product reason emerges).
