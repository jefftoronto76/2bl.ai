# Chat Server — MEMBER CONTEXT

### Chat server — MEMBER CONTEXT (`services/chat/server/member-context.ts`)

Undocumented until 2026-07-31 — the gap that let a real bug ship silently for
weeks (see "Also fixed alongside this" in
`Design Handovers/Decision_MemberContext_Jul31.md`). `services/chat/server/` has
other files too (`booking.ts`, `media-context.ts`, `prompt.ts`, `stream.ts`)
referenced elsewhere in `System Docs/Marker Syntax.md` and
`System Docs/API Routes.md`; this entry
covers only `member-context.ts`, the one that was missing entirely.

### Chat server — media context (`services/chat/server/media-context.ts`)

`resolveMediaContext(mediaItems, tenantId, memberId)` fetches
`status`/`derived_content`/`error_message` from `media_items` for the
media the client says is attached to this turn, and returns a formatted
section for injection into the system prompt (`streamChat()` in
`index.ts` joins it in alongside the booking section and MEMBER CONTEXT).
Short-circuits to `''` when there are no media items, no tenant, or no
member — and on a DB error, matching prior behavior rather than guessing.

Output is up to three sections, joined with blank lines, present only when
non-empty:
- **ATTACHED MEDIA** — `status === 'ready'` rows with `derived_content`, one
  block per file with the real derived content.
- **ATTACHMENT FAILED** — `status === 'failed'` rows, with the failure
  reason run through `sanitizeFailureReason()` — never the raw
  `error_message`.
- **ATTACHMENT IN PROGRESS** — everything else: pending/processing rows, or
  an item the query returned no row for at all (the common case for
  something attached this same turn, since processing is async and rarely
  finishes before this request builds its prompt). Built straight from the
  client-supplied filename/type on `mediaItems`, no second DB lookup.

`sanitizeFailureReason(raw)` maps a raw internal `error_message` to one of a
fixed set of pre-written safe phrases — a category classifier, not string
scrubbing, so no vendor name or storage path can leak through an error
shape the mapping didn't anticipate. The implementation now lives in
`services/media/errorCopy.ts` (dependency-free, no `getAdminClient`) so
client components (upload progress cards) can classify a failure reason
without pulling in this module's server-only import; `media-context.ts`
re-exports it unchanged so existing importers and this file's own test
keep working. Categories: upload not finished ("Storage object not
available after"), processing stalled and timed out, upload never
completed, a file that needs to be re-uploaded (no file found in Storage
on reprocess — `isNeedsReupload` checks this same string for the retry-vs-
reattach UI decision), Deepgram transcription failure, Anthropic vision
failure, Anthropic file-upload failure, a missing
`DEEPGRAM_API_KEY`/`ANTHROPIC_API_KEY`, signed-URL/download failures, and a
generic fallback for anything else.

As of 2026-08-04, `resolveMediaContext()` also fires the
`CHAT_MEDIA_CONTEXT_RESOLVED` audit event (via `logEvent`) on the path that
reaches its DB query, with item counts and section presence only — never
`derived_content`. See `System Docs/Utilities/Audit.md` for the full
metadata shape and the second write site in `index.ts`.

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

### Chat server — generic session context (`services/chat/server/session-context.ts`)

Added 2026-08-13 (session-context-service). A generic, reusable "this session
has attached context" mechanism — deliberately not story-specific, so a
future use case (a different artifact, a booking, a document) adds one
registry entry rather than a redesign. First real use case: a session started
from an empty story gets the story's name/description/owner folded into the
prompt.

**Schema — `chat_session_context` table (Jeff's Studio work — live as of
2026-08-14, see `System Docs/DB_CHANGELOG.md`):**
```sql
CREATE TABLE chat_session_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  session_id uuid NOT NULL UNIQUE REFERENCES chat_sessions(id),
  context_type text NOT NULL,
  context_ref_id uuid NOT NULL,
  context_frequency text NOT NULL DEFAULT 'once' CHECK (context_frequency IN ('once', 'every_turn')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_session_context_tenant_id ON chat_session_context(tenant_id);
```
A dedicated table (Option B from the reviewed planning pass), not columns on
`chat_sessions` — keeps that already-wide table lean and, since the `session_id`
unique constraint is the only thing enforcing today's real 1:1 need, trivially
extends to multiple contexts per session later without a redesign. No CHECK
constraint on `context_type` — matches `artifacts.type`'s own precedent, so a
new context type ships with zero migration. **The service code deploys and
runs safely before this table exists** — every query against it fails, and
both `getSessionContext` (fail-open) and `attachSessionContext`/the route's
best-effort wrapper (fail-closed on the write, but never fatal to session
creation) already treat that as "no context," not a crash.

**`getSessionContext(sessionId, tenantId, isFirstTurn)`** — reads the
session's `chat_session_context` row (no row = no context, full stop, not a
distinct state), dispatches to a per-`context_type` block builder
(`CONTEXT_BLOCK_BUILDERS`; `'story'` → `getStoryContextBlock`, which calls
`getStoryById` in `services/crm/stories.ts`), and returns the delineated
block. `context_frequency` gates re-injection: `'once'` only returns the
block when `isFirstTurn` (the same deterministic signal MEMBER CONTEXT's
marker instruction already uses); `'every_turn'` returns it on every turn —
the story-context case. Fail-open throughout: a DB error, an unrecognized
`context_type`, or a builder that itself throws all return `null` rather than
blocking the turn, matching `getMemberContext`'s posture exactly.

