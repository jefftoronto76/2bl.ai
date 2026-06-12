# DB Changelog

## 2026-06-11

### Add `status` column to `users` table
**Type:** Schema change + data backfill
**Executed by:** Jeff in Supabase Studio

**SQL run:**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
UPDATE users SET status = 'deleted' WHERE deleted_at IS NOT NULL;
```

**Purpose:** Lifecycle flag on platform users, mirroring `members.status`.
Values: `'active'` (default, set on every new row) | `'deleted'`. The backfill
marks rows already soft-deleted (`deleted_at IS NOT NULL`) as `'deleted'`.
Maintained in code by the Clerk webhook (`/api/webhooks/clerk`): the
`user.deleted` handler sets `status = 'deleted'` alongside the existing
`deleted_at` stamp (wired on this branch, same PR as this entry).

---

### Add `tenant_id` column to `auth_events` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
ALTER TABLE auth_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

**Purpose:** Tenant attribution on every auth event. All `logAuthEvent` call sites now stamp `tenant_id` resolved from request context — `/api/auth/log` and the Clerk webhook via `getTenantFromRequest`, the `get-auth-context` admin_access_failed path via the same host resolution (branch `06-10-26_auth0-migration`, commit `0910abc`). Nullable — rows written before this change, and requests whose host doesn't resolve to a tenant, carry null.

---

## 2026-06-10

### Rename `clerk_user_id` → `clerk_id` on `members` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
ALTER TABLE members RENAME COLUMN clerk_user_id TO clerk_id;

**Purpose:** Normalize column naming — `users` table uses `clerk_id`; `members` now matches. All codebase references updated in the same commit.

---

### Add `phone` column to `users` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
ALTER TABLE users ADD COLUMN phone text;

**Purpose:** Store phone number at the platform (user) level, mirroring the existing `phone` column on `members`. Enables Clerk → users → members sync for phone numbers captured at sign-up.

---

### Add `name` column to `members` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
ALTER TABLE members ADD COLUMN name text;

**Purpose:** Store display name at the tenant-membership level. Mirrors `users.name`. Populated from Clerk `firstName + lastName` on sign-up via the claim route and `user.created` webhook.

---

## 2026-06-09

### No schema change — auth_surface metadata convention added to auth_events
**Type:** Note (no schema change)

All new `auth_events` rows written by the application now carry an
`auth_surface` key in the `metadata` JSONB column, distinguishing which
UI surface initiated the auth event:

| Value | Origin |
|-------|--------|
| `'custom_otp'` | `useAuthFlow` hook — the custom email/phone OTP flow |
| `'prebuilt_modal'` | Clerk prebuilt modal (`openSignIn` / `openSignUp`) invoked from `GateView` or `ChatHeader` |

**No value set** on rows written before this change, or on Clerk webhook rows
(`svix_event_id IS NOT NULL`) — Clerk fires webhooks for all surfaces and
does not expose the originating UI.

**Querying:**
```sql
-- custom OTP flow events
SELECT * FROM auth_events WHERE metadata->>'auth_surface' = 'custom_otp';

-- prebuilt modal events
SELECT * FROM auth_events WHERE metadata->>'auth_surface' = 'prebuilt_modal';

-- webhook rows (surface unknown — both surfaces trigger Clerk lifecycle hooks)
SELECT * FROM auth_events WHERE svix_event_id IS NOT NULL;
```

**Implemented in:** `services/auth/log-auth-step.ts` (new shared utility),
`services/auth/useAuthFlow.ts`, `components/shells/membership/GateView.tsx`,
`components/shells/membership/ChatHeader.tsx`.

---

### No schema change — Heirloom Clerk modal appearance retheme
**Type:** Note (no schema change)

Updated Clerk prebuilt modal appearance (sign-in, sign-up, account settings)
to use an eggshell/off-white card surface (`#FAF6EE`) instead of the dark
Heirloom background. Changes are purely presentational (CSS tokens +
`clerkAppearance.ts`); no database tables, columns, or RLS policies were
modified. Logged here so no one searches for a related migration.

**Files changed:**
- `components/shells/membership/clerkAppearance.ts` — all `variables` and
  `elements` entries updated to `--hl-modal-*` tokens (light surface, dark ink)
- `app/heirloom/globals.css` — five new `:root` tokens added
  (`--hl-modal-bg`, `--hl-modal-surface`, `--hl-modal-ink`,
  `--hl-modal-ink-muted`, `--hl-modal-border`); social button border added;
  Apple icon `--cl-icon-fill` override removed so the icon renders at its
  native color

---

## 2026-06-08

