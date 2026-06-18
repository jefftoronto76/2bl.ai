# Prompt Studio / Composer — Research Report

> Read-only investigation as of 2026-06-18. No changes proposed.

---

## 1. Composer UI Route

**File:** `app/admin/prompt-builder/page.tsx` (1,425 lines)
**Route:** `/admin/prompt-builder` (nav label: "Composer")
**Type:** `'use client'` component — all state lives here, no server component wrapper.

The page has two visual states:
- **Empty state** (no messages yet): golden-ratio-positioned greeting + three choice buttons + composer textarea
- **Active state** (after first send): scrollable chat thread + pinned composer at bottom + draft block cards

Supporting admin pages in `app/admin/prompt-studio/`:
- `/prompt-studio/blocks` — block management table
- `/prompt-studio/prompt` — read-only compiled prompt display
- `/prompt-studio/assets` — uploaded documents
- `/prompt-studio/history` — composer session history

---

## 2. Anthropic API Communication

**Primary streaming route:** `POST /api/admin/blocks/chat`
**Route file:** `app/api/admin/blocks/chat/route.ts` (19 lines — thin shell, ANTHROPIC_API_KEY guard + JSON parse only)
**Service function:** `streamBlocksComposer(input: BlocksComposerInput)` in `services/prompt/composer.ts`
**SDK:** `streamText` from `ai` (Vercel AI SDK), model `anthropic('claude-sonnet-4-6')`, `maxTokens: 4000`
**Wire format:** `result.toDataStreamResponse()` — client reads via `readDataStream()` in `services/chat/server/stream-utils.ts`

**Safety check (non-streaming):** `POST /api/admin/prompt/compile/check`
**Service function:** `reviewBlockBody(blockBody)` in `services/prompt/safety.ts`
**SDK:** `generateText`, model `anthropic('claude-sonnet-4-6')`, `maxTokens: 700`

**Legacy prompt assistant:** `POST /api/admin/prompt-chat` → `streamPromptChat()` in `services/prompt/composer.ts`
Model: `anthropic('claude-sonnet-4-6')`, `maxTokens: 800`. This backs an older admin interface (`components/admin/PromptBuilderChat.tsx`); the current Composer page does NOT call this route.

---

## 3. System Prompts — All Three Actions

All three opening choices send to `POST /api/admin/blocks/chat` (same endpoint) and share the same system prompt (`BLOCKS_COMPOSER_SYSTEM`). The difference is the *hidden user message* injected at the front of the messages array.

### BLOCKS_COMPOSER_SYSTEM (`services/prompt/composer.ts` lines 38–64)

```
You are a prompt block builder for Sage, an AI sales assistant. Your job is to help the owner create well-structured prompt blocks through conversation.

A block is one focused instruction or piece of context that will be compiled into Sage's master system prompt. There are five block types:

- Identity — who Sage is, tone, personality, voice
- Knowledge — factual context about the business, owner, or services
- Guardrail — a rule or constraint on what Sage should or should not do
- Process — step-by-step instructions for how Sage should handle a specific situation
- Escalation — when and how Sage should route a visitor to a human or off-ramp

Your process:
1. ALWAYS draft first. When the owner provides any content — typed, pasted, or uploaded — immediately draft one or more blocks from it. Never ask a clarifying question before attempting a draft.
2. If the content is rich enough to warrant multiple blocks, draft all of them in sequence. Present each draft clearly with its suggested type and topic.
3. Present drafts and ask if they capture what the owner meant.
4. Refine based on feedback, then commit to a final version.
5. For each block you draft, output the block prose followed immediately by its JSON object on the next line. One JSON object per block, output immediately when drafted — do not wait for confirmation.
{"done":true,"title":"[block title]","content":"[full block text]","type":"[suggested type]","topic":"[suggested topic]"}
When relevant, include an optional "warning" field with one concise sentence describing an issue the owner should know about — for example: overlap with an existing block, missing context, or a potential conflict. Format: {"done":true,"title":"...","content":"...","type":"...","topic":"...","warning":"One concise sentence describing the issue."}. Omit the field entirely if no warning applies.
6. After the last JSON object, output a closing message of 30 words or fewer. Confirm what was built and invite the owner to save, edit, or ask for changes. Do not repeat or summarize block content. Conversational, not formal.

Rules:
- Draft first, ask later. Only ask a clarifying question if it is genuinely impossible to draft anything from the input — this is the last resort, not the default.
- Even with minimal input, attempt a draft. A rough draft the owner can react to is always better than a question.
- Write blocks in second person directed at Sage ("When a visitor asks X, you should Y...")
- One idea per block, maximum 150 words
- Always suggest the block type and topic — the owner can override in the metadata sidebar
- You have a maximum of 10 exchanges per session
```

