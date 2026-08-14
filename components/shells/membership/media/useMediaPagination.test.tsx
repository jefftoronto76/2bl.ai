// Covers useMediaPagination — the shared incremental-fetch hook behind
// MediaPage.tsx/MediaGallery.tsx's scroll-driven loading. Three behaviors
// the task specifically calls out: scrolling near the bottom fetches the
// next page and appends (not replaces) the list; no duplicate items when
// pages overlap or a reload re-fetches an already-seen id; and the first
// page alone drives `loading` (the caller's skeleton), while later pages
// only ever touch `loadingMore`.
//
// A small render harness (not the bare renderHook) is used deliberately —
// the hook's sentinel-triggered fetch only wires up once its
// IntersectionObserver actually observes a real DOM node
// (sentinelRef.current), so the test needs a mounted `<div ref={...}>`,
// not just the hook's return value in isolation.
//
// happy-dom (this project's vitest environment) does not implement
// IntersectionObserver, so it's mocked here — the mock captures the
// callback passed to `new IntersectionObserver(cb, opts)` so tests can
// fire a synthetic intersection entry directly, standing in for a real
// scroll-into-view event.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useMediaPagination } from './useMediaPagination'
import type { MediaItemWithUrl } from '@/services/media/display-url'

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void

let ioCallbacks: IOCallback[] = []

class MockIntersectionObserver {
  callback: IOCallback
  constructor(callback: IOCallback) {
    this.callback = callback
    ioCallbacks.push(callback)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

function fireIntersect(isIntersecting = true) {
  ioCallbacks.forEach((cb) => cb([{ isIntersecting }]))
}

const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  throw new Error(`unexpected fetch: ${url}`)
})

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

function makeItem(id: string): MediaItemWithUrl {
  return {
    id,
    tenant_id: 't1',
    member_id: 'm1',
    chat_id: null,
    story_id: null,
    type: 'image',
    original_filename: `${id}.jpg`,
    storage_path: `t1/m1/${id}/${id}.jpg`,
    file_size_bytes: 100,
    mime_type: 'image/jpeg',
    status: 'ready',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    url: `https://signed.example/${id}.jpg`,
  }
}

beforeEach(() => {
  ioCallbacks = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function buildUrl({ limit, cursor }: { limit: number; cursor: string | null }) {
  return `/api/media?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
}

type Hook = ReturnType<typeof useMediaPagination>

function TestHarness({ queryKey, resultBox }: { queryKey: string | null; resultBox: { current: Hook | null } }) {
  const hook = useMediaPagination({ queryKey, buildUrl });
  resultBox.current = hook;
  return <div ref={hook.sentinelRef} data-testid="sentinel" />;
}

function setup(queryKey: string | null) {
  const resultBox: { current: Hook | null } = { current: null };
  const { rerender } = render(<TestHarness queryKey={queryKey} resultBox={resultBox} />);
  return {
    box: resultBox,
    rerender: (nextQueryKey: string | null) =>
      rerender(<TestHarness queryKey={nextQueryKey} resultBox={resultBox} />),
  };
}

describe('useMediaPagination', () => {
  it('fetches page one on mount, with loading true until it resolves', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [makeItem('a'), makeItem('b')], hasMore: false, nextCursor: null }),
    )

    const { box } = setup('account')

    expect(box.current!.loading).toBe(true)
    await waitFor(() => expect(box.current!.loading).toBe(false))

    expect(box.current!.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(fetchMock).toHaveBeenCalledWith('/api/media?limit=24')
  })

  it('does not fetch when queryKey is null, and reports loading: false immediately', async () => {
    const { box } = setup(null)

    await waitFor(() => expect(box.current!.loading).toBe(false))
    expect(box.current!.items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('scrolling the sentinel into view fetches the next page and appends — not replaces', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [makeItem('a'), makeItem('b')], hasMore: true, nextCursor: 'cursor-1' }),
    )
    const { box } = setup('account')
    await waitFor(() => expect(box.current!.loading).toBe(false))
    expect(box.current!.items.map((i) => i.id)).toEqual(['a', 'b'])

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [makeItem('c'), makeItem('d')], hasMore: false, nextCursor: null }),
    )

    act(() => fireIntersect(true))

    await waitFor(() => expect(box.current!.loadingMore).toBe(false))
    expect(box.current!.items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(fetchMock).toHaveBeenLastCalledWith('/api/media?limit=24&cursor=cursor-1')
  })

  it('the first-page skeleton flag never flips true again for a later page — only loadingMore does', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [makeItem('a')], hasMore: true, nextCursor: 'cursor-1' }))
    const { box } = setup('account')
    await waitFor(() => expect(box.current!.loading).toBe(false))

    let resolveSecondPage: (v: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSecondPage = resolve;
        }),
    )
    act(() => fireIntersect(true))

    await waitFor(() => expect(box.current!.loadingMore).toBe(true))
    expect(box.current!.loading).toBe(false) // skeleton never re-triggers

    act(() => resolveSecondPage(jsonResponse({ items: [makeItem('b')], hasMore: false, nextCursor: null })))
    await waitFor(() => expect(box.current!.loadingMore).toBe(false))
    expect(box.current!.loading).toBe(false)
  })

  it('does not duplicate an item that reappears on an overlapping/re-fetched page', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [makeItem('a'), makeItem('b')], hasMore: true, nextCursor: 'cursor-1' }),
    )
    const { box } = setup('account')
    await waitFor(() => expect(box.current!.loading).toBe(false))

    // Server-side cursor drift (e.g. a boundary-tie edge case, or a client
    // retry after a dropped response) returns an id already appended.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [makeItem('b'), makeItem('c')], hasMore: false, nextCursor: null }),
    )
    act(() => fireIntersect(true))
    await waitFor(() => expect(box.current!.loadingMore).toBe(false))

    const ids = box.current!.items.map((i) => i.id)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not duplicate items when the scope resets and refetches page one (e.g. a "reload")', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [makeItem('a')], hasMore: false, nextCursor: null }))
    const { box, rerender } = setup('chat-1')
    await waitFor(() => expect(box.current!.loading).toBe(false))
    expect(box.current!.items.map((i) => i.id)).toEqual(['a'])

    // Reload with the identical id coming back from a fresh page-one fetch.
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [makeItem('a')], hasMore: false, nextCursor: null }))
    act(() => rerender('chat-2'))
    await waitFor(() => expect(box.current!.loading).toBe(false))

    expect(box.current!.items.map((i) => i.id)).toEqual(['a'])
  })

  it('ignores a sentinel intersection once hasMore is false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [makeItem('a')], hasMore: false, nextCursor: null }))
    const { box } = setup('account')
    await waitFor(() => expect(box.current!.loading).toBe(false))

    fetchMock.mockClear()
    act(() => fireIntersect(true))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