### Create `audit_events` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Columns:**
- `id` (bigint generated always as identity)
- `product_id` (text, nullable)
- `tenant_id` (uuid, nullable)
- `actor_id` (uuid, nullable, FK → users)
- `actor_type` (text default 'user': 'user' | 'system' | 'anonymous')
- `actor_email` (text, nullable)
- `clerk_user_id` (text, nullable)
- `action` (text NOT NULL — namespaced noun.verb e.g. 'block.update')
- `target_type` (text, nullable)
- `target_id` (text, nullable)
- `outcome` (text default 'success': 'success' | 'failure')
- `ip_address` (inet, nullable)
- `user_agent` (text, nullable)
- `correlation_id` (uuid, nullable — from x-correlation-id middleware header)
- `changes` (jsonb, nullable — {before, after} where relevant)
- `metadata` (jsonb NOT NULL default '{}')
- `created_at` (timestamptz NOT NULL default now())
- Primary key: (id, created_at)
- Indexes: `idx_audit_tenant_time` (tenant_id, created_at desc), `idx_audit_actor_time` (actor_id, created_at desc), `idx_audit_action_time` (action, created_at desc), `idx_audit_target` (target_type, target_id), `idx_audit_created_brin` (brin on created_at)

**Immutability:**
- `prevent_audit_mutation()` trigger function created (raises exception on UPDATE/DELETE)
- BEFORE UPDATE trigger and BEFORE DELETE trigger added to `audit_events`
- `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM public, authenticated, anon`

**RLS:** Enabled. Tenant admins read own tenant's rows; platform admins read all. Append path via service-role client (bypasses RLS).

---

### Create `auth_events` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Columns:**
- `id` (bigint generated always as identity)
- `tenant_id` (uuid, nullable)
- `clerk_user_id` (text, nullable)
- `actor_id` (uuid, nullable, FK → users)
- `email` (text, nullable — claimed email, may be unverified on failure)
- `event_type` (text NOT NULL — 'sign_up' | 'sign_in' | 'sign_out' | 'otp_sent' | 'otp_verified' | 'sign_in_failed' | 'mfa_failed' | 'session_created' | 'session_revoked' | 'admin_access' | 'admin_access_failed' | 'user_deleted' | 'password_reset')
- `outcome` (text default 'success')
- `failure_reason` (text, nullable)
- `ip_address` (inet, nullable)
- `user_agent` (text, nullable)
- `correlation_id` (uuid, nullable)
- `svix_event_id` (text, unique — idempotency key for Clerk webhook deliveries; null for app-logged events)
- `metadata` (jsonb NOT NULL default '{}')
- `created_at` (timestamptz NOT NULL default now())
- Primary key: (id, created_at)
- Indexes: `idx_auth_tenant_time` (tenant_id, created_at desc), `idx_auth_user_time` (clerk_user_id, created_at desc), `idx_auth_type_time` (event_type, created_at desc), `idx_auth_created_brin` (brin on created_at)

**Immutability:**
- Same `prevent_audit_mutation()` trigger function reused
- BEFORE UPDATE and BEFORE DELETE triggers added to `auth_events`
- `REVOKE UPDATE, DELETE, TRUNCATE ON auth_events FROM public, authenticated, anon`

**RLS:** Enabled. Users read own rows (by clerk_user_id); platform admins read all. Append path via service-role client.

---

### Backfill — document pre-existing `auth_logs` table
**Type:** Documentation backfill (no schema change)
**Executed by:** Pre-existing — created in Supabase Studio at an earlier date (exact date unknown)

**Purpose:** `auth_logs` is a Clerk ID resolution diagnostic table created to help
troubleshoot Clerk ID lookup issues. It is **not** a general audit log and should
not be confused with `auth_events` (the new append-only auth-event table).

**Columns:**
- `id` (uuid, PK)
- `clerk_id_attempted` (text)
- `matched_table` (text)
- `matched_column` (text)
- `user_id` (uuid)
- `member_id` (uuid)
- `environment` (text)
- `created_at` (timestamptz)

**Notes:**
- No `tenant_id`, `action`, `outcome`, or immutability enforcement
- Not replaced by `auth_events` — preserved as-is for its diagnostic purpose
- This entry was added to DB_CHANGELOG.md retroactively in the audit-log sprint

---

## 2026-05-28

### Add `user_id` column to `chat_sessions`
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Column:** `user_id` (uuid, nullable, FK → `users(id)`)
**Index:** `idx_chat_sessions_user_id_updated` on `(user_id, updated_at DESC)`

**Purpose:** Link a chat session to a signed-in end-customer so their threads
are recoverable across devices from the DB (Heirloom durability sprint, PR 3).
Written by `POST /api/sessions` via `syncUser` when a Clerk user is signed in;
read by `GET /api/sessions` (scoped by `user_id` + `tenant_id`, newest first).
Nullable — existing rows and the anonymous visitor write path are unaffected.

---

## 2026-05-26

### No schema change — chat-ui-v1 sprint (`[NAME:]` marker)
**Type:** Note (no schema change)

