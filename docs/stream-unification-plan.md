# Stream Unification Plan

**Date:** 2026-06-23  
**Branch:** `claude/gallant-feynman-ck8hcw`  
**Author:** Claude Code (from read-only analysis — no implementation yet)

---

## 1. Current State

### 1.1 Streaming paths

There are **three independent streaming paths** today. None share transport logic.

---

#### Path A — `streamChat` (production visitor/member chat)

**Entrypoint:** `services/chat/server/index.ts` → `streamChat(req: ChatStreamRequest)`

**Called by:**
- `app/api/sage/route.ts` (POST `/api/sage`) — the only route that calls this today

**What it does:**
1. Normalizes messages (empty array → synthetic `Hi`; leading assistant message → prepend `Hi`)
2. Resolves four async dependencies in parallel:
   - `getSystemPrompt(tenantId)` — `services/prompt/compiler.ts`: reads highest-version `master_prompt` row for the tenant, falls back to `DEFAULT_SYSTEM_PROMPT`
   - `getBookingCardSection(tenantId)` — `services/chat/server/booking.ts`: reads `sage_parameters` rows and renders a `[BOOKING: …]` section
   - `resolveModelConfig(tenantId)` — `services/chat/server/stream.ts`: reads `tenant_model_config` row, falls back to `claude-sonnet-4-6` / defaults
   - `getMemberPrimer(sessionId, tenantId, memberId)` — `services/chat/server/member-context.ts`: reads `members.primer` (one-shot, stamps `primer_used_at`), builds name/email/phone context lines and `[NAME:]/[EMAIL:]/[PHONE:]` marker instructions
3. Assembles the system prompt: `[basePrompt, bookingSection, memberPrimer, questionModeContext]` joined with `\n\n`, empty segments filtered
4. Calls `runChatStream({ config, system, messages, onFinish })` — `services/chat/server/stream.ts`
5. In `onFinish`: calls `handleSessionFinish({ sessionId, text, usage, visitorText })` — `services/crm/session.ts`

**`runChatStream`** (`services/chat/server/stream.ts`):
- Calls `getModelInstance(provider, modelId)` to resolve an AI SDK model instance
- Calls `streamText({ model, system, messages, maxTokens, onFinish })` via Vercel AI SDK
- Returns `result.toDataStreamResponse()` — the frozen `/api/sage` wire format

**`ChatStreamRequest` type** (`services/chat/server/types.ts`):
```typescript
interface ChatStreamRequest {
  messages: ChatMessage[]
  mode?: ChatMode                // 'question' | null
  sessionId?: string | null
  memberId?: string | null       // direct members.id (pre-auth invite path)
  tenant: ChatTenantContext      // { tenantId: string | null }
}
```
No `prompt_type`, no `mediaItems`, no `documentContext`.

---

#### Path B — `streamBlocksComposer` (admin Prompt Studio block composer)

**Entrypoint:** `services/prompt/composer.ts` → `streamBlocksComposer(input: BlocksComposerInput)`

**Called by:**
- `app/api/admin/blocks/chat/route.ts` (POST `/api/admin/blocks/chat`)

**What it does:**
1. Accepts `{ type, topic, content_type, content, messages, documentContext?, existingBlocks? }`
2. Builds the system prompt by appending optional sections to the hardcoded `BLOCKS_COMPOSER_SYSTEM` string:
   - `documentContext` → `\n\nThe owner has uploaded a document. Here is its content:\n\n${documentContext}\n\nUse this to suggest relevant blocks.`
   - `existingBlocks` → `\n\nHere are the owner's existing blocks:\n\n${blocks}\n\nDo not duplicate existing blocks.`
3. Calls `streamText` directly via `anthropic('claude-sonnet-4-6')` — **hardcoded model, no tenant config**
4. Returns `result.toDataStreamResponse()`
5. Catches errors and returns a `502` Response

