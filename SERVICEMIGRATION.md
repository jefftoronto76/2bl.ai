# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> CC reads this at the start of every session.

---

## Current State — May 24, 2026

Status: Stages 1-3 complete and merged to main (#22, #23). Phase 3 **chat
service — server half** extracted and live (`/api/sage` routes through it).
The chat-service UI half and the other three Phase 3 services (auth, prompt,
crm) are not started.

---

## Completed

### Stage 1 — Planning
- MIGRATION.md written and approved (full 6-phase plan)
- 2BL.md platform bible created
- Architecture decisions locked

### Stage 2 — Isolate jefflougheed.ca
- ✅ IDOR fix — app/api/sessions/[id]/route.ts scoped by tenant_id
- ✅ 7 self-contained components moved to app/(jefflougheed)/components/
- ✅ All assets namespaced to public/sage/jefflougheed/ (correct tenant 
  hierarchy — jefflougheed.ca is a Sage tenant)
- ✅ All asset references updated, zero stale refs
- ✅ DesignLab logo typo fixed
- ✅ jefflougheed.ca favicons wired in layout.tsx
- ✅ tsc clean, next build passing

### Stage 3 — 2BL/SBL Storefront
- ✅ 2BL logo wired (public/2bl/2blai_logo.svg)
- ✅ 2BL favicons wired in app/secondbrainlabs/layout.tsx
- ✅ public/sage/ and public/sage/favicons/ scaffolded

### Phase 3 (partial) — Chat service: SERVER half ✅ COMPLETE
The server-side streaming/orchestration logic that used to live inline in
`app/api/sage/route.ts` has been extracted into `services/chat/server/`. The
route is now a thin HTTP adapter. The `/api/sage` wire format (Vercel AI SDK
data stream) is frozen and unchanged — jefflougheed.ca was not touched.

Commits: `296846d` (scaffold) → `3831cdc` (stream) → `dbc96db` (prompt) →
`9579b0e` (booking) → `579418c` (session) → `03aa6bf` (orchestrator) →
`6ee05eb` (route adapter).

What's in each file:

| File | Contents |
|------|----------|
| `services/chat/server/types.ts` | Framework-agnostic contract types: `ChatMessage`, `ChatRole`, `ChatMode`, `ChatTenantContext`, `ChatStreamRequest`, `ModelProvider`, `ModelConfig`, `TokenUsage`, `SessionFinishUpdate`, `OpenAs`, `BookingCardData`, `ParsedBookingResult`. No Next.js imports. |
| `services/chat/server/index.ts` | Public orchestrator `streamChat()` — normalizes messages (empty → greeting `'Hi'`; leading-assistant gets `'Hi'` prepended), composes the system prompt (base + booking + question-mode) in parallel with model-config resolution, runs one streamed turn, returns the data-stream Response (502 on upstream error). Re-exports the public contract types. |
| `services/chat/server/stream.ts` | `resolveModelConfig()` (reads `tenant_model_config`, falls back to code defaults), `getModelInstance()` (provider seam — Anthropic wired, OpenAI throws as not-yet-wired), `runChatStream()` (the `streamText` call + `onFinish` usage normalization). The ONLY hardcoded model IDs live here: `claude-sonnet-4-6` / `gpt-4o` defaults. Server-only. |
| `services/chat/server/prompt.ts` | `getSystemPrompt()` (highest-version `master_prompt` row, falls back to `DEFAULT_SYSTEM_PROMPT`) + `QUESTION_MODE_CONTEXT` const. Re-exports `DEFAULT_SYSTEM_PROMPT` (still physically defined in `src/lib/sage-prompt.ts`). Server-only. |
| `services/chat/server/booking.ts` | `getBookingCardSection()` (fetches `sage_parameters`, renders the `[BOOKING: …]` section) + pure `buildBookingSection()`. Returns `''` on error/no-rows so the section is simply omitted. Server-only. |
| `services/chat/server/session.ts` | onFinish detection flows, moved verbatim: `persistTokenUsage` (main turn + Haiku), `scanForCalendarOffer` + `persistCalendarOffered`, `extractNameWithHaiku` (`claude-haiku-4-5`) + `isPlausibleName` + `persistVisitorName`. No-ops when `sessionId` is null. Server-only. |

`app/api/sage/route.ts` now imports `streamChat` from `@/services/chat/server`
and owns only HTTP concerns (ANTHROPIC_API_KEY guard, host→tenant resolution,
JSON body parsing).

---

## Pending — Before Merge

### Logo and favicon polish (deferred — not blocking merge)
- 2BL logo needs black background + terracotta trace in Illustrator
- 2BL favicon needs same treatment
- Sage product logo and favicons not yet uploaded
- JeffLougheed_Logo.svg uploaded but not referenced anywhere in code
  (public/sage/jefflougheed/JeffLougheed_Logo.svg)
- These are design tasks for Jeff — not blocking the service migration

---

## Chat service — UI half NOT yet extracted

The server half is done (above). The **client/UI half has not started** —
`services/chat/ui/` does not exist yet, even though `server/types.ts` and
`server/booking.ts` already reference an intended
`services/chat/ui/v1/parseBookingCards.ts`. Those are forward references with
no target on disk.

Still living in `src/components/sage/` (the UI primitives that should move into
`services/chat/ui/`):

| File | Notes |
|------|-------|
| src/components/sage/parseBookingCards.ts | Client parser — the counterpart to `server/booking.ts`. Comments already point at the intended `services/chat/ui/v1/` home. |
| src/components/sage/BookingCard.tsx | Booking card + inline-embed injection. |
| src/components/sage/SageReply.tsx | Assistant-message renderer; resolves cards to params by URL match. |
| src/components/sage/markdownComponents.tsx | Palette-aware markdown renderers. |
| src/components/sage/useSageParameters.ts | Fetches `/api/sage/parameters`. |

Client transport that SERVICEMIGRATION previously listed as moving into
`services/chat` (still in `src/lib/`):

| File | Notes |
|------|-------|
| src/lib/sage.ts | `streamSageResponse` — the `/api/sage` fetch client. |
| src/lib/stream.ts | `readDataStream`. ⚠️ **Shared with admin** (`components/admin/PromptBuilderChat.tsx`, `app/admin/prompt-builder/page.tsx`), not chat-only — moving it under `services/chat` would make admin import from the chat service. Resolve before moving. |
| src/lib/store.ts | Exports both `useSageStore` (public chat) and `useChatStore`. Consumed by Chat, Hero, Nav, SectionProcess, Work. |

The jefflougheed.ca consumers below stay in `src/components/` and become thin
consumers of the chat service once its UI half exists — do not move or delete
without explicit instruction from Jeff:

| File | Role |
|------|------|
| src/components/Chat.tsx | Visitor chat overlay — consumes the chat service. |
| src/components/Hero.tsx | Imports sage/* + store + sage.ts; drives streaming/booking. |
| src/components/Nav.tsx | Imports `useSageStore`. |
| src/components/SectionProcess.tsx | Imports `useSageStore` (expand question mode). |

---

## ⚠️ Dependency-order problem (Phase 3)

MIGRATION.md Phase 3 specifies moving one service per commit in **dependency
order: `auth → prompt → crm → chat`** — chat last, because it depends on the
other three. In practice **chat was extracted first**, while `auth`, `prompt`,
and `crm` are still scattered across `src/lib/` and `app/api/`. The extracted
`services/chat/server/` therefore reaches around the missing services and reads
their concerns directly:

- It calls `getAdminClient()` (`src/lib/supabase-admin.ts`) directly instead of
  going through a future `services/auth` client factory.
- It reads `master_prompt` / `sage_parameters` / `tenant_model_config` directly
  rather than through a `services/prompt` interface.
- It writes `chat_sessions` (token usage, calendar-offered, visitor_name)
  directly rather than through a `services/crm` interface.

When auth/prompt/crm are extracted, the chat service's direct DB access will
need to be repointed at them. Not a bug today (behavior is correct and
contracts are frozen), but the boundaries are not yet clean.

---

## Not started — other Phase 3 services

| Service | Files that should move (per MIGRATION.md Phase 3) | Status |
|---------|--------------------------------------------------|--------|
| `auth` | `src/lib/get-auth-context.ts`, `get-tenant-from-request.ts`, `sync-user.ts`, the Supabase client factories, the new resolution cache | Not started |
| `prompt` | `app/api/admin/prompt/compile/**`, `compile/check`, `src/lib/sage-prompt.ts`, `blockOrder.ts`, `blockTypes.ts`, `tokenize.ts` | Not started |
| `crm` | `app/api/sessions/**` internals, `src/lib/deriveSessionStatus.ts` | Not started |
| `payments` | (scaffolded empty) | Not started |

---

## Phase 3 infrastructure gaps

- **Missing `@/services/*` tsconfig alias.** `tsconfig.json` only defines
  `@/*` → `./*` + `./src/*`. Imports like `@/services/chat/server` resolve
  only because `services/` happens to sit at repo root under the `./*` glob.
  Phase 3 calls for an explicit `@/services/*` path alias — not added.
- **Missing import-boundary lint rule.** Phase 3 requires an
  `eslint-plugin-boundaries` / `import/no-restricted-paths` rule to forbid
  cross-service internal imports and circular deps, failing the build on a
  cycle. Not added — nothing currently enforces service boundaries.
- **`DEFAULT_SYSTEM_PROMPT` not physically moved.** It is re-exported through
  `services/chat/server/prompt.ts` but still physically defined in
  `src/lib/sage-prompt.ts`, and `app/admin/prompt/page.tsx` still imports it
  from the old path. Physical consolidation is deferred to a cleanup commit
  (see the note in `prompt.ts`), once nothing imports it from `src/lib`
  directly.

---

## Pending Investigation

The following files are not imported by jefflougheed.ca entry points.
Ownership unknown — do not touch until investigated:
- src/components/About.tsx
- src/components/Problems.tsx
- src/components/Process.tsx
- src/components/WhyMe.tsx
- src/components/Work.tsx
- src/components/PromptEditor.tsx
- src/components/QuoteCarouselSection.tsx
- src/components/CareerHighlights.tsx (references public/logos/2blai_logo.svg)

---

## What Remains Before Heirloom Migration

### ✅ Done — Merge Stages 1-3 to main
Merged via #22 (Stages 2+3) and #23 (admin host-tenant fix). jefflougheed.ca
and the 2BL storefront verified on preview.

### ✅ Done (partial) — Phase 3: Chat service SERVER half
`services/chat/server/` extracted; `/api/sage` routes through it as a thin
adapter. See "Phase 3 (partial) — Chat service: SERVER half" above for the
per-file breakdown.

### Priority 1 — Finish Phase 3 (CRITICAL PATH)
The chat engine must be fully in `services/chat` before Heirloom can consume
it. Remaining work, in dependency order (`auth → prompt → crm`, then close out
chat — see the dependency-order problem above):

1. **Extract `auth`** — client factories + `get-auth-context` /
   `get-tenant-from-request` / `sync-user`; repoint `services/chat/server`'s
   `getAdminClient()` calls at it.
2. **Extract `prompt`** — compile pipeline + `sage-prompt.ts` (physically move
   `DEFAULT_SYSTEM_PROMPT` here, drop the re-export shim); repoint chat's
   `master_prompt` reads.
3. **Extract `crm`** — session persistence + `deriveSessionStatus`; repoint
   chat's `chat_sessions` writes.
4. **Extract chat UI half** — `services/chat/ui/v1/` (parseBookingCards,
   BookingCard, SageReply, markdownComponents, useSageParameters) + resolve the
   shared `src/lib/stream.ts` (`readDataStream`) admin coupling, + `sage.ts`
   client + `store.ts`.
5. **Infrastructure** — add the `@/services/*` tsconfig alias and the
   import-boundary lint rule (see "Phase 3 infrastructure gaps").

HTTP contracts remain FROZEN — /api/sage and /api/sage/parameters paths and
shapes do not change. jefflougheed.ca must not break.

### Priority 2 — Phase 4: Harden tenant security
RLS, JWT, audit logging — see MIGRATION.md Phase 4.

### Priority 3 — Heirloom migration
Cannot start until Phases 3 and 4 are complete.

---

## Public Asset Structure

```
public/
  2bl/                          ← 2BL platform assets
    2blai_logo.svg              ⚠️ needs Illustrator polish
    favicons/                   ⚠️ needs Illustrator polish
  sage/                         ← Sage product assets
    favicons/                   ⚠️ awaiting Sage logo/favicon upload
    jefflougheed/               ← jefflougheed.ca tenant assets
      JeffLougheed_Logo.svg     ⚠️ uploaded, not yet referenced in code
      ProblemBackground.webp
      chewing-gum.svg
      bench.svg
      favicons/
      logos/
      headshots/
```

---

## SBL Storefront Known Issues (not blocking)
- /sage, /heirloom, /hugs, /mealflow, /sign-in, /writing all 404
  → Expected. Products not built yet. Resolved in Phase 5.
- Chat widget on SBL not connected to live API
  → Known issue, not blocking migration work.

---

## Deferred — Phase 5

### Model configuration per tenant
**Partially live, ahead of schedule.** `tenant_model_config` now exists and
`services/chat/server/stream.ts` `resolveModelConfig()` already reads it
(provider, model_id, model_id_fallback, max_tokens, rate_limit_requests_per_hour),
falling back to code defaults when no row is present. The remaining Phase 5 work
is the admin UI to manage those rows and per-tenant key handling (below).

Code-default fallbacks (the only hardcoded model IDs, all in `stream.ts` /
`session.ts`):
- Chat model: claude-sonnet-4-6
- Fallback model: gpt-4o (provider seam present; OpenAI not yet wired — throws)
- Name extractor: claude-haiku-4-5 (fixed in `session.ts`, not tenant-configurable)

Note: `server/types.ts` still carries a stale comment implying
`tenant_model_config` is "NOT yet available" — clean that up when the chat
service is next touched.

### PgBouncer / connection pooling
Not applicable to the current stack. Supabase JS uses the HTTPS 
PostgREST endpoint, not a direct Postgres TCP connection. The 
6543 pooled port only applies to direct pg/postgres.js connections 
which don't exist in this codebase.

If a future phase introduces a direct Postgres connection 
(e.g. for bulk operations or a dedicated query layer), configure 
PgBouncer in transaction mode at that point.

---

## Platform Principles

### Tenant-configurable AI API keys
Tenants can bring their own AI API key (Anthropic, OpenAI, or future
providers). The platform provides prompt engineering and orchestration — the
model and API costs are tenant-configurable.

When a tenant supplies their own key:
- Platform uses their key instead of the platform default
- API costs pass through to the tenant directly
- Key must never be exposed client-side under any circumstances

Security requirements before this feature ships:
- API keys stored encrypted at rest (not plain text in DB)
- Multi-factor authentication required to add/update a key
- Key access restricted to server-side only, never in client bundle
- Full audit log on key creation, rotation, deletion
- Separate secrets management — not in tenant_model_config directly

Current state: seam designed, feature not enabled.
Studio task (Jeff): add encrypted api_key storage when ready to implement — do
not add to tenant_model_config as plain text.

---

## Key Documents

| Document | Purpose |
|----------|---------|
| CLAUDE.md | Rules for CC — stack, principles, workflow |
| MIGRATION.md | Full migration plan, phases 1-6 |
| SERVICEMIGRATION.md | This document — critical path |
| DB_CHANGELOG.md | Schema changes log |
| 2BL.md | Platform bible |
