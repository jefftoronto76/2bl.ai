# 2BL.md — Platform Bible

> This is the authoritative document for what 2BL is, how it is built,
> and why. Every architectural decision starts here.

---

## What is 2BL

2BL is a multi-tenant AI platform. It runs multiple products — Sage,
Heirloom, HUGS, and whatever comes next. Each product has its own
storefront where customers sign up and pay. Those customers become
tenants. Products, tenants, and resellers are data, not code.

---

## Products

| Product | Purpose | Status |
|---------|---------|--------|
| Sage | AI inbound assistant for SMBs | Live |
| Heirloom | AI biography and story engine | In migration — storefront, AI chat, and memory/story creation live (confirmed 2026-08-14, `services/crm/memories.ts` + `services/crm/stories.ts`); collaboration features (invites, sharing) still landing |
| HUGS | Family and aging parent support | Planned |

Products are not hardcoded. Adding a new product means adding a tenant
row, a product config, and a storefront. No code changes required.

---

## Tenant Hierarchy

```
2BL (platform)
└── Product (Sage, Heirloom, HUGS)
    └── Tenant
        └── Sub-tenant
            └── … (unlimited depth)
```

The confirmed canonical shape is **2BL → Product → Tenant → Sub-tenant**, and
sub-tenants nest to **unlimited depth**. The hierarchy is not fixed beyond that:
any tenant can be a parent, a child, or both. User management scales up or down
based on the number of sub-tenants — adding a new relationship type is a data
change, not a code change.

Access rights cascade down the tree and can be customized at any node.

jefflougheed.ca is a customer tenant of Sage. It is not part of the
platform.

---

## Capability Model

A tenant is a **composition of capabilities**, not a fixed product template.
Each capability is enabled or disabled per tenant independently — turning one on
is a data/config change, not a code change.

| Capability | What it gives the tenant |
|------------|--------------------------|
| Prompt Studio | Author and compile the tenant's AI system prompt from blocks (see Three-Tier Prompt Studio below). |
| Auth | Tenant-scoped users, roles, and sign-in (Clerk + `tenant_users`). |
| Database | Tenant-scoped data storage under RLS — sessions, content, branding, parameters, etc. |
| Chat | The conversational chat surface, powered by the chat service. |

Capabilities cascade with the tenant tree: a parent provisions which
capabilities its sub-tenants receive, and access inherits down the tree.

### Three-Tier Prompt Studio — target design, not yet built

When the Prompt Studio capability is enabled, a tenant's system prompt is
meant to compile from three inherited tiers, merged top-down:

1. **Platform (2BL)** — base defaults shared by every product and tenant.
2. **Product (Sage / Heirloom / HUGS)** — product-specific defaults layered on
   the platform base.
3. **Tenant** — per-tenant overrides and additions.

Lower tiers inherit the tier above and may override it; the compile merges
**platform → product → tenant** so the most specific tier wins.

