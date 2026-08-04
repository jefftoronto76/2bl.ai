# MIGRATION.md — 2BL Service-Based Architecture Migration Plan

> **Status:** Proposed plan. **No code has been written.** Nothing in this
> document is executed until Jeff approves the plan. Each phase is then
> executed one at a time, with a pause for approval after every phase.
>
> **Scope:** Migrate the repo from a single-product implementation (Sage chat
> for `jefflougheed.ca`) to a multi-product, multi-tenant platform — **2BL** —
> running the products **Sage**, **Heirloom**, and **HUGS**, each with a
> cascading tenant hierarchy and reseller-branded storefronts.
>
> **Non-negotiables for this plan, in priority order:** Security → Performance
> → Simplicity → Scalability.
>
> **Hard constraint:** `jefflougheed.ca` is live production. It must not break
> at any point. `app/(jefflougheed)/` is **not touched** in any phase, and it
> is regression-tested explicitly in **every** phase.

---

## How to read this document

1. **Part A — Current-state audit.** What is actually in the repo today: what
   has migrated, what is half-done, what has not started, what is dead, and
   every security/performance gap found. This is the factual baseline. (This
   is the deliverable of Phase 1; it is presented up front because every later
   phase depends on it.)
2. **Part B — Target architecture.** The directory shape, service boundaries,
   the security model (the canonical written security doc), and the
   cross-cutting design decisions (tenant resolution & caching, model config,
   branding config).
3. **Part C — The phased plan.** Phases 1–6, each with: what changes, why this
   design, alternatives rejected, performance implications, security
   implications, risks, risk mitigation, regression test (jefflougheed.ca
   explicit), fallback plan, and required schema migrations (flagged for Jeff).
4. **Part D — Appendices.** Dead-code inventory, hardcoded-value inventory, RLS
   policy matrix, index recommendations, PHI field inventory, env/secret
   scoping recommendations.

A note on Mantine: any phase that touches admin (Mantine v7) UI must read
`https://mantine.dev/llms.txt` first, per CLAUDE.md. This plan does not write
Mantine code; it only relocates and re-themes existing components.

---

# PART A — CURRENT-STATE AUDIT

The repo is genuinely mid-migration. The audit below separates **done**,
**half-done**, and **not started**, then catalogs **dead code**, **hardcoded
values**, and **gaps** (security, performance, observability).

## A.1 What has already migrated (done)

| Area | Evidence | State |
|------|----------|-------|
| SBL storefront page | `app/secondbrainlabs/page.tsx` (static, Tailwind, self-contained) | Built |
| SBL layout + scoped tokens/fonts | `app/secondbrainlabs/layout.tsx` wraps in `<div data-brand="sbl">`, loads Newsreader + Manrope via `next/font/google` | Built |
| SBL design tokens | `app/globals.css` `[data-brand="sbl"]` block (≈ lines 615–641); Tailwind utilities in `tailwind.config.js` | Built, isolated from inkwell |
| Domain routing | `middleware.ts` rewrites `2bl.ai` / `www.2bl.ai` → `/secondbrainlabs`, tags `x-sbl: 1` | Built |
| Palette gating | `app/layout.tsx` reads `x-sbl` header, drops `data-palette="inkwell"` for SBL | Built |
| SBL tenant seeded | `System Docs/DB_CHANGELOG.md` 2026-05-20: tenant `slug=second-brain-labs`, `type=platform`, `domain=2bl.ai` | Seeded in Supabase (Studio) |
| Multi-engine prompt column | `System Docs/DB_CHANGELOG.md` 2026-05-20: `master_prompt.key` + unique `(tenant_id, key)` | Column added in DB |

## A.2 What is half-done (the dangerous middle)

These are the items most likely to cause problems if left mid-state. Each is a
"started but not load-bearing yet" condition.

1. **SBL storefront links point at routes that do not exist.**
   `app/secondbrainlabs/page.tsx` links to `/sage`, `/heirloom`, `/hugs`,
   `/mealflow`, `/chat`, `/sign-in`, `/writing` (PROJECTS array lines 28–33;
   footer lines 583–598; Nav lines 77–78; SageWidget `/chat?q=` lines 143).
   **None of these routes exist** → they 404 today. Also note `MealFlow`
   appears as a fourth product in the storefront but is **out of the stated
   3-product scope** (Sage/Heirloom/HUGS) — needs a product decision.
2. **`master_prompt.key` exists but nothing reads it.** `app/api/sage/route.ts`
   `getSystemPrompt()` selects the highest `version` and ignores `key`
   entirely. The multi-engine-per-tenant capability is provisioned in the
   schema but not wired in code.
3. **Tenant hierarchy is modeled but not traversed.** `tenants.parent_id`
   exists (CLAUDE.md schema) and the SBL tenant is `type=platform`, but
   `get-auth-context.ts` maps a Clerk user to **exactly one** `tenant_users`
   row via `.single()` (lines 32–40) — there is no concept of product admin,
   reseller, member, or ancestry. The cascading access model does not exist in
   code.
