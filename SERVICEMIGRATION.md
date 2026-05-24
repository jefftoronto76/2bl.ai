# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> CC reads this at the start of every session.

---

## Current State — May 24, 2026

Branch: `phase-3-chat-service-extraction` — fast-forward merged to main (main @ 6ee05eb).
Status: Stages 1-3 complete. Phase 3 **server** extraction complete and merged
to main. Two items deferred to a separate session:
- Client UI move (src/components/sage/*, src/lib/store.ts → services/chat/ui/v1/)
- sage-prompt.ts cleanup (physical move of DEFAULT_SYSTEM_PROMPT out of src/lib)

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

### Stage 4 — Phase 3 Chat Service Extraction (server)
- ✅ Server engine extracted to services/chat/server/ (stream, prompt,
  booking, session, index)
- ✅ Model-provider seam + resolveModelConfig — reads tenant_model_config,
  falls back to claude-sonnet-4-6 / claude-haiku-4-5 when no row
- ✅ OpenAI provider seam present but NOT wired (no dep/key) — clean
  injection point, no circuit breaker
- ✅ /api/sage reduced to a thin HTTP adapter over streamChat (476 → 19 lines)
- ✅ HTTP contract frozen; jefflougheed.ca production verified (chat, booking
  card, ?mode=question, name capture; no console errors, no 500s)
- ✅ tsc clean, next build passing; fast-forward merged to main (6ee05eb)

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

## Deferred to a separate session — Client UI move

Phase 3 **server** extraction is done and merged. The remaining client-side
move (into services/chat/ui/v1/) is intentionally deferred to its own session.
The following files still live in src/components/ and will move then:

| File | Reason blocked |
|------|----------------|
| src/components/Hero.tsx | Deeply coupled — imports from src/components/sage/*, src/lib/store, src/lib/sage. Drives streaming, booking cards, session API calls. |
| src/components/Nav.tsx | Imports useSageStore from src/lib/store |
| src/components/SectionProcess.tsx | Imports useSageStore from src/lib/store (expand question mode) |
| src/components/Chat.tsx | IS the platform chat service |
| src/components/sage/* | Platform-level chat primitives (BookingCard, SageReply, parseBookingCards, markdownComponents, useSageParameters) |

These files are intentionally left in src/components/ for now and must not be
moved or deleted until the dedicated client-UI-move session, per Jeff.

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

### Priority 1 — Merge to main ✅ DONE
- jefflougheed.ca verified on production (chat, booking card, ?mode=question,
  name capture — no console errors, no 500s)
- phase-3-chat-service-extraction fast-forward merged to main (6ee05eb)

### Priority 2 — Phase 3: Extract chat service (CRITICAL PATH)

**Server extraction — ✅ COMPLETE (merged to main).** The orchestration layer
now lives in services/chat/server/:
- stream.ts — Anthropic streaming engine, model-provider seam, resolveModelConfig
- prompt.ts — system-prompt assembly (master_prompt + DEFAULT_SYSTEM_PROMPT,
  question-mode context)
- booking.ts — server-side [BOOKING: …] injection from sage_parameters
- session.ts — onFinish lifecycle: token tracking, calendar-offer + name capture
- index.ts — public interface (streamChat) — what Heirloom imports

app/api/sage/route.ts stayed in place as a thin HTTP adapter (key guard,
tenant resolution, body parse) that delegates to streamChat. HTTP contracts
FROZEN — /api/sage and /api/sage/parameters paths and shapes unchanged.

**Client UI move — DEFERRED (separate session).** Still to move into
services/chat/ui/v1/ (browser-only kit):
- src/components/sage/* (BookingCard, SageReply, parseBookingCards,
  markdownComponents, useSageParameters)
- src/components/Chat.tsx
- src/lib/store.ts (useSageStore)
- streamSageResponse (src/lib/sage.ts) → ui/v1/stream.ts
- Update all importers: Hero.tsx, Nav.tsx, SectionProcess.tsx, admin components

NOTE: src/lib/stream.ts does NOT move — it is also used by the admin Composer.
services/chat/ui/v1/stream.ts will be a separate client module that imports
readDataStream from src/lib/stream.ts.

**sage-prompt.ts cleanup — DEFERRED (separate session).** DEFAULT_SYSTEM_PROMPT
is currently re-exported from services/chat/server/prompt.ts but still
physically defined in src/lib/sage-prompt.ts (the legacy admin prompt page
imports it). Consolidate + retire the re-export in the cleanup session.

### Priority 3 — Phase 4: Harden tenant security
RLS, JWT, audit logging — see MIGRATION.md Phase 4.

### Priority 4 — Heirloom migration
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

### Model configuration per tenant — ✅ IMPLEMENTED
tenant_model_config now exists and is wired. services/chat/server/stream.ts
resolveModelConfig reads model_id / model_id_fallback / provider / max_tokens /
rate_limit_requests_per_hour when a tenant row exists, and falls back to the
code defaults when none does:
- Chat model: claude-sonnet-4-6
- Name extractor: claude-haiku-4-5 (internal constant, not tenant-configurable)

Table is currently empty for all tenants → defaults in effect everywhere.

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
