# Heirloom — Identity & Member Context

**A system report on how Heirloom recognizes people, and what it knows about them.**

Compiled 2026-08-16 · Investigation only — no code, schema, or prompt was changed.

---

## How to read this

This report merges two investigations that turned out to be the same subject
seen from two ends:

- **Part 1 — Member context.** Once someone is recognized, what does the system
  know about them, and how does that reach the AI's prompt?
- **Part 2 — Sign-up & sign-in paths.** How does someone become recognizable in
  the first place? Every distinct door into an account, and what each one writes.
- **Part 3 — Consolidated findings.** Everything worth acting on, deduplicated
  across both parts and ranked. **If you read one section, read this one.**

**Method.** Both parts were walked fresh from the code on `main` (at `e22eccf`),
not from prior documentation. Sources: `middleware.ts`, every
`app/api/**/route.ts`, `services/auth/**`, `services/chat/server/**`,
`services/members/members.ts`, `services/crm/story-invites.ts`, the Heirloom
membership shell components, the test suite (executed locally, passing), GitHub
PR history, and read-only queries against the live `natural-resource` Supabase
project.

**Confidence.** Claims here are confirmed from code or live data unless marked
*inferred*. Inferences are flagged inline and never presented as fact. Live
production numbers are labelled as such with their read date.

---

# Part 1 — Member context

## 1.1 What it is

"MEMBER CONTEXT" is a block the server injects into the AI's system prompt on
every chat turn where it recognizes the visitor as a known member. It carries
their name, email, phone, and a free-text "primer" an inviter wrote about them.
Its purpose is to stop Sage asking a known member for details the system already
has.

## 1.2 End-to-end flow

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
  │    └─ else if inviteToken:
  │         validateMemberToken(token)            services/members/members.ts
  │           members WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL
  │           then caller asserts row.tenant_id === tenantId
  └─ streamChat({ ..., memberId })                services/chat/server/index.ts
       ├─ isFirstTurn = !req.messages.some(m =>
       │      m.role === 'assistant' && m.content.trim().length > 0)
       ├─ Promise.all([
       │      getSystemPrompt(tenantId),          → compiled_prompts (live, max version)
       │      getBookingCardSection(tenantId),
       │      resolveModelConfig(tenantId),
       │      getMemberContext(sessionId, tenantId, memberId, isFirstTurn),  ← THE BLOCK
       │      resolveMediaContext(...),
       │      getSessionContext(sessionId, tenantId, isFirstTurn),
       │  ])
       ├─ systemPrompt = [basePrompt, bookingSection,
       │                  `MEMBER CONTEXT:\n${memberContext}`,
       │                  sessionContext, mediaContext, questionModeContext]
       │                 .filter(non-empty).join('\n\n')
       └─ runChatStream({ system: systemPrompt, ... })