**Confirmed against code 2026-08-14: this is still the target, not the
current behavior.** The shipped `services/prompt/compile.ts` pipeline reads
`blocks.scope IN ('runtime', 'platform')` — two tiers (platform-owned
defaults, tenant runtime), not three. There is no product-level scope value
in the schema; `'composer'` is a separate special category (the admin
Composer tool's own prompt), not a rung in this inheritance chain. See
`System Docs/ARCHITECTURE_OVERVIEW.md`'s Phase C section, which tracks this
same gap as still-open design work.

---

## Architecture Strategy — Future Forward

### Core principle

Next.js is the presentation and routing layer. It is not the platform.

All business logic lives in services/ with zero Next.js imports. Route
handlers in app/api/ are thin adapters — they parse requests, call
services, and format responses. Nothing more.

This means Next.js is replaceable. If the platform outgrows it, the
services layer moves without rewriting business logic. The adapter
layer is the only thing that changes.

### What this means in practice

- A new product is a storefront + tenant config + service consumption
- A new reseller is a database row, not a code change
- Switching a service implementation touches one service, nothing else
- Scaling beyond Next.js means extracting services/ into standalone
  Node services — the interface stays the same, the transport changes

---

## Target Directory Structure

```
services/
  chat/        ← THE core service. Orchestrates all other services.
               Streaming, CRUD, analysis, booking, session lifecycle.
               Everything flows through chat.
  prompt/      ← called by chat
  crm/         ← called by chat
  auth/        ← called by chat
  payments/    ← called by chat

tenants/
  sage/        ← Sage product config, defaults, design tokens
  heirloom/    ← Heirloom product config
  hugs/        ← HUGS product config

app/
  (platform)/      ← 2BL platform admin
  (sage)/          ← Sage product routes
  (heirloom)/      ← Heirloom product routes
  (hugs)/          ← HUGS product routes
  (jefflougheed)/  ← jefflougheed.ca — customer tenant of Sage
  secondbrainlabs/ ← 2BL marketing storefront
  api/             ← thin HTTP adapters, call services only
```

---

## Service Boundaries

### Chat — The Orchestration Layer

Chat is the central service. It is the interface between the user and
everything else in the platform. All user interactions flow through
chat — it orchestrates prompt, crm, auth, and payments on behalf of
the user.

Responsibilities:
- Streaming AI responses
- CRUD operations via conversation
- Analysis and intent detection
- Booking and calendar orchestration
- Session lifecycle management
- Routing between services

### Supporting Services

| Service | Responsibility | Called by |
|---------|---------------|-----------|
| auth | Tenant resolution, RBAC, rate limiting, user sync | Chat + all services |
| prompt | Compile blocks, safety check, version history | Chat |
| crm | Persist sessions, state machine, inbound triage | Chat |
| payments | Stripe checkout, webhooks, entitlements | Chat |

No circular dependencies. No shared mutable state between services.
Cross-service calls go through published interfaces only.

---

## Security Model

Security is priority #1. See Backlog/MIGRATION.md Part B Section B.3 for the
full security model.

Headlines:
- RLS is primary enforcement — cross-tenant access is architecturally
  impossible at the DB layer
- Application-layer scoping is secondary defense only
- Clerk JWT claims power RLS policies
- Cascading access follows the tenant tree — a node can only see its
  own data and the data of its descendants
- Audit log on all data access and mutations
- Designed for HIPAA and SOC2 readiness from the start
- HUGS PHI work blocked until BAA is in place

---

## Technology Choices

| Layer | Technology | Why | When to revisit |
|-------|-----------|-----|-----------------|
| Framework | Next.js 15 + Vercel | Edge middleware, SSR, auto-scale, preview URLs | When API routes become a bottleneck at scale |
| Database | Supabase (Postgres + RLS + Realtime) | RLS as first-class feature, managed ops | When plan limits or feature gaps become real |
| Auth | Clerk | MFA, magic links, org management, JWT templates | When pricing or features no longer fit |
| AI | Anthropic (claude-sonnet-4-6) | Best-in-class reasoning, streaming | Abstracted — swap via tenant_model_config |
| Payments | Stripe | Industry standard, Connect for marketplace | No near-term reason to change |

---

## Performance Targets

- LCP < 2s mobile on all storefronts
- Streaming chat: first token < 1s
- Non-AI API routes < 500ms
- Tenant resolution: cached, no per-request DB round-trip
- No N+1 query patterns
- DB access via the Supabase JS/SSR clients over the PostgREST HTTPS endpoint
  (`NEXT_PUBLIC_SUPABASE_URL`) — no direct Postgres connection, no `DATABASE_URL`,
  no PgBouncer / port 6543 in the codebase (revisit only if a direct pg layer is introduced)
- Per-tenant rate limiting on AI calls
- Batched writes in chat service onFinish — TARGET, not yet implemented (Amendment-3 deferred)

---

## Key Documents

| Document | Purpose |
|----------|---------|
| CLAUDE.md | Rules for CC — principles, stack, workflow (2026-08-04: reference material split to System Docs/, see its "Where the rest of this lives" table) |
| System Docs/Database Schema.md | DB tables/columns |
| System Docs/API Routes.md | API route map |
| System Docs/Known Gaps.md | Known issues, orphaned code, deferred work |
| System Docs/Utilities/ | Service internals, one file per service |
| Backlog/MIGRATION.md | Full migration plan, phases 1-6 |
| Backlog/SERVICEMIGRATION.md | Critical path — current state, what's moving, what's blocked |
| System Docs/DB_CHANGELOG.md | Schema changes log |
| 2BL.md | This document — platform bible |