**No `runChatStream` call.** No `resolveModelConfig`. No `onFinish` lifecycle.

---

#### Path C — `streamPromptChat` (admin prompt-builder chat assistant)

**Entrypoint:** `services/prompt/composer.ts` → `streamPromptChat(input: PromptChatInput)`

**Called by:**
- `app/api/admin/prompt-chat/route.ts` (POST `/api/admin/prompt-chat`)

**What it does:**
1. Accepts `{ messages, systemContext }` — `systemContext` is the current prompt builder content, injected into the system prompt
2. Constructs a hardcoded assistant persona system prompt with `systemContext` interpolated at the end
3. Calls `streamText` directly via `anthropic('claude-sonnet-4-6')` — **hardcoded model, no tenant config**
4. Returns `result.toDataStreamResponse()`
5. Catches errors and returns a `502` Response

**No `runChatStream` call.** No `resolveModelConfig`. No `onFinish` lifecycle.

---

### 1.2 Supporting modules referenced by the paths above

| Module | File | Purpose |
|--------|------|---------|
| `runChatStream` | `services/chat/server/stream.ts` | Thin wrapper: `streamText` → `toDataStreamResponse`. Used only by Path A. |
| `resolveModelConfig` | `services/chat/server/stream.ts` | Reads `tenant_model_config`; falls back to defaults. Used only by Path A. |
| `getModelInstance` | `services/chat/server/stream.ts` | Maps `(provider, modelId)` → AI SDK model instance. |
| `getSystemPrompt` | `services/prompt/compiler.ts` (re-exported via `services/chat/server/prompt.ts`) | Reads highest-version `master_prompt` row. No `prompt_type_key` filter. |
| `QUESTION_MODE_CONTEXT` | `services/prompt/compiler.ts` | Static string appended when `mode === 'question'`. |
| `getBookingCardSection` | `services/chat/server/booking.ts` | Reads `sage_parameters`, renders `[BOOKING: …]` section. |
| `getMemberPrimer` | `services/chat/server/member-context.ts` | One-shot member primer from `members.primer`. |
| `compilePrompt` | `services/prompt/compile.ts` | Fetches active blocks, sorts by compile order, persists to `master_prompt`. No `scope` filter. No `prompt_type_key` filter. |
| `readDataStream` | `services/chat/server/stream-utils.ts` | **Client-side** stream reader (accumulates text deltas). Used by `useChatTurn.ts` and the admin composer clients — not server-side. |

---

### 1.3 Media service (not yet connected to streaming)

The media service (`services/media/`) is a fully built async processing pipeline:

1. Client calls `POST /api/media/upload-url` → creates a `media_items` row at `status=pending`, returns a signed Supabase Storage URL
2. Client PUTs the binary directly to Supabase Storage
3. Supabase triggers `POST /api/webhooks/media-process` → `processMediaItem` in `services/media/processor.ts`
4. Processor runs type-specific extraction:
   - `audio` → Deepgram nova-3 transcription → `derived_content = transcript`
   - `image` → Claude Haiku vision → `derived_content = caption + extracted_text`
   - `document` → `extractText` (PDF via Anthropic doc API / DOCX via mammoth / TXT direct) → `derived_content = rawText`
5. `media_items.status` flips to `ready`, `derived_content` is written

**Connection to chat today:**
- `ChatInput.tsx` sends `[MEDIA_UPLOAD: filename | mediaItemId | type]` markers in the **user message** when attachments are included
- `chatStore.tsx` tracks `mediaItems` in React state via Realtime subscription + polling; used by `MediaGallery.tsx` to display `derived_content` to the user
- **`streamChat` ignores `[MEDIA_UPLOAD:]` markers entirely** — it never reads `media_items` rows and never injects `derived_content` into the system prompt or messages
- There is no server-side resolution of `derived_content` on any chat turn; the AI sees the raw `[MEDIA_UPLOAD: filename | id | type]` marker string and nothing more