This is augmented at call time with:
- **Document section** (when a file is uploaded): `"\n\nThe owner has uploaded a document. Here is its content:\n\n{raw}\n\nUse this to suggest relevant blocks."`
- **Existing blocks section** (always, when blocks exist): `"\n\nHere are the owner's existing blocks:\n\n- [type] title: body\n...\n\nDo not duplicate existing blocks. Suggest blocks that fill gaps or complement what exists."`

### "Summarize my prompt" — hidden trigger (`page.tsx` lines 233–237)

Two variants based on whether the owner has custom (non-default) blocks:

**If custom blocks exist:**
```
The owner has {n} existing blocks covering: {unique types}. Write a short opening message summarizing what's covered, identifying any missing block types, and suggesting what to build next. Do NOT output the done JSON. Do NOT draft any new blocks.
```

**If only default blocks exist:**
```
The owner only has default starter blocks — no custom blocks yet. Write a short opening message acknowledging the foundation is set and suggesting they customize or add blocks specific to their business. Do NOT output the done JSON. Do NOT draft any new blocks.
```

### "Identify opportunities to improve" — hidden trigger (`page.tsx` lines 239–241)

```
The owner wants to know how to improve their current prompt. Based on the existing blocks listed above, identify gaps (missing block types, weak coverage, potential conflicts) and suggest 2-3 specific improvements. Do NOT output the done JSON. Do NOT draft any new blocks.
```

### "Create a new block" — no API call (`page.tsx` lines 221–228)

The handler sets `hasOpeningChoice = true`, injects a hardcoded local assistant message, and focuses the textarea:
```
"Sounds great — to get started, just type in what you're thinking for the block."
```
The user then types and hits send, which triggers the normal flow with no hidden prompt.

### Safety check system prompt (`services/prompt/safety.ts` lines 12–31)

```
You are a safety and quality reviewer for AI prompt blocks. Review the following block and identify any issues:
1. Safety concerns — instructions that could lead to harmful, deceptive, or inappropriate behavior
2. Consistency issues — contradictions with general best practices
3. Quality issues — vague, overly broad, or potentially problematic instructions

Return ONLY a JSON object in this exact format:
{"ok": true, "issues": []}
or
{"ok": false, "issues": [{"description": "Description of issue", "offendingText": "exact text from block that caused this issue"}]}

If there are no issues, return {"ok": true, "issues": []}.
The "offendingText" must be an exact verbatim substring from the block — never paraphrase. If there is no specific text to highlight, set "offendingText" to null.
```

---

## 4. How the Compiled Master Prompt Is Passed to the Composer

**It isn't.** The Composer page does NOT fetch or use the compiled `master_prompt` table.

What it does fetch on mount (two sequential calls in separate effects):
1. `GET /api/admin/topics` → `allTopics` state (for the metadata dropdowns)
2. `GET /api/admin/blocks` → `existingBlocks` state (title, type, body of all active blocks)

The existing blocks are passed as `existingBlocks` on every `POST /api/admin/blocks/chat`, where `streamBlocksComposer()` appends them inline to `BLOCKS_COMPOSER_SYSTEM`. This is fetched once on mount and held in state — it does NOT refresh between exchanges.

The compiled master prompt (the joined versioned blob in the `master_prompt` table) is only surfaced at `/prompt-studio/prompt`, a separate read-only page.

---

## 5. Blocks Data Model

