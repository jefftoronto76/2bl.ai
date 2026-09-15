# Design — generic tool calling for the chat service

**Status:** Investigation + design. **No code written.** Nothing here is
scheduled to be built — see §7.3.
**Date:** 2026-09-15
**Pattern precedents:** `Design Handovers/traffic_cop_design_2026-09-05.md`,
`Design Handovers/identity_reconciliation_design_2026-08-16.md`
**Builds on:** `System Docs/Utilities/Chat Server.md` (turn-context / Traffic
Cop, Phase 2 shadow), `System Docs/Marker Syntax.md`,
`Design Handovers/september_2026/traffic-cop-punch-list (1).md` (Sprint 4's
open "tool call vs. marker" question is the one this document answers)

**Scope, per Jeff.** The mechanism is generic, shared platform infrastructure:
tenant-*aware* (correct for any tenant) but never tenant-*specific* in code. A
new tool's actual logic is a code change, exactly like adding a turn-context
provider. *Which* tools a tenant may use is admin-configurable data, mirroring
`prompt_types` / `prompt_type_tenants`.

**There is no confirmed first use case.** NPS is deprioritized. Memory Review's
chip / improve-pass flow was checked against its own design and does not need
tool calls — markers plus triggered turns cover it, the same way the
jefflougheed.ca symptom pills do. So this is speculative infrastructure, and
`CLAUDE.md`'s *Flexibility Over Convenience* ("we do not abstract for
hypotheticals") argues against building any of it today. The recommendation in
§7.3 follows that principle rather than arguing around it.

**Verification note.** `node_modules/` is absent in this sandbox. Every SDK
claim below was verified by downloading the exact lockfile-resolved tarballs
from npm — `ai@3.4.33`, `@ai-sdk/anthropic@0.0.39`, `@ai-sdk/ui-utils@0.0.50` —
and reading their published `dist/`. Repo claims are `file:line` against `main`
at `7214dea`. What could not be verified either way is in §9.

---

## 0. Findings that shape the design

Five things surfaced while grounding this. Three of them are latent defects that
the *first* tool call would trip, not design preferences.

### 0.1 This app has made tool calls — just never conversational ones

The brief's premise ("never made a tool call") is close but not exact, and the
difference matters. `services/media/vision-tool.ts:85` `callAnthropicTool` posts
to `https://api.anthropic.com/v1/messages` with `tools: [tool]` and
`tool_choice: { type: 'tool', name: tool.name }` (`:104-105`) — a **forced**
tool call used purely to constrain output shape. Two wrappers, `callVisionTool`
and `callTextTool`, sit on top, and `services/media/processor.ts` runs both on
every image and document upload. That is production tool use today.

What has never happened is **conversational** tool use: a model, mid-turn,
choosing to call a tool, the server running it, the result going back into the
conversation, and the model continuing. Everything on that path — `maxSteps`,
tool-call stream parts, tool results in the message history — is genuinely new.

The distinction is already written down. `vision-tool.ts:56-68` explicitly
separates itself from the marker system: markers are for "a model emitting
structured signals INLINE … during an actual conversation turn"; that file is
for "a standalone backend call with no conversation happening." **This design
adds the third case**, which neither covers: in-conversation work whose *result*
the model needs before it can finish speaking.

`vision-tool.ts` is prior art for discipline, not a module to reuse. It is a raw
`fetch`, single-tool, forced-choice, non-streaming path with its own error
ladder. Nothing in it composes with `streamText`.

### 0.2 The client already ignores every stream part except two

`services/chat/server/stream-utils.ts` `readDataStream` is **hand-rolled**, not
the SDK's. `processLine` (`:29-50`) matches exactly `^0:"(.*)"$` and
`^3:"(.*)"$`. There is no default branch, no `else`, no throw: line `:41` is
`if (!onStreamError) return`, and any line that matches neither regex falls off
the end of the function and is dropped.

Consequence, and it is the single most useful fact in this document: **adding
`9:` / `a:` / `b:` / `c:` parts to the `/api/sage` stream is non-breaking
today.** The existing client will not crash, will not corrupt the transcript,
and will not show anything odd — it will silently ignore them, exactly as it
already silently ignores the `e:` and `d:` parts every turn ends with. Client
work is needed only to *act* on tool events, never to survive them.

### 0.3 `onFinish` hands you the last step's text, not the turn's

This is the finding that would break something real.

`services/chat/server/stream.ts:137-144` passes `onFinish({ text, usage })`
through to `handleSessionFinish` (`services/crm/session.ts:494`), which scans
that `text` for `[NAME:]` / `[EMAIL:]` / `[PHONE:]` and hands it to
`recordConversionEvents`. Those scans are the **server-side fallback** required
by `CLAUDE.md`'s Marker fallback principle — pattern (1), "handleSessionFinish
detects the missed case via regex and writes the data anyway."

In `ai@3.4.33`, `streamText`'s per-step closure opens with:

```js
let fullStepText = stepType === "continue" ? previousStepText : "";
```

and the final `onFinish` is called with `text: fullStepText`. `"continue"` is
only ever the step type under `experimental_continueSteps`, which is off. So for
a tool turn — step 1 emits prose and a tool call, step 2 emits the closing prose
— `onFinish.text` contains **step 2 only**. Any marker the model emitted before
calling the tool is invisible to the fallback, even though the visitor saw it
and it is in the persisted transcript.

`usage` is unaffected: `onFinish` receives `combinedUsage`, summed across steps,
so `persistTokenUsage` (`session.ts:519`) stays correct.

The fix is cheap and already available — `onFinish` also receives
`steps: StepResult[]`, and `onStepFinish` fires per step with its own `text`:

```ts
onFinish: async ({ text, steps, usage }) => {
  const fullTurnText = steps.length > 1 ? steps.map(s => s.text).join('') : text
  // …hand fullTurnText to handleSessionFinish
}
```

**This is a gate, not a follow-up.** It must land in the same change as the
first `maxSteps > 1` call, or the first tool ships a silent regression in
contact capture. §7.2 sequences it.

### 0.4 Every tool-layer failure is a visitor-visible chat error today

`runToolsTransformation` in `ai@3.4.33` converts three separate conditions into
an `error` chunk on `fullStream`:

