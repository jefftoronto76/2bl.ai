# DB Changelog

## 2026-06-28

### Drop compatibility views — master_prompt rename complete

**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

Dropped the temporary compatibility views `master_prompt` and 
`master_prompt_history` that were created to bridge the table rename. 
All code references were updated in PR #170 before the views were dropped.

Final state:
- `compiled_prompts` — the live table (was `master_prompt`)
- `compiled_prompts_history` — the archive table (was `master_prompt_history`)
- `compiled_prompts_tenant_key_unique` — constraint (was `master_prompt_tenant_key_unique`)

## 2026-06-26

RLS review pending on prompt_sets/prompt_types for cross-tenant platform writes
Compile metadata shows "Never compiled" for sets not yet compiled under per-set shape — data migration needed

### Add `blocks_touch_parent_prompt_set` trigger

**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Purpose:** Whenever a block is inserted, updated, or deleted, bump the parent
`prompt_sets.updated_at` to now(). This ensures the stale warning on prompt set
cards fires correctly when blocks change — not just when set metadata changes.

**SQL:**
- Created `touch_prompt_set_on_block_change()` trigger function
- Created `blocks_touch_parent_prompt_set` trigger (AFTER INSERT OR UPDATE OR DELETE
  ON blocks, FOR EACH ROW)

### Refactor `prompt_sets` — rename `is_master`, add `is_default`

**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Changes:**
- Renamed `is_master` → `is_composer_prompt` — clarifies this is the 
  prompt set that powers the Composer AI, not a general "master" concept
- Added `is_default` (boolean NOT NULL DEFAULT false) — flags the prompt 
  set loaded for a tenant's chat sessions when no specific set is requested
- Seeded `is_default = true` on both existing sets (Heirloom + jefflougheed.ca)
- Added `prompt_sets_single_default_idx` — unique partial index enforcing 
  one default per tenant
- Added `prompt_sets_single_composer_idx` — unique partial index enforcing 
  one composer prompt across all tenants

**Rules enforced:**
- Every tenant must have exactly one `is_default = true` prompt set
- Exactly one row across all tenants may have `is_composer_prompt = true`
- Application layer must prevent deactivating the last default without 
  another set present


## 2026-06-26

### Refactor `prompt_types` — drop `tenant_id`, add `prompt_type_tenants` join table

**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**Changes:**
- Created `prompt_type_tenants` join table (prompt_type_id, tenant_id, created_at) with unique constraint on (prompt_type_id, tenant_id)
- Migrated existing `prompt_types.tenant_id` values into `prompt_type_tenants`
- Dropped `tenant_id` column and index from `prompt_types`
- Dropped `is_default` column from `prompt_types` — fallback logic belongs in application code, not taxonomy
- Deleted `default` type — wrong concept for a taxonomy table
- `base` is the baseline type (sort_order 0); `sales`, `onboarding`, `editor` round out the platform taxonomy

**Why:**
A type is a definition, not a possession. Separating definition (prompt_types) from assignment (prompt_type_tenants) allows one type to be assigned to multiple tenants without duplicating the definition.

**Current state:**
Four types in prompt_types: base, sales, onboarding, editor — all assigned to SBL via prompt_type_tenants. No other tenants have type assignments yet.


## 2026-06-25 (rename)

`blocks.prompt_type_key` → `blocks.prompt_set_key` → finally `blocks.prompt_set_id`
(Jeff, Studio). For `master_prompt`, the briefly-renamed `prompt_set_key` column
was dropped as an empty ghost — `master_prompt.prompt_set_id` already existed and
is canonical. Net result: both `blocks` and `master_prompt` use `prompt_set_id`.
`pills.prompt_type_key` and `session_tokens.prompt_type_key` are unchanged.
Application code updated to `prompt_set_id` (the older "ADD COLUMN prompt_type_key"
entries below remain as historical record of the original adds).

## June 25 2026:

**Rename `blocks.prompt_type_key` → `blocks.prompt_set_id`**
- Renamed `prompt_type_key` → `prompt_set_key` (intermediate step)
- Renamed `prompt_set_key` → `prompt_set_id` (final name)
- FK → `prompt_sets.id` — 122 rows of data preserved

**Drop `blocks.prompt_set_id` ghost column**
- Was empty, redundant with the renamed column above
- Dropped before the rename to avoid conflict

**Clean up `master_prompt.prompt_type_key`**
- Renamed `prompt_type_key` → `prompt_set_key`
- Dropped `prompt_set_key` (empty ghost column — `prompt_set_id` already existed on the table)
- `master_prompt.prompt_set_id` is now the single FK → `prompt_sets.id`

