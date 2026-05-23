# SERVICEMIGRATION.md — Critical Path

> Living document. Updated after every stage.
> CC reads this at the start of every session.

---

## Current State — End of Day May 23, 2026

Branch: `claude/beautiful-einstein-U9X7p` (14+ commits ahead of main)
Status: Stages 1-3 complete. Pending merge to main.

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

## Blocked — Cannot move until Phase 3 (chat service extraction)

The following files are coupled to the Sage chat engine and must stay
in src/components/ until the chat service is extracted into services/chat:

| File | Reason blocked |
|------|----------------|
| src/components/Hero.tsx | Deeply coupled — imports from src/components/sage/*, src/lib/store, src/lib/sage. Drives streaming, booking cards, session API calls. |
| src/components/Nav.tsx | Imports useSageStore from src/lib/store |
| src/components/SectionProcess.tsx | Imports useSageStore from src/lib/store (expand question mode) |
| src/components/Chat.tsx | IS the platform chat service |
| src/components/sage/* | Platform-level chat primitives (BookingCard, SageReply, parseBookingCards, markdownComponents, useSageParameters) |

These files are intentionally left in src/components/ and must not be
moved or deleted without explicit instruction from Jeff.

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

### Priority 1 — Merge current branch to main
- Verify jefflougheed.ca on Vercel preview (confirmed working)
- Verify 2BL storefront on Vercel preview
- Create PR, merge to main

### Priority 2 — Phase 3: Extract chat service (CRITICAL PATH)
This is the most important remaining work. The chat engine must be
extracted into services/chat before Heirloom can consume it.

The chat service is the orchestration layer — it handles:
- Streaming AI responses
- CRUD operations via conversation
- Analysis and intent detection
- Booking and calendar orchestration
- Session lifecycle management
- Routing to other services (prompt, crm, auth, payments)

Files that move into services/chat:
- app/api/sage/route.ts (core streaming + orchestration logic)
- src/lib/stream.ts
- src/lib/sage.ts
- src/lib/sage-prompt.ts
- src/components/sage/* (BookingCard, SageReply, parseBookingCards, 
  markdownComponents, useSageParameters)
- src/lib/store.ts (useChatStore — platform level)

Files that stay as jefflougheed.ca consumers of the chat service:
- src/components/Hero.tsx
- src/components/Nav.tsx
- src/components/SectionProcess.tsx
- src/components/Chat.tsx (thin adapter)

HTTP contracts are FROZEN — /api/sage and /api/sage/parameters paths
and shapes do not change. jefflougheed.ca must not break.

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

### Model configuration per tenant
Currently hardcoded in services/chat:
- Chat model: claude-sonnet-4-6
- Name extractor: claude-haiku-4-5

When tenant_model_config table exists (Phase 5), the chat service 
reads model config from there with these values as fallback defaults.

Studio task (Jeff): create tenant_model_config table per 2BL.md spec 
before Phase 5 code begins.

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
