// First-ever test coverage for this route. It stays INSERT-only permanently
// under the Finding 1 fix (retry now drives processing directly instead of
// relying on this webhook to pick up an UPDATE) — the "UPDATE is skipped"
// case below documents that as intentional, ongoing behavior, not a gap.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockProcessMediaItem = vi.fn()

vi.mock('@/services/media/processor', () => ({
  processMediaItem: (...args: unknown[]) => mockProcessMediaItem(...args),
}))

import { POST } from './route'

const SECRET = 'test-webhook-secret'

function makeRequest(body: string, signature: string | null = SECRET): Request {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'x-supabase-signature' ? signature : null) },
    text: async () => body,
  } as unknown as Request
}

function pendingInsertPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'INSERT',
    table: 'media_items',
    schema: 'public',
    record: { id: 'item-1', tenant_id: 'tenant-1', type: 'image', status: 'pending', ...overrides },
    old_record: null,
  })
}

beforeEach(() => {
  mockProcessMediaItem.mockReset().mockResolvedValue(undefined)
  process.env.SUPABASE_WEBHOOK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.SUPABASE_WEBHOOK_SECRET
})

describe('POST /api/webhooks/media-process', () => {
  it('returns 401 and never processes when the signature is missing', async () => {
    const res = await POST(makeRequest(pendingInsertPayload(), null))
    expect(res.status).toBe(401)
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('returns 401 when the signature does not match', async () => {
    const res = await POST(makeRequest(pendingInsertPayload(), 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('returns 400 on a malformed JSON body', async () => {
    const res = await POST(makeRequest('not json'))
    expect(res.status).toBe(400)
  })

  it('processes a pending INSERT on media_items', async () => {
    const res = await POST(makeRequest(pendingInsertPayload()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockProcessMediaItem).toHaveBeenCalledTimes(1)
    expect(mockProcessMediaItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', tenant_id: 'tenant-1' }),
    )
  })

  it('skips (idempotency guard) an INSERT payload whose record is not pending — a duplicate delivery', async () => {
    const res = await POST(makeRequest(pendingInsertPayload({ status: 'processing' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('skips a non-INSERT event — permanent, intentional behavior under the direct-call retry fix, not a gap', async () => {
    const body = JSON.stringify({
      type: 'UPDATE',
      table: 'media_items',
      schema: 'public',
      record: { id: 'item-1', tenant_id: 'tenant-1', type: 'image', status: 'pending' },
      old_record: null,
    })
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('skips events on any table other than media_items', async () => {
    const body = JSON.stringify({
      type: 'INSERT',
      table: 'other_table',
      schema: 'public',
      record: { id: 'item-1', tenant_id: 'tenant-1', status: 'pending' },
      old_record: null,
    })
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('still returns 200 even if processMediaItem rejects — fire-and-forget must not fail the request', async () => {
    mockProcessMediaItem.mockRejectedValue(new Error('boom'))
    const res = await POST(makeRequest(pendingInsertPayload()))
    expect(res.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