**Table:** `blocks`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → tenants | all queries scoped by this |
| `owner_id` | uuid FK → users | creator |
| `title` | text nullable | |
| `type` | text nullable | `identity` \| `knowledge` \| `guardrail` \| `process` \| `escalation` |
| `topic_id` | uuid nullable FK → topics | |
| `body` | text | the prompt instruction content |
| `source_id` | uuid nullable FK → content | link to source document/wizard row |
| `status` | text default `'active'` | `active` \| `disabled` \| `deleted` |
| `active` | boolean | legacy, kept in sync with `status` |
| `is_default` | boolean default false | platform-managed starter blocks |
| `order` | integer nullable | null/0 = unordered; >0 = explicit position within type bucket |
| `default_edited_at` | timestamptz | |
| `default_edited_by` | uuid FK → users | |
| `default_action` | text | `'edited'` \| `'deleted'` |
| `default_acknowledged` | boolean default false | |
| `default_acknowledged_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz NOT NULL default now() | auto-set by `blocks_updated_at_trigger` trigger |
| `updated_by` | uuid nullable FK → users | stamped on every PATCH |

**Compile order** (`TYPE_COMPILE_ORDER` in `services/prompt/block-types.ts`):
guardrail (1) → identity (2) → process (3) → knowledge (4) → escalation (5)

Within each type: `order > 0` sorted ascending first, then `order` null/0 sorted by title ascending.

**Related tables:**
- `topics` (`id`, `tenant_id`, `name`, `type`) — optional grouping
- `content` (`id`, `tenant_id`, `owner_id`, `name`, `type`, `raw`, `storage_path`, `block_id`) — source document or wizard session

**Service functions** (`services/prompt/blocks.ts`):
- `listActiveBlocks(tenantId)` — `status='active'`, ordered type → title
- `updateBlock(scope, id, updates: BlockUpdate)` — PATCH; stamps `updated_by`
- `createBlock(scope, input: CreateBlockInput)` — auto-creates `content` row if no `source_id`; optionally saves composer conversation to `chat_sessions`
- `duplicateBlock(scope, sourceId)` — copies with "(copy)" suffix

---

## 6. Prompts Data Model

**Table:** `master_prompt`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → tenants | |
| `key` | text nullable | supports multiple prompts per tenant (e.g. `'base'`, `'editor'`); unique constraint on `(tenant_id, key)` |
| `content` | text | the flat compiled prompt body |
| `version` | integer | incremented on each compile/save |
| `updated_at` | timestamptz | |
| `last_safety_check` | timestamptz nullable | |
| `safety_check_result` | jsonb nullable | |

**Table:** `master_prompt_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `prompt_id` | uuid FK → master_prompt | |
| `tenant_id` | uuid FK → tenants | |
| `content` | text | archived prompt body |
| `version` | integer | version number being archived |

**How prompts reference blocks:** They don't, at rest. The relationship is one-directional at compile time only:
- `POST /api/admin/prompt/compile` → `compilePrompt(tenantId)` in `services/prompt/compile.ts`
- Fetches all `status='active'` blocks for the tenant, sorts by compile order, joins bodies with `\n\n`
- Archives the prior `master_prompt` row to history, writes the new compiled blob
- The resulting `master_prompt.content` is a flat string — no block IDs are embedded

Fallback when no row exists: `DEFAULT_SYSTEM_PROMPT` from `services/prompt/sage-prompt.ts` (~180 lines, the hardcoded Sage identity/behavior/marker prompt).

---

## 7. Asset Storage

**Storage backend:** Supabase Storage, bucket `assets`
**Path pattern:** `{tenant_id}/{content_id}/{filename}`
**DB reference:** `content.storage_path` (text, nullable)

**Accepted types** (`services/content/assets.ts`, constant `ACCEPTED_TYPES`):
- `application/pdf` — extracted via Anthropic API (`claude-sonnet-4-6`, `max_tokens: 16000`)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — extracted via mammoth
- `text/plain` — read directly as UTF-8 via Node `Buffer`

**Max size:** 10 MB (`MAX_FILE_SIZE`)

**Upload flow** (`POST /api/admin/assets/upload` → `createDocumentAsset()`):
1. Route validates auth, file, size, MIME type
2. `extractText(buffer, mimeType)` extracts raw text
3. Insert `content` row (`type='document'`, `raw` = extracted text)
4. Upload original binary to Storage at `{tenant_id}/{content_id}/{filename}`
5. Update `content.storage_path`
6. Return `{ content_id, name, raw }` to the page

**How the Composer uses assets:**
- On upload, the page stores `raw` in `uploadedRaw` state and `content_id` in `contentId` state
- Every subsequent `POST /api/admin/blocks/chat` includes `documentContext: uploadedRaw` in the request body
- `streamBlocksComposer()` appends it to the system prompt as the document section
- When a block is saved, `source_id: contentId` is included in `POST /api/admin/blocks/save` to link the block to its source document
