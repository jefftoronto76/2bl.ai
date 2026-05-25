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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    for (const line of text.split('\n')) {
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
  }

  return accumulated
}
