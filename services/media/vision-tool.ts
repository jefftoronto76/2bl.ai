const DEFAULT_MAX_TOKENS = 512

/** A single Anthropic tool definition — the JSON-schema-shaped contract a forced tool call must satisfy. */
export interface VisionTool {
  name: string
  description: string
  input_schema: object
}

/**
 * Strips a ```json ... ``` (or plain ``` ... ```) markdown code fence.
 * Kept as defense-in-depth for callVisionTool's no-tool-use-block fallback
 * below — see that function's doc comment for why this is no longer the
 * primary parsing path.
 */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : text
}

/**
 * Calls Claude with a single image and a single tool definition, forcing
 * tool use (`tool_choice: { type: 'tool', name: tool.name }`) so the model
 * MUST respond with a `tool_use` block shaped by `tool.input_schema` —
 * never free text. The message sent to the model carries the image only;
 * `tool.description` and its `input_schema` field descriptions ARE the
 * instruction now, so there's no separate "Return JSON only: {...}" text
 * to write or for the model to deviate from.
 *
 * Why forced tool_choice instead of a text instruction: a text instruction
 * is a suggestion the model can (and, in production, did) deviate from —
 * the confirmed, observed failure mode this replaces is Claude wrapping its
 * "JSON only" response in a ```json markdown fence despite being told not
 * to, which broke a plain `JSON.parse()` of the response text outright. A
 * forced tool call is a hard API-level constraint, not a prompt-level
 * request: the model has no free-text channel available to wrap anything
 * in, and `tool_use` input arrives as an already-parsed object per
 * Anthropic's API contract — no `JSON.parse()` needed on the happy path at
 * all.
 *
 * This is the intended pattern for any future "backend job needs
 * structured output from a model, with no ongoing conversation" case in
 * this codebase — define a tool with a JSON-schema `input_schema`, force
 * its use via this function, and read the typed result directly. It is
 * generic over T deliberately: today `services/media/processor.ts` is the
 * only caller, but nothing here is media-specific.
 *
 * This is UNRELATED to the marker system in
 * `services/chat/ui/v1/registry.ts` (e.g. `[BOOKING: ...]`, `[NAME: ...]`)
 * — do not conflate the two, and do not treat this as having replaced that
 * system anywhere. Markers are for a model emitting structured signals
 * INLINE, embedded in ordinary prose, during an actual conversation turn
 * that a visitor or member is having with the AI; the registry detects and
 * strips them from displayed text while the conversation continues. This
 * function is for the opposite situation: a standalone backend call with
 * no conversation happening and no prose response wanted at all, ever
 * (e.g. classifying an uploaded photo). Both patterns are legitimate,
 * solving different problems — use markers for in-conversation signals,
 * use this for structured-output-only backend jobs.
 *
 * Error handling is two-tiered, deliberately:
 * - A non-ok HTTP response is a hard failure and throws
 *   (`Error('Anthropic vision error: ${status} ${body}')`) — the caller
 *   decides how to handle that (e.g. failing the whole job).
 * - A response that comes back `ok` but without a matching `tool_use`
 *   block is an API-level edge case, not the common path (forced
 *   `tool_choice` makes it very unlikely) — this degrades gracefully
 *   instead of throwing. As extra defense-in-depth for that specific edge
 *   case, it looks for a `text` block and attempts the old
 *   fence-stripped-JSON.parse recovery before giving up; if that also
 *   fails, or there's no text block either, it resolves to `null` rather
 *   than throwing. Callers must handle a `null` result explicitly.
 */
export async function callVisionTool<T>(
  imageUrl: string,
  tool: VisionTool,
  apiKey: string,
  options: { model: string; maxTokens?: number },
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
      messages: [
        {
          role: 'user',
          content: [{ type: 'image', source: { type: 'url', url: imageUrl } }],
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic vision error: ${res.status} ${body}`)
  }

  const data = await res.json()
  const content: Array<{ type: string; name?: string; input?: unknown; text?: string }> =
    data.content ?? []

  const toolUseBlock = content.find(b => b.type === 'tool_use' && b.name === tool.name)
  if (toolUseBlock) return toolUseBlock.input as T

  const textBlock = content.find(b => b.type === 'text')
  if (textBlock?.text) {
    try {
      return JSON.parse(stripCodeFence(textBlock.text)) as T
    } catch {
      // Falls through to null below.
    }
  }

  return null
}
