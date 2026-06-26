# Prompt Schema Design — Reference

**Date:** 2026-06-25  
**Status:** Target state — partially implemented (see Cleanup Needed)

---

## The Problem We're Solving

Different tenant surfaces (visitor chat, member chat, onboarding, etc.) need different compiled prompts. The system needs to know which compiled prompt to load at runtime based on what type of experience is starting.

Nothing should be hardcoded. Every prompt is built from blocks, compiled, and stored. Every surface has a fallback — the last compiled prompt for that context.

---

## Terminology

- **`id`** — always a UUID primary key
- **`prompt_set_id`** — a UUID FK pointing at `prompt_sets.id`. Used on `blocks` and `master_prompt` to link to a prompt set. Everything is `id` — no more `key` naming.
- **`prompt_type_id`** — a UUID FK pointing at `prompt_types.id`. Used on `prompt_sets` to categorize what type the set is.

---

## Table Definitions (Current State)

### `prompt_types`
The taxonomy of prompt types. Human categorization — used for organization and targeting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto |
| `tenant_id` | uuid | FK → tenants |
| `key` | text | e.g. `'base'`, `'sales'`, `'onboarding'` — human-readable slug |
| `name` | text | Human-readable label |
| `description` | text | What this type is for |
| `is_default` | boolean | Default type for this tenant |
| `sort_order` | integer | Display order |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

---

### `prompt_sets`
A named collection of blocks belonging to a tenant. Has a type.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto |
| `tenant_id` | uuid | FK → tenants |
| `label` | text | e.g. "Sage — Production" |
| `description` | text | What this set is for |
| `status` | text | `'live'` or `'draft'` (always lowercase) |
| `is_master` | boolean | Platform-level flag — this set powers the Composer block-building assistant |
| `prompt_type_id` | uuid | FK → prompt_types.id — categorizes what type this set is |
| `version` | integer | Auto-incremented on compile — read-only in UI |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

---

### `blocks`
Individual prompt instructions belonging to a prompt set.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto |
| `tenant_id` | uuid | FK → tenants |
| `prompt_set_id` | uuid | FK → prompt_sets.id |
| `type` | text | guardrail / identity / process / knowledge / escalation |
| `title` | text | Block name |
| `body` | text | Block content |
| `scope` | text | `'platform'` / `'composer'` / `'runtime'` |
| `status` | text | active / disabled / deleted |
| `order` | integer | Compile order within type |
| `conversation_id` | uuid | FK → prompt_conversations — which Composer session produced this block |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

---

### `compiled_prompts` (currently named `master_prompt`)
The assembled output of compiling a prompt set. Auto-versioned on each compile. This is what gets loaded at runtime.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto |
| `tenant_id` | uuid | FK → tenants |
| `prompt_set_id` | uuid | FK → prompt_sets.id — which set this was compiled from |
| `content` | text | The full assembled system prompt |
| `version` | integer | Auto-incremented on each compile |
| `description` | text | Human-readable label |
| `last_safety_check` | timestamptz | When safety check last ran |
| `safety_check_result` | jsonb | Result of last safety check |
| `updated_at` | timestamptz | Auto |

---

### `compiled_prompts_history` (currently named `master_prompt_history`)
Every previous compiled version, archived on each compile.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto |
| `prompt_id` | uuid | FK → compiled_prompts.id |
| `tenant_id` | uuid | FK → tenants |
| `content` | text | The archived system prompt content |
| `version` | integer | The version that was archived |
| `created_at` | timestamptz | When this version was archived |

---

## Runtime Flow

1. Session starts (widget opens or new chat begins)
2. System resolves: which tenant + which prompt_set_id is this session?
3. Loads the `compiled_prompts` row for that tenant matching the `prompt_set_id`
4. Sends the compiled content to Claude as the system prompt
5. Fallback: if no matching compiled prompt exists, use the previous compiled version

---

## Build-Time Flow

1. Admin builds blocks in the Composer, organized into a prompt set
2. Admin compiles the prompt set
3. Current compiled prompt is archived to `compiled_prompts_history`
4. New compiled prompt is written to `compiled_prompts` with version + 1
5. Runtime immediately picks up the new compiled prompt

---

## Cleanup Needed

- [ ] Rename `master_prompt` → `compiled_prompts`
- [ ] Rename `master_prompt_history` → `compiled_prompts_history`
- [ ] Update all code references from `master_prompt` → `compiled_prompts`
- [ ] Update all code references from `prompt_type_key` / `prompt_set_key` → `prompt_set_id`
- [ ] Fix `getSystemPrompt` — remove broken `prompt_type_key IS NULL` filter
- [ ] Remove `promptType` parameter from `ChatStreamRequest` and `streamChat`

---

## Done

- [x] Added `prompt_type_id` (UUID FK → `prompt_types.id`) to `prompt_sets` — **2026-06-25**
- [x] Added `prompt_sets_single_master_idx` partial unique index — enforces single platform master — **2026-06-25**
- [x] Created `touch_updated_at()` function and `prompt_sets_touch_updated_at` trigger — **2026-06-25**
- [x] Dropped `blocks.prompt_set_id` (empty ghost column) — **2026-06-25**
- [x] Renamed `blocks.prompt_type_key` → `blocks.prompt_set_key` → `blocks.prompt_set_id` — **2026-06-25**
- [x] Renamed `master_prompt.prompt_type_key` → `master_prompt.prompt_set_key` then dropped (ghost, `prompt_set_id` already existed) — **2026-06-25**
