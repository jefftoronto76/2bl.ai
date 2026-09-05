# MEMBER CONTEXT — system audit, 2026-08-15

**Scope:** documentation only. Nothing was fixed, refactored, or changed. This
describes the system **as it exists today**, not as it should work.

**Method:** read the live code on `main` (as of `e22eccf`), the test suite (run
locally, passing), `System Docs/`, `Design Handovers/`, GitHub PR history
(#120–#123, #189, #240, #383), and — read-only — the live `natural-resource`
Supabase project to confirm what the compiled prompt actually contains and what
the member data actually looks like.

**Where I'm inferring rather than confirming, it says so inline.**

---

## 1. End-to-end flow

### 1.1 Call order, request → prompt

```
POST /api/sage                                    app/api/sage/route.ts
  ├─ getTenantFromRequest(req)                    → tenantId | null   (host → tenant)
  ├─ req.json()                                   → { messages, mode, session_id,
  │                                                    invite_token, prompt_type,
  │                                                    media_items }
  ├─ resolveMemberId(tenantId, inviteToken)       → memberId | null   [route-local fn]
  │    ├─ getCurrentUser()                        services/auth → Clerk currentUser()
  │    │    └─ if signed in:
  │    │         members WHERE tenant_id = ? AND clerk_id = user.providerUserId
  │    │         SELECT id                        → members.id | null
  │    └─ else if inviteToken:
  │         validateMemberToken(token)            services/members/members.ts
  │           members WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL
  │           then caller asserts row.tenant_id === tenantId
  │                                               → members.id | null
  └─ streamChat({ ..., memberId })                services/chat/server/index.ts
       ├─ isFirstTurn = !req.messages.some(m =>
       │      m.role === 'assistant' && m.content.trim().length > 0)
       ├─ Promise.all([
       │      getSystemPrompt(tenantId),          → compiled_prompts (live, max version)
       │      getBookingCardSection(tenantId),
       │      resolveModelConfig(tenantId),
       │      (sessionId || memberId)
       │        ? getMemberContext(sessionId, tenantId, memberId, isFirstTurn)
       │        : null,                           ← THE BLOCK
       │      resolveMediaContext(...),
       │      getSessionContext(sessionId, tenantId, isFirstTurn),
       │  ])
       ├─ systemPrompt = [basePrompt, bookingSection,
       │                  `MEMBER CONTEXT:\n${memberContext}`,
       │                  sessionContext, mediaContext, questionModeContext]
       │                 .filter(non-empty).join('\n\n')
       └─ runChatStream({ system: systemPrompt, ... })
```

### 1.2 Where identity actually gets resolved

There are **two independent identity resolutions** in this path, and they use
**different join keys**:

| # | Where | Query | Join key |
|---|---|---|---|
| 1 | `app/api/sage/route.ts` `resolveMemberId` | `members` by `tenant_id` + `clerk_id` | **`clerk_id`** |
| 2 | `services/chat/server/member-context.ts` (sessionId path only) | `chat_sessions.user_id` → `members` by `tenant_id` + `user_id` | **`user_id`** |

Resolution #1 runs first and wins. If it produces a `memberId`, `getMemberContext`
takes its fast path and **never touches `chat_sessions` at all**. Path #2 only
fires when the route produced no `memberId` but a `sessionId` exists — i.e. when
there's no Clerk session and no valid invite token, but the session row itself is
linked to a `users` row.

In practice that makes path #2 a narrow fallback. `chat_sessions.user_id` is
written at session-creation time by `syncUser()` in `app/api/sessions/route.ts`
(or later by `POST /api/sessions/[id]/claim`). *Inference, not confirmed by
instrumentation:* the realistic way path #2 fires is a signed-in member whose
`members.clerk_id` doesn't match the Clerk id in the current session — e.g. a
dev/preview environment where the value lives in `members.clerk_id_dev` instead.
I did not verify that empirically.

There is a **third**, unrelated `resolveMemberId` in `services/crm/feedback.ts`
(joins on `user_id`, accepts a client-supplied fallback id). It is not on this
path — it serves the feedback / memories / stories routes. Same name, different
function, different trust model. Worth knowing so a future search doesn't conflate
them.

### 1.3 What `getMemberContext` reads from the DB

`services/chat/server/member-context.ts`, guard order:

1. `if (!tenantId) return null`
2. `if (!sessionId && !memberId) return null`
3. **memberId path** — skips straight to step 5.
4. **sessionId path** — `chat_sessions.user_id` (filtered `id` + `tenant_id`),
   then `members.id` (filtered `user_id` + `tenant_id`).
5. The only substantive read:

```sql
SELECT id, primer, invited_name, email, phone
FROM members
WHERE id = <resolvedMemberId> AND tenant_id = <tenantId>
```

**Four data columns, confirmed exhaustively.** `invited_name`, `email`, `phone`,
`primer`. **`members.name` is NOT read** — confirmed, this is the gap you already
knew about (quantified in §3.2). Nothing else is read: not `role`, not `status`,
not `used_at`, not `created_at`. No other table contributes to this block.

### 1.4 What gets written into the prompt, exactly

Descriptive lines, space-joined, each conditional on its field being non-empty
after `.trim()`:

```
Member's name is {invited_name}. Email: {email}. Phone: {phone}. {primer}
```

The `primer` is appended **raw** — no label, no quotes, no XML wrapper (see §3.2).

Then, **only when `isFirstTurn === true` and at least one of name/email/phone
exists**, this is appended:

```

On your first reply, silently append each of the following hidden markers on their own line at the very end of your message (they are stripped before the member sees your reply):
[NAME: {invited_name}]
[EMAIL: {email}]
[PHONE: {phone}]
```

`streamChat` then wraps the whole thing:

```
MEMBER CONTEXT:
Member's name is Sarah. Email: sarah@example.com. Phone: +15551234567. They mentioned their dog Biscuit last visit.

On your first reply, silently append ...
[NAME: Sarah]
...
```

Position in the compiled prompt: **third segment** — after the base prompt and the
booking-card section, before `<session_context>`, media context, and question-mode
context.

### 1.5 The prompt side — what the model is told about this block

Confirmed by reading the live `compiled_prompts` row for the Heirloom tenant
(`20767f1d-…ac56`, version 23, `status='live'`, 29,580 chars). The string
`MEMBER CONTEXT` appears **exactly twice**:

1. *"Exception: if a MEMBER CONTEXT block is present, do not ask for name, email,
   or phone — this information is already known. Proceed directly to the
   conversation."*
2. *"When a MEMBER CONTEXT block is present in your context and provides a name,
   email, or phone number, emit the corresponding hidden marker(s) in your very
   first reply — you do not need to wait for the visitor to share that information
   themselves. Emit `[NAME: firstname]`, `[EMAIL: their_email]`, and/or
   `[PHONE: their_number]` as appropriate, silently and on their own lines, before
   anything else in your response."*

The live prompt does **not** mention `primer` at all. Two consequences:

- The prompt gives the model no framing for the primer text — it arrives as bare
  prose inside a block the prompt has described as authoritative member facts.
- **Occurrence #2 is a live remnant of the one-shot era** — see §2.3.

Note: `Design Handovers/contact-capture-research.md` attributes this language to
`DEFAULT_SYSTEM_PROMPT` in `services/prompt/sage-prompt.ts`. That is stale.
`DEFAULT_SYSTEM_PROMPT` is now a single-sentence "having a technical issue"
fallback with no marker instructions. The real text is the DB row above. (This
staleness is already logged in `System Docs/Known Gaps.md` line ~1690.)

### 1.6 Client side — what is and isn't sent

`services/chat/ui/v1/useChatTurn.ts` `streamTurn()` sends:

```json
{ "messages": [...], "mode": null, "session_id": "...",
  "invite_token": "...", "media_items": null }
```

**No `member_id`.** It used to be sent (PR #123, 2026-06-15) and was removed by
PR #189 (2026-07-13, security pre-trial) so the server derives identity itself
rather than trusting the client. That's the right call and it's correctly done.

The residue: `app/heirloom/page.tsx` still computes `validatedMemberId` (only when
`isAuthorized && !session && memberId`), passes it → `HeirloomApp` → `ChatProvider`
→ `memberIdRef` → the `getMemberId` accessor on `ChatEngineAccessors`. **Nothing
reads it.** `grep` for `accessors.getMemberId` returns zero call sites; only
`getInviteToken` is consumed by `streamTurn`. So the whole `memberId` prop chain
from `page.tsx` through to `useChatSession`'s accessors memo is dead weight, and
its doc comment in `services/chat/ui/v1/types.ts` ("/api/sage passes it to
getMemberContext") is factually wrong today. Harmless, but it's a live trap for
anyone reading the client to understand how member context works.

---

## 2. What triggers each state

### 2.1 Known member vs. anonymous visitor

`memberId` is non-null when **either**:

- **Signed-in path** — a Clerk session exists AND a `members` row exists for
  `tenant_id` + `clerk_id`. Note: **no `status` filter**. A `suspended` or
  soft-`deleted` member still resolves here. (`app/heirloom/page.tsx`'s own
  authorization check *does* filter `status='active'` — the two disagree. See §3.4.)
- **Pre-auth invite path** — no Clerk session, but `invite_token` matches a
  `members` row with `used_at IS NULL` and `revoked_at IS NULL`, and that row's
  `tenant_id` equals the request's tenant. Also no `status` filter. `expires_at`
  is **not** checked (documented elsewhere as "stamped but not yet enforced").

Everyone else is anonymous. Anonymous → `memberId` null → `getMemberContext` is
only called at all if a `sessionId` exists, and then returns null at the
`user_id` check.

### 2.2 Block renders vs. doesn't

Renders when all of:
- `tenantId` is non-null, and
- `sessionId || memberId`, and
- a `members` row resolves (by id, or via session → user_id → member), and
- **at least one** of `invited_name` / `email` / `phone` / `primer` is non-empty
  after trim.

Returns `null` (block omitted entirely — `.filter(segment => segment.length > 0)`
drops it) when any of those fail, **or on any DB error**. Fail-open by design:
"any error returns null so the chat is never blocked."

### 2.3 First-turn vs. every-turn — is the one-shot pattern gone?

**Server-side: yes, genuinely and completely gone.**

- `primer_used_at` has **zero code references** anywhere in the repo. Confirmed by
  full-tree grep: the only hits are a test-name string, a doc comment, and
  historical notes in `Design Handovers/`. No read, no write, no column in any
  select list.
- The `members` select list is `id, primer, invited_name, email, phone` — the
  column isn't even fetched.
- `member-context.test.ts` has an explicit regression test for this: the mocked
  `members` table object exposes only `select`, not `update`, so if the
  implementation ever tried to stamp a lock again the test would throw rather
  than pass.
- The descriptive lines are recomputed and re-injected on **every single turn**.

The **only** first-turn gate left in the code is `markerInstruction`, and it's
gated on the caller-supplied `isFirstTurn`, computed deterministically in
`streamChat`:

```ts
const isFirstTurn = !req.messages.some(
  m => m.role === 'assistant' && m.content.trim().length > 0,
)
```

The `.trim().length > 0` check exists so an empty assistant placeholder left by a
failed first attempt doesn't make a retry read as a later turn. That's tested.

**But there is a remnant — on the prompt side, not the code side.**

Compiled-prompt occurrence #2 (quoted in §1.5) tells the model, *on every turn*,
that when a MEMBER CONTEXT block is present it should emit the markers "in your
very first reply." Since the block is now always-on, that instruction is now in
the model's context on turn 1, turn 2, turn 40 — and the only thing stopping
re-emission on later turns is the model correctly self-assessing "this isn't my
first reply." That is precisely the reliance PR #240's decision record identified
as unsafe and solved server-side with `isFirstTurn`. The server-side half of the
fix landed; the DB-side prompt text was apparently never updated to match.

**Honest read on severity: low, but it's real.** Marker re-emission is close to
harmless in practice because:
- markers are stripped client-side before display (`services/chat/ui/v1/registry.ts`);
- `persistVisitorName` / `persistVisitorEmail` / `persistVisitorPhone`
  (`services/crm/session.ts`) each self-guard — they `SELECT` the existing value
  first and skip the write if one is already set, so repeat emission is idempotent.

So the cost is wasted tokens and a leak risk only if the client-side stripper ever
fails. Not data corruption. But it does mean the answer to *"is the one-shot
pattern fully gone?"* is **"gone from the code, still latent in the live prompt
text."** I'd treat that as one small, contained follow-up — a prompt edit in the
Composer, not a code change.

### 2.4 Data sources feeding the block — definitive list

| Source | Column | Written by | In block? |
|---|---|---|---|
| `members` | `invited_name` | `createMemberInvite` (admin `InviteMemberModal`, member-facing `InviteCollaboratorsModal`) | ✅ as "Member's name is X." + `[NAME:]` |
| `members` | `email` | Clerk sync on auth; invite creation | ✅ "Email: X." + `[EMAIL:]` |
| `members` | `phone` | Clerk sync on auth; invite creation | ✅ "Phone: X." + `[PHONE:]` |
| `members` | `primer` | invite creation (both flows); falls back to `tenants.default_primer` | ✅ raw, appended verbatim |
| `members` | `name` | `syncMember` on ordinary sign-in; three invite-acceptance paths | ❌ **never read** |
| `members` | `role`, `status`, `used_at`, `auto_open`, `primer_used_at` | — | ❌ not read |
| `chat_sessions` | `user_id` | `syncUser()` at creation; claim route | ⚠️ resolution only, not content |
| anything else | — | — | ❌ nothing |

`story_invite_links.primer` is a **separate column on a separate table** — it feeds
the story-invite flow, not `getMemberContext`. It reaches the prompt only if
`acceptStoryInvite` copies a value onto a `members` row. Flagged because
`Known Gaps.md` discusses both under one heading and they're easy to merge mentally.

---

## 3. How "built" is this — maturity assessment

### 3.1 Test coverage — yes, and it's good

This is the strongest part of the system. **40 tests across 3 files, all passing**
(run locally this session with `npx vitest run`, 1.25s):

**`services/chat/server/member-context.test.ts`** — 13 cases:
- `null` when `tenantId` is null (asserts DB never touched)
- `null` when neither `sessionId` nor `memberId` given (asserts DB never touched)
- *memberId path:* full block + marker instruction on first turn
- *memberId path:* descriptive lines only, no marker instruction, on a later turn
- *memberId path:* **"never gates on or references `primer_used_at`"** — identical
  result on repeated calls; the mock deliberately omits `update` so a resurrected
  lock would throw
- *memberId path:* only emits marker lines for fields that exist
- *memberId path:* `null` when all four fields are empty
- *memberId path:* `null` when no member row found
- *memberId path:* fails open on DB error
- *sessionId path:* resolves `user_id` → member
- *sessionId path:* `null` when session has no `user_id` (anonymous)
- *sessionId path:* `null` when no member row for the `user_id`
- *sessionId path:* fails open on DB error (×2 — session lookup, member-id lookup)

**`services/chat/server/index.test.ts`** — 3 cases under
`"streamChat — isFirstTurn computation for MEMBER CONTEXT"`:
- `isFirstTurn=true` when no prior assistant turn
- `isFirstTurn=false` when a non-empty assistant turn exists
- `isFirstTurn=true` when the only prior assistant turn is an empty failed-attempt
  placeholder

**`services/chat/server/session-context.test.ts`** — the sibling mechanism, for
comparison in §4.

**What is *not* covered:** nothing tests `resolveMemberId` in
`app/api/sage/route.ts` — neither the Clerk branch nor the invite-token branch nor
the tenant-mismatch rejection. There is no `app/api/sage/route.test.ts` at all.
That function is where the interesting identity decisions actually happen, and it's
untested. Also untested: that the block lands in the right *position* in the
assembled system prompt (the `Promise.all` result is mocked in `index.test.ts`).

### 3.2 Known gaps beyond `invited_name`

**No `TODO`/`FIXME`/`HACK` comments exist anywhere in `services/chat/server/`.**
The gaps are tracked in `System Docs/Known Gaps.md`, not in code.

**(a) `primer` has zero delineation in the prompt** — `Known Gaps.md` (two
entries, 2026-08-13 and re-flagged 2026-08-13/14). `primer` is concatenated raw,
immediately adjacent to a real instruction telling the model to silently emit
hidden markers. Admin-set `members.primer` is low risk (tenant admins only).
`story_invite_links.primer` is **member-wide** risk — any member who owns a story
can set 500 chars with no sanitization beyond trim/length. Compounded by story
invites forcing `autoOpenChat=true` and falling through to an automatic
`sendHidden('Hi')` on lookup failure — so a hostile primer can reach the model
with no visitor input at all. Fix is scoped in the doc (wrap in `<member_context>`
/ `<primer>` + `escapeForTag()`, reusing `session-context.ts`'s pattern) but
**explicitly not scheduled**.

**(b) `members.name` is never read — quantified.** Live production counts for the
Heirloom tenant, read 2026-08-15:

| | count |
|---|---|
| total `members` rows | 41 |
| with non-empty `invited_name` | 20 |
| with non-empty `primer` | 20 |
| **with `name` but no `invited_name`** | **11** |

So **11 of 41 members (27%) have a known display name that MEMBER CONTEXT
structurally cannot see.** Those are, by construction, the members who signed up
through an ordinary Clerk path rather than a named invite — `syncMember` writes
`name`, never `invited_name`. For them the block renders (if they have
email/phone/primer) but with no name line and no `[NAME:]` marker, while the
compiled prompt is simultaneously telling the model *"do not ask for name, email,
or phone — this information is already known."* That combination is worse than
either half alone: Sage is instructed not to ask for a name it was never given.

**(c) `primer_used_at` is dead in code but alive in the DB** — the column still
exists and **13 rows still carry a non-null value**. Zero code references, so it's
inert, but it's live data that looks meaningful and isn't. `Known Gaps.md` /
`Database Schema.md` already describe it as vestigial pending a Studio drop.

**(d) No `status` filter on either identity resolution** — §2.1. A member with
`status = 'suspended'` or `'deleted'` still resolves in
`app/api/sage/route.ts`'s `resolveMemberId` and still gets their name, email,
phone, and primer injected. `app/heirloom/page.tsx` filters `status='active'` for
page authorization, so the two layers disagree. *I did not find this documented
anywhere* — as far as I can tell it's a new observation, not a known gap. Practical
exposure is limited (they'd have to reach `/api/sage` directly, having been kept
out of the page UI), but it is a real inconsistency and it's the sort of thing a
"deleted member's data should stop being used" review would flag.

**(e) No audit-event coverage.** `member-context.ts` uses `console.log` /
`console.error` exclusively — six call sites. There is no `AuditAction` for member
context at all. Compare its two immediate siblings in the same `Promise.all`:
media context logs `CHAT_MEDIA_CONTEXT_RESOLVED`, session context logs
`CHAT_SESSION_CONTEXT_ATTACHED`. This diverges from `CLAUDE.md` rule 6 ("use
`audit_events` for anything worth persisting or debugging later — `console.log`
output is ephemeral and unqueryable"). Consequence: **there is no way to query how
often the block actually fires, or how often it silently returns null.** Any future
question like "are returning members really getting context now?" cannot be
answered from data — only by reading Vercel logs before they roll off.

Note also that the existing `console.log` at `member-context.ts:143` writes
`resultPreview: result.slice(0, 200)` — which puts the member's **name, email and
phone in plaintext** into logs on every turn. `CLAUDE.md` rule 6 says "never log
raw PII… category/length/presence only." Same class of divergence, opposite
direction.

**(f) Stale comments/docs on the path** — the `getMemberId` accessor doc in
`services/chat/ui/v1/types.ts` (§1.6), `ChatStreamRequest.memberId`'s "pre-auth
invited member" description in `services/chat/server/types.ts` (it's set for
signed-in members too), `contact-capture-research.md`'s `DEFAULT_SYSTEM_PROMPT`
attribution (§1.5), and `stream-unification-plan.md`'s entries still describing
`getMemberPrimer` with `primer_used_at` (a pre-#240 doc, never updated).

### 3.3 Is it considered stable/finished internally?

**My read: it was built fast, then repaired carefully once, and the repair is
solid. The original is not.**

The timeline from PR history:

| Date | PR | What |
|---|---|---|
| 2026-06-15 19:37 | #120 | primer custom greeting + auto-open on invite landing |
| 2026-06-15 21:45 | #121 | invite enhancements — auto-open, primer, marker pre-seeding |
| 2026-06-15 22:29 | #122 | auto-greeting, marker pre-fill, diagnostic logging |
| 2026-06-15 22:49 | #123 | **fix:** thread `memberId` through for pre-auth invited members |
| 2026-06-16 00:41 | #125 | fix: member reconciliation via Clerk `unsafeMetadata` |

**Five PRs in roughly five hours on a single evening**, two of them labelled `fix:`
for the one before. That is the signature of a fast, iterative build, not a
designed one. PR #123's own description confirms the shape: the `user_id` join
simply didn't work for invited members, and the fix was to thread an id down
through eight files. It shipped with **no tests** (the PR lists ten changed files,
none a test file) and, per PR #240, **no documentation anywhere** — not in
`CLAUDE.md`, not in `DB_CHANGELOG.md`.

The consequence is stated bluntly in `Design Handovers/Decision_MemberContext_Jul31.md`:

> "This went unnoticed because `member-context.ts`, `primer`, and `auto_open` were
> completely undocumented."

A one-shot gate silently broke the feature for every returning member from their
second session onward, and it stayed broken for **six weeks** (Jun 15 → Jul 31)
without anyone noticing, because nothing was written down and nothing was tested.

**PR #240 (2026-07-31) is a different quality of work.** It has a real decision
record with a considered-and-rejected alternative (Option B, explicitly *parked,
not rejected* — a separate "genuinely first-ever conversation" moment, to revisit
only if a product reason emerges). It identifies the one non-obvious risk of the
change (markers were safe only by coincidence under one-shot) and closes it
deliberately with a server-computed signal rather than trusting the model. It
removes `primer_used_at` entirely rather than leaving a dead stamp. It ships 14 new
test cases. It backfills the documentation that was missing.

So: **the always-on mechanism is stable and finished. The identity resolution
feeding it is not** — it's the June code, still untested, still without a `status`
check, still swallowing errors. Nobody has audited `resolveMemberId` since #189
touched it for a different reason.

### 3.4 Error-handling gaps — where identity fails silently

Ordered roughly by how much I'd care:

**1. `app/api/sage/route.ts` `resolveMemberId` — discards the Supabase error.**
```ts
const { data: memberRow } = await supabase.from('members')...
return (memberRow as { id: string } | null)?.id ?? null
```
`error` is not destructured, not checked, not logged. A transient Supabase failure
is indistinguishable from "this signed-in user isn't a member." The member silently
becomes anonymous for that turn — and if `sessionId` is present, the block may then
resolve *differently* via the `user_id` fallback path, or not at all. Nothing
anywhere records that it happened. **This is the one you already knew about; it's
the worst of the set.**

**2. Same function — `getCurrentUser()` is not wrapped in try/catch.** It calls
Clerk's `currentUser()`, a network call to Clerk's backend. If it throws, the
exception propagates out of `POST` and the whole chat turn 500s. Compare
`services/crm/feedback.ts`'s `resolveMemberId`, which wraps the equivalent call
with an explicit comment explaining exactly why:

> "If `auth()` ever throws for that anonymous-request shape (rather than cleanly
> resolving to no session), the exception must not surface as an uncaught 500 —
> it's just another way of having 'no server-verified identity'."

The same reasoning applies verbatim to `/api/sage`, which also serves fully
anonymous jefflougheed widget traffic. The guard was written for the lower-stakes
route and not for the higher-stakes one. *I have not confirmed that Clerk actually
throws for that shape* — the feedback-route comment treats it as a real
possibility, and I'd treat it the same way, but it's a defensive gap rather than a
demonstrated bug.

**3. `validateMemberToken` — silent on error.** `if (error || !data) return null`.
A DB failure and an invalid token produce the identical result with no log line at
all. Every invite-holder resolution passes through here.

**4. `getMemberContext` itself — logs but never surfaces.** Four failure branches
`console.error` and return null. That's deliberate and correct as a *policy*
(fail-open, never block a chat), but combined with §3.2(e) — no audit events — it
means the failures are invisible in practice. The chat succeeds, the member is
silently treated as a stranger, and there's nothing queryable afterward.

**5. `app/heirloom/page.tsx` — same discard pattern.** Both the `tenants` settings
read and the `members` authorization read destructure `data` only. A DB error there
means `isAuthorized = false` and the visitor is gated out with no diagnostic.

**Net:** every layer of this path fails open and silent. Individually each is
defensible. Cumulatively, a member can be silently demoted to anonymous at five
different points, and there is no way to detect it after the fact — no audit event,
no counter, no alert.

---

## 4. Compare against `chat_session_context`

### 4.1 Was it designed to cover member context?

**No. Not planned, not stubbed, not mentioned.** Checked exhaustively:

- **PR #383's description** — full text read. It describes a generic mechanism and
  explicitly names the intended future types: *"a future use case (a different
  artifact, a booking, a document) adds one registry entry rather than a redesign."*
  **Member context is not in that list.** The PR mentions `member-context.ts`
  exactly twice, both times to say it was deliberately *left alone*: once for the
  fail-open posture it was copying, and once under "Reviewer attention" — *"`member-context.ts`'s own `primer` field does **not** get this treatment in this PR
  — that's a separate, already-tracked gap, left alone deliberately."*
- **The schema** — `context_type` is plain `text` with **no CHECK constraint and no
  enum** (deliberate, matching `artifacts.type`'s precedent, so a new type ships
  with zero migration). So there is no enum to have stubbed `'member'` into, and
  nothing to inspect for intent. The only value described anywhere is `'story'`.
- **The code** — `CONTEXT_BLOCK_BUILDERS` and `CONTEXT_REF_VALIDATORS` each have
  exactly one entry: `story`. No commented-out entries, no placeholders.
- **`System Docs/DB_CHANGELOG.md`** — *"First (and currently only) `context_type`:
  `'story'`."*

### 4.2 Any half-built member-related code touching it?

**None.** Full-tree grep for `chat_session_context` returns 4 code hits total
(`session-context.ts` ×2, its test ×2) plus docs. No commented-out blocks. No
`'member'` string anywhere near it.

The one adjacent WIP branch — `2026-08-13-story-click-routing`, commit `4b3aa9f9`,
checkpointed and never merged — is documented in `Known Gaps.md` and was **not**
member-related: it wired story-click routing via a discarded client-only approach
with no `chat_session_context` row at all. It was deliberately not resumed.

One more data point worth knowing: **`chat_session_context` currently has zero rows
in production** (confirmed by live query, 2026-08-15). The mechanism and its UI
entry point are both merged, but nothing has exercised it end-to-end yet. PR #383
says as much: *"Not yet possible to verify end-to-end on a live preview… this PR's
mechanism is exercised only by its own unit/integration tests."* So when comparing
maturity: MEMBER CONTEXT is battle-tested-but-under-designed; `chat_session_context`
is well-designed-but-unexercised.

### 4.3 Could it replace the live `members` lookup? — my honest technical read

**These are different mechanisms that rhyme. They are not converging, and forcing
them together would be a downgrade.**

The clean way to see it is what each one is keyed on:

| | MEMBER CONTEXT | `chat_session_context` |
|---|---|---|
| Keyed on | **a person** (`members.id`) | **a session** (`chat_sessions.id`, UNIQUE) |
| Lifetime | as long as the member exists | one session, forever |
| Written by | nothing — derived at read time | an explicit `attachSessionContext` call at session creation |
| Freshness | live, re-read every turn | a **pointer**, resolved live every turn |
| Cardinality | 1 member : N sessions | 1 session : 1 context row |
| Fires when | identity resolves, any session | a row was deliberately written for this session |

The decisive structural facts:

**(a) The `session_id UNIQUE` constraint is a hard blocker.** One context row per
session, period. A story-scoped session that also wanted member context would need
two rows and can't have them. `Database Schema.md` notes the constraint could be
dropped later to allow multiple — but that's a schema change plus a rewrite of
`getSessionContext` (which does `.maybeSingle()`), not a registry entry.

**(b) The write model is fundamentally wrong for identity.** `attachSessionContext`
is called **once**, from `POST /api/sessions`, in the same request that creates the
session. Member identity frequently isn't known at that moment — that's the entire
reason the pre-auth invite fast path exists (PR #123), and the entire reason
`chat_sessions.user_id` is null until sign-in. A visitor who signs up *mid-session*
via `[ACCOUNT_CREATE:]` → `MagicLinkCard` → the claim route becomes a known member
**after** the session row was created. Under the current MEMBER CONTEXT design that
just works — the next turn's live lookup finds them. Under a
`chat_session_context`-based design you'd need a second write path to attach
context retroactively mid-session, which `attachSessionContext` has no concept of.

**(c) The staleness argument cuts the other way from how it first looks.**
`chat_session_context` stores a *reference*, not content — `getSessionContext`
re-resolves it via `getStoryById` on every turn. So it isn't actually a cache, and
"per-session-cached vs. always-live" isn't the real distinction. The real one is
**what the reference points at**: for a story, an immutable-per-session pointer is
correct (this session *is about* this story, and always will be). For a member,
"which member is this" is a property that can change *during* a session. Pinning it
at creation time would be modelling a mutable fact as an immutable one — which is
structurally the same mistake `primer_used_at` made, just relocated from a
`members` column to a join table.

**(d) There is one genuine, narrow overlap** — `context_frequency: 'once'` vs.
`'every_turn'` is the same *idea* as `isFirstTurn`, and both read the identical
signal (`getSessionContext` takes `isFirstTurn` as a parameter and its own doc
comment says so: *"the same deterministic signal streamChat already computes for
MEMBER CONTEXT's marker instruction"*). That's already shared. There's nothing left
to unify there.

**Where they genuinely should converge — and it isn't the table.** The thing
`chat_session_context` has that MEMBER CONTEXT lacks is the **delineation pattern**:
XML tags + `escapeForTag()` + an explicit "reference data, never instructions"
sentence. That's a ~10-line change to `member-context.ts` with a proven precedent
now sitting next to it, and it closes the tracked security gap in §3.2(a). It
requires no schema change, no table, and no shared mechanism. `Known Gaps.md`
already scopes exactly this and notes the fix is *"now more clearly scoped than it
was on 2026-08-13"* precisely because #383 built the pattern.

**Summary judgment:** they should share a *convention*, not a *table*. If someone
proposes folding member context into `chat_session_context`, the questions that
should sink it are: what happens to a session whose member identity changes
mid-conversation, and what happens when a session needs both a story and a member.
Both have clean answers today and neither has a clean answer under a unified table.

---

## Appendix — files on this path

| File | Role |
|---|---|
| `app/api/sage/route.ts` | HTTP adapter; `resolveMemberId` (Clerk / invite-token) |
| `services/auth/providers/clerk/server.ts` | `getCurrentUser()` → `providerUserId` |
| `services/members/members.ts` | `validateMemberToken` |
| `services/chat/server/index.ts` | `streamChat`; `isFirstTurn`; prompt assembly |
| `services/chat/server/member-context.ts` | **the block** — DB read + string build |
| `services/chat/server/member-context.test.ts` | 13 tests |
| `services/chat/server/index.test.ts` | 3 `isFirstTurn` tests |
| `services/prompt/compiler.ts` | `getSystemPrompt` → `compiled_prompts` |
| `services/chat/server/session-context.ts` | sibling mechanism (`chat_session_context`) |
| `services/crm/session.ts` | `persistVisitorName/Email/Phone` — marker landing site |
| `app/heirloom/page.tsx` | server-side member/invite resolution for the page |
| `services/chat/ui/v1/useChatTurn.ts` | client `/api/sage` payload (`invite_token` only) |
| `Design Handovers/Decision_MemberContext_Jul31.md` | the always-on decision record |
| `System Docs/Utilities/Chat Server.md` | current mechanism reference |
| `System Docs/Known Gaps.md` | `primer` delineation gap (2 entries) |

**Live-data claims in this document** (Heirloom tenant, read-only, 2026-08-15):
compiled prompt version 23 / `status='live'` / 29,580 chars / 2 `MEMBER CONTEXT`
occurrences / no `primer` mention; `members` 41 total, 20 `invited_name`, 20
`primer`, 11 `name`-without-`invited_name`, 13 `primer_used_at` still set;
`chat_session_context` 0 rows.
