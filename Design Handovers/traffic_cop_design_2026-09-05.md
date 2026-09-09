# Design — "Traffic Cop": shared prompt selection + per-turn context injection

**Status:** Research/blueprint pass. No code written. Awaiting review.
**Date:** 2026-09-05
**Pattern precedents:** `Design Handovers/identity_reconciliation_design_2026-08-16.md`,
`Design Handovers/identity-tracking-proposal.md`
**Builds on:** `Design Handovers/Decision_MemberContext_Jul31.md`,
`System Docs/Utilities/Chat Server.md` (session-context-service, PR #383)



---

## 0. Findings that shape the design

Five things surfaced while grounding this that materially change the size and
shape of the work.

### 0.1 It is already one code path — the consolidation is smaller than assumed

Heirloom and Sage share **one** chat route (`app/api/sage/route.ts:39`), **one**
orchestrator (`streamChat`, `services/chat/server/index.ts:136`), **one** client
turn engine (`services/chat/ui/v1/useChatTurn.ts:85`, the only `fetch('/api/sage')`
in product code), and **one** prompt read (`getSystemPrompt`,
`services/prompt/compiler.ts:29`). "Shared infrastructure" today means literally
the same functions on the same deploy, not parallel implementations. The products
diverge only in (a) which `tenant_id` the Host header resolves to
(`services/auth/get-tenant-from-request.ts:110`) and (b) which optional client
accessors the shell supplies — Heirloom passes `getMemberId`/`getInviteToken`/
`getMediaItems`/`getSessionContextToAttach` (`components/shells/membership/chatStore.tsx:394-418`);
the Sage widget passes none (`app/(jefflougheed)/page.tsx:25`).

So this is not a merge of two systems. It is turning a fixed six-slot string
concatenation into a governed mechanism.

### 0.2 Job #1 (prompt selection) barely exists — selection is "latest live per tenant"

```ts
// services/prompt/compiler.ts:35-42
      .from('compiled_prompts')
      .select('content')
      .eq('tenant_id', tenantId)
      .eq('status', 'live')
      .order('version', { ascending: false })
      .limit(1)
```

No product, member/visitor, mode, story, or prompt-type input reaches this query.
Every selection-shaped concept in the schema is dead at runtime:
`ChatStreamRequest.promptType` (accepted, documented as ignored,
`services/chat/server/types.ts:45-47`; no client sends it),
`compiled_prompts.prompt_type_id` (written on publish, never read),
`compiled_prompts.key` (zero code references), `prompt_sets.is_default`
(documented as "the set loaded for a tenant's chat sessions when no specific set
is requested", `System Docs/Database Schema.md:50`, never read),
`session_tokens.prompt_type_key` + `context_injection` (table unpopulated,
`Database Schema.md:49`), `blocks.activation_condition` (orphaned jsonb,
`Database Schema.md:20`). The known consequence: once a tenant has two live
typed prompts, the higher `version` wins regardless of type
(`System Docs/Known Gaps.md:587-603`).

The one genuinely rule-based branch in the whole prompt path is the
`context_type` registry in `session-context.ts:61-63` — and it is a good seed
for the generalization proposed here.

### 0.3 Job #2 is a fixed concatenation with per-file fail-open by convention

```ts
// services/chat/server/index.ts:213-222
  const systemPrompt = [
    basePrompt,
    bookingSection,
    memberContext ? `MEMBER CONTEXT:\n${memberContext}` : '',
    sessionContext ?? '',
    mediaContext,
    questionMode ? QUESTION_MODE_CONTEXT : '',
  ]
    .filter(segment => segment.length > 0)
    .join('\n\n')
```

Every resolver individually returns `''`/`null` on error — but that is a
convention each author re-implemented, not a property of the assembler. A
provider that throws inside `Promise.all` (`index.ts:181`) would fail the turn.
There is no priority, no cap (no input-side token limit anywhere on the path —
the full transcript plus every segment at full length, every turn), and no
delineation rule: `<session_context>` is XML-wrapped and escaped
(`session-context.ts:32-57`) while `members.primer` sits raw beside the
marker-emission instruction (`member-context.ts:123-147`;
`Known Gaps.md:322-343`).

### 0.4 Observability is asymmetric and content-free where it exists

Per turn: media context writes `CHAT_MEDIA_CONTEXT_RESOLVED` **twice** with
different metadata shapes (`media-context.ts:121-133`, `index.ts:192-206`);
MEMBER CONTEXT writes no audit event at all (console only,
`member-context.ts:149-157`); session context audits the write side only
(`session-context.ts:179-187`), never the read; base prompt selection and
booking are console-only. There is no single record of "what went into this
turn's prompt and why." Gate 3 (`Design Handovers/identity-tracking-proposal.md`)
had to be bolted onto identity after the fact for exactly this reason; the
brief asks that this component not repeat that.

### 0.5 Two things are absent that the baseline variable list assumes

Confirmed by grep across `services/`, `app/`, `components/`: **no** date/time,
timezone, locale, or location is injected anywhere today, and **no** client
code reads `navigator.geolocation` or `Intl.DateTimeFormat().resolvedOptions().timeZone`.
The wire body (`useChatTurn.ts:88-94`) carries `messages`, `mode`, `session_id`,
`invite_token`, `media_items` — nothing client-environmental. Date/time and
location are therefore greenfield, including the wire contract for them.

---

## 1. Current state — Job #1, prompt selection (inventory)

### 1.1 Write side: how `compiled_prompts` rows come to exist

One live write path: `compilePrompt` (`services/prompt/compile.ts:201`) →
`buildCompiledContent` (`:79`) assembles active `blocks` in fixed section order
(`:46`, identity → knowledge → guardrail → process → output_format) and hands
the entire clear/archive/write/activate sequence to the `publish_compiled_prompt`
Postgres RPC (`:242-252`). Block scoping is by set: `prompt_set_id IS NULL OR = set`
(`:98-102`).

**What drives "v23": not verifiable from the repo.** The version is `out_version`
from the RPC (`compile.ts:166-170`); the RPC body lives only in Studio
(`compile.ts:40-41` comment). The client assumes `compiled_version + 1`
(`components/admin/prompt-studio/promptSet.ts:41-48`) and sends it back as
`expected_version` for the optimistic-concurrency check (`compile.ts:250`,
`P1002` → 409). As far as the app can tell, `version` is per-slot monotonic.
`prompt_sets.version` is a dead column — never incremented (`Database Schema.md:50`).

Second write path, orphaned: `saveCompiledPrompt` (`services/prompt/save.ts:19`)
— no caller since 2026-07-27 (`Known Gaps.md:604-620`), still exported.

### 1.2 Read side: every runtime consumer

| Entry point | Selection logic | Inputs actually used |
|---|---|---|
| `POST /api/sage` → `streamChat` → `getSystemPrompt` (`compiler.ts:29`) | latest `status='live'` row per tenant | `tenant_id` only |
| `POST /api/admin/blocks/chat` → `getCompiledComposerSystem` (`services/prompt/composer.ts:81-103`) | live `is_composer_prompt` set → its highest-version compiled row. **No `status` filter, no `tenant_id` filter** on the compiled read (`:97-103`) | none from the request |
| `POST /api/admin/prompt-chat` → `buildPromptChatSystem` (`composer.ts:151-166`) | hardcoded template | — |
| `POST /api/sessions/[id]/title` (`app/api/sessions/[id]/title/route.ts:50-59`) | inline string, `claude-haiku-4-5-20251001` | — |

Only the first row is in scope; the composer/title paths are admin-internal
and stay out of the traffic cop (see §7).

Fallback ladder for the runtime path: no tenant → `DEFAULT_SYSTEM_PROMPT`
(`compiler.ts:31`); query error → same (`:46`); no live row → same (`:55`);
throw → same (`:65`). `DEFAULT_SYSTEM_PROMPT` is a one-line "brief technical
issue" string (`services/prompt/sage-prompt.ts:1`), not a persona — a
degraded-mode notice, which is the right posture. No env-var prompts exist.

**Caching: none.** No `unstable_cache`, no module-level memo. Every turn issues
~6 uncached Supabase reads before the model call (`index.ts:181-190`). A publish
is live on the very next turn.

### 1.3 The authoring-side concepts that runtime ignores

- **`prompt_sets`** — the "project" owning `blocks`, snapshotted on publish.
  One tenant each. Status `live | draft | retired`.
- **`prompt_types`** — a separate axis (`base`/`sales`/`onboarding`/`editor`
  platform-owned; per-tenant additions via `prompt_type_tenants`,
  `Database Schema.md:46-47`). A set must have a type to go live.
- **Family** — `is_composer_prompt` two-value flag (`promptSet.ts:92-99`).
- **Slot invariants** — at most one live compiled row per
  `(tenant_id, prompt_type_id)` and one untyped
  (`compiled_prompts_single_live_typed_idx` / `_untyped_idx`).

So the schema already has the *slot* concept Job #1 needs. What is missing is
the rule that maps a request to a slot, and a read that honours it.

### 1.4 Docs-vs-code divergences found (prompt side)

| # | Doc says | Code does |
|---|---|---|
| P1 | `Utilities/Prompt.md` `compiler.ts` row: "highest-version row" | also filters `status='live'` (`compiler.ts:39`) |
| P2 | `Database Schema.md:30` `compiled_prompts.key` "supports multiple prompt engines per tenant" | zero code references |
| P3 | `Database Schema.md:50` `prompt_sets.is_default` "flags the set loaded for a tenant's chat sessions" | never read at runtime |
| P4 | `DB_CHANGELOG` 2026-06-26: composer singleton is absolute | status-scoped since July; no changelog entry (`Known Gaps.md:634-650`) |
| P5 | `design_handoff_composer_prompt_fallback_july 2026` specifies a "Revert to fallback" action | the `PUT` it needs was retired (`app/api/platform/settings/master-prompt/route.ts:7-9`) |
| P6 | `app/admin/prompt-studio/prompt/page.tsx:20-24` presented as the compiled-prompt viewer | query has no `.order()` and no `status` filter — arbitrary row |

---

## 2. Current state — Job #2, per-turn injection (inventory)

All six segments resolve concurrently in `index.ts:181-190` and concatenate in
`index.ts:213-222`. `isFirstTurn` is computed server-side once
(`index.ts:177-179`: no prior non-empty assistant message) and shared.

| # | Segment | Trigger | Data | Format | Freshness | Fail mode | Audit |
|---|---|---|---|---|---|---|---|
| 1 | Base prompt — `getSystemPrompt` (`compiler.ts:29`) | always | `compiled_prompts.content` | raw | every turn, uncached | → `DEFAULT_SYSTEM_PROMPT` | console |
| 2 | Booking cards — `getBookingCardSection` (`booking.ts:44`) | `tenantId` present | `sage_parameters` | instruction paragraph + `[BOOKING: …]` lines (`:31-36`) | every turn | → `''` | console |
| 3 | MEMBER CONTEXT — `getMemberContext` (`member-context.ts:32`) | `sessionId \|\| memberId` (`index.ts:185`); `memberId` resolved server-side from Clerk user or invite token (`route.ts:8-32`), **no `status` filter** | `members.{name,invited_name,email,phone,primer}` (`:96`) | `Member's name is X. Email: Y. Phone: Z. <primer raw>` + first-turn marker instruction (`:125-147`); header added by caller (`index.ts:216`) | every turn (always-on since 2026-07-31) | → `null` at 8 sites | **none** |
| 4 | Session context — `getSessionContext` (`session-context.ts:91`) | `sessionId && tenantId`; row in `chat_session_context`; `context_frequency` gate (`:119`) | registry by `context_type` → `getStoryById` | preamble + escaped `<session_context>` XML (`:48-57`) | per row: `once` \| `every_turn` | → `null` (DB error, no row, unknown type, builder throw) | write-side only (`CHAT_SESSION_CONTEXT_ATTACHED`) |
| 5 | Media — `resolveMediaContext` (`media-context.ts:65`) | items + tenant + **member** (so never for Sage visitors) | `media_items` by ids | `ATTACHED MEDIA` / `ATTACHMENT FAILED` (sanitized) / `ATTACHMENT IN PROGRESS` | every turn; client bounds re-sends (`chatStore.tsx:398-427`) | → `''` | `CHAT_MEDIA_CONTEXT_RESOLVED` ×2 |
| 6 | Question mode — `QUESTION_MODE_CONTEXT` (`compiler.ts:22`) | `mode === 'question'` (Sage `?mode=question` only) | constant | paragraph | static | n/a | none |

Also on the path but not system-prompt content: `resolveModelConfig`
(`stream.ts:31`, per-tenant model/maxTokens — `rateLimitRequestsPerHour` and
`fallbackModel` are resolved and **consumed by nothing**), `normalizeMessages`'
synthetic `'Hi'` (`index.ts:37-46`), `stripMediaMarkers` on the messages array
(`index.ts:224`), and `toModelMessages`' interrupted-turn `[SYSTEM: …]` wrapper
(`services/chat/ui/v1/message.ts:217-243`).

**Post-turn, not injection, but the fallback precedent the brief cites:**
`handleSessionFinish` (`services/crm/session.ts:494-665`) runs marker detection
then regex fallbacks for email/phone/name, each self-guarded and each
short-circuited by a successful marker write (`:586-606`, `:653-664`). This is
the pattern the Marker-fallback principle in `CLAUDE.md` is written from and the
traffic cop must not disturb it.

**Size/cost:** output cap only (`tenant_model_config.max_tokens`, default 1000,
`stream.ts:18`). No input cap, no truncation, no per-segment cap. `tokensFor`
(`services/prompt/tokenize.ts`, chars/4) exists but is admin-display only.
Cumulative `input_tokens`/`output_tokens` persisted per session
(`session.ts:422-474`), no budget enforcement.

### 2.1 Docs-vs-code divergences found (injection side)

| # | Doc says | Code does |
|---|---|---|
| I1 | `Marker Syntax.md:59-61`: `[EMAIL:]` instruction lives in `DEFAULT_SYSTEM_PROMPT` | that file is a one-line fallback; instruction lives in the tenant's compiled row |
| I2 | `member_context_system_audit_2026-08-15.md` §3.2(b),(e): `name` not read; `resultPreview` leaks PII | both fixed since (`member-context.ts:96`, `:149-157`) |
| I3 | `services/chat/ui/v1/types.ts:257`: `getMemberId` is "passed to getMemberContext" | `member_id` removed from the wire (PR #189); the `memberId` prop chain has zero readers |
| I4 | `services/chat/server/types.ts:41-42`: `memberId` is for pre-auth invitees | also set for signed-in members (`route.ts:14-24`) |
| I5 | `services/chat/server/types.ts:70-75`: defaults sonnet/haiku, no tenant override | defaults sonnet/`gpt-4o`; `tenant_model_config` is read |
| I6 | `Utilities/Chat Server.md:74-79`: block built from `invited_name` | `name ?? invited_name` via `resolveMemberName` |
| I7 | `Utilities/Chat Server.md:203-205`: story-click flow "not yet landed" | landed — `ChatHero.tsx:433` |
| I8 | `Utilities/Chat Server.md:165-167` implies `<session_context>` style is reusable | `primer` still undelineated (`Known Gaps.md:435-459`) |

---

## 3. Shared vs. duplicated — where Heirloom and Sage actually diverge

**Verdict first:** shared infrastructure today is literally the same functions
on the same deploy. What is duplicated sits *outside* the turn path.

### 3.1 Literally shared (same module, both products)

| Layer | Module | Cite |
|---|---|---|
| Turn route | `POST /api/sage` — the only turn route in the repo | `app/api/sage/route.ts:39` |
| Orchestrator | `streamChat` — zero product branches | `services/chat/server/index.ts:136` |
| Identity resolution | `resolveMemberId`: Clerk user → invite token → anonymous, one helper | `route.ts:8-32` |
| Prompt read | `getSystemPrompt(tenantId)` — `sage-prompt.ts` is a one-line fallback, not a Sage prompt | `compiler.ts:29`; `sage-prompt.ts:1` |
| Model config | `resolveModelConfig(tenantId)` by tenant UUID; `config.ts` holds only the admin default | `stream.ts:31`; `config.ts:11-17` |
| Finish | `handleSessionFinish` — marker + regex capture, unbranched | `services/crm/session.ts:494` |
| Client engine | `useChatTurn` — the only `fetch('/api/sage')` in the repo | `services/chat/ui/v1/useChatTurn.ts:85` |
| Client store core | `useChatSession` / `core/store.ts`; persistence one IndexedDB module, two namespaces | `core/useChatSession.ts:134`; `persistence.ts:26-31` |
| Renderer, markers, feedback | `ChatThread.tsx`, `registry.ts`, `useMessageFeedback` | `components/chat/ChatThread.tsx`; `services/chat/ui/v1/registry.ts` |
| Sessions table | one `chat_sessions` for both; no visitor/heirloom session table exists | `services/crm/sessions.ts` |

### 3.2 Where product identity actually enters

Nowhere in middleware for an API call: `isApiPath` (`middleware.ts:68`) excludes
every `/api/*` from product rewrites and the `x-heirloom`/`x-sbl` headers
(`:194`, `:215`, `:235`). API requests get `x-correlation-id` (`:269`) and, in
non-prod, `x-preview-tenant`. The **first and only** branch point is
`getTenantFromRequest` (`services/auth/get-tenant-from-request.ts:110`): host →
`[fullHost, rootDomain]` candidates (`:119-121`) → `tenants.domain` lookup
(`:134-137`), exact host preferred (`:157-160`). The server never knows "Sage"
or "Heirloom" — it knows a tenant UUID. `services/tenant/` is not on the chat
path; its own `index.ts:7-14` documents the intended `resolveTenantConfig(host)
=> { tenant_id, shell_type, branding, capabilities }` as deliberately not
built.

### 3.3 Capability-by-convention divergences (data or shell, not code forks)

- **Sage-only:** `?mode=question`; `/api/sage/parameters` + `BookingCard`
  render; `useWidgetShell` singleton; `instanceKey="sage"`.
- **Heirloom-only:** media + `/api/transcribe`; memories; stories +
  `setSessionContextToAttach`; recent-sessions sidebar; AI titles; session
  claim; invite gate + `getMemberId`/`getInviteToken`.
- **Same server code, divergent data:** booking runs for both but Heirloom
  has no `sage_parameters` rows → `''`; Heirloom's client *drops* booking
  cards anyway (`MessageList.tsx:109`).
- **The one structural fork:** store mode — singleton (widget) vs isolated
  (Heirloom), one ternary in `useChatSession.ts:157`. And the undocumented
  topology fork: Heirloom bypasses `ChatSessionProvider` (which forwards only
  `instanceKey`/`persistNamespace`, `core/ChatSessionProvider.tsx:28`) to
  reach the accessors, contradicting that file's own header (`:5-6`).

### 3.4 The genuine duplication — outside the turn path

`HEIRLOOM_TENANT_ID` hardcoded verbatim in `services/auth/sync-member.ts:10`,
`services/members/members.ts:14`, `app/heirloom/layout.tsx:10`, and used as a
literal `.eq('tenant_id', …)` across ~15 `/api/heirloom/*` and `/api/members/*`
routes (`app/api/members/sync/route.ts:25` even uses it as the fallback when
host resolution fails). This is the only place the codebase hard-binds a
product to a tenant. It is a membership/invite concern, not a chat concern —
noted here because §9.1's "product == tenant" recommendation depends on it
staying a data relationship rather than growing into code.

### 3.5 Docs that contradict the code on this boundary

| # | Doc | Claim | Reality |
|---|---|---|---|
| B1 | `stream-unification-plan.md:27,99,298` | `getSystemPrompt` reads `master_prompt` | reads `compiled_prompts`, `status='live'` |
| B2 | `stream-unification-plan.md:394-409` Step 3 | `promptType` threaded to selection | added to the type, passed by the route, **never forwarded** (`index.ts:182`) |
| B3 | `chat-shells.md:86-88,347` | Heirloom persists to localStorage; widget has none | both IndexedDB (`persistence.ts:24`) |
| B4 | `chat-shells.md:18-19,67` | `Hero.tsx`/`Chat.tsx`, `ChatProvider` store | merged into `WidgetShell.tsx`; store is shared `useChatSession` |
| B5 | `API Routes.md:206` | `/api/sessions/[id]/claim` client-orphaned | three live callers (`chatStore.tsx:1040,1155,1197`) |
| B6 | `2BL.md:117-144` | `tenants/sage/`, `tenants/heirloom/` config dirs | do not exist; product config is DB rows |
| B7 | `centralization-plan.md:6` | "zero-code-rollout done" | Steps H (inheritance) and I (`app/[tenant]/`) not landed |

---

## 4. The API surface both products use today

One turn route plus a lifecycle surface. No zod anywhere on the turn path —
the body is a hand-rolled TS literal (`route.ts:48-55`).

| Route | Verb | Products | Body | Auth | Cite |
|---|---|---|---|---|---|
| `/api/sage` | POST | both | `{ messages, mode?, session_id?, invite_token?, prompt_type?(dead), media_items? }` → AI SDK data stream; 502/499/500/400 | host tenant; identity optional (Clerk → token → anon) | `route.ts:39-99` |
| `/api/sessions` | POST | both | `{ mediaItemIds?, contextType?, contextRefId?, contextFrequency? }` | host tenant required; Clerk optional | `app/api/sessions/route.ts:32` |
| `/api/sessions` | GET | Heirloom | — | Clerk; anon → `[]` | `:17` |
| `/api/sessions/[id]` | PATCH | both | `{ messages, visitorName, phone, email, title, starred, ttft_ms, last_error_type, stop_requested }` | host tenant | `app/api/sessions/[id]/route.ts:5` |
| `/api/sessions/[id]/feedback` | GET/POST/DELETE | both | rating payload / `?fromIndex` | anonymous-safe | `…/feedback/route.ts:11,40,104` |
| `/api/sessions/[id]/conversion-events` | PATCH | both (engine) | `?after=` | anonymous-safe | `…/conversion-events/route.ts:21` |
| `/api/sessions/[id]/memories` | GET/POST/DELETE | Heirloom UI; DELETE in shared engine | — | POST needs linked user | `useChatTurn.ts:637` |
| `/api/sessions/[id]/title` | POST | Heirloom | `{ firstUserMessage, firstAssistantText? }` | host tenant | `…/title/route.ts:17` |
| `/api/sessions/[id]/claim` | POST | Heirloom | — | Clerk required | `…/claim/route.ts:14` |
| `/api/sage/parameters` | GET | Sage | — | host tenant | `app/api/sage/parameters/route.ts:16` |
| `/api/transcribe` | POST | Heirloom | multipart | Clerk; hardcodes `product_id:'heirloom'` | `app/api/transcribe/route.ts:7,30` |

Admin composer routes (`/api/admin/blocks/chat`, `/api/admin/prompt-chat`)
share only the `runChatStream` transport and skip `streamChat` — out of scope.

**Consequence for the design:** because every chat turn already funnels
through `useChatTurn → /api/sage → streamChat`, the traffic cop needs exactly
one call site on the server and one optional body field on the client. There
is no second product path to migrate.

---

## 5. Proposed mechanism

### 5.1 Shape — one call, two stages, one decision record

```
services/chat/server/turn-context/
  index.ts          resolveTurnPrompt(input): Promise<ResolvedTurnPrompt>
  select-prompt.ts  Job #1 — deterministic slot rules + slot-aware read
  providers/        Job #2 — one file per injected variable
    base-prompt.ts  booking.ts  member-context.ts  session-context.ts
    media.ts        question-mode.ts  date-time.ts  notifications.ts  location.ts
  registry.ts       PROVIDERS: ContextProvider[]  (the only place a new one is added)
  runner.ts         fail-open, timeout, delineation, priority, budget — enforced once
  types.ts
  trace.ts          CHAT_TURN_CONTEXT_RESOLVED audit record
```

Placement follows `2BL.md` §Service Boundaries: chat orchestrates, prompt is
called by chat. The slot-aware compiled-prompt *read* stays in
`services/prompt/` (a new `selectCompiledPrompt(tenantId, slotKey)` beside
`getSystemPrompt`); the *rules* that choose the slot and everything in Job #2
live in the chat server, where `streamChat` already owns assembly. The
existing resolvers (`getMemberContext`, `getSessionContext`,
`resolveMediaContext`, `getBookingCardSection`) are **wrapped, not rewritten**,
in Phase 1 — each provider file is an adapter around the function that exists
today.

### 5.2 Input contract (what both products hand in)

```ts
interface TurnContextInput {
  tenantId: string | null              // from getTenantFromRequest — never client-supplied
  sessionId: string | null
  memberId: string | null              // server-resolved (route.ts resolveMemberId), never client-supplied
  messages: ChatMessage[]              // for isFirstTurn + turn count; not mutated
  mode: ChatMode                       // existing ?mode=question
  mediaItems: MediaAttachmentInput[] | null
  correlationId: string | null         // x-correlation-id from middleware.ts:18
  /** Client-environment hints. All optional, all untrusted, all fail-open. */
  client?: {
    timeZone?: string                  // IANA, from Intl.DateTimeFormat().resolvedOptions().timeZone
    locale?: string
    location?: { lat: number; lon: number; accuracyM?: number; consentedAt: string }
  }
}
```

Deliberately **not** taken: a product id (see §9.1 — product == tenant today),
a prompt type from the client (selection is server-side and deterministic; the
dead `promptType` field is removed in Phase 6), or any Clerk object.

### 5.3 Output contract

```ts
interface ResolvedTurnPrompt {
  system: string                       // what streamChat hands to runChatStream
  selection: {
    slotKey: string                    // e.g. 'base'
    ruleId: string                     // which rule chose it, e.g. 'default-slot'
    compiledPromptId: string | null    // null when DEFAULT_SYSTEM_PROMPT fallback fired
    version: number | null
    fallback: boolean
  }
  injections: InjectionDecision[]      // one per registered provider, always — see 5.8
  budget: { usedTokens: number; capTokens: number; droppedIds: string[] }
}
```

`streamChat` becomes: `const resolved = await resolveTurnPrompt(...)`, then
`runChatStream({ system: resolved.system, … })`. Nothing about the wire format,
`onFinish`, or `handleSessionFinish` changes.

### 5.4 Job #1 — deterministic slot selection

An ordered rule list, first match wins, evaluated synchronously from the input
(no DB call to *decide*; one DB call to *fetch*):

| Order | Rule id | Condition | Slot |
|---|---|---|---|
| 1 | `session-token` | session was opened via a `session_tokens` row with `prompt_type_key` (table exists, unpopulated) | that key |
| 2 | `session-context-type` | `chat_session_context.context_type` has a registered slot mapping (e.g. `story → 'base'` today; a future `'editor'`) | mapped key |
| 3 | `mode` | `mode === 'question'` | `'base'` (mode stays an *injection*, not a different prompt — today's behaviour) |
| 4 | `member-status` | member resolves vs anonymous | `'base'` for both today; the rung exists so a tenant can later publish an `onboarding` slot for first-turn members without code |
| 5 | `default-slot` | — | tenant's untyped live row, then any single live row, then `DEFAULT_SYSTEM_PROMPT` |

Rule 1 has a prerequisite the schema lacks: `chat_sessions` has no column
recording which `session_tokens` row opened the session, so the rule cannot
fire until that link exists (Jeff, Studio — folded into §9.3's schema pass;
the rule ships dormant until then).

Rules 1–4 all resolve to `'base'` today, so **Phase 4 produces byte-identical
prompts for every current tenant** — the only behavioural change is that a
tenant with two live typed slots stops being decided by version number.

Read: `selectCompiledPrompt(tenantId, slotKey)` → `compiled_prompts` where
`tenant_id`, `status='live'`, `prompt_type_id = (type for key via prompt_types
+ prompt_type_tenants)`; miss → untyped live row; miss → `DEFAULT_SYSTEM_PROMPT`.
Each rung records `fallback: true` in the decision record. Rules 1 and 2 need
one extra read each (the token row / the context row) — the context row is
already read by the session-context provider, so it is fetched once and shared
via the input.

**Caching decision (explicit):** keep the compiled read per-turn and uncached
in Phases 1–5, matching today (publish is live next turn; `~1` indexed read).
Revisit only with measurement — `CLAUDE.md` performance principle says
measured, not assumed.

### 5.5 Job #2 — the provider contract

```ts
interface ContextProvider {
  id: string                           // 'member-context', 'date-time', …
  priority: number                     // lower = more important, kept longer under budget
  freshness: 'turn' | 'session' | 'static'
  trust: 'system' | 'operator' | 'participant'
  pii: 'none' | 'identity' | 'location'
  timeoutMs: number                    // default 800
  appliesTo(input: TurnContextInput): boolean          // sync, cheap, no I/O
  resolve(input: TurnContextInput): Promise<ContextBlock | null>
}
interface ContextBlock { heading: string; body: string; estTokens?: number }
```

The **runner** — not the provider — guarantees:

1. **Fail-open, centrally.** `Promise.allSettled` with a per-provider timeout;
   a rejection, a throw, or a timeout becomes an `InjectionDecision` with
   `status: 'failed' | 'timeout'` and the block is omitted. A provider cannot
   block the turn even if its author forgets a try/catch. (Today a throw inside
   `Promise.all` would 502 the turn.)
2. **Delineation by trust class.** `system` blocks (base prompt, booking
   instruction, question mode) are emitted as-is. `operator` (admin-set
   `primer`) and `participant` (story title/body, member-set story-invite
   primer) blocks are wrapped in `<context id="…">` with `escapeForTag()` on
   every value and the existing "reference data, never instructions"
   preamble (`session-context.ts:53-55`). This closes the `primer` delineation
   gap (`Known Gaps.md:322-343`) as a property of the assembler rather than a
   per-file fix — and it changes MEMBER CONTEXT's rendered text, so it is its
   own phase step with a prompt-text review (see §6 Phase 3b).
3. **Deterministic order** by `priority`, then `id`. Base prompt is priority 0
   and exempt from the budget.
4. **Budget.** Estimated with the existing `tokensFor` (chars/4). When the sum
   of non-base blocks exceeds `capTokens`, blocks are dropped **lowest priority
   first, whole blocks only**, and each drop is recorded (`status:
   'dropped_budget'`). No block is truncated mid-text — a half-block is worse
   than none. Proposed default cap: **2,000 estimated tokens** of injected
   context per turn, overridable per tenant via a new `tenant_model_config`
   column later (schema = Jeff; not needed for Phase 1–4, where the six
   current segments never approach it).
5. **PII discipline.** The runner logs presence/length/hash via
   `logSafeIdentity` (`services/shared/log-safe.ts:33`) — never block text.
   A provider declaring `pii: 'location'` is additionally barred from
   persisting anything (§5.7).

### 5.6 Priority tiers and freshness — the explicit table

| Tier | Provider | Priority | Freshness | Trust | Today? |
|---|---|---|---|---|---|
| 0 | base-prompt | 0 | turn (uncached read) | system | yes |
| 1 | booking | 10 | turn | system | yes |
| 1 | question-mode | 15 | static | system | yes |
| 2 | member-context (identity lines + first-turn marker instruction) | 20 | turn | system (lines) + operator (`primer`) | yes |
| 3 | session-context (story) | 30 | per row `once`/`every_turn` | participant | yes |
| 4 | media | 40 | turn | system (statuses) — `derived_content` is participant | yes |
| 5 | date-time | 50 | **turn** | system | new |
| 5 | notifications | 55 | turn (cheap), source-dependent | system | new |
| 6 | location | 60 | **turn**, transient | system-formatted, participant-sourced | new |

Freshness choices, stated so they are decisions not accidents:

- **date-time: every turn.** Cost is zero (no I/O — formatted from server
  clock + client `timeZone` hint). A once-per-session value goes stale in any
  conversation that crosses midnight or a long pause. Format:
  `Current date and time for the visitor: Friday, 5 September 2026, 3:42 pm
  (America/Toronto).` Falls back to UTC with an explicit "(UTC — visitor time
  zone unknown)" when no hint is supplied, so the model never guesses.
- **location: every turn, never stored.** See §5.7. The client re-sends the
  consented coordinates with each turn it wishes to share them; absence on a
  turn means the block is omitted on that turn.
- **member-context / booking / base: every turn**, as today. All three are
  single indexed reads; making them per-session would need a session cache
  that does not exist and would defeat "publish is live next turn."
- **session-context:** keep the per-row `context_frequency` gate — it already
  is an explicit freshness rule.
- **notifications:** computed every turn, but each notification carries its
  own `showUntil`/`showOnTurns` so "you were just invited into a story" fires
  on turn 1 only, and "today is your 30th day" fires all day.

### 5.7 Location — its own privacy treatment

Rules, to be true from the first version, not retrofitted:

1. **Consent is explicit and client-side.** The browser permission prompt is
   never triggered on load or on first message. A visible affordance in the
   shell ("Share my location for this chat") triggers `navigator.geolocation`,
   and the accepted coordinates are held in client memory only (not
   `localStorage`, not the persisted session store).
2. **Transient on the server.** Coordinates arrive in the request body, are
   formatted into the block, and are never written to `chat_sessions`,
   `audit_events`, `members`, or any log. The audit record for the turn
   carries only `{ id: 'location', status: 'injected', granularity: 'city' }`.
3. **Coarsen before the model sees it.** Default injected granularity is
   city/region via reverse geocode with a bounded cache keyed on a rounded
   grid cell — **not** raw coordinates — unless a product case needs more
   (decision §9.4). If no geocoder is configured, the block says
   "approximate location shared" with the rounded coordinates only if Jeff
   opts into that (§9.4).
4. **Never persisted in the transcript.** Because `chat_sessions.messages`
   stores the conversation, the block must live in the *system* prompt only,
   never echoed into a user message.
5. **Retention statement is part of the ship gate**, alongside the consent
   copy — Privacy-by-Design principle in `CLAUDE.md`.

### 5.8 Observability — one record per turn, from day one

New `AuditAction.CHAT_TURN_CONTEXT_RESOLVED = 'chat.turn_context_resolved'`,
written once per turn by the runner (fire-and-forget via `logEvent`,
`services/audit/audit.ts:8`), `target_type: 'chat_session'`,
`correlation_id` threaded from the request:

```jsonc
{
  "selection": { "slotKey": "base", "ruleId": "default-slot",
                 "compiledPromptId": "7743fd18-…", "version": 23, "fallback": false },
  "injections": [
    { "id": "base-prompt",     "status": "injected", "estTokens": 2140, "ms": 41 },
    { "id": "booking",         "status": "injected", "estTokens": 88,   "ms": 39 },
    { "id": "member-context",  "status": "injected", "estTokens": 61,   "ms": 52,
      "fields": { "name": {"present": true, "length": 5, "hash": "a1b2c3d4"}, "primer": {"present": true, "length": 74} },
      "firstTurnMarkers": true },
    { "id": "session-context", "status": "skipped",  "reason": "no-row" },
    { "id": "media",           "status": "skipped",  "reason": "not-applicable" },
    { "id": "question-mode",   "status": "skipped",  "reason": "not-applicable" },
    { "id": "date-time",       "status": "injected", "estTokens": 24, "tz": "America/Toronto" }
  ],
  "budget": { "usedTokens": 2313, "capTokens": 2000, "droppedIds": [] },
  "isFirstTurn": false, "turnIndex": 4, "shadow": false
}
```

Every registered provider appears every turn — `skipped` with a reason is a
first-class outcome — so "why didn't X fire" is a single-row query. Never any
block text, never raw identity values (same rule as `CLAUDE.md` rule 6 and D9).
The two existing `CHAT_MEDIA_CONTEXT_RESOLVED` writes are retired in Phase 6
once this record carries their counts.

### 5.9 Extensibility — what "add a variable" costs

One new file under `providers/`, one line in `registry.ts`, one test file, one
row in the §5.6 table in the docs. Nothing in `runner.ts` or `streamChat`
changes. A registry test enumerates `PROVIDERS` and asserts every entry has a
unique id, a priority, a freshness value, a trust class, and a colocated test
file — the same "make the boundary a lint, not a convention" move Gate 3 used.

Per-tenant enablement of a provider (the `2BL.md` capability model — "turning
one on is a data/config change") has a natural future home in the deferred
`resolveTenantConfig(host) => { …, capabilities }` that `services/tenant/index.ts:7-14`
already earmarks; `appliesTo(input)` would consult it. Not built here — flagged
so the seam is known, not so it is abstracted for a hypothetical.

### 5.10 The "notifications" variable — source needs a decision

Two kinds, different sources:

- **Derived, schema-free:** "Nth day since joining" from `members.created_at`;
  "first conversation ever" from a count of the member's `chat_sessions`
  (Option B from `Decision_MemberContext_Jul31.md`, parked then, revivable
  here as an additive block without touching MEMBER CONTEXT).
- **Event-shaped:** "just invited into story X", "a collaborator added a
  memory since you last visited." These need a durable source. Two options
  for §9.3: (a) generalize `chat_session_context` to multiple rows per session
  (its `session_id UNIQUE` constraint is the only thing enforcing 1:1,
  documented as trivially removable, `Database Schema.md:24`) with a
  `'notification'` context_type; or (b) a new `member_notifications` table
  with `show_from`/`show_until`/`consumed_at`. (b) is cleaner — notifications
  are per-member, not per-session — and is Jeff's Studio work.

---

## 6. Shared API contract

Both products already call the same route with the same body. The contract
change is additive and backward-compatible:

**Wire (`POST /api/sage` body)** — unchanged fields plus an optional
`client_hints: { time_zone?, locale?, location? }` object. The Sage widget and
Heirloom shell both populate `time_zone`/`locale` from `Intl`; only a shell
that has built the consent affordance ever sends `location`. Older clients
send nothing and get UTC-labelled time.

**Server (`streamChat`)** — `ChatStreamRequest` gains `client?: {…}` and
`correlationId`; loses `promptType` (Phase 6). `resolveTurnPrompt(input)`
becomes the single function both the route and any future product adapter
call to obtain `{ system, selection, injections }`.

**Admin/observability** — `audit_events` rows with
`action = 'chat.turn_context_resolved'` are the read surface; an admin
"Prompt trace" panel on the session drawer is a natural later consumer but is
out of scope here.

---

## 7. Migration — build unused, prove, cut over one path at a time, retire

Ordering principle from the identity work: prove parity against live traffic
before any behaviour changes, then cut over in ascending blast radius, one PR
each, each independently revertable.

**Phase 0 — decisions + docs (this doc).** §9 answered; §1.4/§2.1 stale docs
corrected as a standalone docs PR (Documentation Stays Current).

**Phase 1 — build it, unused.** `turn-context/` with the six existing segments
wrapped as providers, `select-prompt.ts` with rules 3–5 only (1–2 need
unpopulated tables), full unit tests including an **assembly-order golden
test** (none exists today — `index.test.ts` asserts only `isFirstTurn` and
stop-detection). Zero call sites. `trust` delineation is implemented but the
`member-context` provider is registered as `system` so output is
byte-identical to today.

**Phase 2 — shadow against real traffic.** `streamChat` calls
`resolveTurnPrompt` alongside the existing assembly, compares `resolved.system
=== systemPrompt`, and writes the §5.8 record with `shadow: true` and a
`parity: boolean`. The model still receives the old string. Exit criterion:
100% parity across N days of both tenants' traffic (N and the threshold in
§9.5). This is the step that makes the rest safe.

**Phase 3a — cut over assembly.** `streamChat` uses `resolved.system`. Old
concatenation deleted. Behaviour identical by construction (Phase 2 proved it).
`shadow: false` from here.

**Phase 3b — turn on delineation for `primer`.** Flip `member-context`'s
`primer` sub-block to `trust: 'operator'`. This changes prompt text, so it
ships with a review of Heirloom's compiled prompt language that references
MEMBER CONTEXT (the July decision found that language brittle once before).

**Phase 4 — slot-aware selection.** `selectCompiledPrompt` replaces
`getSystemPrompt` in the base provider. No observable change for tenants with
one live row; closes `Known Gaps.md:587-603`. `getSystemPrompt` stays exported
for `compiler.test.ts` until Phase 6.

**Phase 5 — new variables, lowest risk first.** (a) `date-time` — no I/O,
no schema, needs the `client_hints.time_zone` wire field in both shells.
(b) `notifications` derived kind (schema-free), then event kind after §9.3.
(c) `location` — last; blocked on consent UI + §9.4.

**Phase 6 — retire.** Remove `promptType` wiring (`route.ts:86-88`,
`types.ts:45-47`), the dead `memberId` prop chain (§2.1 I3), the duplicate
`CHAT_MEDIA_CONTEXT_RESOLVED` writes, `services/chat/server/prompt.ts` shim if
nothing else imports it; add the registry lint test; update `Chat Server.md`,
`Prompt.md`, `API Routes.md`, `Audit.md`, `Database Schema.md`, `CLAUDE.md`.

**Rollback posture:** Phases 1–2 cannot affect the model input. Phase 3a is a
one-line swap with the old array kept in git history; Phase 3b/4/5 are each
one provider flag or one registry line.

---

## 8. What does NOT change

- The `/api/sage` wire format (Vercel AI SDK data stream) and the client turn
  engine, beyond one optional body field.
- `handleSessionFinish` and every marker/regex fallback (`session.ts:494-665`).
- `attachSessionContext`, the `chat_session_context` schema, and the
  `CONTEXT_BLOCK_BUILDERS` registry — the story provider wraps
  `getSessionContext` unchanged.
- Compile & Publish (`compile.ts`, the RPC, release notes, version semantics).
- Admin composer/prompt-chat/title prompts (§1.2 rows 2–4) — separate,
  admin-internal, not chat turns.
- `resolveModelConfig` and model selection — orthogonal; the unused
  `rateLimitRequestsPerHour`/`fallbackModel` stay a separate known gap.
- Host→tenant resolution and the "tenant is the product" model (§9.1).

---

## 9. Decisions needed from Jeff before Phase 1

### 9.1 Is "product" a selection dimension, or is tenant enough?
Today product ≡ tenant (Heirloom is one tenant, jefflougheed.ca is one
tenant). `2BL.md:69-89` and `ARCHITECTURE_OVERVIEW.md` Phase C describe a
product tier that does not exist in the schema. **Recommendation:** key
runtime selection on `(tenant, slot)` only, and treat product as a
*compile-time* inheritance tier (Phase C's concern), not a runtime input.
Reopening this later costs one rule, not a redesign.

### 9.2 Budget numbers
Default cap for injected (non-base) context — proposed 2,000 estimated
tokens — and whether it is a hard cap that drops blocks or a soft cap that
only logs. **Recommendation:** log-only in Phases 1–4 (nothing approaches it),
hard cap from Phase 5 when variables start multiplying.

### 9.3 Notification source
§5.10 (a) generalize `chat_session_context` vs (b) new `member_notifications`
table. **Recommendation:** (b). Studio work, needed before Phase 5b's event
kind; the derived kind needs nothing.

### 9.4 Location granularity and geocoding
City-level via reverse geocode (needs a provider) vs rounded coordinates vs
precise. **API Before Build:** Vercel sets IP-derived geo request headers
(`x-vercel-ip-country` / `-country-region` / `-city`) on every request with
no browser permission and no coordinates — to be confirmed against current
Vercel docs and the `middleware.ts` header-forwarding path before relying on
it. **Recommendation:** if confirmed, start with those headers as the
`location` provider's first source (still consent-gated at the *product* level
— a tenant setting, and still transient/never persisted per §5.7), and defer
GPS until a product case needs street-level. This makes the browser-consent
affordance a later, optional upgrade rather than a Phase 5 blocker. IP-derived
location is still personal data — the §5.7 rules apply to it unchanged.

### 9.5 Parity gate for Phase 2
How many days of shadow traffic, and whether any non-parity turn blocks
cutover or only unexplained ones. **Recommendation:** 7 days, both tenants,
zero *unexplained* mismatches.

### 9.6 The unverifiable RPC
`publish_compiled_prompt`'s body is Studio-only; version increment and retire
semantics are inferred. Not a blocker for this design, but §1.1's "what
drives v23" answer stays inferred until the body is exported into
`System Docs/DB_CHANGELOG.md` (Jeff's side).

### 9.7 Member `status` filter
`resolveMemberId` (`route.ts:17-23`) and `member-context.ts:71-76` inject a
suspended/deleted member's identity. Adding `.eq('status','active')` is a
one-line behaviour change outside this design's scope but naturally lands in
the `member-context` provider. Include in Phase 3b, or separate?

---

## 10. Test plan (for the build phases — written now, per `CLAUDE.md`)

- **Unit, runner:** provider throws → turn proceeds, decision `failed`;
  provider hangs → `timeout` at `timeoutMs`; priority ordering; budget drops
  lowest-priority whole blocks and records ids; trust wrapping escapes `<`/`>`
  (reuse `session-context.test.ts`'s breakout case); every provider appears in
  the decision list every turn.
- **Unit, selection:** each rule in §5.4 with fixtures; fallback ladder
  typed → untyped → default, each stamping `fallback`; two-live-slots case
  picks by slot not version (the `Known Gaps` regression).
- **Golden, assembly:** the six current segments for (a) Sage visitor,
  (b) Heirloom member first turn, (c) Heirloom member story turn, asserting
  byte equality with the Phase 0 concatenation — this is the Phase 2 parity
  oracle in test form.
- **Unit, providers:** existing `member-context.test.ts`,
  `session-context.test.ts`, `media-context.test.ts` unchanged; new
  `date-time` (UTC fallback, DST boundary, invalid tz string), `notifications`
  (window gating), `location` (never appears in audit metadata; omitted when
  hint absent).
- **Registry test:** ids unique, every provider has a colocated `*.test.ts`.
- **Audit:** `logEvent` mocked; assert metadata contains no string matching
  any fixture name/email/phone/coordinate.
- **Verification surface:** Vercel preview per phase; Phase 2 parity read via
  Supabase query on `audit_events` (`action = 'chat.turn_context_resolved'
  AND metadata->>'parity' = 'false'`).

---

## Appendix A — stale documentation to correct in Phase 0

P1–P6 (§1.4), I1–I8 (§2.1), B1–B7 (§3.5), plus: `Utilities/Chat Server.md`
title says "MEMBER CONTEXT" but the file now documents three mechanisms;
`Design Handovers/chat-shells.md` is marked "Authoritative" while
`jefflougheed Chat Widget.md:359` lists it as non-authoritative — pick one.
`ARCHITECTURE_OVERVIEW.md`'s "Batched onFinish writes" target is unchanged and
still true — no action.

## Appendix B — unverifiable from the repo (stated, not guessed)

- `publish_compiled_prompt` RPC body (version increment, retire semantics).
- Live `compiled_prompts` row counts per tenant — whether any tenant already
  has >1 live typed slot (i.e. whether `Known Gaps.md:587` bites today).
- Whether `getCompiledComposerSystem`'s missing `status` filter
  (`composer.ts:97-103`) can pick a retired row — depends on the RPC.
- Vercel geo header availability through this deployment's middleware.
