# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> CC reads this at the start of every session.

---

## Current State — May 24, 2026

The platform foundation is in place and merged to `main`:

- **Chat service — server half** (`services/chat/server/`) extracted and live;
  `/api/sage` routes through it as a thin adapter. (Merged to main, #22/#23.)
- **Platform admin** — `/platform/admin` with the cross-tenant tenant list and
  full tenant create / edit / delete. (Merged to main, #24.)
- **Platform sign-in** — branded `/secondbrainlabs/sign-in` flow with the
  `platform_admin` role gate. (Merged to main, #24.)

Focus now shifts to **Heirloom**: marketing page, chat, and the memory-creation
flow. The remaining service extraction (auth / prompt / crm), the chat-service
UI move to `services/chat/ui/v1/`, and tenant-hierarchy cycle prevention are
**known deferred items** — see "Next — Heirloom" and "Known deferred items"
below.

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

### Platform admin + sign-in ✅ COMPLETE (merged to main, #24)
The `/platform/admin` operator surface and the branded platform sign-in are
live on `main`.

- **Sign-in** — `app/secondbrainlabs/sign-in/[[...sign-in]]/page.tsx` plus the
  `(platform)` layout gate: unauthenticated → `/secondbrainlabs/sign-in`,
  non-`platform_admin` → `/admin`. Role read from Clerk `publicMetadata.role`.
- **Tenant list** — `TenantList.tsx`: cross-tenant parent/child tree (service-
  role read across all tenants), desktop table + mobile cards, expand/collapse,
  rows clickable (mouse + keyboard) to open the editor.
- **Create** — `NewTenantModal.tsx` + `POST /api/platform/tenants`: name, type,
  parent, slug (auto-generated, editable), domain; slug + domain uniqueness.
- **Edit / delete** — `EditTenantModal.tsx` + `PATCH` / `DELETE
  /api/platform/tenants/[id]`: delete is confirmed and refuses to remove a
  tenant with sub-tenants (409) or dependent records (`23503` → 409).
- **Auth** — every `/api/platform/*` route re-checks `platform_admin`
  independently of the UI, so the service-role writes can't run for a non-admin.

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

## Next — Heirloom

With the platform foundation merged, the active work is bringing **Heirloom**
onto the platform:

1. **Heirloom marketing page** — the product storefront / landing surface.
2. **Heirloom chat** — Heirloom's conversational experience on the chat service
   (consuming `services/chat/server`; HTTP contracts stay frozen).
3. **Memory-creation flow** — the core Heirloom flow for capturing and building
   memories / stories.

These can proceed against the current chat service without finishing the full
service extraction — the deferred items below are not blockers for Heirloom's
first cut. HTTP contracts remain FROZEN: `/api/sage` and `/api/sage/parameters`
paths and shapes do not change; jefflougheed.ca must not break.

---

## Known deferred items

Tracked, intentionally not done yet, none blocking Heirloom's first iteration:

1. **Service extraction — `auth`, `prompt`, `crm`.** The chat server half was
   extracted first (out of MIGRATION.md's `auth → prompt → crm → chat` order),
   so it reaches around the missing services and reads their concerns directly.
   See "Dependency-order problem" and "Not started — other Phase 3 services"
   above. Also pending here: the `@/services/*` tsconfig alias and the
   import-boundary lint rule ("Phase 3 infrastructure gaps").
2. **Tenant-hierarchy infinite-loop / cycle prevention.** `PATCH
   /api/platform/tenants/[id]` blocks a tenant being its own parent, but does
   NOT prevent deeper cycles (A→B→A). The list's tree walk drops cycles from the
   root set rather than infinite-looping, so today this is malformed state, not
   a crash — but a full ancestry/descendant check should land before tenant
   hierarchies get deep.
3. **Chat-service UI move to `services/chat/ui/v1/`.** The client primitives
   (parseBookingCards, BookingCard, SageReply, markdownComponents,
   useSageParameters) still live in `src/components/sage/`; the client transport
   (`sage.ts`, `stream.ts`, `store.ts`) is still in `src/lib/`. See "Chat
   service — UI half NOT yet extracted" above (resolve the shared `stream.ts`
   admin coupling first).

**Phase 4 — security hardening** (RLS primary, Clerk→Supabase JWT, audit log;
MIGRATION.md Phase 4) remains the major security milestone and is unchanged.

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
