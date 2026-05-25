# 2BL Platform Architecture — Honest Overview
*May 24, 2026*

---

## Where We Are

The codebase is mid-migration. It started as a single-product 
implementation (Sage for jefflougheed.ca) and is moving toward a 
multi-product platform. The foundation is correct but the execution 
is incomplete and inconsistent.

### What Works Today

- **jefflougheed.ca** — live, chat working, admin working, fully 
  functional as a Sage tenant
- **services/chat/server/** — extracted, route is a thin adapter, 
  streaming works for any tenant
- **Platform admin** — tenant list, create, edit/delete at 
  2bl.ai/platform/admin
- **Multi-tenant auth** — getAuthContext resolves by host, a user 
  can belong to multiple tenants
- **Tenant hierarchy** — parent_id tree in Supabase, unlimited depth
- **Sign-in flow** — 2bl.ai/sign-in routes platform admins to the 
  platform admin

### Phase A — Complete (May 25, 2026)

Phase A — COMPLETE as of May 25, 2026 (PRs #30-36)
- globals.css split by product ✅ PR #30
- Favicon fixed ✅ PR #30
- services/auth/ extracted ✅ PR #31
- services/prompt/ extracted ✅ PR #32
- services/crm/ extracted ✅ PR #33
- Strangle finish (src/lib helpers, PromptEditor, admin-user context) ✅ PR #34
- Multi-tenant admin live on all three domains ✅ PR #35
- Block creation tenant-scoped, body-only required ✅ PR #36
- @/services/* tsconfig alias added ✅
- Import boundary lint enforced (warn) ✅

Still deferred or pending:
- services/chat/ui/v1/ — DEFERRED INTENTIONALLY
  (src/components/sage/*, Chat.tsx, Hero.tsx, store.ts, sage.ts)
- services/payments/ — NOT STARTED
- History page tenant filter — identified, fix pending
- Heirloom master_prompt — blocks started, not compiled/published
- Three-tier prompt inheritance — design pending

---

## Where We Need to Go

One platform. Multiple products. Services owned by 2BL, consumed by 
products and tenants.

### Target Structure

```
services/
  auth/
    index.ts          ← public interface
    tenant.ts         ← tenant resolution, host→tenant, hierarchy
    context.ts        ← getAuthContext, platform admin check
    user.ts           ← user sync, Clerk integration
    supabase.ts       ← DB client factories (authed + service role)
    
  prompt/
    index.ts          ← public interface
    compiler.ts       ← block compilation, compile order
    blocks.ts         ← block CRUD, types, tokenizer
    safety.ts         ← safety check
    history.ts        ← version history
    
  crm/
    index.ts          ← public interface
    sessions.ts       ← session storage, state machine
    inbound.ts        ← inbound triage, status derivation
    
  chat/
    server/           ← DONE
      index.ts        ← streamChat() — orchestrates auth+prompt+crm
      stream.ts
      prompt.ts
      booking.ts
      session.ts
      types.ts
    ui/
      v1/             ← deferred — client UI kit
      
  payments/
    index.ts          ← scaffold only

app/
  (platform)/         ← 2BL God admin
  (sage)/             ← Sage product (future)
  heirloom/           ← Heirloom product
  (hugs)/             ← HUGS product (future)
  (jefflougheed)/     ← jefflougheed.ca marketing site (permanent)
  secondbrainlabs/    ← 2bl.ai storefront
  admin/              ← tenant admin (multi-tenant via host resolution)
  api/                ← thin HTTP adapters only, no business logic
```

### Security Model

- RLS is primary enforcement — cross-tenant access impossible at DB
- Application-layer scoping is secondary defense only
- Clerk JWT claims power RLS policies
- Service role key has exactly ONE justified use: anonymous public 
  chat write path, isolated in services/auth
- Audit log on all data access and mutations
- HIPAA/SOC2 ready by design
- Security hardening informs service design — not retrofitted after

### Performance

- Tenant resolution cached — no per-request DB round-trip
- Batched onFinish writes in chat service
- No N+1 query patterns
- All services have clean interfaces — no internal cross-imports

### Simplicity

- Each service has one responsibility
- Changing one service does not break another
- New products consume services, they don't reimplement them
- New tenants are data, not deployments

---

## Plan to Get There

CC executes. Jeff approves after each step. One service, one PR, verified before the next starts.

### Phase A — Fix the dependency order ✅ COMPLETE (May 25, 2026)

Shipped as PRs #30–36. Auth, prompt, and crm are extracted into
services/; the @/services/* alias and the import-boundary lint rule are
in place; the admin is multi-tenant. The strangle is finished except for
the intentionally-deferred chat UI. Original plan below, for reference.

Chat was extracted first but depends on auth/prompt/crm. Fix in 
dependency order. Strangle, don't cutover — create the new service, 
copy logic, point callers at it, verify, then delete the originals.

**Step 1: Add @/services/* alias + import boundary lint rule**
Do this FIRST, before moving any files. Write the lint rules to 
enforce the target state. Then move files until the linter passes. 
Refactoring against a failing build is safer than moving files and 
hoping to enforce it later.

**Step 2: services/auth/**
Extract getAuthContext, getTenantFromRequest, resolveFromHost, 
syncUser, and the Supabase client factories. This is the foundation 
everything else depends on. Update all callers. One PR. Verify 
jefflougheed.ca and admin work before merging.

**Step 3: services/prompt/**
Extract in slices — compiler first, then CRUD/history/admin routes.
The admin UI (components/admin/) becomes a consumer of this service,
not an owner of the logic. Most complex extraction — take it slow.
One PR per slice.

**Step 4: services/crm/**
Extract session management, state machine, inbound triage.
Smaller and cleaner than prompt. One PR.

**Step 5: services/payments/ scaffold**
Empty scaffold with types. No Stripe yet.

**Step 6: End to end verification**
jefflougheed.ca regression, admin regression, platform admin, 
Vercel preview checks. Nothing merges until this passes.

### Phase B — Heirloom migration — IN PROGRESS

Phase A is complete, so Heirloom is now underway.

- Landing page ✅
- Chat wired ✅
- Multi-tenant admin ✅
- Blocks: in progress
- master_prompt: pending compile/publish
- Memory creation: pending
- Clerk account creation in chat: pending

### Phase C — Platform prompt studio

Three-tier prompt inheritance requires a defined resolution strategy 
before building. Open question: what happens when a tenant wants to 
REMOVE a platform default block, not just override it? This must be 
answered before Phase C starts.

Inheritance order: platform defaults → product defaults → 
tenant overrides → master prompt

### Phase D — Security hardening

This informs Phase A service design — not a separate phase.
RLS policies, Clerk JWT → Supabase, materialized ancestry,
audit log, per-tenant rate limiting.

### Phase E — Tenant provisioning

Keep the form. Defer chat-driven provisioning until platform is 
stable. Chat-driven provisioning is a distraction at this stage — 
forms are deterministic and predictable for admin tasks.

---


### Product design isolation

Every product owns its own design. No exceptions.

- Every product has its own `globals.css` scoped to that product
- Every product has its own design tokens, fonts, and brand config
- No product's design bleeds into another product
- The root `app/globals.css` contains base resets only — nothing 
  brand-specific
- Shared services are headless — they have no design opinions

```
app/
  globals.css              ← base resets only
  (jefflougheed)/
    globals.css            ← Jeff's personal brand tokens
  heirloom/
    globals.css            ← Heirloom espresso/gold tokens
  secondbrainlabs/
    globals.css            ← 2BL platform tokens
  (sage)/
    globals.css            ← Sage product tokens (when built)
```

**Current violation:** inkwell (jefflougheed), SBL, and Heirloom 
tokens all live in the root `app/globals.css`. This must be fixed 
as part of properly scaffolding each product — it is part of the 
Definition of Done for each product, not a cleanup task.

**Known violations to fix:**
- Move inkwell tokens → `app/(jefflougheed)/globals.css`
- Move SBL tokens → `app/secondbrainlabs/globals.css`
- Move Heirloom tokens → `app/heirloom/globals.css`
- Root `app/globals.css` becomes base resets only

## Known Deferred Items

- Infinite loop prevention in tenant hierarchy (circular parent_id)
- OpenAI fallback circuit breaker (seam exists, not wired)
- Client UI move to services/chat/ui/v1/
- HUGS (requires BAA before any PHI work)
- Per-tenant AI API keys
- Payments (Stripe Connect)
- Chat-driven tenant provisioning
- Three-tier prompt inheritance resolution strategy

---

## References

Every major decision can be verified against these sources:

### Architecture
- **Modular monolith over microservices** — Martin Fowler, "Monolith First"
  https://martinfowler.com/bliki/MonolithFirst.html
- **Strangle pattern** — Martin Fowler, "Strangler Fig Application"
  https://martinfowler.com/bliki/StranglerFigApplication.html
- **Service extraction order** — Clean Architecture, Robert C. Martin
- **Enforce boundaries before extracting** — reviewer feedback, May 24 2026
- **RLS as primary enforcement** — Supabase RLS docs
  https://supabase.com/docs/guides/database/postgres/row-level-security
- **Clerk JWT → Supabase RLS**
  https://supabase.com/docs/guides/auth/third-party/clerk
- **Adjacency list + materialized path** — standard Postgres hierarchical 
  data pattern; GIN index makes containment O(1)

### Codebase evidence
- **services/chat/server/ extracted** — PR #22, commit 6ee05eb
- **getAuthContext single-tenant problem** — PR #23, commit b674af7
- **Chat extracted before dependencies** — CC audit report May 24 2026
- **Import boundary + alias missing** — same audit

### Design
- **Heirloom host: heirloom.2bl.ai** — 2BL.md, confirmed May 24 2026
- **Heirloom palette + Cormorant Garamond** — LJ_Legacy26 tailwind.config.js
- **Token scoping via [data-brand]** — app/globals.css, SBL pattern

### Security
- **HIPAA technical safeguards** — 45 CFR §164.312
- **SOC2 Trust Service Criteria** — AICPA TSC 2017
- **Least privilege** — NIST SP 800-53 AC-6

---

## The Honest Assessment

The architecture decisions are right. The tenant model, the RLS 
design, the modular monolith approach, the service boundaries — 
correct and defensible.

The execution has been inconsistent. Services were extracted in the 
wrong order. Documentation drifted. The fix is Phase A — done 
carefully, one service at a time, with verification before proceeding.

Phase A is the real project. Everything else builds on it.
