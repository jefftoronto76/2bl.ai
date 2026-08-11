// This route is now an INTENTIONAL NO-OP on every INSERT — see the route
// file's own header comment for why (the Step 2 trigger-ordering fix moved
// the real trigger to POST /api/media/[id]/start-processing). These tests
// cover that the no-op is total: signature verification and payload
// filtering still work exactly as before, but nothing ever calls
// processMediaItem, regardless of payload shape.

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
  mockProcessMediaItem.mockReset()
  process.env.SUPABASE_WEBHOOK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.SUPABASE_WEBHOOK_SECRET
})

describe('POST /api/webhooks/media-process', () => {
  it('returns 401 when the signature is missing', async () => {
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

  it('is a no-op on a valid pending INSERT — signature verifies, but processMediaItem is never called', async () => {
    const res = await POST(makeRequest(pendingInsertPayload()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('is a no-op regardless of the INSERTed record\'s status', async () => {
    const res = await POST(makeRequest(pendingInsertPayload({ status: 'processing' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('skips a non-INSERT event', async () => {
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
})
