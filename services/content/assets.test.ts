// Covers the Files API migration for PDF extraction — inline base64 hit
// Anthropic's documented 32MB per-request payload limit well below this
// app's own 50MB upload cap, so any document in that gap failed outright.
// These tests confirm the upload -> reference-by-file_id -> cleanup flow,
// including that cleanup runs even when extraction itself fails.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractText } from './assets'

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  const method = init?.method ?? 'GET'
  throw new Error(`unexpected fetch: ${method} ${url}`)
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

function textResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ANTHROPIC_API_KEY
})

describe('extractText — pdf via Anthropic Files API', () => {
  it('uploads the buffer, extracts using the returned file_id, then deletes the uploaded file on success', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === 'https://api.anthropic.com/v1/files' && method === 'POST') {
        return jsonResponse({ id: 'file_abc123' })
      }
      if (url === 'https://api.anthropic.com/v1/messages' && method === 'POST') {
        const body = JSON.parse(init!.body as string)
        expect(body.messages[0].content[0]).toEqual({
          type: 'document',
          source: { type: 'file', file_id: 'file_abc123' },
        })
        return jsonResponse({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Extracted PDF text.' }],
        })
      }
      if (url === 'https://api.anthropic.com/v1/files/file_abc123' && method === 'DELETE') {
        return jsonResponse({ id: 'file_abc123', type: 'file_deleted' })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    const result = await extractText(Buffer.from('%PDF-1.4 fake pdf bytes'), 'application/pdf')

    expect(result).toBe('Extracted PDF text.')
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/files', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/files/file_abc123',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws and never attempts extraction when the file upload itself fails', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === 'https://api.anthropic.com/v1/files') {
        return textResponse('upload rejected', 413)
      }
      throw new Error(`unexpected fetch: ${init?.method} ${url}`)
    })

    await expect(extractText(Buffer.from('big pdf'), 'application/pdf')).rejects.toThrow(
      'Anthropic file upload error: 413',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still deletes the uploaded file when the extraction call fails', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === 'https://api.anthropic.com/v1/files' && method === 'POST') {
        return jsonResponse({ id: 'file_xyz789' })
      }
      if (url === 'https://api.anthropic.com/v1/messages' && method === 'POST') {
        return textResponse('page limit exceeded', 400)
      }
      if (url === 'https://api.anthropic.com/v1/files/file_xyz789' && method === 'DELETE') {
        return jsonResponse({ id: 'file_xyz789', type: 'file_deleted' })
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await expect(extractText(Buffer.from('pdf'), 'application/pdf')).rejects.toThrow('Anthropic API error: 400')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/files/file_xyz789',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('a failed cleanup delete does not mask the real extraction error', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === 'https://api.anthropic.com/v1/files' && method === 'POST') {
        return jsonResponse({ id: 'file_cleanup_fail' })
      }
      if (url === 'https://api.anthropic.com/v1/messages' && method === 'POST') {
        return textResponse('bad request', 400)
      }
      if (url === 'https://api.anthropic.com/v1/files/file_cleanup_fail' && method === 'DELETE') {
        return textResponse('not found', 404)
      }
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await expect(extractText(Buffer.from('pdf'), 'application/pdf')).rejects.toThrow('Anthropic API error: 400')
  })

  it('throws before any fetch when ANTHROPIC_API_KEY is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY

    await expect(extractText(Buffer.from('pdf'), 'application/pdf')).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('extractText — non-pdf types are unaffected by the Files API change', () => {
  it('extracts plain text directly from the buffer, with no Anthropic calls at all', async () => {
    const result = await extractText(Buffer.from('hello world'), 'text/plain')

    expect(result).toBe('hello world')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