---

## 2. Gap Analysis

### Gap 1 — `derived_content` is never injected into the model context

**What exists:** The processor writes high-quality `derived_content` (transcript, image caption, document text) to `media_items`. The client sends `[MEDIA_UPLOAD: filename | id | type]` in the user message.

**What's missing:** `streamChat` does not look up `derived_content` from `media_items` rows referenced in the user message. The model receives a marker string but not the actual content it refers to. The AI cannot use uploaded media as context.

**What the target requires:** When the incoming user message contains one or more `[MEDIA_UPLOAD: …]` markers and the referenced items are `status=ready`, `streamChat` should:
1. Parse the markers from the latest user message
2. Fetch `derived_content` from `media_items` for each `id` (service-role, tenant-scoped)
3. Inject them as a `MEDIA CONTEXT` section into the system prompt (or as a prefixed user message turn — to be decided)
4. Strip the raw marker from the user turn so the model doesn't see the bracket syntax

This capability is purely Heirloom-origin today (the `ChatInput` and media pipeline exist only in the membership shell) but the injection logic belongs in `streamChat`, not in Heirloom-specific code, so it works for any future consumer.

---

### Gap 2 — `compiler.ts` ignores `prompt_type_key`

**What exists:** `master_prompt` rows have a `prompt_type_key` column (nullable — `null` = default prompt). The schema also has a `prompt_types` table and `session_tokens` rows can carry a `prompt_type_key`.

**What's missing:** `getSystemPrompt(tenantId)` reads the single highest-version row with `ORDER BY version DESC LIMIT 1` and **does not filter by `prompt_type_key`**. There is no way to route a chat turn to a non-default compiled prompt variant.

**What the target requires:** `getSystemPrompt(tenantId, promptTypeKey?)` — when `promptTypeKey` is provided, filter by `prompt_type_key = promptTypeKey`; when absent, filter by `prompt_type_key IS NULL` (the default slot).

---

### Gap 3 — `compile.ts` ignores `scope` and `prompt_type_key`

**What exists:** Blocks have a `scope` column (`platform | composer | runtime`, default `runtime`) and a `prompt_type_key` column (nullable). The compile step is supposed to:
- Exclude `scope = 'composer'` blocks from the runtime compiled prompt
- Include `scope = 'platform'` blocks (2BL-owned defaults) alongside `scope = 'runtime'` tenant blocks
- When compiling for a specific prompt type, include blocks matching that key plus blocks where `prompt_type_key IS NULL` (shared)

**What's missing:** `compilePrompt` fetches all blocks where `status = 'active'` and `tenant_id = tenantId` — no `scope` filter, no `prompt_type_key` filter. `composer`-scoped blocks (used as action pills in Prompt Studio) are compiled into the master prompt today if they are set to `status = 'active'`.

**What the target requires:** 
- `scope` filter: `scope IN ('runtime', 'platform')` or explicitly exclude `scope = 'composer'`
- `prompt_type_key` filter: compile only blocks where `prompt_type_key = targetKey OR prompt_type_key IS NULL`
- `compilePrompt` should accept an optional `promptTypeKey` argument

---

### Gap 4 — `streamChat` has no `prompt_type` parameter

**What exists:** `ChatStreamRequest` has `mode`, `sessionId`, `memberId`, `tenant`.

**What's missing:** There is no way for a caller to say "use the `sales` prompt variant" or "use the `onboarding` prompt variant." All turns always use the default (`prompt_type_key IS NULL`) master prompt.

**What the target requires:** Add `promptType?: string | null` to `ChatStreamRequest`. When set, pass it to `getSystemPrompt(tenantId, promptType)`. The `/api/sage` route can resolve it from the `session_tokens.prompt_type_key` lookup (when that feature is built) or from the request body.

---

### Gap 5 — Transport logic lives in `services/prompt/composer.ts`