```

## 1.3 Where identity is resolved — and the two join keys

Two independent resolutions happen on this path, **using different join keys**:

| # | Where | Query | Join key |
|---|---|---|---|
| 1 | `app/api/sage/route.ts` `resolveMemberId` | `members` by `tenant_id` + `clerk_id` | **`clerk_id`** |
| 2 | `services/chat/server/member-context.ts` (sessionId path) | `chat_sessions.user_id` → `members` by `tenant_id` + `user_id` | **`user_id`** |

Resolution #1 runs first and wins. When it yields a `memberId`,
`getMemberContext` takes its fast path and never touches `chat_sessions`.
Path #2 is a narrow fallback that only fires when there is no Clerk session and
no valid invite token, but the session row is itself linked to a `users` row.

There is a **third**, unrelated `resolveMemberId` in `services/crm/feedback.ts`
(joins on `user_id`, accepts a client-supplied fallback id). It is not on this
path — it serves the feedback / memories / stories routes. Same name, different
function, different trust model.

## 1.4 What is read from the database

`services/chat/server/member-context.ts`, the only substantive read:

```sql
SELECT id, primer, invited_name, email, phone
FROM members
WHERE id = <resolvedMemberId> AND tenant_id = <tenantId>
```

**Four data columns, confirmed exhaustively.** `invited_name`, `email`, `phone`,
`primer`.

**`members.name` is never read.** Nothing else contributes to this block — not
`role`, not `status`, not `used_at`, and no other table.

## 1.5 What is written into the prompt

Descriptive lines, space-joined, each conditional on its field being non-empty:

```
Member's name is {invited_name}. Email: {email}. Phone: {phone}. {primer}
```

The `primer` is appended **raw** — no label, no quotes, no wrapper.

Then, only when `isFirstTurn` is true **and** at least one of name/email/phone
exists:

```
On your first reply, silently append each of the following hidden markers on their own line
at the very end of your message (they are stripped before the member sees your reply):
[NAME: {invited_name}]
[EMAIL: {email}]
[PHONE: {phone}]
```

`streamChat` prefixes the whole thing with `MEMBER CONTEXT:` and places it as
the **third segment** of the compiled prompt — after the base prompt and the
booking-card section, before `<session_context>`, media context, and
question-mode context.

## 1.6 What the AI is told about the block

Confirmed by reading the live `compiled_prompts` row for the Heirloom tenant
(version 23, `status='live'`, 29,580 chars). `MEMBER CONTEXT` appears **exactly
twice**:

1. *"Exception: if a MEMBER CONTEXT block is present, do not ask for name,
   email, or phone — this information is already known. Proceed directly to the
   conversation."*
2. *"When a MEMBER CONTEXT block is present in your context and provides a name,
   email, or phone number, emit the corresponding hidden marker(s) in your very
   first reply…"*

The live prompt does **not** mention `primer` at all — so the model gets no
framing for that text; it arrives as bare prose inside a block the prompt has
described as authoritative member facts.

> **Doc correction:** `Design Handovers/contact-capture-research.md` attributes
> this language to `DEFAULT_SYSTEM_PROMPT` in `services/prompt/sage-prompt.ts`.
> That is stale — that constant is now a single-sentence "having a technical
> issue" fallback with no marker instructions. The real text is the DB row above.

## 1.7 What triggers each state

**Known member vs. anonymous.** `memberId` is non-null when either a Clerk
session matches a `members` row on `tenant_id` + `clerk_id`, **or** an
`invite_token` matches a row with `used_at IS NULL` and `revoked_at IS NULL`
whose `tenant_id` matches the request. Neither check filters on `status`.
`expires_at` is not enforced on the invite path.

**Block renders** when a tenant resolves, a member row resolves, and at least
one of the four fields is non-empty. It returns `null` — and the segment is
dropped entirely — on any miss **or any DB error**. Fail-open by design.

**First-turn vs. every-turn.** The historical `primer_used_at` one-shot gate is
**completely gone from the code**: zero references repo-wide, the column isn't
even in the select list, and there is a regression test whose mock omits
`update` so a resurrected lock would throw rather than pass. The descriptive
lines are recomputed on every turn.

The only remaining first-turn gate is the marker instruction, driven by a
deterministic server-side signal:

```ts
const isFirstTurn = !req.messages.some(
  m => m.role === 'assistant' && m.content.trim().length > 0,
)
```

The `.trim().length > 0` check exists so an empty assistant placeholder from a
failed first attempt doesn't make a retry read as a later turn. Tested.

**However — a remnant survives on the prompt side.** Compiled-prompt occurrence
#2 tells the model, on *every* turn, to emit markers "in your very first reply."
Because the block is now always-on, that instruction is in context on turn 1,
turn 2, turn 40 — and only the model's own self-assessment prevents
re-emission. That is exactly the reliance the July decision record identified as
unsafe and solved server-side. **The code half of the fix landed; the prompt text
was never updated to match.**

Severity is low: markers are stripped client-side before display, and
`persistVisitorName` / `persistVisitorEmail` / `persistVisitorPhone` each
`SELECT` the existing value first and skip the write if one is set, so repeat
emission is idempotent. The cost is wasted tokens plus a leak risk only if the
client-side stripper fails. But the answer to *"is the one-shot pattern fully
gone?"* is **"gone from the code, still latent in the live prompt."** The fix is
a Composer edit, not a code change.

## 1.8 Data sources — definitive

| Source | Column | Written by | In block? |
|---|---|---|---|
| `members` | `invited_name` | `createMemberInvite` (admin + member-facing invite flows) | ✅ "Member's name is X." + `[NAME:]` |
| `members` | `email` | Clerk sync on auth; invite creation | ✅ "Email: X." + `[EMAIL:]` |
| `members` | `phone` | Clerk sync on auth; invite creation | ✅ "Phone: X." + `[PHONE:]` |
| `members` | `primer` | invite creation; falls back to `tenants.default_primer` | ✅ raw, verbatim |
| `members` | `name` | `syncMember` on sign-in; three invite-acceptance paths | ❌ **never read** |
| `members` | `role`, `status`, `used_at`, `auto_open`, `primer_used_at` | — | ❌ not read |
| `chat_sessions` | `user_id` | `syncUser()` at creation; claim route | ⚠️ resolution only |

`story_invite_links.primer` is a **separate column on a separate table**. It
reaches this block only if `acceptStoryInvite` copies a value onto a `members`
row.

## 1.9 Test coverage

The strongest part of the system. **40 tests across 3 files, all passing** (run
locally, 1.25s).

`services/chat/server/member-context.test.ts` — 13 cases: null-guards that assert
the DB is never touched; full block + marker instruction on first turn;
descriptive lines only on later turns; **an explicit "never gates on or
references `primer_used_at`" regression test**; per-field marker emission; null
when all four fields empty; null when no row; fail-open on DB error; and the
full sessionId path including its two error branches.

`services/chat/server/index.test.ts` — 3 cases covering the `isFirstTurn`
computation, including the empty-placeholder retry edge case.

**Not covered:** `resolveMemberId` in `app/api/sage/route.ts` has no tests at
all — neither the Clerk branch, the invite-token branch, nor the tenant-mismatch
rejection. There is no `app/api/sage/route.test.ts`. That function is where the
interesting identity decisions happen. Also untested: that the block lands in the
right *position* in the assembled prompt.

## 1.10 Maturity — how "built" is this?

**Built fast, repaired carefully once. The repair is solid; the original is not.**

| Date | PR | What |
|---|---|---|
| 2026-06-15 19:37 | #120 | primer custom greeting + auto-open on invite landing |
| 2026-06-15 21:45 | #121 | invite enhancements — auto-open, primer, marker pre-seeding |
| 2026-06-15 22:29 | #122 | auto-greeting, marker pre-fill, diagnostic logging |
| 2026-06-15 22:49 | #123 | **fix:** thread `memberId` through for pre-auth invited members |
| 2026-06-16 00:41 | #125 | fix: member reconciliation via Clerk `unsafeMetadata` |
| 2026-07-13 | #189 | security: `/api/sage` derives `memberId` server-side |
| 2026-07-31 | #240 | **MEMBER CONTEXT injection made always-on** |

Five PRs in roughly five hours on one evening, two labelled `fix:` for the one
before. PR #123 shipped with **no tests** and, per PR #240, **no documentation
anywhere**. The consequence, stated in the decision record:

> "This went unnoticed because `member-context.ts`, `primer`, and `auto_open`
> were completely undocumented."

A one-shot gate silently broke the feature for every returning member from their
second session onward, and stayed broken for **six weeks** because nothing was
written down and nothing was tested.

**PR #240 is a different quality of work.** Real decision record with a
considered-and-parked alternative; identifies the one non-obvious risk of going
always-on and closes it with a server-computed signal rather than trusting the
model; removes `primer_used_at` entirely rather than leaving a dead stamp; ships
14 test cases; backfills the missing docs.

**Net: the always-on mechanism is stable and finished. The identity resolution
feeding it is not** — it is the June code, still untested, still without a
`status` check, still swallowing errors.

## 1.11 Comparison against `chat_session_context`

**Was it designed to cover member context? No — not planned, not stubbed, not
mentioned.** Checked exhaustively:

- **PR #383's description** names its intended future types: *"a different
  artifact, a booking, a document."* Member context is not in that list. The PR
  mentions `member-context.ts` twice, both times to say it was deliberately left
  alone.
- **The schema** — `context_type` is plain `text` with no CHECK and no enum
  (deliberate, matching `artifacts.type`), so there is no enum to have stubbed
  `'member'` into.
- **The code** — `CONTEXT_BLOCK_BUILDERS` and `CONTEXT_REF_VALIDATORS` each have
  exactly one entry: `story`. No commented-out entries, no placeholders.
- **No half-built member code anywhere.** Full-tree grep for
  `chat_session_context` returns 4 code hits (the service + its test). The one
  adjacent unmerged WIP branch was story-routing, not member-related, and was
  deliberately not resumed.
- **Zero rows in production.** The mechanism and its UI entry point are both
  merged but nothing has exercised it end to end.

### Could it replace the live `members` lookup? — technical read

**These are different mechanisms that rhyme. They are not converging, and
forcing them together would be a downgrade.**

| | MEMBER CONTEXT | `chat_session_context` |
|---|---|---|
| Keyed on | **a person** (`members.id`) | **a session** (`chat_sessions.id`, UNIQUE) |
| Lifetime | as long as the member exists | one session, forever |
| Written by | nothing — derived at read time | explicit `attachSessionContext` at session creation |
| Freshness | live, re-read every turn | a *pointer*, resolved live every turn |
| Cardinality | 1 member : N sessions | 1 session : 1 context row |

Three decisive facts:

**(a) The `session_id UNIQUE` constraint is a hard blocker.** One context row per
session. A story-scoped session that also wanted member context would need two
rows and can't have them. Dropping the constraint means a schema change plus
rewriting `getSessionContext` (which uses `.maybeSingle()`) — not a registry
entry.

**(b) The write model is wrong for identity.** `attachSessionContext` is called
once, at session creation — precisely when member identity often isn't known
yet. That is the whole reason the pre-auth invite fast path exists, and why
`chat_sessions.user_id` is null until sign-in. A visitor who signs up
*mid-session* becomes a known member **after** the session row was created.
Today that just works: the next turn's live lookup finds them. Under a
`chat_session_context` design you'd need a retroactive attach path that doesn't
exist.

**(c) "Cached vs. live" is the wrong framing.** `chat_session_context` stores a
*reference* and re-resolves it every turn, so it isn't a cache. The real
distinction is what the reference points at: for a story, an
immutable-per-session pointer is correct. For a member, "which member is this"
can change *during* a session. Pinning it at creation would model a mutable fact
as an immutable one — structurally the same mistake `primer_used_at` made, just
relocated to a join table.

**Where they genuinely should converge — the convention, not the table.** What
`chat_session_context` has that MEMBER CONTEXT lacks is the **delineation
pattern**: XML tags + `escapeForTag()` + an explicit "reference data, never
instructions" sentence. That is a ~10-line change to `member-context.ts` with a
proven precedent now sitting beside it, and it closes the tracked security gap.
No schema change, no shared table.

If someone proposes folding member context into `chat_session_context`, the two
questions that should sink it are: *what happens to a session whose member
identity changes mid-conversation*, and *what happens when a session needs both
a story and a member*. Both have clean answers today; neither does under a
unified table.

---

# Part 2 — Sign-up & sign-in path inventory

Every distinct way a person can create an account or authenticate, across
`heirloom.2bl.ai`, `2bl.ai` / `www.2bl.ai`, and `jefflougheed.ca` /
`legacy.2bl.ai`.

## 2.1 A note on "sign-up vs sign-in"

Rows 1–4 below all run the same `useAuthFlow` →
`services/auth/providers/clerk/client.ts` `sendCode` state machine, which is
**not** a sign-up form or a sign-in form — it is one form that decides for
itself. It calls `signUp.create()` first; an existing identifier returns
`form_identifier_exists` and the attempt is rerouted to `signIn`. The resolved
branch comes back as `flowType: 'signin' | 'signup'`, which is how `SaveChatCTA`
renders "Welcome back — your story is saved." vs "You're now a member." off the
same submit. The visitor never chooses, and those surfaces have no "already have
an account?" affordance because they don't need one.

Rows 5–8 are prebuilt Clerk surfaces, where the split is whatever Clerk's own
modal offers. Rows 9–10 are neither — `users` writes around an existing session.

## 2.2 Table A — Authentication paths (Clerk-backed)

| # | Path name | Sign-up or sign-in? | Entry point | Trigger | Identifier | Handler(s) | Writes `members`? | Writes `users`? | Name captured? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Admin invite link → chat OTP** | **Both — auto-detected.** New invitee → sign-up. Returning member re-clicking their link → sign-in (and `acceptInvite` then 404s on the used token) | `app/invite/[token]/route.ts` → `/?invite=TOKEN` → `app/heirloom/page.tsx` → `MessageList.tsx` → `MagicLinkCard.tsx` | Admin-created invite link, clicked | Email **or** phone (visitor picks tab) | `useAuthFlow` → `sendCode` (`signUp.create` + `signUp.update({unsafeMetadata:{heirloom_invite_token}})`) → Clerk `user.created` webhook → `linkInvitedMember()`; **racing** client `POST /api/heirloom/invites/accept` → `acceptInvite()` | **Yes** — updates the pre-existing invited row: `clerk_id`, `user_id`, `status='active'`, `source='invite'`, `used_at`, and `name` **only if currently null** | **Yes** — `linkInvitedMember` upserts `clerk_id`,`email`; webhook upserts `clerk_id`,`name`,`email`,`phone`; `acceptInvite` path uses `ensureClerkUser()` | **Yes** — name field required in `MagicLinkCard` → Clerk `firstName`/`lastName` → `users.name` + `members.name` (null-guarded). `invited_name` is separate, set at invite creation |
| 2 | **Story invite link → chat OTP** | **Both — auto-detected.** Sign-in is first-class here, not an edge: the link is durable and multi-use, so an existing member hits `acceptStoryInvite`'s `isNewMember: false` branch | `app/join/[token]/route.ts` → `/?join=TOKEN` → `app/heirloom/page.tsx` → `MagicLinkCard.tsx` | Durable, multi-use story link (`story_invite_links`) | Email **or** phone | Same `useAuthFlow` (`unsafeMetadata.heirloom_story_invite_token`) → webhook `acceptStoryInvite()`; **racing** client `POST /api/heirloom/story-invites/accept` | **Yes** — **inserts a new row**: `clerk_id`, `user_id`, `role='member'`, `status='active'`, `source='story_invite'`, `primer` (from the link), `name`. Also inserts `artifact_subscribers` | **Yes** — webhook upsert + `ensureClerkUser()` | **Yes** — name field → Clerk → `name` param on `acceptStoryInvite` → `members.name` on insert |
| 3 | **Chat self-serve — `[ACCOUNT_CREATE:]`** | **Both — auto-detected.** Named for sign-up, but a signed-out returning member signs in through the identical form | `MessageList.tsx` (marker-triggered) → `MagicLinkCard.tsx` | Sage emits `[ACCOUNT_CREATE: reason]`; no invite token | Email **or** phone | `useAuthFlow` (no tokens) → webhook `linkInvitedMember()` by **email fallback** → else `syncMember()`. Client: `handleAuthSuccess` → `claimCurrentSession()` + `POST /api/members/sync` | **Yes** — `syncMember` upserts on `clerk_id`: `user_id`, `status='active'`, `name`, `email`, `phone`. `source` left null | **Yes** — `syncMember` upsert; `/api/members/sync` separately upserts when a name was supplied | **Yes** — required name field → both `users.name` and `members.name` |
| 4 | **Chat self-serve — `SaveChatCTA`** | **Both — auto-detected, and it says so.** The only surface that visibly branches on the result | `components/shells/membership/SaveChatCTA.tsx` | `messages.length >= 4` **and** not yet a member — independent of any marker | Email **or** phone | `useAuthFlow` (**does not pass `inviteToken`/`storyInviteToken`**) → webhook cascade as row 3. Client: `claimAllSessions(name)` → `POST /api/members/sync` | **Yes** — same as row 3 | **Yes** — same as row 3 | **Yes** — required name field; pre-filled by re-scanning the transcript for `[NAME:]` at click time |
| 5 | **GateView prebuilt Clerk modal** | **Sign-up primary, sign-in reachable.** `heirloomClerkAppearance` *styles* `footerActionText`/`footerActionLink` rather than hiding them, so Clerk's "Already have an account?" link is live | `GateView.tsx` → `openSignUp()` | Invite gate on, no valid token — "Claim a free membership" (also the invalid/expired-token screen) | Whatever the Clerk dashboard enables (email, phone, OAuth) | Clerk hosted modal → webhook `linkInvitedMember()` → else `syncMember()`. Client: `false→true` → `POST /api/heirloom/members/claim` → `claimMembership()` | **Yes** — `claimMembership` inserts `clerk_id`, **`status='pending'`**, `name`, `email`, `phone` — only if no row exists; webhook's `syncMember` may win first with `status='active'` | **Yes** — `ensureClerkUser()` + webhook upsert | **Yes, indirectly** — whatever name Clerk's modal collects → `claimMembership` → `members.name` + `users.name`. No app-owned name field |
| 6 | **ChatHeader "Sign in" modal** | **Sign-in primary, sign-up reachable.** Same appearance object as row 5 — footer cross-over not suppressed. A sign-up completed here fires **no** `members` claim | `ChatHeader.tsx` → `openSignIn()` | Signed-out visitor uses the account dropdown | Clerk-configured | Clerk hosted modal. `chatStore`'s `false→true` effect runs `claimSessionsOnly()` (+ token accepts if present) | **No** — membership writes only if a token-accept branch fires | **Indirectly** — `POST /api/sessions/[id]/claim` → `ensureClerkUser()` | **No** |
| 7 | **SBL platform admin sign-in** | **Sign-in only.** The one surface that genuinely cannot sign anyone up: `elements: { footerAction: 'hidden' }`. Platform accounts are provisioned out of band | `app/secondbrainlabs/sign-in/[[...sign-in]]/page.tsx` (`SignInPanel`) | `2bl.ai/sign-in` (middleware rewrite), **or** `app/(platform)/layout.tsx` redirecting an unauthenticated `/platform` hit | Clerk-configured | Clerk `<SignIn>` → `/platform/admin` | **No** | **No** on this page — `users` written once an `/admin` page loads (row 8) | **No** |
| 8 | **`/admin` protected redirect** | **Both — and off-app.** No `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is configured, so `auth.protect()` redirects to **Clerk's hosted Account Portal**, not the branded page. What it offers is dashboard config, not app code | `middleware.ts` `auth.protect()` on `/admin(.*)`; host-driven, every product host | Unauthenticated hit on any `/admin` path | Clerk-configured | Clerk hosted portal → back to `/admin` → `app/admin/layout.tsx` calls `syncUser()` | **No** | **Yes** — `syncUser()` upserts `clerk_id`, `email`, `name`. Returns null (no write) when Clerk has no email | **Yes** — `users.name` from `firstName + lastName` |
| 9 | **Anonymous session creation** | **Neither.** No auth surface — a `users` write piggybacking on an existing session, or a no-op | `app/api/sessions/route.ts` `POST` | Any first message in a chat | Clerk session if present | `syncUser()` → `chat_sessions.user_id` | **No** | **Yes** — `syncUser()` | **Yes** — `users.name` only |
| 10 | **Post-auth session claim** | **Neither.** Runs strictly after one of rows 1–8 established the session | `app/api/sessions/[id]/claim/route.ts` | `claimCurrentSession` / `claimSessionsOnly` / `claimAllSessions` | Clerk session | `ensureClerkUser()` → `claimSession()` | **No** | **Yes** — upserts `clerk_id` + fields **only when present** (phone-only safe) | **No** — writes `users.name` only if Clerk already has one |