**Naming convention finalized**
- All FK columns linking to `prompt_sets.id` are now named `prompt_set_id`
- All FK columns linking to `prompt_types.id` are named `prompt_type_id`
- No more `_key` suffix anywhere

Added prompt_type_id (UUID FK → prompt_types.id) to prompt_sets
Created prompt_sets_single_master_idx partial unique index (enforces single platform master)
Created touch_updated_at() function and prompt_sets_touch_updated_at trigger


## 2026-06-24

### Create `prompt_conversations` table
```sql
CREATE TABLE prompt_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL DEFAULT 'New conversation',
  preview text,
  messages jsonb NOT NULL DEFAULT '[]',
  prompt_set_id uuid REFERENCES prompt_sets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prompt_conversations_tenant_id_idx ON prompt_conversations(tenant_id);
CREATE INDEX prompt_conversations_owner_id_idx ON prompt_conversations(owner_id);
CREATE INDEX prompt_conversations_updated_at_idx ON prompt_conversations(updated_at DESC);
```

### Add `updated_at` trigger on `prompt_conversations`
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompt_conversations_updated_at
BEFORE UPDATE ON prompt_conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Add `conversation_id` to `blocks`
```sql
ALTER TABLE blocks
ADD COLUMN conversation_id uuid REFERENCES prompt_conversations(id);

CREATE INDEX blocks_conversation_id_idx ON blocks(conversation_id);
```

### Add `is_master` to `prompt_sets`
```sql
ALTER TABLE prompt_sets
ADD COLUMN is_master boolean NOT NULL DEFAULT false;
```
Platform-level flag. One row across all tenants has `is_master = true` — designates the system prompt used by all tenant Composers when building blocks. Falls back to hardcoded `BLOCKS_COMPOSER_SYSTEM` constant when no row is flagged.

---

## 2026-06-18

### Create `prompt_types` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
```sql
CREATE TABLE prompt_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX prompt_types_tenant_id_idx ON prompt_types(tenant_id);
```

**Purpose:** Stores prompt type definitions per tenant. The platform tenant
(`6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`) owns the platform-level defaults,
which flow down to all product tenants. Tenants may define additional types
on top. Four platform defaults seeded at creation time:

| key | name | sort_order |
|-----|------|-----------|
| `base` | Base | 0 |
| `sales` | Sales | 1 |
| `onboarding` | Onboarding | 2 |
| `editor` | Editor | 3 |

**Notes:**
- `key` is unique per `tenant_id` (enforced by UNIQUE constraint)
- `is_default` flags the type that compiles when no `prompt_type_key` is
  specified
- `sort_order` controls display ordering in the admin UI (nulls last)

---

### Create `pills` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
```sql
CREATE TABLE pills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  label text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('composer', 'runtime')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('message', 'tool', 'card')),
  payload jsonb NOT NULL DEFAULT '{}',
  prompt_type_key text,
  block_id uuid REFERENCES blocks(id),
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pills_tenant_id_idx ON pills(tenant_id);
```

**Purpose:** Stores pills (Composer-facing UI actions) and chips (member-facing
runtime suggestions) in one table, distinguished by `scope`.

- `scope = 'composer'` — action pill displayed in the Prompt Studio Composer
- `scope = 'runtime'` — suggestion chip shown to members during a chat session

`trigger_type` determines what happens when the pill/chip is activated:

| trigger_type | Behaviour |
|--------------|-----------|
| `message` | Sends a message; `payload.text` is the message body |
| `tool` | Invokes a tool call; `payload` carries the tool definition |
| `card` | Renders a card; `payload` carries the card config |

`prompt_type_key` scopes a pill/chip to a specific prompt type (null = applies
to all types). `block_id` optionally links a composer pill to a specific block.

Three platform default composer pills seeded at creation time:
- "Summarize my prompt"
- "Identify opportunities to improve"
- "Create a new block"

---

### Create `session_tokens` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
```sql
CREATE TABLE session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  created_by uuid NOT NULL REFERENCES users(id),
  token text NOT NULL UNIQUE,
  context_injection text,
  prompt_type_key text,
  chip_preload jsonb NOT NULL DEFAULT '[]',
  expires_at timestamptz,
  used_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX session_tokens_tenant_id_idx ON session_tokens(tenant_id);
CREATE INDEX session_tokens_token_idx ON session_tokens(token);
```

**Purpose:** Stores shareable URL tokens that pre-configure a chat session
before the first message. A token resolves to:
- `context_injection` — an invisible system-prompt addition (injected for the
  life of the session, not shown to the member)
- `prompt_type_key` — the prompt type to load for the session
- `chip_preload` — an array of chip definitions to surface to the member at
  session open

**Use cases:** custom deep-link URLs, QR codes, referral links, and any
scenario where the session needs to be pre-configured based on how the
visitor arrived.

