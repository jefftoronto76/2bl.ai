// Heirloom-local reader for the Vercel AI SDK data stream returned by
// POST /api/sage. The SDK encodes text deltas as lines of the form
// `0:"delta text"`. This parses those lines, accumulates the full response,
// and calls onChunk with the running total after each delta.
//
// Deliberately self-contained: the Heirloom storefront does not import
// src/lib/sage.ts or src/lib/stream.ts (those carry Sage store + admin
// coupling). The wire format is the only shared contract.
export async function readSageStream(
  response: Response,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      const match = line.match(/^0:"(.*)"$/);
      if (match) {
        try {
          const delta = JSON.parse(`"${match[1]}"`);
          accumulated += delta;
          onChunk(accumulated);
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  return accumulated;
}
