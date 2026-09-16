// services/chat/server/stream-utils.ts
//
// Dependency-free by design: this module is imported by CLIENT code
// (services/chat/ui/v1/useChatTurn.ts, components/admin/PromptBuilderChat.tsx)
// as well as server code, so it must never pull in a server-only import.

/**
 * The bounded set of reasons an in-stream `3:` error part can carry.
 *
 * This is a **category classifier, not an error string** — the same discipline
 * as `sanitizeFailureReason` (services/media/errorCopy.ts): a raw provider
 * error may name a vendor, a URL, an internal path, or the arguments a tool was
 * called with, and regex-scrubbing an open-ended string is inherently
 * incomplete. Mapping to a fixed vocabulary guarantees none of that can reach
 * the browser, whatever the underlying error actually said.
 *
 * Produced server-side by `describeStreamError` (./stream.ts) and read back
 * client-side by `parseStreamErrorCode` below. Adding a member means updating
 * both ends plus the mapping in useChatTurn's `streamTurn`.
 */
export type StreamErrorCode =
  | 'rate_limited'
  | 'auth_error'
  | 'unknown_tool'
  | 'invalid_tool_arguments'
  | 'aborted'
  | 'upstream_error'

const STREAM_ERROR_CODES: readonly StreamErrorCode[] = [
  'rate_limited',
  'auth_error',
  'unknown_tool',
  'invalid_tool_arguments',
  'aborted',
  'upstream_error',
]

/**
 * Narrows a `3:` part's message to a known `StreamErrorCode`.
 *
 * Returns `null` — meaning "an error happened but it did not say what" — for
 * three distinct cases the caller must treat identically:
 *   1. `''`, the AI SDK's own default masking. `toDataStreamResponse()` called
 *      with no options uses `getErrorMessage: () => ''`, so before this
 *      mechanism existed every in-stream error arrived as a literal `3:""`.
 *      A deployment that predates `describeStreamError` still emits that.
 *   2. Any string not in the vocabulary — a future code this client is too old
 *      to know about, so an older client keeps working against a newer server.
 *   3. `null`/`undefined`, i.e. no error part at all.
 *
 * `null` therefore means "fall back to the previous behaviour," never "no
 * error" — presence is tracked separately by the caller.
 */
export function parseStreamErrorCode(
  message: string | null | undefined,
): StreamErrorCode | null {
  if (typeof message !== 'string' || message.length === 0) return null
  return (STREAM_ERROR_CODES as readonly string[]).includes(message)
    ? (message as StreamErrorCode)
    : null
}

/**
 * Reads a Vercel AI SDK data stream response and accumulates text deltas.
 *
 * The SDK encodes text chunks as lines in the format `0:"delta text"`.
 * This function parses those lines, accumulates the full response, and
 * calls `onChunk` with the accumulated text after each delta.
 *
 * `onStreamError` is optional and additive: when supplied, it is invoked
 * with the message from an in-stream `3:"..."` error part — the AI SDK's
 * data-stream protocol signal for a failure that happened after the response
 * had already started streaming as a 200 (e.g. an upstream provider error
 * mid-generation). Callers that omit it (the admin composer transport) see
 * no change in behavior — those lines are simply skipped, as before.
 *
 * The message it receives is a `StreamErrorCode` when the server classified
 * the failure, and `''` when it did not (see `parseStreamErrorCode`). Callers
 * should route it through that helper rather than comparing strings.
 *
 * Every other part code — `2:` data, `8:` annotations, `9:` tool call,
 * `a:` tool result, `b:`/`c:` tool-call streaming, `d:`/`e:` finish — is
 * deliberately ignored, which is what keeps this parser forward-compatible
 * with stream shapes it does not yet understand.
 *
 * @returns The final accumulated text.
 */
export async function readDataStream(
  response: Response,
  onChunk: (accumulated: string) => void,
  onStreamError?: (message: string) => void
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''

  const processLine = (line: string) => {
    const textMatch = line.match(/^0:"(.*)"$/)
    if (textMatch) {
      try {
        const delta = JSON.parse(`"${textMatch[1]}"`)
        accumulated += delta
        onChunk(accumulated)
      } catch {
        // skip malformed lines
      }
      return
    }
    if (!onStreamError) return
    const errorMatch = line.match(/^3:"(.*)"$/)
    if (errorMatch) {
      try {
        onStreamError(JSON.parse(`"${errorMatch[1]}"`))
      } catch {
        onStreamError(errorMatch[1])
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      // Flush any incomplete line that was never terminated with a newline
      if (buffer) processLine(buffer)
      break
    }

    const text = buffer + decoder.decode(value, { stream: true })
    const lines = text.split('\n')
    // The last element may be an incomplete line — hold it for the next read
    buffer = lines.pop() ?? ''
    for (const line of lines) processLine(line)
  }

  return accumulated
}