The chat-ui-v1 work (shared `useChatTurn` engine + marker registry) and the new
`[NAME:]` marker introduced **no schema change** — visitor-name capture reuses
the existing `chat_sessions.visitor_name` column. Logged here so no one hunts
for a NAME-related migration. (PRs #42-46.)

---

## 2026-05-25

### Add `email` column to `chat_sessions`
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Column:** `email` (text, nullable)

**Purpose:** Capture a visitor email on a chat session (e.g. for Heirloom
account creation / follow-up). Nullable — existing rows and the anonymous
visitor write path are unaffected.

---

### Create `artifacts` + `artifact_media` tables
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**New table: `artifacts`**
- id (uuid, PK)
- tenant_id (uuid, FK → tenants)
- user_id (uuid, FK → users)
- session_id (uuid, FK → chat_sessions)
- type (text) — e.g. 'memory' for Heirloom; general-purpose across tenants
- title (text)
- body (text)
- metadata (jsonb)
- status (text) — 'draft' | 'published'
- created_at (timestamptz)
- updated_at (timestamptz)

**New table: `artifact_media`**
- id (uuid, PK)
- artifact_id (uuid, FK → artifacts)
- type (text)
- url (text)
- filename (text)
- mime_type (text)
- size (integer)
- created_at (timestamptz)

**Notes:**
- Tables created in Supabase Studio by Jeff — not via migration file
- `artifact_media` references `artifacts` via `artifact_id`
- Not yet wired to chat — pending PR

---

## 2026-05-24

### Create `tenant_branding` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Columns:** ⚠️ _Confirm exact column list from Studio._ Expected shape:
`tenant_id` (uuid, FK → tenants.id) plus per-tenant branding fields
(e.g. logo, palette/colors, fonts).

**Purpose:** Per-tenant branding/theming so each product storefront and tenant
surface can be styled from data rather than hardcoded tokens. Supports the
capability model in 2BL.md (Database/Chat surfaces rendered per tenant brand).

---

### Insert Sage tenant
**Type:** Data insert
**Executed by:** Jeff in Supabase Studio

**Record inserted:** `tenants` table
- `id:` ⚠️ _fill from Studio_
- `name: Sage`
- `slug:` ⚠️ _fill from Studio_
- `type: product`
- `parent_id:` Second Brain Labs platform tenant (`6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`) — ⚠️ _confirm_
- `domain:` ⚠️ _fill from Studio (if any)_

**Purpose:** Establish Sage as a product tenant under the 2BL platform.

---

### Insert Heirloom tenant
**Type:** Data insert
**Executed by:** Jeff in Supabase Studio

**Record inserted:** `tenants` table
- `id:` ⚠️ _fill from Studio_
- `name: Heirloom`
- `slug:` ⚠️ _fill from Studio_
- `type: product`
- `parent_id:` Second Brain Labs platform tenant (`6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`) — ⚠️ _confirm_
- `domain:` ⚠️ _fill from Studio (if any)_

**Purpose:** Establish Heirloom as a product tenant under the 2BL platform,
ahead of the Heirloom migration (marketing page, chat, memory-creation flow).

---

### Insert `tenant_users` rows for Jeff (Heirloom + 2BL)
**Type:** Data insert
**Executed by:** Jeff in Supabase Studio

**Records inserted:** `tenant_users` table — two rows giving Jeff membership on:
- The **Heirloom** tenant (id above)
- The **2BL** platform tenant — Second Brain Labs (`6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`)

Per row: `tenant_id`, `user_id:` Jeff (⚠️ _fill `users.id` from Studio_),
`role:` ⚠️ _fill from Studio_.

**Purpose:** Grant Jeff access to the Heirloom and 2BL tenants. A user with
multiple `tenant_users` rows is resolved to the active tenant by request host
(see `getAuthContext` / `resolve-tenant-from-host`).

---

## 2026-05-23

### Add tenant_model_config table
**Type:** Schema change  
**Executed by:** Jeff in Supabase Studio

**Columns:**
- `tenant_id` (uuid)
- `provider` (text, default 'anthropic')
- `model_id` (text — primary chat model)
- `model_id_fallback` (text — circuit-breaker fallback model)
- `max_tokens` (integer, default 1000)
- `rate_limit_requests_per_hour` (integer, default 100)

**Purpose:** Per-tenant model configuration. Provider, model ID, fallback model, max tokens, rate limiting. Chat service reads from this table when a row exists for the tenant, falls back to hardcoded defaults when no row found.

---

## 2026-05-20

### Add `key` column to `master_prompt`
**Type:** Schema change  
**Executed by:** Jeff in Supabase Studio

**SQL run:**

```sql
ALTER TABLE public.master_prompt
ADD COLUMN key text NULL;

ALTER TABLE public.master_prompt
ADD CONSTRAINT master_prompt_tenant_key_unique UNIQUE (tenant_id, key);
```


**Purpose:** Supports multiple prompt engines per tenant. A tenant can now have multiple master prompts differentiated by `key` (e.g. 'base', 'editor', 'onboarding'). Existing rows with `key: null` are unaffected — jefflougheed.ca prompt resolution unchanged.

---

## 2026-05-20

### Insert Second Brain Labs tenant
**Type:** Data insert  
**Executed by:** Jeff in Supabase Studio

**Record inserted:** `tenants` table  
- `id: 6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`
- `name: Second Brain Labs`
- `slug: second-brain-labs`
- `type: platform`
- `domain: 2bl.ai`
