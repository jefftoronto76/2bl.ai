// Covers useMemories's reviseBlocks — the block-canvas mutation (Memory
// Canvas V1 backend). Mirrors useMediaUpload.test.ts's renderHook/fetch-mock
// convention. reviseBlocks follows rename()'s shape for failure handling (no
// pre-emptive optimistic mutation — a failure just logs and leaves state
// exactly as it was, since nothing was changed ahead of the request to roll
// back), but NOT for its success path: unlike title (a field the client
// fully controls), the server derives `body` from `blocks` via its own
// flattening logic (reviseMemoryBlocks, services/crm/memories.ts), so
// success must parse and trust the response body rather than echoing the
// client's own arguments (a real bug, found in review — see this file's git
// history) — the first test below is written specifically to fail if that
// regresses.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMemories, type MemoryRow } from './useMemories'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return { ok, status, json: async () => body } as Response
}

const SEEDED_MEMORY: MemoryRow = {
  id: 'mem-1',
  session_id: 'sess-1',
  anchor_message_id: 'm1',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer by the lake.',
  body_blocks: null,
  status: 'published',
  created_at: 'now',
  updated_at: 'now',
}

const OTHER_MEMORY: MemoryRow = {
  ...SEEDED_MEMORY,
  id: 'mem-2',
  anchor_message_id: 'm2',
  title: 'The Garden',
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  const method = init?.method ?? 'GET'
  if (url === '/api/sessions/sess-1/memories' && method === 'GET') {
    return jsonResponse({ memories: [SEEDED_MEMORY, OTHER_MEMORY] })
  }
  throw new Error(`unexpected fetch: ${method} ${url}`)
})

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function renderLoaded() {
  const { result } = renderHook(() => useMemories('sess-1'))
  await waitFor(() => expect(result.current.isLoaded).toBe(true))
  return result
}

describe('useMemories.reviseBlocks', () => {
  it('PATCHes action: revise_blocks with the memory id and blocks, and merges the SERVER RESPONSE (not the client argument) into local state on success', async () => {
    const result = await renderLoaded()
    // The client sends unflattened, padded content — reviseMemoryBlocks
    // (services/crm/memories.ts) stores blocks verbatim but computes a
    // freshly trimmed/flattened `body` server-side. The mocked response's
    // `body` is deliberately NOT what the old buggy implementation would
    // have left in place (SEEDED_MEMORY.body, untouched) — if reviseBlocks
    // ever regresses to echoing the client's own arguments instead of
    // reading this response, `body` below stays stale and this test fails.
    const serverMemory = {
      ...SEEDED_MEMORY,
      body_blocks: [{ id: 'b1', type: 'text', content: '  Revised passage.  ' }],
      body: 'Revised passage.',
    }
    fetchMock.mockImplementationOnce(async () => jsonResponse({ memory: serverMemory }))

    const blocks = [{ id: 'b1', type: 'text' as const, content: '  Revised passage.  ' }]
    await act(() => result.current.reviseBlocks('mem-1', blocks))

    const [, patchCall] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/sessions/sess-1/memories/mem-1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(JSON.parse((patchCall as RequestInit).body as string)).toEqual({ action: 'revise_blocks', blocks })

    const updated = result.current.memories.find(m => m.id === 'mem-1')
    expect(updated?.body_blocks).toEqual(serverMemory.body_blocks)
    expect(updated?.body).toBe('Revised passage.') // the server's flattened body, not the stale seed and not a client-side re-derivation
    // The other memory is untouched.
    expect(result.current.memories.find(m => m.id === 'mem-2')).toEqual(OTHER_MEMORY)
  })

  it('leaves local state unchanged when the PATCH response is not ok (nothing to roll back — no pre-emptive mutation)', async () => {
    const result = await renderLoaded()
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: 'boom' }, false, 500))

    const before = result.current.memories
    await act(() => result.current.reviseBlocks('mem-1', [{ id: 'b1', type: 'text', content: 'x' }]))

    expect(result.current.memories).toBe(before) // same reference — setMemories never called
    expect(console.error).toHaveBeenCalledWith('[useMemories] reviseBlocks failed:', 500)
  })

  it('leaves local state unchanged and logs when the fetch itself throws', async () => {
    const result = await renderLoaded()
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('network down')
    })

    const before = result.current.memories
    await act(() => result.current.reviseBlocks('mem-1', [{ id: 'b1', type: 'text', content: 'x' }]))

    expect(result.current.memories).toBe(before)
    expect(console.error).toHaveBeenCalledWith('[useMemories] reviseBlocks threw:', expect.any(Error))
  })

  it('is a no-op with no session id — never calls fetch', async () => {
    const { result } = renderHook(() => useMemories(null))
    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    fetchMock.mockClear()

    await act(() => result.current.reviseBlocks('mem-1', [{ id: 'b1', type: 'text', content: 'x' }]))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