## 2.3 Table B — `members` rows created with no Clerk account

| # | Path name | Entry point | Trigger | Identifier | Handler(s) | Writes `members`? | Writes `users`? | Name captured? |
|---|---|---|---|---|---|---|---|---|
| 11 | **Tenant-admin invite creation** | `app/api/admin/members/invite/route.ts` (from `InviteMemberModal.tsx`) | Admin fills the invite form | Email and/or phone, both optional | `getAuthContext()` → `createMemberInvite()` | **Yes** — `status='invited'`, `role='member'`, `token`, `expires_at`, `invited_by`, and optionally `invited_name`, `email` (lowercased), `phone`, `auto_open`, `primer` (falls back to `tenants.default_primer`) | **No** | **Yes** — the admin types it → **`members.invited_name`**, never `members.name` |
| 12 | **Platform-admin invite creation** | `app/api/platform/members/invite/route.ts` | Platform admin invites into an arbitrary tenant (`tenant_id` in body) | Email and/or phone, both optional | `isPlatformAdmin` → `createMemberInvite()` | **Yes** — identical shape to row 11 | **No** — reads `users` only to resolve `invited_by` | **Yes** → `invited_name` |
| 13 | **Member collaborator invite** | `app/api/heirloom/invites/route.ts` (from `InviteCollaboratorsModal.tsx`) | A signed-in member mints a shareable link for their story | **None** — deliberately generic, no recipient fields | `getCurrentUser()` → `members` lookup by `clerk_id` → `createMemberInvite()` | **Yes** — `status='invited'`, `token`, `primer`, `invited_by`; **no** `invited_name`/`email`/`phone` | **No** | **No** — this invite carries no name at all |
| 14 | **Waitlist self-registration** | `app/api/heirloom/members/waitlist/route.ts` (from `GateView.tsx`) | Gate on, no invite token, visitor submits the form | **Email only** (required) | Inline in the route — no service function | **Yes** — `email`, `status='waitlist'`, `role='member'`. No `clerk_id`, no `user_id`, no token | **No** | **No** |

