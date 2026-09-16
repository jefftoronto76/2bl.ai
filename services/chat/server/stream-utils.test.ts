// Covers readDataStream's handling of the data-stream protocol, and
// parseStreamErrorCode's narrowing of the `3:` error part.
//
// The behaviour under test is the fix for the client's error-masking blind
// spot: before it, every in-stream failure arrived as a literal `3:""` (the AI
// SDK's default masking) and the client could only ask "did an error happen",
// never "which one". These tests pin both the new classified path and the
// masked path that must keep working against a server that predates it.

import { describe, it, expect, vi } from 'vitest'
import { parseStreamErrorCode, readDataStream } from './stream-utils'

/** Builds a Response whose body streams `lines`, split across chunk boundaries. */
function streamOf(lines: string[], chunkSize = 1024): Response {
  const payload = lines.map(l => `${l}\n`).join('')
  const bytes = new TextEncoder().encode(payload)
  let offset = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close()
          return
        }
        controller.enqueue(bytes.slice(offset, offset + chunkSize))
        offset += chunkSize
      },
    }),
  )
}

describe('parseStreamErrorCode', () => {
  it('narrows every member of the vocabulary', () => {
    for (const code of [
      'rate_limited',
      'auth_error',
      'unknown_tool',
      'invalid_tool_arguments',
      'aborted',
      'upstream_error',
    ] as const) {
      expect(parseStreamErrorCode(code)).toBe(code)
    }
  })

  it('returns null for the SDK default masking — the blind spot this fixes', () => {
    expect(parseStreamErrorCode('')).toBeNull()
  })

  it('returns null for a code this client does not know, so an old client survives a new server', () => {
    expect(parseStreamErrorCode('some_future_code')).toBeNull()
  })

  it('returns null for absent input', () => {
    expect(parseStreamErrorCode(null)).toBeNull()
    expect(parseStreamErrorCode(undefined)).toBeNull()
  })

  it('does not narrow a raw provider message that merely contains a code', () => {
    // Guards the vocabulary against accidental substring matching — a raw
    // error string must never be mistaken for a classification.
    expect(parseStreamErrorCode('Error: rate_limited by upstream')).toBeNull()
  })
})

describe('readDataStream — text', () => {
  it('accumulates text deltas and reports the running total', async () => {
    const chunks: string[] = []
    const final = await readDataStream(streamOf(['0:"Hel"', '0:"lo"', '0:" there"']), c =>
      chunks.push(c),
    )
    expect(chunks).toEqual(['Hel', 'Hello', 'Hello there'])
    expect(final).toBe('Hello there')
  })

  it('reassembles a delta split across read boundaries', async () => {
    const chunks: string[] = []
    const final = await readDataStream(streamOf(['0:"alpha"', '0:"beta"'], 3), c => chunks.push(c))
    expect(final).toBe('alphabeta')
    expect(chunks.at(-1)).toBe('alphabeta')
  })

  it('unescapes JSON string escapes in a delta', async () => {
    const final = await readDataStream(streamOf(['0:"line\\nbreak \\"quoted\\""']), () => {})
    expect(final).toBe('line\nbreak "quoted"')
  })

  it('skips a malformed text line without throwing', async () => {
    const final = await readDataStream(streamOf(['0:"ok"', '0:"bad\\"', '0:"!"']), () => {})
    expect(final).toBe('ok!')
  })
})

describe('readDataStream — error part', () => {
  it('reports a masked error (3:"") as an empty message, not as absence', async () => {
    // The pre-fix wire shape. The callback MUST still fire: presence is what
    // tells the caller the turn failed, and '' is what tells it the server
    // could not say why.
    const onStreamError = vi.fn()
    await readDataStream(streamOf(['0:"partial"', '3:""']), () => {}, onStreamError)
    expect(onStreamError).toHaveBeenCalledTimes(1)
    expect(onStreamError).toHaveBeenCalledWith('')
    expect(parseStreamErrorCode(onStreamError.mock.calls[0][0])).toBeNull()
  })

  it('reports a classified error with its real message', async () => {
    const onStreamError = vi.fn()
    await readDataStream(streamOf(['0:"partial"', '3:"rate_limited"']), () => {}, onStreamError)
    expect(onStreamError).toHaveBeenCalledWith('rate_limited')
    expect(parseStreamErrorCode(onStreamError.mock.calls[0][0])).toBe('rate_limited')
  })

  it('still returns the text streamed before the failure', async () => {
    const text = await readDataStream(
      streamOf(['0:"said this"', '3:"upstream_error"']),
      () => {},
      vi.fn(),
    )
    expect(text).toBe('said this')
  })

  it('ignores error parts entirely when no handler is supplied', async () => {
    // The admin composer transport (PromptBuilderChat, prompt-builder page)
    // passes no third argument and must be unaffected by any of this.
    const final = await readDataStream(streamOf(['0:"text"', '3:"rate_limited"']), () => {})
    expect(final).toBe('text')
  })
})

describe('readDataStream — parts it must ignore', () => {
  it('drops every non-text, non-error part code', async () => {
    // Pins the forward-compatibility property the tool-calling design relies
    // on: `9:`/`a:` tool parts can be added to the wire without this client
    // needing to change. Also covers the `e:`/`d:` parts already sent today.
    const onStreamError = vi.fn()
    const chunks: string[] = []
    const final = await readDataStream(
      streamOf([
        '0:"before"',
        '2:[{"k":"v"}]',
        '8:[{"note":"x"}]',
        '9:{"toolCallId":"t1","toolName":"ping","args":{}}',
        'a:{"toolCallId":"t1","result":{"ok":true}}',
        'b:{"toolCallId":"t1","toolName":"ping"}',
        'c:{"toolCallId":"t1","argsTextDelta":"{"}',
        'e:{"finishReason":"tool-calls","isContinued":false}',
        '0:"after"',
        'd:{"finishReason":"stop"}',
      ]),
      c => chunks.push(c),
      onStreamError,
    )
    expect(final).toBe('beforeafter')
    expect(chunks).toEqual(['before', 'beforeafter'])
    expect(onStreamError).not.toHaveBeenCalled()
  })

  it('throws when the response has no body', async () => {
    await expect(readDataStream(new Response(null), () => {})).rejects.toThrow('No response body')
  })
})