4. **README is stale.** `README.md` still describes a single product ("Natural
   Resource — jefflougheed.ca") and says "push directly to main," contradicting
   CLAUDE.md. CLAUDE.md is the authoritative current-state doc; README is not.
5. **`.env.example` is stale/wrong.** It contains `VITE_ANTHROPIC_API_KEY`
   (Vite-prefixed) in a Next.js app — a leftover from the pre-migration repo.

## A.3 What has not started

> **Snapshot from migration kickoff — partially superseded.** Several items
> below have since started (e.g. `services/chat/server`, the `(platform)`
> admin, `tenant_model_config`, and the Heirloom storefront). See
> `SERVICEMIGRATION.md` for the authoritative current state.

- `services/` — does not exist. Chat/prompt/CRM/auth logic lives inline in
  `app/api/**` and `src/lib/**`.
- `tenants/` product config (`sage/`, `heirloom/`, `hugs/`) — does not exist.
- `app/(sage)/`, `app/(heirloom)/`, `app/(hugs)/`, `app/(platform)/` route
  groups — do not exist. Admin lives at `app/admin/**` and is implicitly
  single-tenant (Sage).
- `payments/` — **no Stripe code anywhere.** No dependency, no routes.
- RBAC beyond a single `tenant_users.role` — not present.
- **RLS policies — none in repo, and bypassed in practice** (see A.5).
- Per-tenant **branding config** — brand tokens are hardcoded in CSS.
- Per-tenant / per-product **model config** — model IDs hardcoded (A.4).
- **OpenAI fallback** — CLAUDE.md claims it; **not wired** (no `openai` /
  `@ai-sdk/openai` dependency or import).
- **Audit logging** — none.
- HUGS — nothing exists. (Heirloom has since started — storefront + chat live
  under `app/heirloom/` on `heirloom-migration`; see `SERVICEMIGRATION.md`.)

## A.4 Dead code & duplicates (delete in Phase 2)

**Confirmed dead / orphaned (no live import path):**

- `src/lib/ai.ts` — exports `SYSTEM_PROMPT` + `sendMessage`, uses the old model
  `claude-sonnet-4-20250514` and browser-direct Anthropic
  (`anthropic-dangerous-direct-browser-access`). **No importers.** Hard-codes
  the "Natural Resource" prompt. Delete.
- `components/admin/PromptBuilderChat.tsx` — never rendered. Delete.
- `app/api/admin/prompt-chat/route.ts` — only caller is the orphaned
  `PromptBuilderChat.tsx`. Delete.
- `app/boardseat/page.jsx` — standalone, unlinked. Delete (or archive).
- `src/components/About.tsx`, `Problems.tsx`, `Process.tsx`, `WhyMe.tsx`,
  `Work.tsx` — **not imported** by the live jefflougheed page (which renders
  `Nav, Hero, Problem, SectionOutcomes, SectionWhy, SectionCareer,
  SectionTestimonials, SectionProcess, Chat, Footer`). ⚠ **Verify each against
  `app/(jefflougheed)/page.tsx` import list immediately before deletion** —
  `Work.tsx`/`Session.tsx` are referenced in CLAUDE.md as carrying the
  discovery-call link, so confirm live-wiring before removing. Anything in the
  `(jefflougheed)` tree that *is* imported stays untouched.
- Empty root files `natural-resource@2.0.0` and `tsc` (0 bytes). Delete.

**Duplicate implementations (consolidate in Phase 2):**

- **Legacy prompt page vs Prompt Studio.** `app/admin/prompt/page.tsx` (renders
  `src/components/PromptEditor.tsx`, calls `/api/admin/prompt/check`) is
  superseded by `app/admin/prompt-studio/prompt/page.tsx` (renders
  `PromptPreview`, calls `/api/admin/prompt/compile/check`). The admin nav
  **still links both**: `AdminSidebarNav.tsx` `NAV_ITEMS` "Prompt" →
  `/admin/prompt` (line 8) **and** `PROMPT_STUDIO_ITEMS` "Prompt" →
  `/admin/prompt-studio/prompt` (line 17). Two "Prompt" entries is a live
  UX bug. Keep the Studio version; delete the legacy page, `PromptEditor.tsx`,
  the legacy nav entry, and `/api/admin/prompt/check`.
- **Check endpoints.** `/api/admin/prompt/check` (legacy, only PromptEditor) vs
  `/api/admin/prompt/compile/check` (live). Keep `compile/check`.

**Live and must be kept** (named because they are easy to mistake for dupes):
`app/admin/prompt-builder/page.tsx` is the live Composer (nav "Composer" →
`/admin/prompt-builder`, calls `/api/admin/blocks/chat` and
`/api/admin/prompt/compile/check`). The `prompt-studio/{blocks,history,assets,
prompt}` pages are all live. `src/lib/sage-prompt.ts` `DEFAULT_SYSTEM_PROMPT`
is the live public-chat fallback. `/api/admin/blocks/duplicate` is live
(`BlocksTable`). All `components/admin/content/*` are reachable via
`BlocksTable`. All `*.test.ts(x)` are live.

## A.5 Security gaps (priority #1 — these drive Phase 4 and partly Phase 2)

1. **RLS is bypassed everywhere.** Every server data path uses
   `getAdminClient()` = `createClient(URL, SUPABASE_SERVICE_ROLE_KEY)`
   (`src/lib/supabase-admin.ts`, plus inline duplicates in
   `app/api/sessions/route.ts` and `app/api/sessions/[id]/route.ts`). The
   service-role key **bypasses RLS by design**. So today **tenant isolation is
   application-layer only** — the exact inverse of the requirement ("all access
   rules enforced at the Supabase RLS layer; application-layer checks are a
   secondary defense"). Whether any RLS policies even exist in the DB is
   unverified and, given service-role usage, currently moot.
2. **Unauthenticated cross-tenant IDOR write.**
   `app/api/sessions/[id]/route.ts` `PATCH` takes `id` from the URL and runs
   `update(...).eq('id', id)` with **no auth and no `tenant_id` scope**. Any
   anonymous caller can overwrite **any** session's `messages` / `visitor_name`
   / `status` across **any** tenant by enumerating UUIDs. This is a concrete
   cross-tenant data-integrity breach and must be fixed early (it is also a
   correctness bug for jefflougheed today).
3. **Single-tenant auth model.** `get-auth-context.ts` cannot express the
   required hierarchy (2BL admin / product admin / reseller / member /
   contributor). There is no role-aware or ancestry-aware access decision
   anywhere.
4. **No audit logging.** No record of who accessed/changed what. Required for
   SOC2 and HIPAA (HUGS).
5. **One broad credential for everything.** A single `SUPABASE_SERVICE_ROLE_KEY`
   and a single `ANTHROPIC_API_KEY` are used across all products/tenants. No
   least-privilege scoping; a leak of either is total.
6. **PHI sent to Anthropic (future HUGS risk).** Sage's chat ships visitor text
   to Anthropic. For HUGS (family/health data) this becomes PHI and requires a
   BAA-covered, zero-retention path or de-identification — not yet considered.
7. **Admin routes *are* app-layer tenant-scoped** (good, but still secondary):
   e.g. `app/api/admin/blocks/[id]/route.ts` does
   `.eq('tenant_id', authCtx.tenant_id)`. This pattern is correct but is the
   only line of defense given (1).

## A.6 Performance gaps

1. **Tenant resolution hits the DB on every public request.**
   `get-tenant-from-request.ts` runs a `tenants` lookup by `domain` per request
   with no caching. At platform scale (every storefront request) this is a
   per-request round-trip on the hot path.
2. **No verified index on `tenants.domain`** (the public hot-path lookup) or on
   `tenants.parent_id` (hierarchy traversal). Flagged in Appendix D.2.
3. **Read-modify-write counters.** `persistTokenUsage` in `app/api/sage/route.ts`
   does select-then-update; documented as not concurrency-safe. Fine for one
   serialized visitor, but a correctness landmine if sessions ever fan out.
4. **`onFinish` does up to 4 sequential Supabase round-trips** per streamed
   message (token pre-state, calendar pre-check, name pre-check, writes).
   Acceptable now; flagged for the chat service to batch.
5. **N+1 risk in future hierarchy traversal.** Walking `parent_id` recursively
   per-row would be an N+1 pattern; the security model (B.3) prescribes a
   materialized ancestry to avoid it.

## A.7 Observability gaps

- Logging is `console.log` only (well-instrumented but ephemeral on Vercel; not
  queryable, not alertable). No error aggregation, no admin health panel
  surface (CLAUDE.md aspires to one), no access/audit log, no per-session cost
  alerting despite token counters existing on `chat_sessions`.

## A.8 Hardcoded values that must become config

See Appendix D.1 for the full table with file:line. Headlines:

- **Model IDs** in 7 live locations (`claude-sonnet-4-6`, `claude-haiku-4-5`)
  plus the dead `claude-sonnet-4-20250514` in `ai.ts`; `maxTokens` literals
  scattered (20 → 16000).
- **Domain map** `SBL_HOSTS = new Set(['2bl.ai','www.2bl.ai'])` in
  `middleware.ts`; `.ca`/`.com`-only root-domain assumption in
  `get-tenant-from-request.ts`.
- **Brand strings**: "Natural Resource" baked into `AdminShell.tsx` (lines 34,
  117), `ai.ts`, `CareerTimeline.tsx`; Calendly handle `naturalresource` in 4
  places; SBL `REPLACE-ME` Calendly placeholder.
- **Design tokens**: inkwell palette (`globals.css` `:root` + `html[data-
  palette="inkwell"]`) and SBL palette (`[data-brand="sbl"]`) are CSS-literal,
  not tenant-driven.
- **Single env credentials** (A.5.5).

## A.9 Database / schema reality

There is **zero schema-as-code and zero RLS-as-code** in the repo: no `.sql`
files, no `migrations/`/`supabase/`/`db/` directory, no ORM. Schema and RLS are
managed **manually by Jeff in Supabase Studio** (per CLAUDE.md), recorded in
prose in `System Docs/DB_CHANGELOG.md` and the CLAUDE.md schema tables. **Consequence for
this plan:** every schema/RLS change is flagged as a *Studio task for Jeff*, run
**before** the dependent code phase, and logged in `System Docs/DB_CHANGELOG.md`. CC writes
no migration files and runs no DDL.

---

# PART B — TARGET ARCHITECTURE

## B.1 Directory shape

```
services/                ← platform capabilities (framework-agnostic core + thin route adapters)
  chat/                  ← streaming engine, session lifecycle, booking-card injection/parse
  prompt/                ← blocks, compiler, safety check, version history
  crm/                   ← chat storage, session state machine, inbound triage
  auth/                  ← tenant resolution, auth context, RBAC decisions, user sync
  payments/              ← Stripe integration (new)

tenants/                 ← per-PRODUCT config & defaults (data + tokens, not customer data)
  sage/
  heirloom/
  hugs/

app/
  (platform)/            ← 2BL platform admin (all tenants, all products)
  (sage)/                ← Sage product routes + Sage admin
  (heirloom)/            ← Heirloom product routes + admin
  (hugs)/                ← HUGS product routes + admin
  (jefflougheed)/        ← UNCHANGED, untouched, served at "/"
  secondbrainlabs/       ← 2BL marketing storefront (existing)
  api/                   ← stable HTTP contracts; thin adapters that call services/*
```

**Key principle — services own logic, `app/` owns HTTP + React.** A service
module exports a typed interface (functions/classes) with **no Next.js imports
in its core**. Route handlers and server components are thin adapters: parse
request → call service → format response. This is what makes a service
replaceable without touching its consumers.

**Key principle — public HTTP route paths are a frozen contract.** `/api/sage`,
`/api/sage/parameters`, `/api/sessions` keep their **paths and shapes** through
the whole migration. Only their *implementation* moves into `services/`. This
is the single most important rule for not breaking jefflougheed.ca, whose
`src/components/Chat.tsx` and `streamSageResponse` call those paths directly.

## B.2 Service boundaries & dependency rules

| Service | Single responsibility | Consumes | Must NOT |
|---------|----------------------|----------|----------|
| `auth` | Resolve principal → tenant(s), role, product; make access decisions; sync users | DB (auth-scoped client) | depend on chat/prompt/crm/payments |
| `chat` | Stream Sage responses; assemble system prompt; inject booking cards; detect name/calendar | `auth` (tenant resolution), `prompt` (system prompt), `crm` (persist) | reach into prompt/crm internals — only via their interfaces |
| `prompt` | Compile blocks → master prompt; safety check; version history | `auth` | know about chat transport |
| `crm` | Persist/read sessions; session state machine; inbound triage | `auth` | know about streaming/model details |
| `payments` | Stripe checkout, webhooks, entitlements | `auth` | be required by chat to stream (no hard coupling) |

**Rules:** no circular deps (enforce with a lint boundary, e.g. an
`eslint-plugin-boundaries`/`import/no-restricted-paths` rule added in Phase 3);
no shared mutable state between services (config is read-only data); cross-
service calls go through the published interface only.

**Dependency direction:** `auth` is the leaf everything depends on; `chat`
orchestrates `prompt` + `crm`; `payments` is independent. No service imports a
route; routes import services.

## B.3 Security model (canonical written doc — also the Phase 4 deliverable)

### B.3.1 Principals & cascading access

```
2BL Platform Admin   → sees ALL products, ALL tenants, ALL data
  Product Admin (Sage|Heirloom|HUGS) → sees only tenants/data under that product
    Reseller Admin   → sees only their Members and their Members' data
      Member          → sees only their own tenant's data
        Contributor / Family Member / 3rd-Party Support
                        → sees only what the Member explicitly grants (scoped grant)
```

Sage path: `2BL → Sage → Tenant (e.g. jefflougheed.ca) → Clients`.
Heirloom path: `2BL → Heirloom → Reseller? → Member → Contributors`.
HUGS path: `2BL → HUGS → Reseller? → Member → Family Members + 3rd-Party Support`.

### B.3.2 Enforcement: RLS is primary

The defining decision: **stop using the service-role key for request-scoped
reads/writes; enforce isolation in the database via RLS keyed off the
authenticated principal's claims.**

Because auth is **Clerk**, not Supabase Auth, RLS needs the principal's identity
inside Postgres. The mechanism:

1. **Clerk → Supabase JWT.** Configure a Clerk JWT template that mints a
   Supabase-compatible token carrying claims: `tenant_id`, `tenant_ancestor_ids`
   (or an `ltree` path), `role`, `product`, and `platform_admin` (bool).
2. **Per-request authed client.** Server components / route handlers create a
   Supabase client initialized with the Clerk-issued token (replacing
   `getAdminClient()` on these paths). Now `auth.jwt()` claims are available to
   RLS.
3. **RLS policy shape** (illustrative; Jeff applies in Studio):
   - Base isolation on every tenant-scoped table:
     `USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`.
   - Hierarchy visibility without N+1: store **materialized ancestry** on each
     tenant (`ancestor_ids uuid[]` or `ltree path`); a row is visible if its
     `tenant_id = jwt.tenant_id` **OR** `jwt.tenant_id = ANY(row_owner_ancestor_ids)`
     **OR** `jwt.platform_admin`. Encapsulate in a `SECURITY DEFINER` helper
     `can_access_tenant(target uuid)` so policies stay one-liners and the
     traversal is a single indexed array/`ltree` containment check, not a
     recursive per-row walk.
   - Product scoping for product admins: `product = jwt.product`.
   - Grants (contributors/3rd-party): a `grants` table (`grantor_tenant_id`,
     `grantee_principal`, `scope`, `expires_at`); policy allows access where a
     matching unexpired grant exists.
4. **Service-role becomes the exception, not the rule.** Reserved for: user
   sync (`syncUser`, pre-identity), platform-admin cross-tenant reads (behind an
   explicit, audited `auth` service function that asserts `platform_admin`), and
   the anonymous public-chat write path (which re-derives tenant from host
   server-side and scopes writes by `(id AND tenant_id)` — closing the IDOR).
   Every service-role use is centralized in `services/auth` and logged.
5. **Anonymous public reads** (Sage chat reading `master_prompt` /
   `sage_parameters`): RLS allows `SELECT` on rows flagged publishable, scoped
   by the tenant resolved from host server-side. No client-supplied `tenant_id`
   is ever trusted.

**Why RLS-primary over app-layer-primary:** app-layer scoping (today's
`.eq('tenant_id', …)`) is one forgotten `.eq` away from a breach and is invisible
to audit. RLS makes cross-tenant access *architecturally impossible* — the DB
refuses it even if app code is wrong. App-layer checks remain as defense-in-
depth.

### B.3.3 HIPAA readiness (HUGS)

- **Encryption:** Supabase encrypts at rest (AES-256) and in transit (TLS) by
  default — document this as satisfied at the platform level; flag any field
  needing **application-level / column encryption** (e.g. health notes) where
  at-rest platform encryption is insufficient for "minimum necessary."
- **BAA:** HIPAA requires a signed BAA with Supabase (HIPAA add-on/plan) **and**
  with any subprocessor that touches PHI — critically **Anthropic** if HUGS
  chat sends family/health text. Until a BAA + zero-retention path exists, HUGS
  must **not** send PHI to the model (de-identify or gate). Flagged as a launch
  blocker for HUGS, not Sage.
- **Access logging / audit:** introduce an append-only `audit_log` (who, what,
  when, tenant, action) written by the `auth`/`crm` services. Required for
  HIPAA access logging and SOC2.
- **Minimum-necessary & least privilege:** per-service / per-product scoped
  keys (B.3.5); RLS enforces row minimization.
- **Data retention:** define per-table retention (esp. PHI and visitor chat);
  flagged as a Studio + policy task — none exists today.
- **PHI boundary:** explicitly enumerate PHI-bearing tables/fields as they are
  designed for HUGS (family members, health/condition data, caregiving notes,
  3rd-party support grants, contact info). See Appendix D.4. None exist yet —
  the point is to design them PHI-aware from creation, never retrofit.

### B.3.4 SOC2 readiness

- **Change management:** every migration step is a reviewable PR with the
  mandatory three-section description (CLAUDE.md rule 4); schema changes logged
  in `System Docs/DB_CHANGELOG.md`. This plan *is* the change-management artifact for the
  migration.
- **Access-control documentation:** this section (B.3) is the written model.
- **Monitoring/alerting:** close the observability gap (A.7) — error
  aggregation + an admin health surface + per-session cost alerting.
- **Incident response:** define the tenant-isolation-breach runbook (detect via
  audit_log anomaly → revoke affected tokens/keys → assess blast radius via
  audit_log → notify) as part of Phase 4's deliverable.

### B.3.5 Secrets & credentials

- Replace the single broad `SUPABASE_SERVICE_ROLE_KEY` usage with the authed-
  client model (B.3.2); keep the service-role key only server-side, centralized,
  audited.
- Scope `ANTHROPIC_API_KEY` per product where the provider allows (esp. a
  separate BAA-covered key for HUGS). Document each key's blast radius.
- Remove the stale `VITE_ANTHROPIC_API_KEY` from `.env.example`.

## B.4 Cross-cutting design decisions

- **Tenant resolution + caching.** Centralize host→tenant and tenant→config
  resolution in `services/auth`. Cache the `domain → {tenant_id, product,
  branding, model_config}` map (e.g. `unstable_cache`/short-TTL in-memory, keyed
  by host) with explicit invalidation when tenant config changes. This removes
  the per-request DB round-trip (A.6.1) while keeping correctness. Requires an
  index on `tenants.domain` (Appendix D.2).
- **Model configuration as tenant/product data.** Replace hardcoded model IDs
  and `maxTokens` with a resolved `model_config` (default per product in
  `tenants/<product>/`, overridable per tenant). The `chat`/`prompt` services
  read config, never literals. Latest Claude models per CLAUDE.md (Sonnet for
  chat, Haiku for the name extractor) become the Sage defaults, not constants.
- **Branding as tenant config (resellers).** Brand tokens (palette, fonts,
  logo, names, booking URLs) move from CSS literals to tenant config. The two
  existing palettes (inkwell, SBL) become the **first two seeded brand
  configs**, emitted as CSS custom properties on the layout wrapper at request
  time (the `[data-brand]` mechanism already proves the scoping works). A new
  reseller is then *data*: a tenant row + a branding config, **no code**.
- **`MealFlow` decision required.** The SBL storefront already advertises a 4th
  product. Decide: in-scope (add `tenants/mealflow`, `app/(mealflow)`) or
  remove from storefront. Flagged for Jeff (B/A.2.1).

---

# PART C — THE PHASED PLAN

Global rules for every phase (from CLAUDE.md): one change at a time; commit and
**push immediately**; verify on the **Vercel preview** (not local); update
CLAUDE.md as part of the phase's Definition of Done; **pause for Jeff's approval
before the next phase**; **regression-test jefflougheed.ca explicitly**.

The standing jefflougheed.ca regression checklist (run **every phase**):

- [ ] `jefflougheed.ca` loads at `/`; inkwell palette intact; LCP < 2s mobile.
- [ ] Sage chat opens, streams (first token < 1s), greeting renders.
- [ ] Booking card renders from a `[BOOKING: …]` line; CTA opens (new tab) /
      inline embed injects.
- [ ] `?mode=question` deep-link auto-opens chat in question mode.
- [ ] Calendly embeds in the Work section initialize and book.
- [ ] Admin loads, auth works, Inbound Chats list renders tenant-scoped, Blocks
      / Composer / Prompt / Settings function.
- [ ] No new console errors; no 500s in Vercel logs.

---

## Phase 1 — Audit & baseline  *(no code changes)*

**What changes:** Nothing in code. Deliverable is Part A of this document,
committed as `MIGRATION.md`. Confirm the dead-code and hardcoded-value
inventories against `HEAD` immediately before Phase 2 acts on them.

**Why this design:** You cannot safely move or delete what you have not mapped.
The half-done items (A.2) are the real hazard; surfacing them prevents Phase 3
from "extracting" logic that is itself mid-migration.

**Design considerations / alternatives rejected:** "Start extracting services
immediately" — rejected: extracting on top of unmapped dead code and a live
IDOR bakes problems into the new structure.

**Performance implications:** None.

**Security implications:** Documents the gaps (A.5) but changes nothing. Note:
the IDOR (A.5.2) is now *known* — treat it as embargoed/priority for Phase 2.

**Risks:** Audit misses a live import and Phase 2 deletes something used →
mitigated by the "verify imports immediately before deletion" gate.

**Risk mitigation:** Re-grep importers at the moment of deletion; rely on
TypeScript strict + `next build` to catch broken imports before push.

**Regression test:** Run the full jefflougheed.ca checklist as the **baseline**
recording (so later phases compare against a known-good preview).

**Fallback plan:** N/A (no changes). Doc edits revert via git.

**Schema migrations required (Jeff/Studio):** None.

---

## Phase 2 — Cleanup  *(no behavior changes)*

**What changes:**
- Delete dead code (A.4): `src/lib/ai.ts`; `components/admin/PromptBuilderChat.tsx`;
  `app/api/admin/prompt-chat/route.ts`; `app/boardseat/page.jsx`; verified-unused
  `src/components/*`; empty root files `natural-resource@2.0.0`, `tsc`.
- Consolidate the duplicate prompt UI: delete `app/admin/prompt/page.tsx`,
  `src/components/PromptEditor.tsx`, `app/api/admin/prompt/check/route.ts`, and
  remove the duplicate "Prompt" → `/admin/prompt` entry from
  `AdminSidebarNav.tsx` `NAV_ITEMS`.
- Fix `.env.example` (drop `VITE_ANTHROPIC_API_KEY`); refresh `README.md` to the
  multi-product reality (point to CLAUDE.md as source of truth).
- **Security fix that fits "cleanup, no behavior change for legit users":**
  close the `app/api/sessions/[id]` IDOR by re-deriving tenant from host
  server-side and scoping the update by `(id AND tenant_id)`. (Legit
  jefflougheed traffic is unaffected; only cross-tenant abuse is blocked.)

**Why this design:** Shrinking the surface before moving it means Phase 3
extracts only live code. Removing the duplicate prompt page eliminates a live UX
ambiguity and a second safety-check code path. The IDOR fix is low-risk and
high-severity, and belongs before any data-layer refactor.

**Design considerations / alternatives rejected:** "Defer the IDOR to Phase 4
(security)" — rejected: it is an active unauthenticated cross-tenant write;
waiting is unjustifiable and the fix is a few lines. "Leave dead `ai.ts` for
reference" — rejected: it carries an outdated model + browser-direct key pattern
that could be copied.

**Performance implications:** Negligible (slightly smaller bundle/route count).

**Security implications:** **Net positive** — closes the IDOR; removes the
browser-direct Anthropic pattern in `ai.ts`. No new surface.

**Risks:** (a) Deleting a component that is actually imported. (b) The IDOR fix
changes the sessions PATCH contract subtly.

**Risk mitigation:** (a) `next build` + `tsc` must pass before push; re-grep
importers at deletion time. (b) Keep the request/response shape identical;
only add server-side tenant derivation + `.eq('tenant_id', …)`; verify
jefflougheed chat still PATCHes its own session successfully on preview.

**Regression test:** Full jefflougheed.ca checklist. Specifically confirm: chat
session create + PATCH still works end-to-end (the IDOR fix path); admin nav
shows a single "Prompt" entry; Prompt Studio prompt page still works; Composer
still works.

**Fallback plan:** Each deletion/consolidation is its own commit → `git revert`
the offending commit. The IDOR fix is an isolated commit, independently
revertible.

**Schema migrations required (Jeff/Studio):** None.

---

## Phase 3 — Extract platform services  *(no behavior changes)*

**What changes:**
- Create `services/{chat,prompt,crm,auth,payments}` (payments scaffolded empty).
- Move logic, **not contracts**:
  - `chat`: the streaming/system-prompt/booking/name/calendar logic currently
    in `app/api/sage/route.ts` + `src/lib/stream.ts` + `src/components/sage/
    parseBookingCards.ts` core.
  - `prompt`: `app/api/admin/prompt/compile/**`, `compile/check`, block
    compilation, `src/lib/sage-prompt.ts`, `blockOrder.ts`, `blockTypes.ts`,
    `tokenize.ts`.
  - `crm`: session persistence/state (`app/api/sessions/**` internals,
    `deriveSessionStatus.ts`).
  - `auth`: `get-auth-context.ts`, `get-tenant-from-request.ts`, `sync-user.ts`,
    the Supabase client factories, and the **new resolution cache** (B.4).
- `app/api/**` route handlers become thin adapters importing the services.
  **Route paths and request/response shapes are unchanged.**
- Add an import-boundary lint rule to forbid cross-service internal imports and
  circular deps.
- Update `tsconfig.json` path aliases if needed (`@/services/*`).

**Why this design:** This is a mechanical move that establishes the boundaries
without changing behavior — the safest possible point to introduce the new
structure. Freezing HTTP contracts is what guarantees jefflougheed.ca (which
calls `/api/sage` etc.) keeps working byte-for-byte.

**Design considerations / alternatives rejected:** "Move routes too / rename
endpoints" — rejected: it would break jefflougheed's client at the same time as
the refactor, conflating two risks. "Big-bang move all services in one commit" —
rejected: violates one-change-at-a-time; move one service per commit
(`auth` → `prompt` → `crm` → `chat`, in dependency order) so each is
independently verifiable on preview.

**Performance implications:** Neutral by construction, **with one intended win**:
the `auth` tenant-resolution cache removes the per-request `tenants` DB lookup
(A.6.1). Verify first-token-latency unchanged or improved on preview.

**Security implications:** No isolation change yet (still service-role) — but
centralizing all DB-client creation in `services/auth` is the **precondition**
for Phase 4's RLS switch (one place to change). Document this explicitly.

**Risks:** (a) An import move silently changes behavior (e.g. a server-only
module pulled into a client bundle). (b) The resolution cache serves a stale
tenant after a config change. (c) Hidden coupling surfaces as a circular dep.

**Risk mitigation:** (a) Keep `'use server'`/server-only boundaries; `tsc` +
build + preview after each service move. (b) Short TTL + explicit invalidation
hook on tenant write; start with a conservative TTL. (c) The boundary lint rule
fails the build on a cycle.

**Regression test:** Full jefflougheed.ca checklist **after each service move**
(not just at phase end), because chat depends on auth+prompt+crm. Confirm
streaming, booking cards, name capture, calendar-offered flag, admin inbound
list, Composer compile + safety check all behave identically.

**Fallback plan:** One service per commit → revert the specific commit; because
contracts are frozen, reverting an internal move cannot break callers.

**Schema migrations required (Jeff/Studio):** None.

---

## Phase 4 — Harden tenant security  *(behavior change: enforcement moves to DB)*

**What changes:**
- Implement the B.3 security model: Clerk→Supabase JWT template; per-request
  authed Supabase client in `services/auth`; switch request-scoped reads/writes
  off the service-role key onto the authed client.
- Audit **every** API route and query for tenant scope; add the materialized
  ancestry + `can_access_tenant()` helper usage in app queries where hierarchy
  visibility is needed.
- Introduce `audit_log` writes in `auth`/`crm`.
- Produce the **written security model deliverable** (B.3, expanded with the
  per-table RLS matrix from Appendix D.3 and the incident-response runbook).
- Flag all PHI-adjacent fields (Appendix D.4) — design-time, since HUGS tables
  don't exist yet.
- Scope/segment secrets (B.3.5).

**Why this design:** Security is priority #1, and it must land *after* the
service boundaries exist (so the DB-client swap happens in one place) but
*before* new products multiply the surface (Phase 5/6). Doing it now means
Heirloom/HUGS are built on RLS-primary foundations from day one.

**Design considerations / alternatives rejected:** "Keep service-role +
app-layer scoping only" — rejected: violates the explicit requirement that RLS
be primary and that cross-tenant access be architecturally impossible.
"Recursive `parent_id` walk in RLS" — rejected: N+1/again-per-row; use
materialized `ancestor_ids`/`ltree` + GIN index. "Migrate off Clerk to Supabase
Auth for native `auth.uid()`" — rejected: large blast radius on a live admin;
the Clerk JWT template achieves RLS claims without changing the auth provider.

**Performance implications:** RLS adds per-query policy evaluation; keep it cheap
with indexed equality + array/`ltree` containment (no recursion). Authed-client
init per request is negligible. Net: small, bounded cost for a large security
gain. Verify non-AI admin routes stay < 500ms on preview.

**Security implications:** This **is** the security phase — flips isolation from
app-layer to DB-layer (primary), adds audit logging, segments credentials. New
surface introduced: the Clerk JWT template and claim mapping become a trust-
critical component → must be reviewed and tested for claim spoofing / missing
claims (deny-by-default if claims absent).

**Risks:** (a) An RLS policy is too strict → legitimate reads (incl.
jefflougheed admin) start returning empty/403. (b) A policy is too loose →
silent cross-tenant leak. (c) Anonymous public chat read of `master_prompt`
breaks under new policies → jefflougheed chat falls back to default prompt.
(d) JWT claims missing/misshaped → admin locked out.

**Risk mitigation:** (a/b) Roll out RLS in **audit/log-only or permissive-then-
tighten** order: enable policies per table, verify the existing single tenant
(jefflougheed) still reads/writes on preview, then tighten; write explicit
positive **and negative** test cases (tenant A must NOT see tenant B). (c)
Add/verify the anonymous-publishable SELECT policy and test the public chat path
on preview specifically. (d) Deny-by-default with a clear error; keep a
break-glass platform-admin path (service-role, audited) to recover.

**Regression test:** Full jefflougheed.ca checklist with emphasis on: admin
inbound list still returns jefflougheed's sessions (RLS allows own tenant);
public chat still loads the jefflougheed master prompt (anon read policy);
booking cards still resolve (`sage_parameters` read). **Plus a negative test:**
attempt a cross-tenant read with a second seeded tenant's token and confirm the
DB returns nothing.

**Fallback plan:** RLS is enabled in DB by Jeff (Studio) and can be **disabled
per table** instantly if it breaks production; the code change (authed client)
can be reverted to service-role per commit. Because policies are additive and
table-scoped, rollback is granular. Sequence so the code path tolerates both
(authed client works whether or not a given table's RLS is on).

**Schema migrations required (Jeff/Studio) — flagged, run before code:**
- Add `tenants.ancestor_ids uuid[]` (or `ltree path`) + backfill from
  `parent_id`; GIN index.
- Indexes: `tenants(domain)` unique, `tenants(parent_id)`,
  `tenant_users(user_id)`, `tenant_users(tenant_id, role)` (Appendix D.2).
- Create `audit_log` table.
- Create `grants` table (contributor/3rd-party scoped access).
- Author + enable **RLS policies for every table** (Appendix D.3 matrix).
- Configure the Clerk JWT template (Clerk dashboard, Jeff) + Supabase JWT
  secret alignment.

---

## Phase 5 — Product layer

**What changes:**
- Scaffold `app/(platform)/`, `app/(sage)/`, `app/(heirloom)/`, `app/(hugs)/`.
- Move Sage's product routes + admin into `app/(sage)/` (admin currently at
  `app/admin/**` becomes Sage-product-scoped; platform-wide admin goes to
  `app/(platform)/`). **`app/(jefflougheed)/` stays at `/`, untouched.**
- Create `tenants/{sage,heirloom,hugs}/` product config: default model config,
  default design tokens/brand, default prompt-engine keys, default thresholds.
- **Reseller branding from tenant config:** replace CSS-literal palettes with
  request-time CSS-custom-property injection driven by the resolved tenant
  branding (inkwell + SBL become the first two seeded brand configs). Resolve
  brand in middleware/`auth` (same `x-sbl`-style mechanism, generalized).
- **Tenant provisioning flow:** a platform-admin flow to create a tenant
  (product, parent, domain, branding, model config) — "new tenant = data."
- Make the SBL storefront product links real (or stub `app/(sage|heirloom|
  hugs)/` landing pages); resolve the `MealFlow` decision (B.4).

**Why this design:** Once services + RLS exist, products are thin route groups
over shared services differentiated by config. Branding-as-config is the
scalability unlock for resellers (no code per reseller).

**Design considerations / alternatives rejected:** "Per-tenant CSS files /
per-reseller code" — rejected: violates "new tenants are data, not deployments."
"One mega-admin for all products" — rejected: breaks product-admin isolation
(B.3) and simplicity; product-scoped admins + a platform admin match the access
model. "Move jefflougheed under `(sage)`" — rejected: explicit constraint, and
its bespoke marketing site differs from the generic Sage storefront.

**Performance implications:** Brand/config resolution rides the cached tenant
resolution (B.4) — no extra per-request DB cost. Per-product route groups don't
add runtime cost. Verify storefront LCP < 2s on mobile.

**Security implications:** Product-admin and platform-admin boundaries are now
real routes — they must sit behind the RBAC decisions from Phase 4 (route
guards + RLS). New provisioning flow is a privileged operation → platform-admin
only, audited.

**Risks:** (a) Moving Sage admin routes breaks admin URLs/bookmarks or Clerk
route protection. (b) Branding injection regresses jefflougheed's inkwell or
SBL tokens. (c) Provisioning writes a malformed tenant (bad ancestry) → RLS
visibility bugs.

**Risk mitigation:** (a) Keep admin paths stable or add redirects; re-verify
`middleware.ts` `auth.protect()` matchers cover the new group paths. (b) Seed
inkwell + SBL as configs and **diff the rendered tokens** against current on
preview before removing the CSS literals; jefflougheed checklist. (c)
Provisioning validates ancestry + recomputes `ancestor_ids`; covered by Phase 4
negative tests.

**Regression test:** Full jefflougheed.ca checklist (palette + chat + admin
unaffected). SBL storefront renders, product links resolve (no 404s), tokens
unchanged. Create a test Sage tenant via provisioning and confirm it is
isolated (cannot see jefflougheed data) and renders its own branding.

**Fallback plan:** Route-group moves are revertible per commit; keep redirects
so URLs survive a revert. Branding: keep the CSS-literal palettes until the
config-driven path is verified on preview, then remove in a separate commit
(revertible).

**Schema migrations required (Jeff/Studio):** Tenant config columns/tables for
branding + model config (if not stored in existing `tenants.settings` JSON);
provisioning may need a `tenant_branding` / `tenant_model_config` table.
Flagged for Jeff once the config shape is approved.

---

## Phase 6 — Heirloom migration

**What changes:**
- Migrate Heirloom from the legacy Vite repo into `app/(heirloom)/`, consuming
  `services/{chat,prompt,crm,auth,payments}` rather than its own logic.
- Implement Heirloom's hierarchy: `2BL → Heirloom → Reseller? → Member →
  Contributors`, using the Phase 4 ancestry + grants model.
- Seed the **first reseller tenant** and verify end-to-end: reseller branded
  storefront, reseller adds a Member, Member adds Contributors, isolation holds.

**Why this design:** Heirloom is the first real test that "new product = same
pattern" and "reseller = data." Doing it after the platform/security/product
layers exist means Heirloom inherits RLS-primary isolation and branding-as-config
for free.

**Design considerations / alternatives rejected:** "Port Heirloom's Vite code
as-is" — rejected: it would re-introduce a parallel implementation of chat/auth;
the point is to consume shared services. "Skip reseller verification" —
rejected: resellers are the scalability thesis; must be proven end-to-end.

**Performance implications:** Heirloom rides the same cached resolution + RLS;
watch for any Heirloom-specific N+1 in contributor/grant lookups (use the
materialized ancestry + indexed grants).

**Security implications:** First multi-level hierarchy (Reseller→Member→
Contributor) and first heavy use of `grants`. Exercises the negative-isolation
tests at depth. PHI is **not** in Heirloom (memory/contributor data) but privacy
obligations (Privacy by Design) still apply.

**Risks:** (a) Heirloom's legacy data model doesn't map cleanly to the tenant
hierarchy. (b) Reseller branding collides with Sage/jefflougheed tokens. (c)
Contributor grants leak across members.

**Risk mitigation:** (a) Map the legacy schema to the platform schema before
code; flag schema needs for Jeff. (b) Branding is scoped per tenant (proven in
Phase 5); diff tokens. (c) Negative isolation tests for Member↔Member and
Contributor scope expiry; audit_log review.

**Regression test:** Full jefflougheed.ca checklist (must still be pristine —
Sage and Heirloom share services). Heirloom: reseller storefront branded
correctly; Member sees only own data; Contributor sees only granted scope;
cross-Member access denied at the DB.

**Fallback plan:** Heirloom lives entirely under `app/(heirloom)/` + new tenant
rows; it can be feature-disabled (route group / tenant flag) without touching
Sage/jefflougheed. Revert the Heirloom route group; shared services are
unchanged for Sage.

**Schema migrations required (Jeff/Studio):** Heirloom domain tables (members,
contributors, memory records, reseller config) + their RLS policies + indexes.
Flagged for Jeff once Heirloom's data model is approved. HUGS is explicitly a
later phase (PHI/BAA work) and is **out of scope for Phase 6**.

---

# PART D — APPENDICES

## D.1 Hardcoded-value inventory (→ tenant/product config)

| Category | Location | Value |
|----------|----------|-------|
| Model ID | `app/api/sage/route.ts:367` | `claude-sonnet-4-6` (chat) |
| Model ID | `app/api/sage/route.ts:68` | `claude-haiku-4-5` (name extractor) |
| Model ID | `app/api/admin/assets/upload/route.ts` | `claude-sonnet-4-6` (maxTokens 16000) |
| Model ID | `app/api/admin/prompt/compile/check/route.ts` | `claude-sonnet-4-6` (700) |
| Model ID | `app/api/admin/blocks/chat/route.ts` | `claude-sonnet-4-6` (4000) |
| Model ID | `app/api/admin/prompt/check/route.ts` *(dead — Phase 2)* | `claude-sonnet-4-6` |
| Model ID | `app/api/admin/prompt-chat/route.ts` *(dead — Phase 2)* | `claude-sonnet-4-6` |
| Model ID | `src/lib/ai.ts` *(dead — Phase 2)* | `claude-sonnet-4-20250514` |
| Domain map | `middleware.ts:6` | `SBL_HOSTS = {'2bl.ai','www.2bl.ai'}` |
| Domain rule | `src/lib/get-tenant-from-request.ts` | last-two-labels (`.ca`/`.com` only) |
| Brand | `components/admin/layout/AdminShell.tsx:34,117` | "Natural Resource" (admin wordmark ×2) |
| Brand | `src/components/CareerTimeline.tsx` | "Natural Resource" |
| Brand | `src/lib/sage-prompt.ts` | Jeff Lougheed identity + Calendly links |
| Booking URL | `src/components/Work.tsx`, `Session.tsx`, `sage-prompt.ts` | `calendly.com/naturalresource/...` |
| Placeholder | `app/secondbrainlabs/page.tsx:351` | `calendly.com/REPLACE-ME/working-session` |
| Tokens | `app/globals.css` `:root` / `html[data-palette="inkwell"]` | inkwell palette |
| Tokens | `app/globals.css` `[data-brand="sbl"]` | SBL palette |
| Fonts | `app/(jefflougheed)/layout.tsx` (link) / `app/secondbrainlabs/layout.tsx` (next/font) | per-brand |
| Secret | `src/lib/supabase-admin.ts` + inline in `app/api/sessions/**` | one `SUPABASE_SERVICE_ROLE_KEY` |
| Secret | all AI routes | one `ANTHROPIC_API_KEY` |

## D.2 Index recommendations (flag for Jeff; verify in Studio)

Based on observed query patterns (cannot inspect the DB from the repo):

- `tenants(domain)` — **unique**; hot public path (`get-tenant-from-request`).
- `tenants(parent_id)` and `tenants USING GIN (ancestor_ids)` — hierarchy.
- `tenant_users(user_id)` — `get-auth-context` lookup.
- `tenant_users(tenant_id, role)` — RBAC reverse lookup.
- `chat_sessions(tenant_id, session_type, updated_at DESC)` — admin inbound list
  (`app/admin/page.tsx`).
- `master_prompt(tenant_id, version DESC)` — `getSystemPrompt`. (`(tenant_id,
  key)` unique already exists.)
- `blocks(tenant_id, status, type)` — compile + Blocks page.
- `sage_parameters(tenant_id)` — booking-card fetch. (`(tenant_id, key)` unique
  exists.)
- `audit_log(tenant_id, created_at DESC)` — once created.
- `grants(grantee_principal, expires_at)` — once created.

## D.3 RLS policy matrix (author + enable in Phase 4 — Jeff/Studio)

Every table is tenant-scoped; default **deny**, then:

| Table | SELECT | INSERT/UPDATE/DELETE | Notes |
|-------|--------|----------------------|-------|
| `tenants` | own + descendants (`can_access_tenant`) or platform_admin | platform/product-admin only | hierarchy via ancestry |
| `tenant_users` | own tenant or ancestor admin | admin of that tenant/ancestor | |
| `users` | self / admins | self (profile), sync via service-role | |
| `chat_sessions` | own tenant; anon write-path scoped server-side | own tenant; **anon insert/patch via host-derived tenant only** | closes IDOR |
| `blocks` | own tenant | own tenant admin | |
| `topics` | own tenant | own tenant admin | |
| `content` | own tenant | own tenant admin | storage bucket path also tenant-prefixed |
| `master_prompt` | own tenant + **anon read of publishable** | own tenant admin | anon read powers public chat |
| `master_prompt_history` | own tenant | own tenant admin | |
| `sage_parameters` | own tenant + anon read (no admin fields) | own tenant admin | |
| `do_not_engage` | own tenant | own tenant admin | |
| `chat_corrections` | own tenant | own tenant admin | |
| `audit_log` *(new)* | own tenant admins + platform | append-only; no update/delete | |
| `grants` *(new)* | grantor/grantee | grantor admin | scoped + `expires_at` |
| Heirloom/HUGS tables *(future)* | per hierarchy + grants | per hierarchy | HUGS = PHI (D.4) |

## D.4 PHI-adjacent inventory (HUGS — design-time flags; tables don't exist yet)

Design these PHI-aware from creation (encryption, audit, retention, BAA path):
- Family member identities & relationships (names, DOB, contact).
- Health / condition / care-need fields.
- Caregiving notes, schedules, incident records.
- 3rd-party support grants (who can see what, when, expiry).
- Any free-text sent to the model → **PHI to a subprocessor** → requires
  Anthropic BAA + zero-retention or de-identification **before** HUGS chat
  ships. **Launch blocker for HUGS** (not Sage/Heirloom).

## D.5 Secrets / credential scoping (Phase 4/5)

- Move all service-role usage behind `services/auth`; replace request-scoped
  reads with the Clerk-JWT authed client (B.3.2).
- Per-product `ANTHROPIC_API_KEY` where the provider allows; a separate
  BAA-covered key for HUGS.
- Remove stale `VITE_ANTHROPIC_API_KEY` from `.env.example` (Phase 2).

## D.6 Open decisions for Jeff (blockers before the relevant phase)

1. **MealFlow:** in scope (4th product) or remove from the SBL storefront?
   (Affects Phase 5 route groups + storefront links.)
2. **Auth strategy:** confirm Clerk-JWT-template → Supabase RLS (B.3.2) vs any
   appetite to move to Supabase Auth. (Affects Phase 4.)
3. **HUGS BAA path:** confirm Supabase HIPAA plan + Anthropic BAA timeline
   before any HUGS data design. (Gates HUGS, post-Phase-6.)
4. **Branding storage:** `tenants.settings` JSON vs dedicated
   `tenant_branding`/`tenant_model_config` tables. (Affects Phase 5 schema
   flags.)

---

## Definition of Done per phase (CLAUDE.md alignment)

- [ ] Feature/refactor works as specified; **mobile responsive verified**.
- [ ] **jefflougheed.ca regression checklist passed on Vercel preview.**
- [ ] No TypeScript (strict) errors; `next build` clean; tests pass.
- [ ] Design-system consistency (Mantine admin / Tailwind public) preserved.
- [ ] Accessibility unchanged or improved; error states on-brand.
- [ ] Performance targets not regressed (LCP < 2s mobile; non-AI routes
      < 500ms; first token < 1s).
- [ ] Security implications reviewed; no new cross-tenant surface.
- [ ] **CLAUDE.md updated** to reflect the change.
- [ ] Branch pushed; PR description in the mandatory three-section format.
- [ ] Required schema migrations flagged to Jeff and applied in Studio
      **before** the dependent code merged; `System Docs/DB_CHANGELOG.md` updated.
