const DEFAULT_MAX_TOKENS = 512

/** A single Anthropic tool definition — the JSON-schema-shaped contract a forced tool call must satisfy. */
export interface AnthropicTool {
  name: string
  description: string
  input_schema: object
}

type AnthropicContentBlock =
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'text'; text: string }

/**
 * Strips a ```json ... ``` (or plain ``` ... ```) markdown code fence.
 * Kept as defense-in-depth for callAnthropicTool's no-tool-use-block
 * fallback below — see that function's doc comment for why this is no
 * longer the primary parsing path.
 */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : text
}

/**
 * Shared core behind every forced tool-use call in this codebase. Sends
 * caller-built `content` blocks plus a single tool definition to Claude,
 * forcing tool use (`tool_choice: { type: 'tool', name: tool.name }`) so
 * the model MUST respond with a `tool_use` block shaped by
 * `tool.input_schema` — never free text. `tool.description` and its
 * `input_schema` field descriptions ARE the instruction; there's no
 * separate "Return JSON only: {...}"-style text to write or for the model
 * to deviate from.
 *
 * Why forced tool_choice instead of a text instruction: a text instruction
 * is a suggestion the model can (and, in production, did) deviate from —
 * the confirmed, observed failure mode this replaces is Claude wrapping a
 * "JSON only" response in a ```json markdown fence despite being told not
 * to, which broke a plain `JSON.parse()` of the response text outright,
 * and the closely related risk of an unconstrained free-text response
 * (e.g. a one-word classification) coming back polluted with extra prose
 * or a fence with nothing validating it before it's stored. A forced tool
 * call is a hard API-level constraint, not a prompt-level request: the
 * model has no free-text channel available to wrap or pad anything with,
 * and `tool_use` input arrives as an already-parsed object per Anthropic's
 * API contract — no `JSON.parse()` needed on the happy path at all.
 *
 * This is the intended pattern for any future "backend job needs
 * structured output from a model, with no ongoing conversation" case in
 * this codebase — define a tool with a JSON-schema `input_schema`, force
 * its use, and read the typed result directly. Not exported: callers go
 * through `callVisionTool` (image input) or `callTextTool` (text input)
 * below, both thin wrappers that just build the right `content` shape and
 * an accurate `errorLabel` for their own failure messages.
 *
 * This is UNRELATED to the marker system in
 * `services/chat/ui/v1/registry.ts` (e.g. `[BOOKING: ...]`, `[NAME: ...]`)
 * — do not conflate the two, and do not treat this as having replaced that
 * system anywhere. Markers are for a model emitting structured signals
 * INLINE, embedded in ordinary prose, during an actual conversation turn
 * that a visitor or member is having with the AI; the registry detects and
 * strips them from displayed text while the conversation continues. This
 * function (and its two wrappers) is for the opposite situation: a
 * standalone backend call with no conversation happening and no prose
 * response wanted at all, ever (e.g. classifying an uploaded photo or
 * document). Both patterns are legitimate, solving different problems —
 * use markers for in-conversation signals, use this for
 * structured-output-only backend jobs.
 *
 * Error handling is two-tiered, deliberately:
 * - A non-ok HTTP response is a hard failure and throws
 *   (`Error('${errorLabel} error: ${status} ${body}')`) — the caller
 *   decides how to handle that (e.g. failing the whole job, or — as
 *   `processDocument`'s classification pass does — catching it and
 *   falling back to a default).
 * - A response that comes back `ok` but without a matching `tool_use`
 *   block is an API-level edge case, not the common path (forced
 *   `tool_choice` makes it very unlikely) — this degrades gracefully
 *   instead of throwing. As extra defense-in-depth for that specific edge
 *   case, it looks for a `text` block and attempts the old
 *   fence-stripped-JSON.parse recovery before giving up; if that also
 *   fails, or there's no text block either, it resolves to `null` rather
 *   than throwing. Callers must handle a `null` result explicitly.
 */
async function callAnthropicTool<T>(
  content: AnthropicContentBlock[],
  tool: AnthropicTool,
  apiKey: string,
  options: { model: string; maxTokens?: number },
  errorLabel: string,
): Promise<T | null> {
  const { model, maxTokens = DEFAULT_MAX_TOKENS } = options

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${errorLabel} error: ${res.status} ${body}`)
  }

  const data = await res.json()
  const responseContent: Array<{ type: string; name?: string; input?: unknown; text?: string }> =
    data.content ?? []

  const toolUseBlock = responseContent.find(b => b.type === 'tool_use' && b.name === tool.name)
  if (toolUseBlock) return toolUseBlock.input as T

  const textBlock = responseContent.find(b => b.type === 'text')
  if (textBlock?.text) {
    try {
      return JSON.parse(stripCodeFence(textBlock.text)) as T
    } catch {
      // Falls through to null below.
    }
  }

  return null
}

/**
 * Forced tool-use call with an image as input — e.g. `processImage`'s
 * vision analysis (caption/classification/extracted_text). Thin wrapper
 * over `callAnthropicTool`: builds the image `content` block and labels
 * its own thrown errors `'Anthropic vision error: ...'`. See
 * `callAnthropicTool`'s doc comment for the full contract (why forced
 * tool_choice, the two-tiered error handling, the marker-system
 * distinction).
 */
export async function callVisionTool<T>(
  imageUrl: string,
  tool: AnthropicTool,
  apiKey: string,
  options: { model: string; maxTokens?: number },
): Promise<T | null> {
  return callAnthropicTool<T>(
    [{ type: 'image', source: { type: 'url', url: imageUrl } }],
    tool,
    apiKey,
    options,
    'Anthropic vision',
  )
}

/**
 * Forced tool-use call with plain text as input — e.g.
 * `processDocument`'s single-word classification pass over extracted
 * document text. Thin wrapper over `callAnthropicTool`: builds the text
 * `content` block and labels its own thrown errors `'Anthropic tool-use
 * error: ...'` (a text call isn't "vision", so it gets its own accurate
 * label rather than `callVisionTool`'s). Same forced-tool_choice contract,
 * same two-tiered error handling, same fallback/degrade behavior — see
 * `callAnthropicTool`'s doc comment.
 */
export async function callTextTool<T>(
  text: string,
  tool: AnthropicTool,
  apiKey: string,
  options: { model: string; maxTokens?: number },
): Promise<T | null> {
  return callAnthropicTool<T>(
    [{ type: 'text', text }],
    tool,
    apiKey,
    options,
    'Anthropic tool-use',
  )
}
