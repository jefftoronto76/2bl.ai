# 2BL — Multi-Tenant AI Platform

2BL is a multi-tenant AI platform that runs multiple products from one
codebase. Each product has its own storefront; customers who sign up become
tenants. Products, tenants, and resellers are **data, not code** — adding one
is a database change plus config, not a rewrite.

The authoritative platform overview is [`2BL.md`](./2BL.md). This README is the
practical entry point: what's here, how it's wired, and where things live.

---

## Products

| Product | Purpose | Status |
|---------|---------|--------|
| Sage | AI inbound assistant for SMBs | Live |
| Heirloom | AI biography and story engine | In migration |
| HUGS | Family / aging-parent support | Planned |

`jefflougheed.ca` is a **customer tenant of Sage**, not part of the platform —
it's the reference Sage deployment.

---

## Tenant hierarchy

```
2BL (platform)
└── Product (Sage, Heirloom, HUGS)
    └── Tenant
        └── Sub-tenant
            └── … (unlimited depth)
```

Any tenant can be a parent, a child, or both. Access rights cascade down the
tree and can be customized at any node. Adding a relationship type is a data
change, not a code change.

---

## Architecture

Next.js is the **presentation and routing layer — not the platform**. Business
logic lives (or is migrating) into `services/` with zero Next.js imports;
`app/api/` route handlers are thin adapters that parse, call a service, and
format the response. This keeps Next.js replaceable and the services portable.

- **`services/`** — platform business logic. `services/chat/server/` (the chat
  orchestration engine) is extracted and live; `auth`, `prompt`, `crm`,
  `payments` are still being carved out (see `SERVICEMIGRATION.md`).
- **`app/`** — route groups split by brand/product, resolved at the edge by
  `middleware.ts` (host → route group). Today: `(jefflougheed)` (Sage tenant
  site), `secondbrainlabs` (2bl.ai storefront), `(platform)` (platform admin),
  `admin` (Sage tenant admin).
- **Supabase** — multi-tenant Postgres. Every row is tenant-scoped; Row Level
  Security is the primary enforcement boundary.

See `2BL.md` for the full architecture strategy and target directory structure.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind (public sites) · Mantine v7 (admin) |
| Database | Supabase (Postgres + Row Level Security + Realtime) |
| Auth | Clerk (role via `publicMetadata.role`) |
| AI | Anthropic (`claude-sonnet-4-6`) via Vercel AI SDK; per-tenant config in `tenant_model_config` |
| Payments | Stripe (planned) |
| Hosting | Vercel |

---

## Key routes

| URL / route | What it is |
|-------------|-----------|
| `2bl.ai` → `/secondbrainlabs` | Second Brain Labs platform storefront |
| `jefflougheed.ca` → `/` | jefflougheed.ca — reference Sage tenant site |
| `/platform/admin` | Platform admin — cross-tenant tenant management (gated `platform_admin`) |
| `/secondbrainlabs/sign-in` | Branded platform sign-in |
| `/admin` | Sage tenant admin (Prompt Studio, sessions, settings) |
| `/api/sage` | Public visitor chat endpoint (frozen wire format) |
| `/api/platform/tenants`, `/api/platform/tenants/[id]` | Tenant create / update / delete (platform_admin only) |

Domain → route-group resolution lives in `middleware.ts`; the `x-sbl` header is
the single signal the root layout uses to pick the brand palette.

---

## Platform admin

`/platform/admin` is the platform-operator surface, gated on Clerk
`publicMetadata.role === 'platform_admin'` in the `(platform)` layout, the page,
and every `/api/platform/*` route (defense in depth — the service-role writes
never run for a non-admin).

- Cross-tenant **tenant list** rendered as a parent/child tree.
- **Create** a tenant (name, type, parent, slug, domain).
- **Edit / delete** a tenant by clicking a row; delete is confirmed and refuses
  to remove a tenant that still has sub-tenants or dependent records.

---

## Sage — public AI chat

`src/components/Chat.tsx` (overlay) + `app/api/sage/route.ts` (thin adapter over
`services/chat/server`).

- `claude-sonnet-4-6` via the Vercel AI SDK data-stream format.
- System prompt resolved per tenant from `master_prompt`, with booking-card and
  question-mode context appended; falls back to `DEFAULT_SYSTEM_PROMPT`.
- Streaming with typing indicator, markdown rendering, retry on error.
- Mobile: `visualViewport`-driven overlay so the keyboard doesn't displace it.

---

## Database (Supabase)

All tables are multi-tenant; every access respects `tenant_id` and RLS. Core
tables include `tenants`, `tenant_users`, `tenant_branding`, `users`,
`chat_sessions`, `master_prompt` / `master_prompt_history`, `blocks`, `topics`,
`content`, `sage_parameters`, `tenant_model_config`, `do_not_engage`. The
authoritative schema lives in `CLAUDE.md`; schema changes are logged in
`DB_CHANGELOG.md` and executed by Jeff in Supabase Studio.

---

## Environment variables

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DEFAULT_ADMIN_TENANT_ID=   # optional — fallback tenant for multi-membership admins on unmatched hosts
```

---

## Development workflow

- **Branch per feature**, branched from the current working branch. No direct
  changes to `main` unless explicitly instructed.
- **Verification on Vercel preview URLs**, not local dev. Static checks (`tsc`,
  `next build`, tests) run in the sandbox.
- **Schema migrations are done by Jeff in Supabase Studio** — code is written
  against the already-migrated schema, never against ad-hoc `ALTER TABLE`s.
- TypeScript strict mode throughout; mobile-first and accessible by default.

---

## Key documents

| Document | Purpose |
|----------|---------|
| `2BL.md` | Platform bible — what 2BL is, how it's built, and why |
| `CLAUDE.md` | Operating rules — stack, principles, schema, API map, workflow |
| `MIGRATION.md` | Full 6-phase service-architecture migration plan |
| `SERVICEMIGRATION.md` | Critical path — what's done, what's next, what's deferred |
| `DB_CHANGELOG.md` | Schema + seed-data change log (Studio) |
