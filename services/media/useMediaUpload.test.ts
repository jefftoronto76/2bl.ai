// Covers the upload hook, including the dedup feature: a content hash is
// computed client-side (bytes never reach the server) and sent to
// /api/media/upload-url; a `duplicate: true` response means the server
// reused an existing row, so the Storage PUT is skipped entirely.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaUpload, type UploadResult } from './useMediaUpload'

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  throw new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

describe('useMediaUpload', () => {
  it('resolves an UploadResult on the happy path (upload-url -> PUT -> upload_completed event)', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === '/api/media/upload-url' && method === 'POST') {
        return jsonResponse({ signedUrl: 'https://signed.example/put', mediaItemId: 'item-1' })
      }
      if (url === 'https://signed.example/put' && method === 'PUT') {
        return jsonResponse({})
      }
      if (url === '/api/events/media' && method === 'POST') {
        return jsonResponse({ ok: true })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    const { result } = renderHook(() => useMediaUpload('session-1', null))
    const file = new File(['hello'], 'dog.jpg', { type: 'image/jpeg' })

    const uploadResult = await act(() => result.current.upload(file))

    expect(uploadResult).toEqual({ mediaItemId: 'item-1', type: 'image', filename: 'dog.jpg', status: 'pending' })
    expect(result.current.isUploading).toBe(false)
    expect(result.current.error).toBeNull()

    // A content hash is always attempted and sent (crypto.subtle is available
    // under happy-dom/Node's Web Crypto), even when nothing matches server-side.
    const uploadUrlCall = fetchMock.mock.calls.find(([input]) => input === '/api/media/upload-url')
    const sentBody = JSON.parse((uploadUrlCall![1] as RequestInit).body as string)
    expect(typeof sentBody.contentHash).toBe('string')
    expect(sentBody.contentHash).toHaveLength(64)

    const eventBodies = fetchMock.mock.calls
      .filter(([input]) => (typeof input === 'string' ? input : input.toString()) === '/api/events/media')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))
    expect(eventBodies.map((b) => b.event)).toEqual(['upload_started', 'upload_completed'])
  })

  it('on a duplicate response, resolves the existing mediaItemId WITHOUT ever PUTting to Storage', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === '/api/media/upload-url' && method === 'POST') {
        return jsonResponse({ mediaItemId: 'existing-item-1', duplicate: true, status: 'ready' })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    const { result } = renderHook(() => useMediaUpload('session-1', null))
    const file = new File(['hello'], 'dog.jpg', { type: 'image/jpeg' })

    const uploadResult = await act(() => result.current.upload(file))

    // The real status of the reused item is carried through — NOT hardcoded
    // to 'pending' — so a duplicate reusing an already-ready item is
    // reported as ready, not reset.
    expect(uploadResult).toEqual({ mediaItemId: 'existing-item-1', type: 'image', filename: 'dog.jpg', status: 'ready' })
    // Only the one call — no PUT, no lifecycle events fired for a dedup.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('classifies audio and document files correctly', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === '/api/media/upload-url') return jsonResponse({ signedUrl: 'https://signed.example/put', mediaItemId: 'item-1' })
      if (url === 'https://signed.example/put') return jsonResponse({})
      if (url === '/api/events/media') return jsonResponse({ ok: true })
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    const { result } = renderHook(() => useMediaUpload('session-1', null))

    const audioResult: UploadResult | null = await act(() =>
      result.current.upload(new File(['x'], 'memo.m4a', { type: 'audio/m4a' })),
    )
    expect(audioResult?.type).toBe('audio')

    const docResult: UploadResult | null = await act(() =>
      result.current.upload(new File(['x'], 'letter.pdf', { type: 'application/pdf' })),
    )
    expect(docResult?.type).toBe('document')
  })

  it('returns null and sets error when the upload-url request fails, without attempting the PUT', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/media/upload-url') {
        return jsonResponse({ error: 'File type not supported: video/quicktime' }, false, 415)
      }
      throw new Error(`unexpected fetch: ${init?.method} ${url}`)
    })

    const { result } = renderHook(() => useMediaUpload('session-1', null))
    const file = new File(['hello'], 'video.mov', { type: 'video/quicktime' })

    const uploadResult = await act(() => result.current.upload(file))

    expect(uploadResult).toBeNull()
    expect(result.current.error).toBe('File type not supported: video/quicktime')
    expect(result.current.isUploading).toBe(false)
    expect(fetchMock.mock.calls.some(([input]) => (typeof input === 'string' ? input : input.toString()).startsWith('https://signed.example'))).toBe(false)
  })

  it('returns null and fires an upload_failed event when the storage PUT fails', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === '/api/media/upload-url') {
        return jsonResponse({ signedUrl: 'https://signed.example/put', mediaItemId: 'item-1' })
      }
      if (url === 'https://signed.example/put') {
        return jsonResponse({}, false, 500)
      }
      if (url === '/api/events/media') {
        return jsonResponse({ ok: true })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    const { result } = renderHook(() => useMediaUpload('session-1', null))
    const file = new File(['hello'], 'dog.jpg', { type: 'image/jpeg' })

    const uploadResult = await act(() => result.current.upload(file))

    expect(uploadResult).toBeNull()
    expect(result.current.error).toBe('Storage upload failed: 500')

    const failedEvent = fetchMock.mock.calls
      .filter(([input]) => (typeof input === 'string' ? input : input.toString()) === '/api/events/media')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string))
      .find((b) => b.event === 'upload_failed')
    expect(failedEvent).toMatchObject({ mediaItemId: 'item-1', event: 'upload_failed' })
  })
})
