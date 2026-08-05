// Covers the Files API migration for PDF extraction — inline base64 hit
// Anthropic's documented 32MB per-request payload limit well below this
// app's own 50MB upload cap, so any document in that gap failed outright.
// These tests confirm the upload -> reference-by-file_id -> cleanup flow,
// including that cleanup runs even when extraction itself fails.
//
// Also covers the audit-logging pass: uploadFileToAnthropic/deleteAnthropicFile/
// extractTextFromPdf now emit logAiMediaEvent calls when a MediaAuditContext is
// supplied (the media pipeline's call, via processor.ts) and stay silent when
// it isn't (the unrelated admin document-upload route's call, unaffected).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractText, type MediaAuditContext } from './assets'
import { AuditAction } from '@/services/audit/types'

const mockIsMediaAuditEnabled = vi.fn()
const mockLogAiMediaEvent = vi.fn()

vi.mock('@/services/media', () => ({
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logAiMediaEvent: (...args: unknown[]) => mockLogAiMediaEvent(...args),
}))

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

const CTX: MediaAuditContext = {
  tenant_id: 'tenant-1',
  member_id: 'member-1',
  media_item_id: 'item-1',
  correlation_id: 'corr-1',
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogAiMediaEvent.mockReset().mockResolvedValue(undefined)
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
    // No context supplied (this is how the unrelated admin upload route calls
    // it) — no audit logging attempted at all.
    expect(mockLogAiMediaEvent).not.toHaveBeenCalled()
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

describe('extractText — audit logging, when a MediaAuditContext is supplied (the media pipeline call)', () => {
  it('logs MEDIA_FILE_UPLOAD_RECEIVED and MEDIA_PDF_EXTRACTION_RECEIVED on a full success', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'

      if (url === 'https://api.anthropic.com/v1/files' && method === 'POST') return jsonResponse({ id: 'file_abc123' })
      if (url === 'https://api.anthropic.com/v1/messages' && method === 'POST') {
        return jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Extracted PDF text.' }] })
      }
      if (url === 'https://api.anthropic.com/v1/files/file_abc123' && method === 'DELETE') return jsonResponse({})
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await extractText(Buffer.from('pdf'), 'application/pdf', CTX)

    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        member_id: 'member-1',
        media_item_id: 'item-1',
        correlation_id: 'corr-1',
        action: AuditAction.MEDIA_FILE_UPLOAD_RECEIVED,
        outcome: 'success',
        metadata: expect.objectContaining({ file_id: 'file_abc123' }),
      }),
    )
    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_PDF_EXTRACTION_RECEIVED,
        outcome: 'success',
        metadata: expect.objectContaining({ extracted_text_length: 'Extracted PDF text.'.length }),
      }),
    )
    // Cleanup succeeded — no failure event for it.
    expect(mockLogAiMediaEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_FILE_CLEANUP_FAILED }),
    )
  })

  it('logs MEDIA_FILE_UPLOAD_FAILED (not extraction) when the upload step fails', async () => {
    fetchMock.mockImplementation(async () => textResponse('too large', 413))

    await expect(extractText(Buffer.from('pdf'), 'application/pdf', CTX)).rejects.toThrow()

    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_FILE_UPLOAD_FAILED, outcome: 'failure' }),
    )
    expect(mockLogAiMediaEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_PDF_EXTRACTION_FAILED }),
    )
  })

  it('logs MEDIA_PDF_EXTRACTION_FAILED when the extraction HTTP call fails', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === 'https://api.anthropic.com/v1/files') return jsonResponse({ id: 'file_1' })
      if (url === 'https://api.anthropic.com/v1/messages') return textResponse('bad request', 400)
      if (method === 'DELETE') return jsonResponse({})
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await expect(extractText(Buffer.from('pdf'), 'application/pdf', CTX)).rejects.toThrow()

    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_PDF_EXTRACTION_FAILED, outcome: 'failure' }),
    )
  })

  it('logs MEDIA_PDF_EXTRACTION_FAILED when no text block is returned, without leaking raw response content into metadata', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === 'https://api.anthropic.com/v1/files') return jsonResponse({ id: 'file_1' })
      if (url === 'https://api.anthropic.com/v1/messages') {
        return jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'image', secret: 'raw vendor content' }] })
      }
      if (method === 'DELETE') return jsonResponse({})
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await expect(extractText(Buffer.from('pdf'), 'application/pdf', CTX)).rejects.toThrow(
      'No text returned from Anthropic',
    )

    const call = mockLogAiMediaEvent.mock.calls.find(
      ([arg]) => arg.action === AuditAction.MEDIA_PDF_EXTRACTION_FAILED,
    )
    expect(call).toBeDefined()
    expect(JSON.stringify(call![0].metadata)).not.toContain('raw vendor content')
    expect(call![0].metadata.content_block_count).toBe(1)
  })

  it('logs MEDIA_FILE_CLEANUP_FAILED when the delete call returns a non-ok response', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === 'https://api.anthropic.com/v1/files') return jsonResponse({ id: 'file_1' })
      if (url === 'https://api.anthropic.com/v1/messages') {
        return jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })
      }
      if (method === 'DELETE') return textResponse('not found', 404)
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await extractText(Buffer.from('pdf'), 'application/pdf', CTX)

    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_FILE_CLEANUP_FAILED, outcome: 'failure' }),
    )
  })

  it('logs MEDIA_FILE_CLEANUP_FAILED when the delete call throws', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === 'https://api.anthropic.com/v1/files') return jsonResponse({ id: 'file_1' })
      if (url === 'https://api.anthropic.com/v1/messages') {
        return jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })
      }
      if (method === 'DELETE') throw new TypeError('network error')
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await extractText(Buffer.from('pdf'), 'application/pdf', CTX)

    expect(mockLogAiMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_FILE_CLEANUP_FAILED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_message: 'network error' }),
      }),
    )
  })

  it('skips all audit logging when isMediaAuditEnabled() returns false, even with a context supplied', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === 'https://api.anthropic.com/v1/files') return jsonResponse({ id: 'file_1' })
      if (url === 'https://api.anthropic.com/v1/messages') {
        return jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })
      }
      if (method === 'DELETE') return jsonResponse({})
      throw new Error(`unexpected fetch: ${method} ${url}`)
    })

    await extractText(Buffer.from('pdf'), 'application/pdf', CTX)

    expect(mockLogAiMediaEvent).not.toHaveBeenCalled()
  })
})
