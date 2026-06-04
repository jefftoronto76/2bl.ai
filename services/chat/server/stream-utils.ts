/**
 * Reads a Vercel AI SDK data stream response and accumulates text deltas.
 *
 * The SDK encodes text chunks as lines in the format `0:"delta text"`.
 * This function parses those lines, accumulates the full response, and
 * calls `onChunk` with the accumulated text after each delta.
 *
 * @returns The final accumulated text.
 */
export async function readDataStream(
  response: Response,
  onChunk: (accumulated: string) => void
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''

  const processLine = (line: string) => {
    const match = line.match(/^0:"(.*)"$/)
    if (match) {
      try {
        const delta = JSON.parse(`"${match[1]}"`)
        accumulated += delta
        onChunk(accumulated)
      } catch {
        // skip malformed lines
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