## 2.4 Table C — Identity mutation after the fact

| # | Path name | Entry point | Trigger | Identifier | Handler(s) | Writes `members`? | Writes `users`? | Name captured? |
|---|---|---|---|---|---|---|---|---|
| 15 | **Clerk "Manage account" edit** | `ChatHeader.tsx` → `openUserProfile()`; `UserButton` in `UnifiedAdminShell.tsx` | Member edits name / email / phone in Clerk's hosted profile UI | Email, phone, name | Clerk `user.updated` webhook → `users` upsert → `linkInvitedMember()` → else `syncMember()` | **Yes, indirectly** — `syncMember` overwrites `members.name`/`email`/`phone` from the new Clerk values | **Yes** | **Yes** — a rename propagates to `users.name` + `members.name`, never to `invited_name` |
| 16 | **Invite resend / token rotation** | `app/api/admin/members/invite/resend/route.ts` | Admin re-sends an invite | n/a | Direct `members` update | **Yes** — new `token`, new `expires_at`; identity fields untouched | **No** | **No** |
| 17 | **Status / role change** | `app/api/platform/members/status/route.ts`, `.../roles/route.ts` | Platform admin bulk-edits | n/a | Direct `members` update | **Yes** — `status` (+ `deleted_reason`) or `role` | **No** | **No** |
| 18 | **Hard delete** | `app/api/platform/members/[userId]/route.ts` → `hardDeleteMember()`; Clerk `user.deleted` webhook | Admin hard-deletes, or the Clerk account is deleted | n/a | `hardDeleteMember` deletes the `users` row (cascade removes `members`); webhook instead soft-deletes | **Yes** — cascade delete, or `status='deleted'` | **Yes** — deleted, or `deleted_at`/`status` stamped | n/a |

