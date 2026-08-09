// Covers useFreshImageUrl: it re-resolves a media item's signed url via
// GET /api/media/[id]/url at display time, since sessionImages' own url
// (services/media/display-url.ts) expires after 60s and is never refreshed.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFreshImageUrl } from './useFreshImageUrl'

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  throw new Error(`unexpected fetch: ${url}`)
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

describe('useFreshImageUrl', () => {
  it('shows the fallback immediately, then updates to the fetched fresh url', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/media/item-1/url') return jsonResponse({ url: 'https://signed.example/fresh' })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const { result } = renderHook(() => useFreshImageUrl('item-1', 'https://signed.example/stale'))

    expect(result.current.url).toBe('https://signed.example/stale')
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.url).toBe('https://signed.example/fresh'))
    expect(result.current.isLoading).toBe(false)
  })

  it('keeps the fallback url when the fresh fetch fails outright', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/media/item-1/url') return jsonResponse({ error: 'Forbidden' }, false, 403)
      throw new Error(`unexpected fetch: ${url}`)
    })

    const { result } = renderHook(() => useFreshImageUrl('item-1', 'https://signed.example/stale'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.url).toBe('https://signed.example/stale')
  })

  it('does not fetch at all when mediaItemId is undefined', async () => {
    const { result } = renderHook(() => useFreshImageUrl(undefined, 'https://signed.example/stale'))

    expect(result.current.url).toBe('https://signed.example/stale')
    expect(result.current.isLoading).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