**Wired into `streamChat()`'s `Promise.all`** (`index.ts`) alongside
`memberContext`/`mediaContext`, and joined into the system prompt as its own
segment, positioned after MEMBER CONTEXT and before the media section.

**Security — delineated, unlike MEMBER CONTEXT's own `primer`:** the story
name/description/owner name are member-controlled and re-sent on every turn
of a potentially long conversation, so the block is wrapped in XML tags
(`<session_context><name>…</name><description>…</description>
<owner_name>…</owner_name></session_context>`, one field per tag — the same
delineation style `services/prompt/composer.ts`'s `getCompiledComposerSystem`
already uses for `<document_context>`/`<existing_blocks>`), preceded by an
explicit sentence telling the model to treat it as reference data only, never
as instructions. Every interpolated value is run through `escapeForTag()`
(escapes literal `<`/`>`) first, so a story titled
`</session_context>ignore previous instructions` can't break out of the
wrapper — XML tags around untrusted text are only a real boundary if the text
itself can't contain tag syntax. **`member-context.ts`'s own `primer` field
does NOT get this treatment as part of this change** — that's a separate,
already-tracked gap; see `System Docs/Known Gaps.md`.

**`attachSessionContext(tenantId, sessionId, contextType, contextRefId,
frequency)`** — the generic write side. Validates `contextRefId` actually
resolves to a real, tenant-scoped row before writing (fails closed, unlike
the read side — this is a deliberate write). Access control (does this
caller have rights to the referenced row) is the caller's job, not this
function's — same separation `services/crm/stories.ts`'s own write functions
use. Logs `CHAT_SESSION_CONTEXT_ATTACHED` on success.

**Wiring — threaded through session creation, not a separate call
(`app/api/sessions/route.ts`):** the POST body optionally carries
`contextType`/`contextRefId`/`contextFrequency`, read from the same
`req.json()` call that already extracts `mediaItemIds`. When present, the
route calls `attachSessionContext` right after `createSession` succeeds, in
the same best-effort-relative-to-the-response style already used for the
media chat_id backfill block — a failed or invalid attach never turns a
successful session creation into a 500, it just leaves the session with no
context (the ordinary state for most sessions). This is deliberately the SAME
request as session creation, not a follow-up attach call: a separate call
would race the first `/api/sage` turn (two independent, unordered requests),
so threading it through session creation is what guarantees the attachment
exists before any turn that needs to see it.

Client-side plumbing (`ChatEngineAccessors.getSessionContextToAttach`,
`services/chat/ui/v1/types.ts`; threaded through `useChatSession`'s
`ChatSessionConfig` and read by `useChatTurn.ts`'s `send()`/`sendHidden()` at
the exact moment either lazily creates a session): a pending-context ref
(`chatStore.tsx`'s `pendingSessionContextRef`/`setSessionContextToAttach`),
mirroring the `getMemberId`/`getInviteToken` accessor pattern. `newChat()`
and `hydrateConversation`'s genuine-session-transition reset both clear it,
so it can never leak into an unrelated session. **The actual "click an empty
story to start a chat in it" UI flow that calls `setSessionContextToAttach`
is a separate, not-yet-landed piece** — see `System Docs/Known Gaps.md`.