## 2.5 `jefflougheed.ca` and `legacy.2bl.ai`

**No member auth surface at all.** `components/shells/widget/` contains zero
auth imports — no sign-up, no sign-in, no `members` writes. Those hosts serve
anonymous visitors only. Their sole authenticated surface is `/admin`, which
middleware passes through un-rewritten on every host (row 8).

---

# Part 3 — Consolidated findings

Ranked by what I'd act on first. Nothing here has been fixed.

## 3.1 Summary table

| # | Finding | Class | Confidence |
|---|---|---|---|
| 1 | `members.name` invisible to MEMBER CONTEXT — 27% of members affected | Data correctness | Confirmed + quantified |
| 2 | `primer` injected with zero delineation; member-settable via story invites | Security | Confirmed (already tracked) |
| 3 | No `status` filter on either identity resolution | Data correctness | Confirmed (undocumented) |
| 4 | `MagicLinkCard` mount branch can null `members.name` | Data correctness | Inferred from code |
| 5 | `status='pending'` unrecognized by admin tooling | Data correctness | Confirmed, 1 live row |
| 6 | `/api/sage` `resolveMemberId` discards Supabase errors | Silent failure | Confirmed |
| 7 | `getCurrentUser()` unguarded on `/api/sage`, guarded elsewhere | Silent failure | Confirmed asymmetry; throw unverified |
| 8 | No audit events for member context; PII in logs | Observability | Confirmed |
| 9 | Four `users`-upsert implementations that disagree | Architecture | Confirmed + live evidence |
| 10 | Every invited sign-up runs two racing handlers | Architecture | Confirmed |
| 11 | `SaveChatCTA` omits both invite tokens | Architecture | Confirmed |
| 12 | `source` null for most rows; `story_invite` never written | Observability | Confirmed, live data |
| 13 | `/admin` and `/platform` disagree on sign-in destination | Consistency | Confirmed |
| 14 | ChatHeader sign-up creates a Clerk account with no `members` row | Consistency | Inferred from code |
| 15 | `/invite` doesn't enforce `expires_at`; `/join` does | Consistency | Confirmed |
| 16 | Compiled prompt still carries the pre-fix marker instruction | Prompt debt | Confirmed |
| 17 | Dead/vestigial: `primer_used_at`, `clerk_id_dev`, `getMemberId`, waitlist, `chat_session_context` | Cleanup | Confirmed |

