// Covers the Finding 1 fix: retry now drives processing directly instead of
// hoping the Supabase Database Webhook (INSERT-only) picks up its UPDATE —
// which it never could, regardless of how the webhook trigger is configured.
//
// Also covers the audit-logging pass: a successful retry logs
// MEDIA_RETRY_REQUESTED (actor-attributable — a member triggered this,
// distinct from the system-level MEDIA_PROCESS_* events processMediaItem
// logs on its own once reprocessing actually runs); an unexpected throw from
// processMediaItem logs MEDIA_RETRY_FAILED.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'
import { AuditAction } from '@/services/audit/types'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockGetMediaItem = vi.fn()
const mockUpdateMediaItem = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()
const mockProcessMediaItem = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/services/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: (...args: unknown[]) => mockSingle(...args),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/services/media', () => ({
  getMediaItem: (...args: unknown[]) => mockGetMediaItem(...args),
  updateMediaItem: (...args: unknown[]) => mockUpdateMediaItem(...args),
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
}))

vi.mock('@/services/media/processor', () => ({
  processMediaItem: (...args: unknown[]) => mockProcessMediaItem(...args),
}))

import { POST } from './route'

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'document',
    original_filename: 'letter.pdf',
    storage_path: 'tenant-1/media/member-1/item-1/letter.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    status: 'failed',
    derived_content: null,
    classification: null,
    error_message: 'something went wrong while processing this file',
    processed_at: '2026-08-05T00:00:00.000Z',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeRequest(): Request {
  return { headers: { get: () => null } } as unknown as Request
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetTenantFromRequest.mockReset()
  mockGetMediaItem.mockReset()
  mockUpdateMediaItem.mockReset().mockResolvedValue(undefined)
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockProcessMediaItem.mockReset().mockResolvedValue(undefined)
  mockSingle.mockReset()

  mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockResolvedValue('tenant-1')
  mockSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
})

describe('POST /api/media/[id]/retry', () => {
  it('returns 401 when there is no authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(401)
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the item does not exist', async () => {
    mockGetMediaItem.mockResolvedValue(null)
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(404)
  })

  it('returns 400 and does not touch the item when status is not failed', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ status: 'ready' }))
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('ready')
    expect(mockUpdateMediaItem).not.toHaveBeenCalled()
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('returns 403 when the requesting member does not own the item', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ member_id: 'someone-else' }))
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(403)
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('resets the item to pending and drives processing directly, without waiting on the DB webhook', async () => {
    const item = makeItem()
    mockGetMediaItem.mockResolvedValue(item)

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockUpdateMediaItem).toHaveBeenCalledWith('item-1', {
      status: 'pending',
      error_message: null,
      derived_content: null,
      classification: null,
      processed_at: null,
    })
    expect(mockProcessMediaItem).toHaveBeenCalledTimes(1)
    expect(mockProcessMediaItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1', tenant_id: 'tenant-1' }),
    )
  })

  it('still returns 200 even if processMediaItem rejects — fire-and-forget must not fail the request', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockProcessMediaItem.mockRejectedValue(new Error('boom'))

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the rejected promise's .catch() run
  })
})

describe('POST /api/media/[id]/retry — audit logging', () => {
  it('logs MEDIA_RETRY_REQUESTED on a successful reset, attributed to the requesting member', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())

    await POST(makeRequest(), makeParams('item-1'))

    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        member_id: 'member-1',
        media_item_id: 'item-1',
        action: AuditAction.MEDIA_RETRY_REQUESTED,
        outcome: 'success',
        metadata: expect.objectContaining({
          original_filename: 'letter.pdf',
          previous_error_message: 'something went wrong while processing this file',
        }),
      }),
    )
  })

  it('logs MEDIA_RETRY_FAILED when processMediaItem rejects unexpectedly, sharing the same correlation_id as the requested event', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockProcessMediaItem.mockRejectedValue(new Error('boom'))

    await POST(makeRequest(), makeParams('item-1'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const requestedCall = mockLogMediaEvent.mock.calls.find(([arg]) => arg.action === AuditAction.MEDIA_RETRY_REQUESTED)
    const failedCall = mockLogMediaEvent.mock.calls.find(([arg]) => arg.action === AuditAction.MEDIA_RETRY_FAILED)

    expect(requestedCall).toBeDefined()
    expect(failedCall).toBeDefined()
    expect(failedCall![0]).toEqual(
      expect.objectContaining({
        media_item_id: 'item-1',
        outcome: 'failure',
        correlation_id: requestedCall![0].correlation_id,
        metadata: expect.objectContaining({ error_message: 'boom' }),
      }),
    )
  })

  it('does not log MEDIA_RETRY_FAILED when processMediaItem succeeds', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())

    await POST(makeRequest(), makeParams('item-1'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockLogMediaEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_RETRY_FAILED }),
    )
  })

  it('skips all audit logging when isMediaAuditEnabled() returns false', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockProcessMediaItem.mockRejectedValue(new Error('boom'))

    await POST(makeRequest(), makeParams('item-1'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })
})
