# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> Not auto-loaded — nothing in the codebase imports or reads this file at session start; consult it manually.

---

## Current State — May 26, 2026

The platform foundation is in place and merged to `main`. **Phase A — the
service-extraction strangle — is COMPLETE** (PRs #30–36, May 25, 2026):

- **globals.css split by product** + root favicon fixed. (#30)
- **services/auth/** extracted — auth-context, tenant resolution, user sync, the
  Supabase client factories, and the admin-user context. (#31, #34)
- **services/prompt/** extracted — runtime compiler, master-prompt compile,
  manual save, LLM safety review, block CRUD, and the block/token helpers; the
  `app/api/admin/{prompt,blocks}/*` routes are thin consumers. (#32, #34)
- **services/crm/** extracted — session state machine, chat `onFinish`
  lifecycle, anonymous session writes, inbound-chat triage; the
  `app/api/sessions/*` routes and the admin Inbound Chats list are thin. (#33)
- **Strangle finished** — `src/lib` helpers, `PromptEditor`, and the admin-user
  context moved out of `src/`; only the deferred chat-UI layer remains. (#34)
- **`@/services/*` tsconfig alias** + **import-boundary lint rule**
  (`eslint-plugin-boundaries`, `warn`) in place.
- **Multi-tenant admin live** on all three domains — `/admin` passes through the
  host rewrites and the banner name is host-derived. (#35)
- **Block creation tenant-scoped, body-only required** (Title/Type/Topic
  optional, stored null when omitted). (#36)

Earlier foundation (pre-Phase-A): chat server half (#22/#23), platform admin +
branded sign-in (#24).

**Heirloom is in migration.** Landing page ✅, chat wired to
`services/chat/server` ✅ with the **full session lifecycle** (PR #39 — the
Heirloom chat store POSTs `/api/sessions` on first send, passes `session_id` to
`/api/sage`, and PATCHes `/api/sessions/[id]` after the stream settles), and
multi-tenant admin ✅. Remaining: **block development** (in progress),
**master_prompt compile/publish** (pending — until then Heirloom chat falls back
to Sage's `DEFAULT_SYSTEM_PROMPT`), the **memory creation flow**, and **Clerk
account creation in chat**.

**Known gaps:**
- `services/payments/` — not created (scaffold only, deferred).
- ~~History page missing the `tenant_id` filter~~ — **fixed (PR #38):**
  `app/admin/prompt-studio/history/page.tsx` now resolves the tenant via
  `getAuthContext()` and scopes the `chat_sessions` query by `tenant_id`.
- Chat-UI strangle (`services/chat/ui/v1/`) — **complete** (Steps E/F + Nav
  relocation; `boundaries/element-types` reports **0** warnings).

The chat-service UI move and tenant-hierarchy cycle prevention remain **known
deferred items** — see "Next — Heirloom" and "Known deferred items" below.

---

## Completed

### Chat UI v1 — shared engine (May 26, 2026, PRs #42-46)

The client chat engine was extracted into `services/chat/ui/v1/` and both
tenants migrated onto it:
- **#42** — type contracts: marker registry + `useChatTurn` hook interfaces (`types.ts`).
- **#43** — concrete marker registry (`createMarkerRegistry` / `createDefaultRegistry`
  / `BOOKING_MARKER`) + store-agnostic `useChatTurn` hook; jefflougheed (`Chat.tsx`,
  `Hero.tsx`) migrated; `src/lib/sage.ts` deleted; `parseBookingCards` delegates to
  the registry.
- **#44** — Heirloom chat migrated onto the same `useChatTurn` engine via
  `ChatEngineAccessors` over its `useReducer` store; `app/heirloom/lib/stream.ts`
  deleted; `MessageList` strips markers.
- **#45** — `[NAME:]` marker (server-persist) added, dual-run alongside Haiku.
- **#46** — Haiku name extractor removed; name capture is marker-only.

`useChatTurn` is store-agnostic (injected `ChatEngineAccessors`), so jefflougheed
(Zustand) and Heirloom (`useReducer`) share one turn engine and one marker
registry. The visual components moved to `components/shells/widget/` (Steps E/F;
see "Chat service — UI half (fully extracted)" below).

### Stage 1 — Planning
- MIGRATION.md written and approved (full 6-phase plan)
- System Docs/2BL.md platform bible created
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
| `services/chat/server/prompt.ts` | Thin re-export of `services/prompt/compiler.ts` (`getSystemPrompt`, `QUESTION_MODE_CONTEXT`) + `DEFAULT_SYSTEM_PROMPT` (now `services/prompt/sage-prompt.ts`). The runtime compiler moved to the prompt service in V3; `sage-prompt.ts` moved there in V5. Server-only. |
| `services/chat/server/booking.ts` | `getBookingCardSection()` (fetches `sage_parameters`, renders the `[BOOKING: …]` section) + pure `buildBookingSection()`. Returns `''` on error/no-rows so the section is simply omitted. Server-only. |
| `services/chat/server/session.ts` | onFinish detection flows. **Now lives at `services/crm/session.ts`** (moved during the crm extraction). `persistTokenUsage`, `scanForCalendarOffer` + `persistCalendarOffered`, and `[NAME:]`-marker name capture: `detectVisitorNameMarker` + `isPlausibleName` + `persistVisitorName`. **Name capture is marker-only — `extractNameWithHaiku` (`claude-haiku-4-5`) was removed in PR #46.** No-ops when `sessionId` is null. Server-only. |

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

### Admin/platform route → service delegation ✅ (centralization Step C)
The inline-logic admin/platform routes flagged in the centralization plan are
now thin consumers; their business logic moved into services. Behavior is
byte-for-byte preserved (same queries, validation, status codes, wire format,
log strings).

- **`services/tenant/`** — `createTenant` / `updateTenant` / `deleteTenant`
  back `POST /api/platform/tenants` and `PATCH`/`DELETE
  /api/platform/tenants/[id]`. Routes keep the `platform_admin` gate + parse.
  `resolveTenantConfig(host)` is DEFERRED to Step I (needs `tenants.shell_type`
  + confirmed `tenant_branding` columns — Jeff/Studio).
- **`services/content/`** — `extractText` + `createDocumentAsset` (assets),
  `createContent` / `getContent` (content), `listTopics` / `createTopic`
  (topics) back `/api/admin/assets/upload`, `/api/admin/content[/id]`, and
  `/api/admin/topics`.
- **`services/prompt/composer.ts`** — `streamBlocksComposer` /
  `streamPromptChat` back `/api/admin/blocks/chat` and `/api/admin/prompt-chat`,
  returning the Vercel AI SDK data-stream Response unchanged.

### Membership shell extraction ✅ (centralization Step F)
The Heirloom chat — the platform's **membership shell** — was split per
Correction 1 (headless logic → `services/`, JSX → `components/`):

- **Headless → `services/chat/ui/v1/`:** `chatReducer.ts` (+ test) — the pure
  shell reducer (no React/JSX).
- **JSX → `components/shells/membership/`:** `ChatHero`, `ChatHeader`,
  `ChatInput`, `MessageList`, `Sidebar`, the `chatStore.tsx` / `ChatProvider`
  context wrapper, and `ui/*` (`Avatar`, `Button`, `IconButton`).
- `app/heirloom/` now holds only `page.tsx` (mount), `layout.tsx`,
  `globals.css`, and `components/landing/*`. The landing files + `page.tsx`
  import the shell via `@/components/shells/membership/*` (app→components, legal
  under the Step D eslint rule). Mobile keyboard handling was untouched.

### Heirloom storefront — landing + chat ✅ (on `heirloom-migration`)
Bringing Heirloom onto the platform (steps 1–2 of "Next — Heirloom" below):

- **Host routing + tokens** — `heirloom.2bl.ai` → `/heirloom` rewrite and an
  `x-heirloom` brand signal in `middleware.ts`; `[data-brand="heirloom"]` design
  tokens in `globals.css` / `tailwind.config.js`; `app/heirloom/layout.tsx`
  (Cormorant Garamond + DM Sans). Commits `5b1d2a4`, `8575cc1`, `9a1a981`.
- **Landing page** — all marketing sections under
  `app/heirloom/components/landing/`. Commit `f4e51dc`.
- **Chat UI + streaming** — full chat surface ported from the legacy Vite repo
  into `app/heirloom/components/{chat,ui}/`: collapsible sidebar, header,
  message list, input. `page.tsx` is the product app root (`ChatProvider` +
  slide-in panel + backdrop, Escape / backdrop-click to close). Real streaming
  via a Heirloom-local `lib/stream.ts` reader POSTing to `/api/sage` (no
  dependency on `src/lib/sage.ts` / `stream.ts`); `session_id` null for now.
- **Frozen contract honored** — `/api/sage` paths/shapes unchanged;
  jefflougheed.ca untouched. `tsc` clean, `next build` passing.

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

## Chat service — UI half (fully extracted, PRs #42-46 + Steps E/F + Nav)

The server half was done earlier (above). The **engine half of the UI is now
extracted** into `services/chat/ui/v1/`: the marker registry (`registry.ts` —
`createMarkerRegistry`, `createDefaultRegistry`, `BOOKING_MARKER`, `NAME_MARKER`),
the store-agnostic `useChatTurn` hook, and the type contracts (`types.ts`). Both
tenants consume the hook — jefflougheed via Zustand (`useSageStore`), Heirloom
via `useReducer` — each wrapping its store in `ChatEngineAccessors`.
`src/lib/sage.ts` (`streamSageResponse`) was **deleted**; the hook owns transport
via the shared `readDataStream` (`services/chat/server/stream-utils.ts`). See
"Chat UI v1 — shared engine" under Completed.

### Widget shell extraction ✅ (centralization Step E)
The jefflougheed Sage chat — the platform's **widget shell** — was split per
Correction 1 (headless → `services/`, JSX → `components/`):

- **JSX → `components/shells/widget/`:** `Hero`, `Chat`, and `sage/*`
  (`SageReply`, `BookingCard`, `markdownComponents`).
- **Headless → `services/chat/ui/v1/`:** `useWidgetShell` (the shell-state
  store — extracted from the old `src/lib/store.ts` `useSageStore`, which was
  deleted; the conversation slice had already migrated to `useChatSession`) and
  `useSageParameters` (data hook). The headless `parseBookingCards` parser had
  already moved in Step B.
- `useReveal` moved to `services/shared/`; the orphaned `Work.tsx` was deleted.
- `app/(jefflougheed)/page.tsx` mounts the singleton
  `<ChatSessionProvider instanceKey="sage">`; Hero + Chat consume
  `useChatSessionContext()` (one conversation across both surfaces). The iOS
  keyboard handling and the Chat mode-bridge were preserved unchanged.

`src/components/` is now **empty and removed**. The last resident, `Nav.tsx`
(jefflougheed nav chrome — **no chat coupling**; only `ShareModal`), was
relocated into `app/(jefflougheed)/components/Nav.tsx` (importing `ShareModal`
via relative `./ShareModal`), which clears the final `src→app` boundary warning
(`boundaries/element-types` now reports **0** warnings). `SectionProcess.tsx`
had already moved there in Step E. `src/` now holds only `calendly.d.ts`.

Note: `readDataStream` (the data-stream reader, shared with the admin composer)
was moved out of `src/lib/stream.ts` to `services/chat/server/stream-utils.ts`
(V5) — named to avoid colliding with the chat `stream.ts`.
`services/chat/ui/v1/useChatTurn.ts`, `components/admin/PromptBuilderChat.tsx`,
and `app/admin/prompt-builder/page.tsx` import it from there now.

---

## ⚠️ Dependency-order problem (Phase 3)

MIGRATION.md Phase 3 specifies moving one service per commit in **dependency
order: `auth → prompt → crm → chat`** — chat last, because it depends on the
other three. In practice **chat was extracted first**, while `auth`, `prompt`,
and `crm` are still scattered across `src/lib/` and `app/api/`. The extracted
`services/chat/server/` therefore reaches around the missing services and reads
their concerns directly:

- It calls `getAdminClient()` — now `services/auth/supabase-admin.ts` (the auth
  service is extracted), imported as `@/services/auth/supabase-admin`. The
  client factory now physically lives in `services/auth/`; a richer resolution
  cache on top of it is still future work.
- It reads the base `master_prompt` through `services/prompt/` now: the runtime
  compiler (`getSystemPrompt`) lives there, and `services/chat/server/prompt.ts`
  is a thin re-export of `services/prompt/compiler.ts`. The booking section
  (`sage_parameters`) and `tenant_model_config` reads are still direct in
  `services/chat/server/{booking,stream}.ts`.
- Session-finish writes to `chat_sessions` (token usage, calendar-offered,
  visitor_name) now go through `services/crm/session.ts` (`handleSessionFinish`),
  which the orchestrator imports from `@/services/crm/session`. The remaining
  direct reads/writes from the chat service are the booking section and
  `tenant_model_config` noted above.

`auth`, `prompt`, and `crm` are now extracted; the chat service's base prompt
and session-finish flows route through them. The remaining direct DB access
(booking `sage_parameters`, `tenant_model_config`) is documented above. Not a
bug today (behavior is correct and contracts are frozen).

---

## Not started — other Phase 3 services

| Service | Files that should move (per MIGRATION.md Phase 3) | Status |
|---------|--------------------------------------------------|--------|
| `auth` | `get-auth-context.ts`, `get-tenant-from-request.ts`, `resolve-tenant-from-host.ts`, `sync-user.ts`, the Supabase client factories (`supabase.ts`, `supabase-admin.ts`, `supabase-server.ts`) | ✅ Moved to `services/auth/` (pure file move; the resolution cache is still future work) |
| `prompt` | runtime compiler, `compile`, `compile/check`, manual `save` + legacy `check`, block CRUD, block/token helpers | ✅ Moved to `services/prompt/` (`compiler.ts`, `compile.ts`, `blocks.ts`, `save.ts`, `safety.ts`, `block-types.ts`, `block-order.ts`, `tokenize.ts`, `sage-prompt.ts`, `index.ts`); routes are thin. The block/token helpers + `DEFAULT_SYSTEM_PROMPT` moved out of `src/lib/` in V5 — nothing prompt-related remains there |
| `crm` | `deriveSessionStatus`, the chat `onFinish` session lifecycle, `app/api/sessions/**` internals, admin inbound-list triage | ✅ Moved to `services/crm/` (`status.ts`, `session.ts`, `sessions.ts`, `inbound.ts`, `index.ts`); the session routes and admin Inbound Chats list are thin |
| `payments` | (scaffolded empty) | Not started |

---

## Phase 3 infrastructure gaps

- ✅ **`@/services/*` tsconfig alias added.** `tsconfig.json` now defines an
  explicit `@/services/*` → `./services/*` entry ahead of the general `@/*` →
  `./*` + `./src/*` glob.
- ✅ **Import-boundary lint rule added (partial).** `eslint-plugin-boundaries`
  is installed and `.eslintrc.json` (extending `next/core-web-vitals`) defines
  `app` / `src` / `services` elements with a `boundaries/element-types` rule
  forbidding direct `app/` ↔ `src/` imports (services/ is the shared layer). It
  is set to **`warn`, not `error`** — the strangle is now complete (0 warnings;
  see "Strangle status" below). Flip to `error` in Step G (a separate review pass).
  (`react/no-unescaped-entities` and `@next/next/no-html-link-for-pages`
  are downgraded to `warn` too: the codebase was never linted and violates them
  pre-existingly; fixing that is out of scope here.)
- ✅ **`DEFAULT_SYSTEM_PROMPT` physically moved.** `sage-prompt.ts` now lives at
  `services/prompt/sage-prompt.ts` (V5); `services/prompt/compiler.ts` imports +
  re-exports it, `services/chat/server/prompt.ts` re-re-exports it, and
  `app/admin/prompt/page.tsx` imports it from the new path. Nothing imports it
  from `src/lib/` any more.

### Strangle status (complete — 14 → 0)

**V5 cleared 8 of 14** (`14 → 6`):
- `src/lib/{blockTypes,blockOrder,tokenize,sage-prompt}` → `services/prompt/`;
  `src/lib/stream.ts` (`readDataStream`) → `services/chat/server/stream-utils.ts`.
- `src/context/admin-user.tsx` → `services/auth/admin-user-context.tsx`.
- `src/components/PromptEditor.tsx` → `components/admin/PromptEditor.tsx`.

**Steps E/F + Nav cleared the remaining 6** (`6 → 0`):
- `Chat.tsx`, `Hero.tsx`, `sage/*` → `components/shells/widget/` (Step E).
- `useWidgetShell`, `useSageParameters` → `services/chat/ui/v1/`; `useReveal` → `services/shared/` (Step E).
- `SectionProcess.tsx`, `Nav.tsx` → `app/(jefflougheed)/components/` (Step E + Nav relocation).
- Membership shell → `components/shells/membership/`; `chatReducer` → `services/chat/ui/v1/` (Step F).
- `src/lib/store.ts` (`useSageStore`), `src/lib/sage.ts`, `src/hooks/useReveal.ts` deleted.
- `src/components/` empty and removed; `src/` holds only `calendly.d.ts`.

`boundaries/element-types` now reports **0** warnings. Rule stays at `warn` until Step G flips it to `error`.

---

## Pending Investigation

~~`src/components/` orphans (About, Problems, Process, WhyMe, Work, QuoteCarouselSection,
CareerHighlights) — listed here for ownership investigation.~~ `src/components/` no
longer exists (removed as part of strangle completion — Steps E/F/Nav). These files
are gone; investigation is moot.

---

## Next — Heirloom

Bringing **Heirloom** onto the platform, in three steps:

1. ✅ **Heirloom marketing page** — the product storefront / landing surface.
   (Done on `heirloom-migration` — see "Heirloom storefront" under Completed.)
2. ✅ **Heirloom chat** — Heirloom's conversational experience on the chat
   service (consumes `/api/sage` → `services/chat/server`; HTTP contracts stay
   frozen). (Done on `heirloom-migration`.)
3. ⏭️ **Memory-creation flow** — the core Heirloom flow for capturing and
   building memories / stories. **This is the next step.**

A near-term follow-up to step 2: `/api/sage` resolves the tenant from the host,
so until a Heirloom tenant + `master_prompt` is configured the Heirloom chat
falls back to Sage's `DEFAULT_SYSTEM_PROMPT` (it streams, but answers as Sage).

These proceed against the current chat service without finishing the full
service extraction — the deferred items below are not blockers. HTTP contracts
remain FROZEN: `/api/sage` and `/api/sage/parameters` paths and shapes do not
change; jefflougheed.ca must not break.

---

## Known deferred items

Tracked, intentionally not done yet, none blocking Heirloom's first iteration:

1. **Service extraction — `auth`, `prompt`, `crm`.** The chat server half was
   extracted first (out of MIGRATION.md's `auth → prompt → crm → chat` order),
   so it reaches around the missing services and reads their concerns directly.
   See "Dependency-order problem" and "Not started — other Phase 3 services"
   above.
2. **Tenant-hierarchy infinite-loop / cycle prevention.** `PATCH
   /api/platform/tenants/[id]` blocks a tenant being its own parent, but does
   NOT prevent deeper cycles (A→B→A). The list's tree walk drops cycles from the
   root set rather than infinite-looping, so today this is malformed state, not
   a crash — but a full ancestry/descendant check should land before tenant
   hierarchies get deep.

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
- /sage, /hugs, /mealflow, /writing all 404
  → Expected. Products not built yet. Resolved in Phase 5.
  (`/heirloom` now serves the Heirloom storefront — see Completed.)
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

Code-default fallbacks (the only hardcoded model IDs, in `stream.ts`):
- Chat model: claude-sonnet-4-6
- Fallback model: gpt-4o (provider seam present; OpenAI not yet wired — throws)

(The `claude-haiku-4-5` name extractor was removed in PR #46 — name capture is
now the `[NAME:]` marker, no separate model call.)

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
| System Docs/DB_CHANGELOG.md | Schema changes log |
| System Docs/2BL.md | Platform bible |