## 3.2 Data correctness

**1. `members.name` is never read by MEMBER CONTEXT — and it's not a rare case.**
Live production, Heirloom tenant, 2026-08-16:

| | count |
|---|---|
| total `members` rows | 41 |
| with non-empty `invited_name` | 20 |
| with non-empty `primer` | 20 |
| **with `name` but no `invited_name`** | **11** |

**11 of 41 members (27%) have a known display name the block structurally cannot
see.** Those are, by construction, everyone who signed up through an ordinary
Clerk path — `syncMember` writes `name`, never `invited_name`. For them the block
renders (if they have email/phone/primer) with no name line and no `[NAME:]`
marker, *while the compiled prompt simultaneously instructs the model:* "do not
ask for name, email, or phone — this information is already known." That
combination is worse than either half alone: Sage is told not to ask for a name
it was never given.

**2. `primer` reaches the prompt with zero delineation.** Concatenated raw,
immediately adjacent to a real instruction telling the model to silently emit
hidden markers. Admin-set `members.primer` is low risk (tenant admins only).
**`story_invite_links.primer` is member-wide risk** — any member who owns a story
can set 500 chars with no sanitization beyond trim/length. Compounded by story
invites forcing `autoOpenChat=true` and falling through to an automatic
`sendHidden('Hi')` on lookup failure, so a hostile primer can reach the model
with no visitor input at all. The fix is scoped in `Known Gaps.md` — wrap in
`<member_context>` / `<primer>` plus `escapeForTag()`, reusing the pattern
`session-context.ts` already proves — but is explicitly not scheduled.

**3. Neither identity resolution filters on `status`.** A member with
`status='suspended'` or `'deleted'` still resolves in `/api/sage`'s
`resolveMemberId` and still gets name, email, phone, and primer injected.
`app/heirloom/page.tsx` *does* filter `status='active'` for page authorization,
so the two layers disagree — someone kept out of the UI can still reach
`/api/sage` directly and be treated as known. **Not documented anywhere; new
observation.**

**4. `MagicLinkCard`'s "already signed in on mount" branch can null a name.**
`MagicLinkCard.tsx:127–132` fires `onSuccess(nameValue)` where `nameValue` is
`initialName ?? ''`. That reaches `POST /api/members/sync` as `{name: null}`,
and `syncMember` treats `null` (unlike `undefined`) as "write this column" — so
`members.name` is overwritten with null. Reachable whenever a signed-in member
gets an `[ACCOUNT_CREATE:]` marker with no `[NAME:]` marker or `invited_name` to
pre-fill from. *Inferred from the code path; not reproduced against a live
session.*

**5. `status='pending'` is written by a path nothing else recognizes.**
`claimMembership()` (the GateView self-service path) inserts it. Every other
enumeration lists only `active | invited | waitlist | suspended | deleted` —
including `VALID_STATUSES` in `app/api/platform/members/status/route.ts:13`,
which rejects `'pending'` as input, and `PROTECTED_STATUSES`, which doesn't
shield it. **1 such row exists in production** — a member the admin tooling
cannot act on.

## 3.3 Silent failure & observability

**6. `/api/sage`'s `resolveMemberId` discards the Supabase error.**
```ts
const { data: memberRow } = await supabase.from('members')...
```
`error` is not destructured, checked, or logged. A transient Supabase failure is
indistinguishable from "this signed-in user isn't a member." The member silently
becomes anonymous for that turn, and nothing records it.