**What exists:** `streamBlocksComposer` and `streamPromptChat` call `streamText` directly. They hardcode `anthropic('claude-sonnet-4-6')`. They bypass `resolveModelConfig`, `getModelInstance`, and `runChatStream`.

**What's missing:** Per the target state, no streaming transport should live in the prompt service. The prompt service provides system-prompt content; the chat service owns the transport.

**What the target requires:** `composer.ts` exposes `buildBlocksComposerSystem(input)` and `buildPromptChatSystem(input)` — pure functions that return a `{ system: string, messages: ChatMessage[] }` shape. The route handler (or a thin wrapper in `services/chat/server`) calls `runChatStream` with those outputs.

Note: this is a low-risk refactor. The wire format (`toDataStreamResponse`) is unchanged. The only observable difference is that the admin composer routes now share the same 502 error shape and model resolution logic as Path A.

---

### Gap 6 — `documentContext` / `existingBlocks` are stranded in `composer.ts`

**What exists:** `streamBlocksComposer` accepts `documentContext` (admin-uploaded doc text) and `existingBlocks` (current block list). These are Prompt Studio–specific context injections.

**What's missing:** There is no equivalent mechanism in `streamChat` for a caller to inject a document or existing-blocks context into a chat turn. If a member-facing composer surface were built in a product shell, it would need to call `composer.ts` directly rather than going through `streamChat`.

**What the target requires:** `streamChat` accepts optional `documentContext?: string | null` and `existingBlocks?: { title: string; type: string; body: string }[] | null`. These are assembled into a context section only when provided. `composer.ts` becomes a pure prompt-assembly module that returns strings, not a streaming function.

---

## 3. Target State

### 3.1 `streamChat` — unified orchestrator

**Location:** `services/chat/server/index.ts` (same file, extended)

**Extended `ChatStreamRequest`:**

```typescript
interface ChatStreamRequest {
  messages: ChatMessage[]
  mode?: ChatMode                        // existing: 'question' | null
  sessionId?: string | null              // existing
  memberId?: string | null               // existing
  tenant: ChatTenantContext              // existing: { tenantId: string | null }
  promptType?: string | null             // NEW: routes compiler to right block set
  mediaItems?: MediaAttachmentInput[]    // NEW: derived_content injection
  documentContext?: string | null        // NEW: moved from composer.ts (Prompt Studio)
  existingBlocks?: ExistingBlockInput[]  // NEW: moved from composer.ts (Prompt Studio)
}

interface MediaAttachmentInput {
  mediaItemId: string
  filename: string
  type: 'audio' | 'image' | 'document'
}

interface ExistingBlockInput {
  title: string
  type: string
  body: string
}
```

**System prompt assembly order (all segments filter-joined with `\n\n`):**

1. `basePrompt` — from `getSystemPrompt(tenantId, promptType)` (extended)
2. `bookingSection` — from `getBookingCardSection(tenantId)` (unchanged)
3. `memberPrimer` — from `getMemberPrimer(sessionId, tenantId, memberId)` (unchanged)
4. `mediaContext` — NEW: built from `resolveMediaContext(mediaItems, tenantId)` — fetches `derived_content` for each referenced item that is `status=ready`, formats as a labeled section
5. `documentContext` — NEW: passed through from caller when present
6. `existingBlocksContext` — NEW: formatted from `existingBlocks` when present
7. `questionModeContext` — existing: `QUESTION_MODE_CONTEXT` when `mode === 'question'`

**`resolveMediaContext`** (new, in `services/chat/server/media-context.ts` or inline):
- Accepts `mediaItems: MediaAttachmentInput[]` and `tenantId: string`
- Fetches `media_items` rows for those IDs (service-role, `eq('tenant_id', tenantId)`)
- For each `status=ready` row, formats: `[filename (type)]\n${derived_content}`
- Returns a section string prefixed `ATTACHED MEDIA:\n\n` or `''` when no ready items

