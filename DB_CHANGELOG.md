# DB Changelog

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