**7. The same function doesn't guard `getCurrentUser()`.** It calls Clerk's
`currentUser()` — a network call — with no try/catch. If it throws, the whole
chat turn 500s. `services/crm/feedback.ts`'s `resolveMemberId` wraps the
equivalent call with a comment explaining exactly why:

> "If `auth()` ever throws for that anonymous-request shape … the exception must
> not surface as an uncaught 500 — it's just another way of having 'no
> server-verified identity'."

The same reasoning applies verbatim to `/api/sage`, which also serves fully
anonymous widget traffic. The guard was written for the lower-stakes route and
not the higher-stakes one. *I have not confirmed Clerk actually throws for that
shape — a defensive gap, not a demonstrated bug.*

**8. Member context has no audit coverage, and logs PII.** `member-context.ts`
uses `console.log`/`console.error` exclusively across six call sites; there is no
`AuditAction` for it at all. Its two siblings in the same `Promise.all` both log
audit events (`CHAT_MEDIA_CONTEXT_RESOLVED`, `CHAT_SESSION_CONTEXT_ATTACHED`).
**There is therefore no way to query how often the block fires or how often it
silently returns null** — the exact question "are returning members really
getting context now?" cannot be answered from data. Separately, the log at
`member-context.ts:143` writes `resultPreview: result.slice(0, 200)`, putting the
member's **name, email and phone in plaintext** into logs on every turn. Both
diverge from `CLAUDE.md` rule 6.

**12. `source` is null for 18 of 41 rows, including 12 active members.** Only
`acceptInvite` and `linkInvitedMember` stamp it; `syncMember` and
`claimMembership` stamp nothing. "How did this person get here" is unanswerable
for most of the member base. `source='story_invite'` has **never been written** —
the story-invite sign-up path has zero production rows despite being fully built
and merged.

## 3.4 Architecture & consistency

**9. Four separate `users`-upsert implementations with four different field
sets** — `syncUser`, `ensureClerkUser`, the webhook's inline upsert, and
`linkInvitedMember`'s own. They disagree on real things:
- `syncUser` **returns null when Clerk has no email**, so a phone-only member
  gets no `users` row and their chat session is never linked.
  `ensureClerkUser` exists to fix exactly this — but only the routes that call it
  are fixed.
- `syncUser` writes `name` unconditionally as
  `[firstName, lastName].filter(Boolean).join(' ')`, which is `''` when Clerk has
  no name; `ensureClerkUser` guards with `|| null`. **Two production `users` rows
  have `name = ''`** rather than null — the `syncUser` signature.
- `linkInvitedMember` upserts `email: email?.toLowerCase() ?? null` where the
  webhook passes `email ?? ''`, so a phone-only invited sign-up would write
  `users.email = ''` over the row the webhook just created. *No production row
  shows this yet (0 empty emails) — a code-path observation, not an observed
  defect.*

**10. Every invited sign-up runs two independent handlers that race.** The Clerk
webhook (`linkInvitedMember` / `acceptStoryInvite`) and the client's own accept
call (`acceptInvite` / `acceptStoryInvite`) both fire for the same event with no
ordering guarantee. The code is visibly scarred: `acceptInvite` has an orphan-row
delete step *plus* a name-rescue for the row it's about to delete, and
`acceptStoryInvite` has an explicit `23505` unique-violation re-fetch branch. It
works — but the reconciliation logic is now larger than the happy path.

**11. `SaveChatCTA` omits both invite tokens.** Same flow as `MagicLinkCard`
otherwise, but it calls `flow.sendEmail(val, nameValue)` with no
`inviteToken`/`storyInviteToken`. If the turn-count CTA fires before the marker
does, an invite holder signs up with no token in Clerk `unsafeMetadata`, the
webhook falls back to email matching, and the invite row's `primer` /
`invited_name` / `auto_open` are orphaned — unless the racing client accept call
rescues it (finding 10).