**Notes:**
- `token` has a unique index for fast lookup on inbound URLs
- `expires_at` is nullable; null = never expires
- `used_count` tracks how many sessions have been initiated with this token
  (informational only — no hard limit enforced at the DB layer)
- Table is currently unpopulated; no application code reads or writes it yet.
  Created to establish the schema ahead of the feature build.

---

### Add `scope` and `prompt_type_key` columns to `blocks` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
```sql
ALTER TABLE blocks ADD COLUMN scope text NOT NULL DEFAULT 'runtime'
  CHECK (scope IN ('platform', 'composer', 'runtime'));

ALTER TABLE blocks ADD COLUMN prompt_type_key text;
```

**Purpose:**

`scope` distinguishes three categories of block:

| scope | Meaning |
|-------|---------|
| `platform` | Owned by the 2BL platform tenant; flows to all product tenants |
| `composer` | Powers the Prompt Studio Composer UI; never compiled into the runtime Sage conversation prompt |
| `runtime` | Compiles into the tenant's Sage conversation prompt (all existing blocks) |

Default is `'runtime'` so all pre-existing blocks remain valid and the
compile pipeline is unchanged without any backfill.

`prompt_type_key` links a block to a specific prompt type. Semantics:
- `null` — shared; block compiles into every prompt type for the tenant
- non-null — block only compiles into the matching `prompt_type_key`

**Notes:**
- No backfill required — `scope = 'runtime'` and `prompt_type_key = null`
  are the correct values for all existing blocks
- Compile-order logic in `/api/admin/prompt/compile` and
  `services/prompt/compile.ts` is unchanged; runtime blocks with a
  `prompt_type_key` will be filtered there once the feature is built

---

### Add `prompt_type_key` and `description` columns to `master_prompt` table
**Type:** Schema change
**Executed by:** Jeff in Supabase Studio

**SQL run:**
```sql
ALTER TABLE master_prompt ADD COLUMN prompt_type_key text;
ALTER TABLE master_prompt ADD COLUMN description text;
```

**Purpose:**

`prompt_type_key` identifies which prompt type a compiled master prompt
represents (e.g. `'base'`, `'sales'`, `'onboarding'`, `'editor'`). Existing
rows with `prompt_type_key = null` continue to behave as the default prompt —
no backfill required.

`description` is a human-readable label for the compiled prompt, surfaced in
the admin UI (e.g. "Base prompt — compiled 2026-06-18"). Optional; null for
existing rows.

**Notes:**
- The existing `key` column (added 2026-05-20) distinguishes multiple prompt
  _engines_ per tenant; `prompt_type_key` distinguishes which _type_ a
  compiled prompt serves. Both can be null for the default path.
- `master_prompt_history` rows are not altered — archived versions retain their
  shape at the time of archival.

---

## 2026-06-12

### Backfill — document `users.role` column
**Type:** Documentation backfill (column pre-existing; no new schema change)
**Executed by:** Jeff in Supabase Studio, on or before 2026-06-11 (exact date
unknown — Studio SQL Editor history unavailable)

**SQL run:** Confirmed against Studio 2026-06-12 — matches the originally
inferred SQL (from `docs/auth-service-rebuild.md` §7) exactly:
```sql
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'member';
UPDATE users SET role = 'platform_admin' WHERE clerk_id = '<admin_clerk_id>';
```

**Purpose:** Authorization lives in our DB, not the auth provider.
`'platform_admin'` drives server-side `isPlatformAdmin`
(`resolveIsPlatformAdminFromDb` in `services/auth/providers/clerk/server.ts`,
commit `841b897`); any other value or no row resolves to false, with a loud
fallback to Clerk publicMetadata only when the lookup itself fails. The admin
backfill UPDATE is required for Jeff's row — without it every privileged
server-side gate denies.

---

### Backfill — document `users.deleted_at` column
**Type:** Documentation backfill (column pre-existing; no new schema change)
**Executed by:** Jeff in Supabase Studio (exact date unknown — Studio SQL
Editor history unavailable)

**SQL run:** Confirmed against Studio 2026-06-12 — matches the originally
inferred SQL (nullable timestamptz, no default) exactly:
```sql
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
```

**Purpose:** Soft-delete stamp on platform users. Set by the Clerk webhook
(`/api/webhooks/clerk`) on `user.deleted`, alongside `members.status =
'deleted'` and — since 2026-06-11 — `users.status = 'deleted'` (see that
entry). Nullable; null = live user. The 2026-06-11 `users.status` backfill
keyed off this column (`UPDATE users SET status = 'deleted' WHERE deleted_at
IS NOT NULL`).

---

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