---

### 3.2 `services/prompt/composer.ts` — prompt-assembly only

Loses all streaming/transport logic. Becomes pure functions:

```typescript
// Returns the assembled system prompt string + formatted messages — no streamText call
export function buildBlocksComposerSystem(input: BlocksComposerInput): string
export function buildPromptChatSystem(input: PromptChatInput): string
```

The route handlers call `runChatStream` directly:
```typescript
// app/api/admin/blocks/chat/route.ts
const system = buildBlocksComposerSystem(body)
return runChatStream({ config: defaultConfig, system, messages: body.messages, maxTokens: 4000 })

// app/api/admin/prompt-chat/route.ts
const system = buildPromptChatSystem(body)
return runChatStream({ config: defaultConfig, system, messages: body.messages, maxTokens: 800 })
```

Where `defaultConfig` = `{ provider: 'anthropic', chatModel: 'claude-sonnet-4-6', ... }`. No tenant config resolution for admin composer routes (they are platform-internal, not tenant-scoped).

---

### 3.3 `compiler.ts` and `compile.ts` — filtered by scope and prompt_type_key

**`compiler.ts` — `getSystemPrompt` signature change:**

```typescript
export async function getSystemPrompt(
  tenantId: string | null,
  promptTypeKey?: string | null,   // NEW
): Promise<string>
```

Query change:
```sql
-- current
SELECT content FROM master_prompt
WHERE tenant_id = $tenantId
ORDER BY version DESC LIMIT 1

-- target (when promptTypeKey is null/absent → default slot)
SELECT content FROM master_prompt
WHERE tenant_id = $tenantId AND prompt_type_key IS NULL
ORDER BY version DESC LIMIT 1

-- target (when promptTypeKey is provided)
SELECT content FROM master_prompt
WHERE tenant_id = $tenantId AND prompt_type_key = $promptTypeKey
ORDER BY version DESC LIMIT 1
```

**`compile.ts` — `compilePrompt` signature change:**

```typescript
export async function compilePrompt(
  tenantId: string,
  promptTypeKey?: string | null,   // NEW — null compiles the default slot
): Promise<CompileResult>
```

Block fetch change:
```sql
-- current
SELECT id, title, type, body, order FROM blocks
WHERE tenant_id = $tenantId AND status = 'active'

-- target
SELECT id, title, type, body, order, scope, prompt_type_key FROM blocks
WHERE tenant_id = $tenantId
  AND status = 'active'
  AND scope IN ('runtime', 'platform')                        -- NEW: exclude composer
  AND (prompt_type_key IS NULL OR prompt_type_key = $key)    -- NEW: shared + type-specific
```

Save change: persist `prompt_type_key` on the `master_prompt` row so the runtime query can filter it.

---

### 3.4 `/api/sage` route — `prompt_type` pass-through

**Current body:** `{ messages, mode?, session_id?, member_id? }`

**Target body:** `{ messages, mode?, session_id?, member_id?, prompt_type?, media_items? }`

```typescript
// where media_items is:
{ mediaItemId: string; filename: string; type: string }[]
```

Route resolves `prompt_type` from the body (later: from `session_tokens.prompt_type_key` lookup). Passes `mediaItems` directly to `streamChat`.

---

## 4. Migration Steps

Each step is independently deployable without breaking existing consumers. Steps are ordered by dependency — each step's preconditions are met by prior steps.

---

### Step 1 — Split `composer.ts`: extract `runChatStream` calls into route handlers

**What changes:**
- `streamBlocksComposer` renamed to `buildBlocksComposerSystem`, returns `string` instead of `Promise<Response>`
- `streamPromptChat` renamed to `buildPromptChatSystem`, returns `string` instead of `Promise<Response>`
- `app/api/admin/blocks/chat/route.ts` imports `buildBlocksComposerSystem` + `runChatStream`; builds the system prompt, calls `runChatStream` with a hardcoded `defaultAdminConfig`
- `app/api/admin/prompt-chat/route.ts` imports `buildPromptChatSystem` + `runChatStream`; same pattern
- `services/prompt/index.ts` updates its exports accordingly