**13. `/admin` and `/platform` disagree about where unauthenticated users go.**
`/platform` is gated in `app/(platform)/layout.tsx`, which redirects to the
branded `/secondbrainlabs/sign-in` page — with an explicit comment saying it does
this *because* no `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is set and middleware would
otherwise dump the user on Clerk's hosted Account Portal. `/admin` is gated by
`middleware.ts` `auth.protect()` and gets exactly that unbranded portal. The
workaround was applied to one surface and not the other.

**14. A sign-up from the ChatHeader modal creates a Clerk account with no
`members` row.** Rows 5 and 6 open the same Clerk component with the same
appearance object, but only `GateView` calls `/api/heirloom/members/claim` on the
sign-in transition — `ChatHeader` runs `claimSessionsOnly()`, which deliberately
skips `members`. A visitor who opens "Sign in", follows Clerk's footer link to
sign up, and completes it ends with a `users` row and no membership until the
webhook's `syncMember()` fallback catches them. *Inferred; I did not exercise the
footer link against a live Clerk instance to confirm it renders.*

**15. Two invite mechanisms that look alike share no code** — `members.token` +
`/invite/[token]` + `acceptInvite` (single-use, identity-bound) versus
`story_invite_links.token` + `/join/[token]` + `acceptStoryInvite` (durable,
multi-use, generic). Separate tables, routes, service files, accept endpoints —
deliberate and documented in both files. The one asymmetry: **`/join` enforces
`expires_at`; `/invite` reads it and does not.**

**Cross-cutting: "sign-up vs sign-in" is barely a real distinction here.** Of ten
authentication paths, exactly **one** can only sign someone in and **zero** can
only sign someone up. Mostly a good thing — it's why an invite holder who already
has an account doesn't hit a dead end — but any reasoning of the form "this is
the sign-up path, so the user must be new" is unsafe, and two places already
depend on it (finding 10's `acceptInvite` 404, and GateView's claim firing on the
transition regardless of which branch ran).

## 3.5 Prompt debt

**16. The compiled prompt still carries the pre-fix marker instruction.** See
§1.7. The server-side `isFirstTurn` fix landed in July; the DB prompt text still
tells the model to emit markers "in your very first reply" on every turn. Low
severity (markers are stripped client-side; the persist functions self-guard),
but it is a live remnant of the bug that was supposedly closed. Fix is a Composer
edit.

## 3.6 Dead & vestigial

**17.** All confirmed by full-tree grep and/or live query:

- **`members.primer_used_at`** — zero code references; **13 production rows still
  carry a non-null value.** Inert, but it is live data that looks meaningful and
  isn't. Pending a Studio drop.
- **`members.clerk_id_dev`** — zero code references anywhere. Whatever
  dev/preview identity path it was for does not exist in production code.
- **The client-side `memberId` chain** — `page.tsx` → `HeirloomApp` →
  `chatStore` → `getMemberId` accessor. Nothing reads it; PR #189 removed
  `member_id` from the `/api/sage` payload but left the accessor and its
  now-incorrect doc comment. A live trap for anyone reading the client to
  understand how this works.
- **The waitlist path** — zero `status='waitlist'` rows. The only path that
  collects an identifier with no Clerk account behind it, and it is dead in
  practice.
- **`chat_session_context`** — zero rows. Mechanism and UI entry point both
  merged; never exercised end to end.

**Stale comments and docs on these paths:** `getMemberId`'s doc in
`services/chat/ui/v1/types.ts`; `ChatStreamRequest.memberId`'s "pre-auth invited
member" description (it's set for signed-in members too);
`contact-capture-research.md`'s `DEFAULT_SYSTEM_PROMPT` attribution;
`stream-unification-plan.md`'s entries still describing `getMemberPrimer` with
`primer_used_at`.

---

# Appendix

## A. Files on the member-context path

| File | Role |
|---|---|
| `app/api/sage/route.ts` | HTTP adapter; `resolveMemberId` (Clerk / invite-token) |
| `services/auth/providers/clerk/server.ts` | `getCurrentUser()` → `providerUserId` |
| `services/members/members.ts` | `validateMemberToken`, `createMemberInvite`, `linkInvitedMember`, `acceptInvite` |
| `services/chat/server/index.ts` | `streamChat`; `isFirstTurn`; prompt assembly |
| `services/chat/server/member-context.ts` | **the block** — DB read + string build |
| `services/chat/server/member-context.test.ts` | 13 tests |
| `services/chat/server/index.test.ts` | 3 `isFirstTurn` tests |
| `services/prompt/compiler.ts` | `getSystemPrompt` → `compiled_prompts` |
| `services/chat/server/session-context.ts` | sibling mechanism (`chat_session_context`) |
| `services/crm/session.ts` | `persistVisitorName/Email/Phone` — marker landing site |
| `app/heirloom/page.tsx` | server-side member/invite resolution for the page |
| `services/chat/ui/v1/useChatTurn.ts` | client `/api/sage` payload (`invite_token` only) |

## B. Files on the auth paths

| File | Role |
|---|---|
| `middleware.ts` | host routing; `auth.protect()` on `/admin(.*)` |
| `services/auth/useAuthFlow.ts` | OTP stage machine (UI state only) |
| `services/auth/providers/clerk/client.ts` | `sendCode` / `verifyCode`; sign-up-vs-sign-in detection |
| `services/auth/sync-user.ts` / `sync-member.ts` / `ensure-clerk-user.ts` / `claim-membership.ts` | the four identity-write functions |
| `app/api/webhooks/clerk/route.ts` | `user.created` / `updated` / `deleted` cascade |
| `services/crm/story-invites.ts` | `acceptStoryInvite`, link mint/revoke/reset |
| `app/invite/[token]/route.ts`, `app/join/[token]/route.ts` | the two public redirects |
| `components/shells/membership/{MagicLinkCard,SaveChatCTA,GateView,ChatHeader}.tsx` | the four client auth surfaces |

## C. Reference docs

- `Design Handovers/Decision_MemberContext_Jul31.md` — the always-on decision record
- `System Docs/Utilities/Chat Server.md` — current mechanism reference
- `System Docs/Known Gaps.md` — the `primer` delineation gap (two entries)
- `System Docs/Database Schema.md` — `members`, `chat_session_context`

## D. Live-data claims

All read-only, Heirloom tenant (`20767f1d-…ac56`), 2026-08-15/16:

- **Compiled prompt:** version 23, `status='live'`, 29,580 chars, 2
  `MEMBER CONTEXT` occurrences, no `primer` mention.
- **`members` (41 total):** 20 `invited_name`, 20 `primer`, 11
  `name`-without-`invited_name`, 13 `primer_used_at` still set. By status/source:
  invited/null 15, active/null 12, active/`invite` 7, deleted/null 6,
  **pending/null 1**, waitlist 0, `story_invite` 0.
- **`users` (26 total):** 2 with `name = ''`, 4 with `name IS NULL`, 1 with
  neither email nor phone, 0 with empty email.
- **`chat_session_context`:** 0 rows.

## E. Provenance

Both investigations were run against `main` at `e22eccf`, on branch
`claude/member-context-docs-2j6wlx`. Source documents:
`Design Handovers/member_context_system_audit_2026-08-15.md` and
`Design Handovers/signup_signin_path_inventory_2026-08-16.md`.
