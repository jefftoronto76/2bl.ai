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
- **`app/`** — routes split by brand/product, resolved at the edge by
  `middleware.ts` (host → route group / segment). Today: `(jefflougheed)` (Sage
  tenant site), `secondbrainlabs` (2bl.ai storefront), `heirloom`
  (heirloom.2bl.ai storefront), `(platform)` (platform admin), `admin` (Sage
  tenant admin).
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
| `heirloom.2bl.ai` → `/heirloom` | Heirloom storefront — landing + slide-in AI chat |
| `jefflougheed.ca` → `/` | jefflougheed.ca — reference Sage tenant site |
| `/platform/admin` | Platform admin — cross-tenant tenant management (gated `platform_admin`) |
| `/secondbrainlabs/sign-in` | Branded platform sign-in |
| `/admin` | Sage tenant admin (Prompt Studio, sessions, settings) |
| `/api/sage` | Public visitor chat endpoint (frozen wire format) |
| `/api/platform/tenants`, `/api/platform/tenants/[id]` | Tenant create / update / delete (platform_admin only) |

Domain → route resolution lives in `middleware.ts`; the `x-sbl` and
`x-heirloom` headers are the signals the root layout uses to pick the brand
palette.

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

## Chat shells

Every AI chat surface is built on one of two shells. The shell shapes the page
topology; brand tokens, system prompt, and capability flags are data.

### Widget shell

An AI assistant embedded in a content or marketing page. The page exists
independently; the chat layers on top of it. Two surfaces share one
conversation:

- **`Hero.tsx`** — inline composer + canvas in the `#hero` section. Always
  mounted; no body scroll-lock. iOS keyboard pinning via `visualViewport` CSS
  vars (`--kb-surface-h` / `--kb-surface-y` + `.chat-surface--kb`).
- **`Chat.tsx`** — full-viewport overlay, opened from Nav / CTAs. Body
  scroll-locked while open. Keyboard handling is pure CSS (`100dvh` +
  safe-area insets).

Both surfaces share state via `ChatSessionProvider instanceKey="sage"`.

**Reference deployment:** `jefflougheed.ca` — the Sage AI assistant.

### Membership shell

The chat IS the product. A slide-in modal panel (fixed, `max-w-2xl`, right
edge) with sidebar, session history, and account features. One surface drives
the conversation.

- **`ChatHero.tsx`** — panel body with `Sidebar`, `ChatHeader`, `MessageList`,
  `ChatInput`. Store via `useReducer` / `ChatProvider` (isolated, no shared
  instance). iOS keyboard pinning via body scroll-lock + surface height
  shrink to visual viewport height.

**Reference deployment:** `heirloom.2bl.ai` — the Heirloom biography engine.

### Adding a new product

1. Choose widget (AI feature on a page) or membership (AI is the product).
2. Create `app/<product>/` with `page.tsx` + `layout.tsx`. Import a new
   `app/<product>/globals.css` with `:root` token overrides from that layout only.
3. Add the product host to `middleware.ts` and rewrite it to `/product` path.
4. Add the domain to `tenants.domain` in Supabase Studio. The chat falls back to
   `DEFAULT_SYSTEM_PROMPT` until a `master_prompt` row exists for the tenant.

See `docs/chat-shells.md` for the full decision guide, keyboard hook wiring,
and new-product step-by-step.

---

## Contact Capture

Heirloom captures visitor contact information (name, phone, email)
through two sequential paths with short-circuit logic.

**Why two paths?**
No single method is reliable in all situations. The marker approach
depends on the conversational model following prompt instructions.
The regex approach depends on the visitor typing recognizable patterns.
Together they cover each other's gaps.

**How it works:**

1. Marker detection runs first — Sage is instructed via the prompt to
   emit hidden markers ([NAME:], [PHONE:], [EMAIL:]) when a visitor
   shares contact info. The server reads these after each turn and
   writes to the database.

2. Regex watcher runs second — if the marker path found nothing, a
   pattern matcher scans the visitor's own message for phone numbers
   and emails.

**Design principles:**
- Sequential not parallel — prevents format conflicts between paths
- Short-circuit — if the marker path writes successfully, the regex
  watcher is skipped for that field
- Self-guarded writes — once a field is captured, neither path
  overwrites it
- First capture locks the value — malformed marker values are caught
  by validation before they can block the fallback

---

## Heirloom — storefront + AI chat

`app/heirloom/` (Tailwind, `[data-brand="heirloom"]` palette). `page.tsx` is the
product app root: a landing page with a slide-in chat panel layered over it
(Escape / backdrop-click to close).

- Self-contained chat store + stream reader under `app/heirloom/` — streams from
  `/api/sage` via a Heirloom-local reader, decoupled from the Sage client
  (`src/lib/sage.ts` / `stream.ts` are not imported).
- Collapsible sidebar, header, message list, input ported from the legacy repo.
- Tenant note: until a Heirloom tenant + prompt is configured, `/api/sage` falls
  back to Sage's `DEFAULT_SYSTEM_PROMPT`.

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