**Files changed:** `services/prompt/composer.ts`, `app/api/admin/blocks/chat/route.ts`, `app/api/admin/prompt-chat/route.ts`, `services/prompt/index.ts`

**Existing consumers that must keep working:** `/api/admin/blocks/chat` and `/api/admin/prompt-chat` — wire format unchanged, same model, same `maxTokens`.

**Verification:** Admin Prompt Studio composer and prompt-builder chat continue to stream responses. No behavioral difference visible to users.

---

### Step 2 — Add `scope` filter to `compile.ts`

**What changes:**
- `compilePrompt` block fetch adds `.in('scope', ['runtime', 'platform'])` (or equivalently `.not('scope', 'eq', 'composer')`)
- No signature change — `promptTypeKey` is not added yet; that's Step 4

**Files changed:** `services/prompt/compile.ts`

**Precondition:** The `scope` column exists and has default `'runtime'` (documented in CLAUDE.md — schema already in Supabase). All pre-existing blocks have `scope = 'runtime'` by default. No backfill needed.

**Existing consumers that must keep working:** `/api/admin/prompt/compile` — behavior unchanged for any tenant that has no `scope = 'composer'` blocks. If a tenant has composer-scoped blocks set to `active`, those are currently incorrectly included in compiled prompts; this step fixes that.

**Verification:** Compile a prompt in the admin Prompt Studio. Confirm the result matches expectations. Check that any composer-scoped blocks are excluded.

---

### Step 3 — Add `promptType` parameter to `getSystemPrompt` and wire into `streamChat`

**What changes:**
- `compiler.ts` `getSystemPrompt(tenantId, promptTypeKey?)` — adds optional second parameter; when absent, filters `prompt_type_key IS NULL`; when provided, filters by the key
- `services/chat/server/prompt.ts` re-export updated to include the new signature
- `services/chat/server/types.ts` adds `promptType?: string | null` to `ChatStreamRequest`
- `services/chat/server/index.ts` `streamChat` passes `req.promptType` to `getSystemPrompt`
- `/api/sage/route.ts` reads `body.prompt_type` from the request and passes it to `streamChat`

**Files changed:** `services/prompt/compiler.ts`, `services/chat/server/prompt.ts`, `services/chat/server/types.ts`, `services/chat/server/index.ts`, `app/api/sage/route.ts`

**Precondition:** Requires that existing `master_prompt` rows have `prompt_type_key = NULL` (the default slot). If any row was inserted with a non-null key before this step, those rows will be invisible to the existing callers — not a regression since they are unreachable today anyway.

**Existing consumers that must keep working:** All existing chat sessions use `promptType = null`, so they still hit `prompt_type_key IS NULL` — the default slot. No behavioral change for `/api/sage` unless a caller explicitly passes `prompt_type`.

**Verification:** Send a chat request without `prompt_type` — behavior unchanged. Confirm the runtime query now includes a `prompt_type_key IS NULL` filter (check logs).

---

### Step 4 — Add `prompt_type_key` parameter to `compile.ts`

**What changes:**
- `compilePrompt(tenantId, promptTypeKey?)` — adds optional second parameter
- Block fetch adds `prompt_type_key` to the SELECT list
- Block filter: `AND (prompt_type_key IS NULL OR prompt_type_key = $promptTypeKey)` when provided; `AND prompt_type_key IS NULL` when absent
- The `master_prompt` upsert writes `prompt_type_key` on the saved row (currently not written; needs `INSERT ... (prompt_type_key)` change)
- `/api/admin/prompt/compile` route reads optional `prompt_type_key` from request body and passes to `compilePrompt`