| Condition | SDK error |
|---|---|
| Model calls a name not in `tools` | `NoSuchToolError` |
| Args fail the tool's schema | `InvalidToolArgumentsError` (from `parseToolCall`) |
| **`tool.execute` rejects** | the rejection itself, verbatim |

`toDataStreamInternal` renders an `error` chunk as a `3:` part. Because
`stream.ts:146` calls `toDataStreamResponse()` with no options, `getErrorMessage`
falls back to its default `() => ""` ("mask error messages for safety by
default"), so the literal bytes are `3:""`.

`readDataStream`'s error regex is `^3:"(.*)"$`, which matches `3:""` with an
empty capture. `useChatTurn.ts:114-125` then sets `streamErrorMessage = ''` and,
because the guard is `if (streamErrorMessage !== null)`, throws
`ChatTurnError('stream_interrupted')`. **The visitor gets an error state for the
whole turn — after the prose has already streamed onto their screen.**

Nothing in the marker system behaves this way. A malformed marker renders as
text or gets stripped; it cannot fail a turn. Any tool mechanism has to be held
to the same standard, which is why §3.5 makes "`execute` never rejects" a
contract rather than a convention.

### 0.5 Shadow parity constrains the prompt, not the tools array

The brief describes the `/api/sage` response and `readDataStream` as having been
kept byte-identical, "which Traffic Cop's shadow mode explicitly depends on."
Those are two different freezes and it is worth separating them, because they
have opposite implications for this work.

- **Shadow mode's oracle is the system-prompt string.**
  `turn-context/shadow.ts:118` is `const match = legacySystem === shadowSystem`,
  and `assembly.golden.test.ts` asserts the same equality in test form.
- **The wire format is frozen separately**, by the `/api/sage` route contract
  (`app/api/sage/route.ts:37` — "The wire format (Vercel AI SDK data stream) is
  unchanged") and by `readDataStream`'s two-part parser. The Traffic Cop design
  lists it under §8 *What does NOT change*, as an invariant it respects, not one
  it depends on.

So: **passing a `tools:` array is parity-neutral.** Tool definitions go to the
provider as a separate request field and never enter `systemPrompt`. But **any
prompt text instructing the model to use a tool breaks parity on every turn**,
and blocks the Phase 3a cutover until explained. That single fact drives the
sequencing in §7.

---

## 1. What is actually available at the pinned versions

### 1.1 Resolved versions

`package.json` declares `ai: ^3.4.0` and `@ai-sdk/anthropic: ^0.0.39`. Both
lockfiles agree on the resolution:

| Package | Declared | Resolved |
|---|---|---|
| `ai` | `^3.4.0` | **3.4.33** (last of the 3.4 line) |
| `@ai-sdk/anthropic` | `^0.0.39` | **0.0.39** |
| `@ai-sdk/ui-utils` | transitive | 0.0.50 |
| `@ai-sdk/openai` | — | **not installed** (`getModelInstance` throws for `'openai'`, `stream.ts:99`) |
| `@anthropic-ai/sdk` | — | **not installed** — `vision-tool.ts` uses raw `fetch` |
| `zod` | `^3.25.76` | 3.25.76 |

### 1.2 `streamText` surface at `ai@3.4.33`

Everything needed is present. No SDK upgrade is required or proposed.

| Option | Present | Notes |
|---|---|---|
| `tools` | yes | `Record<string, CoreTool>`; `tool()` helper exported (two overloads, with and without `execute`) |
| `toolChoice` | yes | `'auto' \| 'none' \| 'required' \| { type: 'tool', toolName }` |
| `maxSteps` | yes | **defaults to 1** — today's call is single-step by construction |
| `maxToolRoundtrips` | yes, **deprecated** | `maxSteps - 1`; do not use |
| `experimental_activeTools` | yes | narrows the callable set without changing result types |
| `experimental_toolCallStreaming` | yes | gates the `b:` / `c:` parts; **off by default** |
| `onStepFinish` | yes | fires per step with `{ stepType, text, toolCalls, toolResults, usage, … }` |
| `onFinish` | yes | `{ text, usage, steps, toolCalls, toolResults, responseMessages, … }` — see §0.3 |
| `experimental_continueSteps` | yes | unrelated (length-limit continuation); leave off |
| `stopWhen` | **no** | AI SDK 5 API. Does not exist at 3.x. |

### 1.3 The Anthropic provider at `0.0.39` — what it does, and what it throws on

It maps tools correctly. `tools` / `toolChoice` become Anthropic `tools` +
`tool_choice: { type: 'auto' \| 'any' \| 'tool', name }`; `tool_use` and
`tool_result` content blocks are mapped in both directions; and, contrary to a
first reading, it **does** emit partial tool-call deltas — `input_json_delta`
becomes a `tool-call-delta` chunk, with the whole `tool-call` emitted at
`content_block_stop`. (The SDK then discards those deltas unless
`experimental_toolCallStreaming` is on.)

The risk is elsewhere, and it is the largest one in this document. This provider
predates Claude 3.7 and 4 entirely — its typed model-id union tops out at
`claude-3-5-sonnet-20240620`, with a `(string & {})` escape hatch that is why
`'claude-sonnet-4-6'` (`stream.ts:16`) type-checks at all. Its stream transform
is written as an exhaustive switch that **throws** on anything it does not
recognize:

```js
default: {
  const _exhaustiveCheck = contentBlockType;
  throw new Error(`Unsupported content block type: ${_exhaustiveCheck}`);
}
```

with the same shape for delta types. Today's text-only turns never produce an
unrecognized block. A tool turn is the first time this codebase would ask a
2026-era model for non-text content blocks through a 2024-era provider. This is
**not a reason the design fails** — tools themselves are mapped — but it is the
first thing to prove, before anything else is built (§9, row 1).

### 1.4 What is deliberately not proposed

- **No AI SDK upgrade.** `ai@5` renames `toDataStreamResponse` →
  `toUIMessageStreamResponse`, changes the wire protocol outright, renames
  `usage.promptTokens` / `completionTokens` → `inputTokens` / `outputTokens`
  (breaking `persistTokenUsage`), and forces `@ai-sdk/anthropic` 0.0.39 → 2.x in
  the same move. Everything this design needs exists at 3.4.33.
- **No prompt caching, no `providerOptions`, no `anthropic.tools.*`
  server-side tools.** None exist at provider 0.0.39. Prompt caching is already
  tracked separately as Traffic Cop Sprint 6.

---

## 2. The wire format, part by part

### 2.1 What `/api/sage` emits today

`stream.ts:146` returns `result.toDataStreamResponse()` — data-stream protocol
v1, `content-type: text/plain; charset=utf-8`, header
`x-vercel-ai-data-stream: v1`, newline-delimited `TYPE_ID:CONTENT_JSON\n`.

A normal turn is `0:` deltas, then `e:` (finish step), then `d:` (finish
message). A provider failure after headers are committed adds `3:""`.

### 2.2 What it would emit with tools

Two additional parts, drawn from `toDataStreamInternal`'s switch:

```
9:{"toolCallId":"toolu_01ABC","toolName":"lookup_memories","args":{"limit":5}}
a:{"toolCallId":"toolu_01ABC","result":{"ok":true,"count":3}}
```

and, **only if `experimental_toolCallStreaming` is turned on**, the streaming
pair that precedes `9:`:

```
b:{"toolCallId":"toolu_01ABC","toolName":"lookup_memories"}
c:{"toolCallId":"toolu_01ABC","argsTextDelta":"{\"limit\":"}
```

With `maxSteps: 2`, the turn also carries **two** `e:` parts (one per step)
before its single `d:`.

### 2.3 What the client does with each part

| Part | Name | Today | Needed for tools |
|---|---|---|---|
| `0:` | text | appended to `accumulated`, `onChunk` fired | unchanged |
| `2:` | data | dropped | unused |
| `3:` | error | `onStreamError` → `stream_interrupted` | unchanged — but see §0.4 |
| `8:` | message annotations | dropped | unused |
| `9:` | tool_call | **dropped** | optional `onToolCall` callback |
| `a:` | tool_result | **dropped** | optional `onToolResult` callback |
| `b:`/`c:` | tool call streaming | **dropped** | not emitted (§2.4) |
| `d:` | finish message | dropped | unchanged |
| `e:` | finish step | dropped | unchanged (now 2× per turn) |

### 2.4 Recommendation — extend, do not replace

1. **No protocol change, no new endpoint, no second stream.** The frozen wire
   format stays frozen in the sense that matters: nothing that exists today
   changes shape, and everything new is additive.
2. **`experimental_toolCallStreaming: false`.** Whole tool calls only. It keeps
   `b:`/`c:` off the wire entirely and removes a whole class of partial-JSON
   client state. Nothing in v1 needs to render arguments as they type.
3. **Extend `readDataStream` with optional callbacks**, following the precedent
   that added `onStreamError`: callers that omit them see byte-identical
   behaviour, and the two admin composer call sites
   (`components/admin/PromptBuilderChat.tsx:61`,
   `app/admin/prompt-builder/page.tsx:597`) need no change at all.

   ```ts
   export async function readDataStream(
     response: Response,
     onChunk: (accumulated: string) => void,
     onStreamError?: (message: string) => void,
     onToolEvent?: (event: ToolStreamEvent) => void,   // new, optional
   ): Promise<string>
   ```

   with `ToolStreamEvent = { kind: 'call', toolCallId, toolName, args } |
   { kind: 'result', toolCallId, result }`.

4. **Parse `9:`/`a:` with `JSON.parse` on the remainder of the line, inside a
   `try`, dropping on failure** — the same defensive posture the existing `0:`
   branch takes. Note the current regexes are anchored (`^…$`) and assume one
   part per line; `9:`/`a:` payloads are objects, not quoted strings, so they
   need their own branch rather than a widened regex.
5. **`bufferMarkdown` is unaffected.** It operates on accumulated *prose*; tool
   parts never enter `accumulated`.

---

## 3. The mechanism

### 3.1 Server-executed tools only, v1 — and the boundary against markers

**Recommendation: v1 supports only tools with an `execute` function that runs on
the server.** Client-executed tools are rejected for v1 (§3.8 A).

That is not a limitation dressed up as a decision; it is what makes the two
mechanisms complementary rather than competing. The boundary:

| | Marker | Tool |
|---|---|---|
| Emitted as | text inside `0:` deltas | a `9:` stream part |
| Acted on by | the client (or the server, post-hoc in `onFinish`) | the server, mid-turn |
| The model | never learns what happened | receives the result and keeps talking |
| Turn shape | one model call | two (or more) |
| Failure mode | renders as text, or is stripped | see §0.4 |

**Markers are for in-conversation signals the client acts on. Tools are for
server work whose *result* the model needs before it can finish speaking.**

Read that way, most of what exists today is correctly a marker and should stay
one. `[SAVE_MEMORY]` is a client dispatch to `memories.create()`; the model does
not need to know the outcome to keep talking. Same for `[ACCOUNT_CREATE:]`,
`[BOOKING:]`, and the media trio. `Known Gaps.md:1918-1926` already records that
auto-save "is functionally the 'guide invokes a save mid-conversation' behavior
the original design called Auto, just implemented as a marker rather than a real
tool call" — and that remains the right call. **A tool would buy nothing there.**

A tool earns its cost only when the model is *blocked* without the answer: a
lookup it must read before replying, a computation, an availability check, a
write whose success or failure changes what it should say next. No current
feature is in that shape, which is precisely why §7.3 recommends building
nothing yet.

### 3.2 The `ToolDefinition` contract

Deliberately a thin, house-styled wrapper over `CoreTool` rather than a
re-invention — the SDK already owns schema validation and execution.

```ts
interface ToolDefinition<A extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> {
  /** Stable registry key. Matches `tools.key` in the DB. snake_case. */
  key: string
  /** What the model reads to decide whether to call it. This IS the prompt. */
  description: string
  /** Zod schema; field descriptions are instructions, per vision-tool.ts:29-33. */
  parameters: A
  /** Cheap, sync, no I/O. Excludes the tool from this turn's `tools` object. */
  appliesTo(ctx: ToolTurnContext): boolean
  /** MUST NOT reject. See §3.5. */
  execute(args: z.infer<A>, ctx: ToolTurnContext): Promise<ToolOutcome<R>>
  /** Milliseconds. Enforced by the tool layer, not the SDK. Default 3000. */
  timeoutMs?: number
  /** Declares what the audit record may carry. See §5.3. */
  audit: { argKeys: readonly string[]; pii: 'none' | 'identity' }
}

type ToolOutcome<R> =
  | { ok: true; data: R }
  | { ok: false; reason: ToolFailureReason }   // bounded union, never free text

interface ToolTurnContext {
  tenantId: string | null
  sessionId: string | null
  memberId: string | null
  correlationId: string | null
  abortSignal: AbortSignal
}
```

Three things are worth naming. `appliesTo` mirrors `ContextProvider.appliesTo`
(`turn-context/types.ts`) deliberately — same word, same contract, same "sync,
cheap, no I/O" rule. `ToolTurnContext` carries `tenantId` / `memberId`
explicitly rather than letting a tool re-resolve them, so a tool physically
cannot read another tenant's data by resolving differently. And `ToolOutcome` is
a result union, not a throw, for the reason in §3.5.

### 3.3 The registry — one file, one line, one test, one docs row

Code-side, this copies `turn-context/registry.ts` verbatim in spirit, because
that is exactly Jeff's stated shape ("a new tool's logic is a code change, like
adding a turn-context provider"):

```
services/chat/server/tools/
  registry.ts          ← the one place a tool is registered
  types.ts             ← ToolDefinition, ToolOutcome, ToolTurnContext
  runner.ts            ← timeout, never-reject wrapper, audit collection
  build.ts             ← tenant-assigned set → the `tools` object for a turn
  registry.test.ts     ← keys unique, every tool has a colocated test
  <tool-key>.ts + <tool-key>.test.ts
```

Adding a tool costs: one file under `tools/`, one line in `registry.ts`, one
colocated test, one row in `System Docs/Utilities/Chat Server.md`. A registry
test enforces the first three, the same "make the boundary a lint, not a
convention" move `turn-context/registry.test.ts` already makes.

### 3.4 Tenant resolution — building the `tools` object for a turn

```
tenantId (already resolved, index.ts)
  → listToolKeysForTenant(tenantId)            // services/tools/, §4
  → intersect with TOOLS registry keys          // DB row with no code = ignored
  → filter by appliesTo(ctx)
  → Record<key, CoreTool>  →  streamText({ tools })
```

**Recommendation: build the object from the tenant's assigned set, rather than
passing a fixed object and narrowing with `experimental_activeTools`.** A tool a
tenant is not assigned should not be in the type surface of that turn at all.
`experimental_activeTools` is the weaker guarantee and is experimental besides.

Two ordering rules, both stated so they are decisions and not accidents:

- **A registry key with no `tools` row, or a `tools` row with no registry
  entry, is ignored — never an error.** Deploys and Studio edits are not
  atomic; a mismatch in either direction must degrade to "that tool isn't
  available this turn," not to a failed chat.
- **An empty resolved set means `tools` is omitted entirely**, not passed as
  `{}`. This keeps the request byte-identical to today's for every tenant with
  no tools assigned — which, at ship time, is all of them.

`listToolKeysForTenant` is one indexed read and is a natural sixth entry in
`streamChat`'s existing `Promise.all` (`index.ts:182`), so it costs no
additional serial round trip on the path to first token.

### 3.5 Failure discipline — `execute` never rejects

From §0.4: a rejection inside `execute` becomes `3:""` on the wire and a
visitor-visible `stream_interrupted`. So:

1. **`execute` returns `ToolOutcome`, never throws.** The runner wraps every
   tool in a `try`/`catch` + timeout and converts anything that escapes into
   `{ ok: false, reason: 'tool_failed' }`. A tool author who forgets a
   `try`/`catch` cannot break a turn — the guarantee lives in the runner, the
   same way `turn-context/runner.ts` centralizes fail-open for providers.
2. **`reason` is a bounded union, never a raw error string.** Same reasoning as
   `sanitizeFailureReason` (`services/media/errorCopy.ts:9-20`): mapping to a
   fixed set of known-safe values guarantees no vendor name, internal path, or
   argument value reaches the model — or the audit row — regardless of what the
   underlying error said. Regex-scrubbing an open-ended string is inherently
   incomplete.
3. **A failed tool is a normal result, not an error.** `{ ok: false, reason }`
   is returned to the model as the tool result; the model narrates it in prose.
   The turn completes normally, the visitor sees a sentence rather than an error
   card, and `onFinish` runs.
4. **Pass an explicit `getErrorMessage` to `toDataStreamResponse`.** It does not
   prevent a `3:` part, but it stops the current silent `3:""` and lets the
   client tell a real upstream failure from an empty one.

Two failure modes this does **not** close, and both are honest open items:

- **`NoSuchToolError`** — the model hallucinating a tool name still produces a
  `3:` part before any of our code runs. Partially mitigated by never describing
  a tool in the prompt that is not in the turn's `tools` object, but not
  eliminated. Decision §11.4.
- **`InvalidToolArgumentsError`** — the SDK validates against the Zod schema and
  errors before `execute` is reached. Keeping schemas permissive (optional
  fields, wide types, validation inside `execute`) trades model-side strictness
  for turn-side safety. Recommendation: keep schemas permissive; validate in
  `execute` and return `{ ok: false }`.

### 3.6 `maxSteps`, cost, and the performance targets

**Recommendation: `maxSteps: 2`** — one tool round-trip — as the platform
default, raised only with evidence. `maxSteps` must be ≥ 1 and is only read when
`tools` is non-empty, so this is a no-op for every tenant without tools.

What it costs, against `CLAUDE.md`'s Performance Is a Feature targets:

| Target | Effect |
|---|---|
| First token < 1s | **Unaffected when the model answers directly.** A turn that opens with a tool call delays the *visible* prose by the tool's latency plus a second model round trip. Measure before promising. |
| Anthropic cost per session | **Up to 2× the model calls on a tool turn**, and the second call re-sends the whole conversation plus the tool result. Real, and the reason `maxSteps` is 2 rather than 5. |
| Per-tenant rate limiting | `rateLimitRequestsPerHour` is resolved by `resolveModelConfig` (`stream.ts:68`) and **not enforced anywhere today** — a pre-existing gap that multi-step makes more expensive, not one this design creates. Flagged, not in scope. |

### 3.7 Abort, stop, and the 500 ms poll

`createServerAbortController` (`index.ts:75-129`) polls
`chat_sessions.stop_requested_at` every 500 ms and threads one `AbortSignal`
into `streamText`. Three consequences, all unverified against a real multi-step
turn (§9):

- The SDK forwards `abortSignal` to `tool.execute`'s options, so the runner can
  and should pass it through — a tool must abandon its work on Stop.
- Whether an abort *between* steps is caught cleanly, or surfaces as an error
  chunk, is untested.
- `onFinish` does not run on an aborted turn, which is deliberate
  (`stream.ts:116-119`) — so a tool that already wrote to the DB during step 1
  has committed work for a turn the visitor cancelled. **Tools that write should
  be idempotent**, not transactional-across-steps. For v1, prefer read-shaped
  tools.

### 3.8 Alternatives considered (rejected — recorded so they are not re-proposed)

**A. Client-executed tools** (`CoreTool` without `execute`, results returned via
`useChat`'s `onToolCall` / `addToolResult`). Rejected for v1. This codebase does
not use `useChat` — `useChatTurn` is a bespoke engine over a bespoke
`readDataStream` — so this would mean building a whole new "send the tool result
back and resume the turn" protocol on `/api/sage`, which is exactly the frozen
surface. The use cases it would serve (render a card, open a panel, save a
memory) are already served well by markers. Revisit only when something needs
the model to *read* a client-side result.

**B. A second endpoint** (`/api/sage/tools`) so `/api/sage` never changes.
Rejected: §0.2 shows `/api/sage` does not need to change in any breaking way,
and a second endpoint would duplicate tenant resolution, abort handling, session
lifecycle, and the whole turn-context assembly. It trades a non-problem for a
real one.

**C. JSON-in-a-marker** (`[TOOL: {"name":…,"args":…}]`, server parses it in
`onFinish` and issues a second turn). Rejected: it is the marker system wearing
a tool costume. It cannot return a result to the same turn, it inherits marker
parsing fragility for structured data (the exact failure `vision-tool.ts:35-46`
was written to escape), and it doubles latency without the SDK's schema
validation.

**D. Forced `tool_choice`, `vision-tool.ts`-style, inside the chat turn.**
Rejected: forcing a tool removes the model's free-text channel, which is the
whole point of a conversation. That pattern is correct for its own use case and
should stay there.

---

## 4. Where the registry lives — schema

### 4.1 Two tables, following `prompt_types` / `prompt_type_tenants`

The precedent and its rationale are in `System Docs/DB_CHANGELOG.md` (2026-06-26):
*"A type is a definition, not a possession. Separating definition from assignment
allows one type to be assigned to multiple tenants without duplicating the
definition."* That refactor **dropped** `prompt_types.tenant_id` and
`is_default`, having learned both were mistakes. This design starts where that
one ended up.

| Table | Purpose |
|---|---|
| `tools` | The definition/taxonomy row. `key` matches a registry entry in code. |
| `tool_tenants` | The assignment. `UNIQUE (tool_id, tenant_id)` — load-bearing, since the write path detects "already assigned" from the `23505`. |

`is_platform` on `tools` carries the same meaning it does on `prompt_types`: a
platform-shared tool visible to every tenant without an assignment row, settable
only by a platform admin, re-checked server-side and never trusted from a client
flag.

The visible set is the same union, and should be the same two queries deduped by
`Map<id>` in-process — **not** a PostgREST `.or()`. The reason is documented at
`app/api/admin/prompt-types/route.ts:45-50`: embedded-resource `or` semantics do
not reliably combine with a base-table condition like `is_platform`.

### 4.2 Two deliberate departures from the precedent

**(a) `UNIQUE (key)` on `tools`.** `prompt_types.key` has no unique constraint —
confirmed against the live table 2026-09-15 (`Database Schema.md:46`) — and it
leaks: the create path must `order('created_at').limit(1)` to "take the first,"
and `select-prompt.ts` carries a header warning that key resolution "cannot
assume `key` is globally unique." For a prompt type that is untidy. For a tool
key it is a security surface: two rows sharing a key, assigned to different
tenants, resolving to one code entry is a cross-tenant confusion waiting to
happen. A real unique constraint removes the entire class.

**(b) Accessors in `services/tools/`, not in route handlers.** There is **no
service-layer module for prompt types at all** — the same ~30-line union query
is copy-pasted into four route files (`app/api/admin/prompt-types/route.ts`,
`app/api/platform/prompt-types/route.ts`, and both `prompt-sets` routes). That
is a direct violation of `2BL.md`'s "route handlers are thin adapters." Tools
should get `services/tools/registry.ts` exporting
`listToolKeysForTenant(tenantId)`, `listToolsForTenant(tenantId)`,
`assignToolToTenant(toolId, tenantId)`, each returning the house result union
`{ ok: true; status; data } | { ok: false; status; error }` (`services/tenant/tenants.ts:45`).

### 4.3 DDL — Jeff's, in Studio

Per `CLAUDE.md` workflow rule 3, CC does not write migrations or run
`ALTER TABLE`. This is the shape for Jeff to run, not a migration file:

```sql
create table tools (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  name          text not null,
  description   text,
  sort_order    integer,
  is_platform   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tools_key_key unique (key)          -- §4.2(a); the departure
);

create table tool_tenants (
  id          uuid primary key default gen_random_uuid(),
  tool_id     uuid not null references tools(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint tool_tenants_tool_tenant_key unique (tool_id, tenant_id)
);

create index tool_tenants_tenant_id_idx on tool_tenants (tenant_id);
```

Notes on what is deliberately absent. **No `tenant_id` on `tools`** and **no
`is_default`** — the two columns the 2026-06-26 refactor removed from
`prompt_types`; availability lives in `tool_tenants`, and there is no such thing
as a default tool. **No `config` jsonb column** — per-tenant tool *configuration*
is a different problem from tool *availability*, and adding a speculative column
for it is the abstraction-for-hypotheticals this design is otherwise arguing
against. **No enabled/disabled flag** — assignment is the on switch; removing the
row is the off switch, exactly as `prompt_type_tenants` works.

RLS: `Database Schema.md:5-13` records that RLS is enabled on all tables but only
three carry real policies, with tenant isolation enforced in application code via
`tenant_id` scoping. These two tables inherit that posture rather than inventing a
new one — which is a known platform gap (`Known Gaps.md`), not something this
design resolves.

### 4.4 Admin surface

The precedent is weak here and worth improving on: there is **no "manage prompt
types" page** — assignment happens as a side effect of creating or editing a
prompt set in `app/admin/settings/PromptSets.tsx`. For tools, availability is the
whole point of the config, so it needs its own surface: a list of the tenant's
visible tools (assigned ∪ platform) with an assign/unassign control, plus the
platform-admin-only "make available to all tenants" switch, gated on
`requirePlatformAdmin()` server-side exactly as `make_platform` is today.

Mantine admin design system; nothing novel. Shape it when a real tool exists —
designing the page before there is anything to put on it is not useful.

---

## 5. Audit and logging

Per `CLAUDE.md` rule 6, this belongs in `audit_events`, not `console.log`.

### 5.1 New `AuditAction` values

Added to the existing `as const` object in `services/audit/types.ts`, following
the `namespace.verb` convention:

```ts
TOOL_ASSIGNED_TO_TENANT: 'tool.assigned_to_tenant',
TOOL_UNASSIGNED_FROM_TENANT: 'tool.unassigned_from_tenant',
CHAT_TOOLS_RESOLVED: 'chat.tools_resolved',
```

Three, not more. The house convention documented on `MEDIA_UPLOAD_REJECTED` and
`MEDIA_PROCESS_FAILED` is **one action plus a discriminating `metadata` key**
rather than one action per sub-case — so there is no `TOOL_INVOCATION_FAILED`;
a failed call is a `status` inside the turn record. `CHAT_TOOLS_RESOLVED` sits in
the `chat.` namespace deliberately, alongside `CHAT_TURN_CONTEXT_RESOLVED`,
because it describes a turn, not a tool.

### 5.2 One record per turn, modelled on `recordTurnContext`

Written fire-and-forget (`void logEvent({ … })`) from `onStepFinish` accumulation,
flushed once in `onFinish`. `target_type: 'chat_session'`, `target_id: sessionId`,
`actor_type: memberId ? 'user' : 'anonymous'`, `correlation_id` threaded.

**Written only on turns where `tools` was non-empty** — unlike
`CHAT_TURN_CONTEXT_RESOLVED`, which fires every turn. Once every tenant has zero
tools, this writes zero rows, which is the correct cost for infrastructure nobody
is using yet.

```jsonc
{
  "available": ["lookup_memories", "check_availability"],  // keys resolved for this turn
  "steps": 2,
  "calls": [
    { "key": "lookup_memories", "status": "ok",
      "argKeysPresent": ["limit"], "ms": 84, "resultBytes": 212 },
    { "key": "check_availability", "status": "failed",
      "reason": "upstream_unavailable", "ms": 3001 }
  ],
  "finishReason": "stop"
}
```

Every available tool appears, called or not — `status: "not_called"` is a
first-class outcome, so "why didn't the model use X" is a single-row query. Same
principle as the turn-context record, where `skipped` with a reason is
first-class.

### 5.3 What is never logged

- **Never the `args` object.** Only `argKeysPresent` — which keys the model
  supplied, declared up front by the tool's own `audit.argKeys`, so a tool
  physically cannot widen what gets recorded by changing its schema.
- **Never the result.** Only `resultBytes` and `ok`/`failed`.
- **Never a raw error string.** Only the bounded `reason` union from §3.5.
- **Never raw PII.** A tool declaring `audit.pii: 'identity'` routes any value
  it must reference through `logSafeIdentity` / `contentHash`
  (`services/shared/log-safe.ts`), presence and length only — the same contract
  `turn-context/trace.ts` states in its header and `trace.test.ts` enforces
  against PII fixtures.

A test asserting that no fixture name, email, phone, or argument value appears in
the emitted metadata is part of the test plan (§10), not a nice-to-have.

---

## 6. What does NOT change

- **The `/api/sage` request contract.** No new body field. Tool availability is
  resolved server-side from the already-resolved `tenantId`.
- **The `/api/sage` response contract**, in the sense that matters: `0:`, `3:`,
  `d:`, `e:` keep their exact shape and meaning; `9:`/`a:` are additive and
  already ignored (§0.2). Both admin `readDataStream` callers are untouched.
- **The marker system, entirely.** `services/chat/ui/v1/registry.ts`, all ten
  markers, `bufferMarkdown`, `parseBookingCards`, and every server-side fallback
  in `handleSessionFinish` stay exactly as they are. Tools are additive; §3.1
  argues nothing currently on markers should move.
- **The Traffic Cop.** No provider changes, no `resolveTurnPrompt` changes, no
  change to what shadow mode compares — subject to §7.1's sequencing.
- **`resolveModelConfig` and model selection.** Orthogonal.
- **Host→tenant resolution**, `getMemberContext`, session lifecycle,
  `stripMediaMarkers`, `persistTokenUsage`.
- **`services/media/vision-tool.ts`.** Different problem, correct as-is, stays.

---

## 7. Sequencing — what must be true before any of this is built

### 7.1 Traffic Cop Phase 3a must land first (if tool instructions enter the prompt)

From §0.5: a `tools:` array is parity-neutral, but **prompt text instructing tool
use is not**. Shadow mode compares `legacySystem === shadowSystem` on every turn;
adding a tool-instruction segment to `systemPrompt` while Phase 2 is running
flips `parity` to false universally and destroys the cutover gate.

Three ways out, in order of preference:

1. **Wait for Phase 3a.** Once `streamChat` uses `resolved.system`, there is no
   second assembly to disagree with, and tool instructions are just another
   provider.
2. **Ship instructions as a registered `ContextProvider`**, so both assemblies
   carry them and parity survives. Workable, but it means adding a provider
   during shadow — the thing Phase 2 exists to hold still.
3. **Put instructions in the tenant's `compiled_prompts` row** rather than in
   code. Parity-safe (the base provider reads the same row both ways) but pushes
   platform infrastructure into per-tenant prompt content, which is exactly what
   "generic, not tenant-specific" rules out.

**Recommendation: (1).** It costs calendar time and nothing else.

### 7.2 The §0.3 fix is a gate on the first `maxSteps > 1` call

Not a follow-up, not a Phase 6 cleanup. The first tool turn that emits prose
before calling a tool silently drops that prose from `handleSessionFinish`'s
marker scan, which is a breach of a `CLAUDE.md` non-negotiable. It ships in the
same change or the tool does not ship.

### 7.3 Recommendation: build nothing yet

`CLAUDE.md`: *"We do not abstract for hypotheticals."* The test it sets is
whether a decision closes a real door — and not building this closes none. Every
finding in §0 keeps its value as a written record; the schema in §4 is ready the
day a use case arrives; and §3.1's boundary is usable *now*, as a test to apply
to each new feature ("does the model need the result to keep talking?").

What building it early would cost: a registry with no entries, two empty tables,
an admin page listing nothing, and — the real cost — a `maxSteps`/tool code path
in `runChatStream` that is exercised by no production traffic while the Traffic
Cop cutover is being proved against that exact function.

**So: file this, apply §3.1's test to the next few candidate features, and pick
it back up when one of them genuinely fails that test.** The most likely
candidates today are the NPS survey (deprioritized; `traffic-cop-punch-list` Sprint
4 leaves "tool call vs. marker" open — **§3.1 answers it: marker**, since nothing
about a survey response changes what the model says next) and anything that needs
a real lookup mid-conversation, which is where §8's product-knowledge work could
eventually land.

---

## 8. Risks and how each is held

| Risk | Held by |
|---|---|
| `@ai-sdk/anthropic@0.0.39` throws on a 2026-model content block | §9 row 1 — one flagged preview probe before anything else; this is the gate |
| A tool failure shows the visitor an error mid-turn (§0.4) | §3.5 — runner-owned never-reject wrapper + bounded reasons; not left to tool authors |
| Contact-capture markers silently lost on multi-step turns (§0.3) | §7.2 — gated, ships in the same change |
| Shadow parity destroyed, Phase 3a blocked (§0.5) | §7.1 — sequencing, tool instructions land after 3a |
| Model hallucinates a tool name → `3:` error | **Partially open.** Never describe an unavailable tool; decision §11.4 |
| Schema validation failure → `3:` error before our code runs | §3.5 — permissive schemas, validate inside `execute` |
| Cross-tenant tool access | `ToolTurnContext.tenantId` is passed in, never re-resolved by a tool (§3.2); `UNIQUE (key)` removes key collisions (§4.2a) |
| DB row and code registry drift at deploy | §3.4 — mismatch in either direction is ignored, never an error |
| Cost doubles on tool turns | §3.6 — `maxSteps: 2`, audited per turn, `tools` omitted entirely when empty |
| Tool writes committed on a turn the visitor stopped | §3.7 — prefer read-shaped tools in v1; writes must be idempotent |
| A tool leaks PII into `audit_events` | §5.3 — declared `argKeys`, no args/results logged, PII-fixture test |
| Registry grows without tests or docs | §3.3 — registry test enforces colocated test + unique key |

---

## 9. Uncertain — verify before any build

| Claim | Confidence | How to verify |
|---|---|---|
| `@ai-sdk/anthropic@0.0.39` handles a **tool** turn from `claude-sonnet-4-6` without throwing | **Low — the largest open risk.** The provider predates Claude 3.7/4; its stream transform throws on any unrecognized content-block or delta type (§1.3). Tool mapping itself is present and correct | One preview deploy, one trivial echo tool behind a flag, on a throwaway tenant. Do this **first** — a failure here invalidates §2 and §3 and turns the question into "which provider version," not "which design" |
| Raising `maxSteps` does not break the abort path | Medium — `abortSignal` is forwarded to `execute`, but between-step abort is untested | Preview: Stop mid-tool-execution; check `chat_sessions.server_abort_confirmed_at` and whether an error chunk reaches the client |
| First-token latency on a tool turn | Unmeasured | Preview, against the <1s target in `CLAUDE.md`; a tool turn's first *visible* token is after the tool runs |
| Per-turn cost delta | Unmeasured | The §5.2 audit record's `steps` plus existing `persistTokenUsage` rows |
| Every SDK claim in §1 and §2 | High — read from the published tarballs at the exact lockfile-resolved versions | `pnpm install`, re-read `node_modules/ai/dist/index.d.ts` and `node_modules/@ai-sdk/anthropic/dist/index.mjs` |
| Whether `3:""` (empty masked error) is distinguishable from a real one by the current client | High — it is not; `useChatTurn.ts:123` tests `!== null`, not truthiness | Read `stream-utils.ts:42-49` with `useChatTurn.ts:114-125` |
| Live `prompt_type_tenants` assignment counts (whether the union-read path has ever had more than the SBL rows) | Unknown | Jeff, Supabase Studio |

---

## 10. Test plan (outline, written now per `CLAUDE.md`)

- **Unit, runner:** `execute` throws → `{ ok: false }`, turn proceeds, no `3:`
  part emitted; `execute` hangs → timeout at `timeoutMs` with the same outcome;
  `abortSignal` propagates into `execute`; every available tool appears in the
  audit record including `not_called`.
- **Unit, tenant resolution (`build.ts`):** assigned-only; platform-only;
  assigned ∪ platform deduped; DB key with no registry entry → ignored; registry
  key with no DB row → ignored; empty set → `tools` omitted, not `{}`;
  `appliesTo` false → excluded.
- **Unit, registry:** keys unique; every entry has a colocated `*.test.ts`;
  every entry declares `audit.argKeys`.
- **Unit, wire (`stream-utils`):** `9:` / `a:` parsed into `onToolEvent`;
  malformed `9:` dropped without throwing; **omitting `onToolEvent` reproduces
  today's behaviour byte-for-byte on a fixture stream containing tool parts** —
  this is the "additive, non-breaking" claim in test form.
- **Unit, §0.3 regression:** a two-step fixture where step 1 emits `[NAME: Ada]`
  and step 2 emits only prose → `handleSessionFinish` still sees the name. Fails
  against `onFinish.text`; passes against the reconstructed turn text. **Write
  this test first** — it is the gate in §7.2.
- **Unit, audit:** `logEvent` mocked; assert the emitted metadata contains no
  fixture name, email, phone, argument value, or result body.
- **Integration, shadow parity:** a turn with a non-empty `tools` object still
  produces `parity: true` — the §0.5 claim in test form.
- **Verification surface:** Vercel preview per `CLAUDE.md` rule 2. The §9 row-1
  provider probe is a preview deploy, not a unit test — it cannot be mocked,
  since the question is what a real model returns.

**Definition of Done note.** The mobile-responsive, accessibility, and design-
system rows of `CLAUDE.md`'s Definition of Done apply to §4.4's admin surface
when it is built, and to nothing else here — this document ships no UI. Saying
so rather than silently skipping them, per the preamble of `CLAUDE.md`.

---

## 11. Decisions needed from Jeff

### 11.1 Build now, or file and wait?
§7.3 recommends **file and wait**, on `CLAUDE.md` grounds, and apply §3.1's test
to the next few features instead. The counter-argument is that §9 row 1 — the
provider-version risk — is worth retiring early, cheaply, because it could
invalidate the whole design and is better discovered now than under deadline.
**A middle option I'd take if you want motion: run the §9 row-1 probe only** — a
throwaway echo tool, one preview deploy, one flag, deleted afterwards — and file
the rest. That is ~half a day and answers the only question that could change
the design.

### 11.2 Server-executed tools only for v1?
§3.1 / §3.8 A recommend yes, with markers keeping client-side dispatch. This is
the load-bearing decision: reversing it later means a new `/api/sage` round-trip
protocol, not a config change. I have not assumed you agree.

### 11.3 `UNIQUE (key)` on `tools` — confirm the departure from precedent
§4.2(a). It differs deliberately from `prompt_types`, which has no such
constraint. It is your Studio work either way, and I would rather you agree with
the reasoning than inherit it.

### 11.4 Hallucinated tool names
A tool name the model invents produces `3:` before any of our code runs (§3.5).
Options: (a) accept it, keep the tool set small and never describe an unavailable
tool; (b) have the client treat `3:""` as non-fatal and only `3:"<message>"` as
fatal, which needs the explicit `getErrorMessage` from §3.5(4); (c) both.
**I lean (c)** — (b) is a small, independently useful robustness fix to
`readDataStream` regardless of tools. Not decided.

### 11.5 Does the §0.3 fix ship on its own?
It is inert today (`maxSteps` defaults to 1, so `steps.length === 1` always) but
it is a latent correctness bug with a one-line fix and a test that documents why.
Ship it standalone now, or hold it as the gate in §7.2? **I lean hold** — a fix
with no observable effect and no way to verify on preview is harder to review
than the same fix next to the thing that makes it matter.

### 11.6 The missing Traffic Cop design doc (Appendix A)
Separate from this work, but it is the kind of thing that gets lost. Your call
whether I open a small docs PR for it.

---

## 12. Documentation to update if and when this ships

Per phase, not at the end (`CLAUDE.md`, Documentation Stays Current):

- `System Docs/Database Schema.md` — `tools` and `tool_tenants` rows, written in
  the same style as the `prompt_types` / `prompt_type_tenants` rows, including
  the §4.2(a) note on why `key` is unique here and not there.
- `System Docs/DB_CHANGELOG.md` — the dated entry, by Jeff, with the DDL actually
  run.
- `System Docs/Utilities/Chat Server.md` — a tool-registry section beside the
  turn-context one, with the per-tool table §3.3 requires a row in.
- `System Docs/Utilities/Audit.md` + `services/audit/types.ts` — the three new
  actions and the §5.3 contract.
- `System Docs/API Routes.md` — the admin assign/unassign routes (§4.4).
- `System Docs/Marker Syntax.md` — a short "markers vs. tools" note pointing at
  §3.1, so the boundary is written down where someone choosing between them will
  actually look.
- `System Docs/Known Gaps.md:1918-1926` — update the Memories entry's "there is
  still no generic tool-use wiring in this codebase," which would stop being
  true.
- `CLAUDE.md` — only if the stack line changes. It would not: no new dependency.
- This document — status header updated per phase, matching
  `identity_reconciliation_design_2026-08-16.md`'s convention.

---

## Appendix A — a missing design doc, found while grounding this

`Design Handovers/traffic_cop_design_2026-09-05.md` is cited as authoritative by
four live references — `System Docs/Utilities/Chat Server.md:215`,
`System Docs/Known Gaps.md:644`, `System Docs/Database Schema.md:46`, and
`services/chat/server/turn-context/shadow.ts:17` — and **is not on `main`**. Its
section numbers (§5.5, §5.10, §9.1–9.7) are also referenced from
`Design Handovers/september_2026/traffic-cop-punch-list (1).md`, which is the
only part of it that did land.

It exists on the unmerged branch `claude/traffic-cop-prompt-context-czvj9i`,
commit `0225f06` ("Add Traffic Cop design doc: shared prompt selection +
per-turn context injection"), 812 lines. It is load-bearing for the phase plan
currently being executed.

Flagged, not fixed — out of scope for this document, and Jeff's call (§11.6).

## Appendix B — unverifiable from the repo (stated, not guessed)

- **How `claude-sonnet-4-6` actually behaves through `@ai-sdk/anthropic@0.0.39`
  with tools.** Requires a live call. §9 row 1.
- **Whether `node_modules` matches the lockfiles on Vercel.** Everything in §1
  and §2 is read from npm tarballs at the lockfile-resolved versions, which is
  strong evidence but not the deployed tree.
- **Anthropic's current tool-use API surface** beyond what provider 0.0.39
  implements — a newer provider may map things this one cannot, which would
  change §1.4's "no upgrade needed" if §9 row 1 fails.
- **Whether `stop_requested_at` polling behaves across a step boundary.** §3.7.
- **Live `prompt_type_tenants` row counts**, which would tell us whether the
  union-read path in §4.1 has ever been exercised beyond the SBL tenant.
