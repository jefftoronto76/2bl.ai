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