**Files changed:** `services/prompt/compile.ts`, `app/api/admin/prompt/compile/route.ts`

**Precondition:** Step 2 (scope filter) must be in place. The `prompt_types` table must be populated by Jeff in Studio for any non-null keys to be useful — but the code change is safe regardless (null is the default).

**Existing consumers that must keep working:** `/api/admin/prompt/compile` — when called without `prompt_type_key`, compiles all `runtime`/`platform` blocks with `prompt_type_key IS NULL`, saving to the `prompt_type_key = NULL` slot. This is exactly the current behavior (modulo the Step 2 scope filter).

**Verification:** Compile a prompt from the admin UI. Confirm the saved `master_prompt` row has `prompt_type_key = NULL`. Confirm `version` increments as before.

---

### Step 5 — Add `mediaItems` to `ChatStreamRequest` and wire `resolveMediaContext`

**What changes:**
- `services/chat/server/media-context.ts` (new file): `resolveMediaContext(mediaItems, tenantId)` — fetches `derived_content` from `media_items` for referenced IDs, builds a `ATTACHED MEDIA:\n\n` section string
- `services/chat/server/types.ts` adds `MediaAttachmentInput` interface and `mediaItems?: MediaAttachmentInput[] | null` to `ChatStreamRequest`
- `services/chat/server/index.ts` adds `resolveMediaContext` to the parallel Promise.all block; adds `mediaContext` to the system prompt assembly array
- `/api/sage/route.ts` parses `body.media_items` from request body and passes to `streamChat`

**Files changed:** `services/chat/server/media-context.ts` (new), `services/chat/server/types.ts`, `services/chat/server/index.ts`, `app/api/sage/route.ts`

**Precondition:** None beyond Steps 1–4. The `media_items` table and its `derived_content` column exist. The Heirloom `ChatInput.tsx` already sends `[MEDIA_UPLOAD:]` markers — the route just needs to also receive `media_items` from the request body and resolve them.

