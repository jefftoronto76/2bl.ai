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
| Heirloom | AI biography and story engine | In migration |
| HUGS | Family and aging parent support | Planned |

Products are not hardcoded. Adding a new product means adding a tenant
row, a product config, and a storefront. No code changes required.

---

## Tenant Hierarchy

```
2BL (platform)
└── Product
    └── Tenant
        └── Sub-tenant
            └── X
                └── Y
                    └── Z (unlimited depth)
```

The hierarchy is not fixed. Any tenant can be a parent, a child, or
both. Depth is unlimited and varies by product and use case. User
management scales up or down based on the number of sub-tenants —
adding a new relationship type is a data change, not a code change.

Access rights cascade down the tree and can be customized at any node.

jefflougheed.ca is a customer tenant of Sage. It is not part of the
platform.

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

Security is priority #1. See MIGRATION.md Part B Section B.3 for the
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
- All DB queries via PgBouncer pooled connection (port 6543)
- Per-tenant rate limiting on AI calls
- Batched writes in chat service onFinish

---

## Key Documents

| Document | Purpose |
|----------|---------|
| CLAUDE.md | Rules for CC — stack, principles, workflow |
| MIGRATION.md | Full migration plan, phases 1-6 |
| SERVICEMIGRATION.md | Critical path — current state, what's moving, what's blocked |
| DB_CHANGELOG.md | Schema changes log |
| 2BL.md | This document — platform bible |