**Note on client changes (out of scope for this step's server change):** The Heirloom `ChatInput.tsx` currently sends markers in the user message text but does NOT send a separate `media_items` array in the `/api/sage` POST body. A companion client-side change is needed to pass `media_items` in the body alongside `messages`. This is a coordinated change: the server-side `resolveMediaContext` is a no-op until the client sends the array.

**Existing consumers that must keep working:** All existing `/api/sage` callers — `media_items` is optional; when absent, `resolveMediaContext` short-circuits and returns `''`. No behavioral change for jefflougheed.ca or any caller that doesn't send `media_items`.

**Verification:** Upload a document in Heirloom chat, wait for `status = ready`, then send a message that references it. Confirm the model's response reflects knowledge of the document content.

---

### Step 6 — Add `documentContext` / `existingBlocks` to `ChatStreamRequest` (optional, low priority)

**What changes:**
- `services/chat/server/types.ts` adds `documentContext?: string | null` and `existingBlocks?: ExistingBlockInput[] | null`
- `services/chat/server/index.ts` includes them in the system prompt assembly (after `mediaContext`, before `questionModeContext`)
- No route change needed yet — these are admin-only inputs, not passed via `/api/sage`

**Files changed:** `services/chat/server/types.ts`, `services/chat/server/index.ts`

**Existing consumers that must keep working:** All existing callers — both fields are optional and default to empty.

**Note:** This step is a prerequisite only if a product shell (not the admin Prompt Studio) ever needs to inject document context into a `streamChat` turn. The admin composer routes already have this via `buildBlocksComposerSystem`. This step is marked optional until a concrete need exists.

---

## 5. Do-Not-Break List

Every existing consumer of every streaming function, mapped to the step that touches it.

| Consumer | Streaming function called | Step that touches it | Risk mitigation |
|----------|--------------------------|---------------------|-----------------|
| `app/api/sage/route.ts` | `streamChat` | Steps 3, 5 | `promptType` defaults to null (no-op); `mediaItems` is optional (no-op when absent) |
| `app/api/admin/blocks/chat/route.ts` | `streamBlocksComposer` | Step 1 | Wire format (`toDataStreamResponse`) unchanged; `maxTokens=4000` preserved; hardcoded model unchanged |
| `app/api/admin/prompt-chat/route.ts` | `streamPromptChat` | Step 1 | Wire format unchanged; `maxTokens=800` preserved; hardcoded model unchanged |
| `app/api/admin/prompt/compile/route.ts` | `compilePrompt` | Steps 2, 4 | Step 2: scope filter is additive (pre-existing rows have `scope='runtime'`); Step 4: key defaults to null |
| `services/chat/ui/v1/useChatTurn.ts` | Reads `readDataStream` (client-side) | Not touched | `readDataStream` is not modified in any step |
| `app/admin/prompt-builder/page.tsx` | Reads `readDataStream` (client-side) | Not touched | Same as above |
| `components/admin/PromptBuilderChat.tsx` | Reads `readDataStream` (client-side) | Not touched | Same as above |
| `components/shells/membership/chatStore.tsx` | Sends to `/api/sage` | Step 5 (client companion) | Currently sends no `media_items` array; companion client change is a separate, coordinated deploy |
| `components/shells/membership/ChatInput.tsx` | Sends `[MEDIA_UPLOAD:]` marker in messages | Step 5 (client companion) | Marker is currently ignored server-side — no regression until client companion lands |

### Additional safeguards

- **`streamChat` `502` error shape:** `runChatStream` wraps the `streamText` call; the `streamChat` caller's `try/catch` converts errors to `502`. Steps 1 and later preserve this path exactly.
- **`compiler.ts` fallback:** `getSystemPrompt` always falls back to `DEFAULT_SYSTEM_PROMPT` on any error. Steps 3 adds a `prompt_type_key IS NULL` clause — if the query returns no row, the fallback fires exactly as before.
- **`compile.ts` exclusions:** Adding the scope filter in Step 2 only removes blocks; it never causes a compile error. If no blocks match, the existing `'No active blocks to compile'` 400 response fires — the same as today.
- **Wire format is frozen:** The `/api/sage` response is Vercel AI SDK `toDataStreamResponse`. None of these steps change `runChatStream` or `toDataStreamResponse`. The client-side `readDataStream` reader continues to work unchanged.

---

## Appendix — File Paths Read

All files listed below were read in full during analysis for this plan. No code was written.

**Chat service — server:**
- `services/chat/server/index.ts`
- `services/chat/server/stream.ts`
- `services/chat/server/stream-utils.ts`
- `services/chat/server/types.ts`
- `services/chat/server/prompt.ts`
- `services/chat/server/booking.ts`
- `services/chat/server/member-context.ts`

**Prompt service:**
- `services/prompt/compiler.ts`
- `services/prompt/compile.ts`
- `services/prompt/composer.ts`
- `services/prompt/index.ts`

**Media service:**
- `services/media/index.ts`
- `services/media/types.ts`
- `services/media/processor.ts`
- `services/media/storage.ts`
- `services/media/useMediaUpload.ts`

**Route handlers:**
- `app/api/sage/route.ts`
- `app/api/admin/blocks/chat/route.ts`
- `app/api/admin/prompt-chat/route.ts`
- `app/api/media/upload-url/route.ts`
- `app/api/media/route.ts`
- `app/api/media/[id]/retry/route.ts`
- `app/api/events/media/route.ts`
- `app/api/webhooks/media-process/route.ts`

**Shell components (for media integration context):**
- `components/shells/membership/ChatInput.tsx`
- `components/shells/membership/chatStore.tsx`
- `components/shells/membership/MediaGallery.tsx`

**No Heirloom-specific chat route exists** (`app/api/heirloom/chat/` — not found). All Heirloom chat goes through `/api/sage`.
