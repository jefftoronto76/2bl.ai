// Covers this route's own orchestration: auth/ownership guards, the
// stale-processing age check, and how it reacts to verifyAndReprocess's two
// possible outcomes ('reprocessing' vs 'needs_reupload'). verifyAndReprocess
// itself (the objectExists check, the DB writes, the after()-wrapped
// processMediaItem call, and its own MEDIA_RETRY_FAILED-on-throw logging)
// is mocked here and covered separately in services/media/processor.test.ts —
// this file only asserts THIS route calls it correctly and shapes its
// response/audit trail around whatever it returns.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'
import { AuditAction } from '@/services/audit/types'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockGetMediaItem = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()
const mockVerifyAndReprocess = vi.fn()
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
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
  // Real values, not mocks — the route's stale-processing backstop does real
  // arithmetic against these, and the whole point of these tests is
  // exercising that arithmetic.
  MAX_PROCESSING_AGE_SECONDS: { image: 300, document: 600, audio: 5400 },
  NEEDS_REUPLOAD_ERROR_MESSAGE: 'This file needs to be uploaded again',
}))

vi.mock('@/services/media/processor', () => ({
  verifyAndReprocess: (...args: unknown[]) => mockVerifyAndReprocess(...args),
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
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockVerifyAndReprocess.mockReset().mockResolvedValue('reprocessing')
  mockSingle.mockReset()

  mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockResolvedValue('tenant-1')
  mockSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
})

describe('POST /api/media/[id]/retry — guards', () => {
  it('returns 401 when there is no authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(401)
    expect(mockVerifyAndReprocess).not.toHaveBeenCalled()
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

  it('returns 400 and never calls verifyAndReprocess when status is pending', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ status: 'pending' }))
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('pending')
    expect(mockVerifyAndReprocess).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('returns 400 when status is processing and still within its type\'s max age', async () => {
    // 'document' threshold is 600s — 60s old is well within it, a genuinely
    // in-flight job.
    const recentCreatedAt = new Date(Date.now() - 60_000).toISOString()
    mockGetMediaItem.mockResolvedValue(
      makeItem({ status: 'processing', created_at: recentCreatedAt }),
    )
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('processing')
    expect(mockVerifyAndReprocess).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('accepts a processing item past its type\'s max age — the stale-processing backstop', async () => {
    // 'document' threshold is 600s — 1 hour old is well past it.
    const staleCreatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const item = makeItem({ status: 'processing', error_message: null, created_at: staleCreatedAt })
    mockGetMediaItem.mockResolvedValue(item)

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(mockVerifyAndReprocess).toHaveBeenCalledTimes(1)
    expect(mockVerifyAndReprocess).toHaveBeenCalledWith(item, expect.any(String))
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_RETRY_REQUESTED,
        metadata: expect.objectContaining({
          previous_status: 'processing',
          stale_processing_recovery: true,
        }),
      }),
    )
  })

  it('rejects a processing item just under its threshold as still in-flight (not yet stale)', async () => {
    // 1s under the 600s 'document' threshold — deliberately not exactly at
    // the boundary, since real wall-clock time elapses between building this
    // timestamp and the route computing its own age against Date.now(),
    // which would make an exactly-600s-old fixture flaky.
    const justUnderThreshold = new Date(Date.now() - 599_000).toISOString()
    mockGetMediaItem.mockResolvedValue(
      makeItem({ status: 'processing', created_at: justUnderThreshold }),
    )
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(400)
    expect(mockVerifyAndReprocess).not.toHaveBeenCalled()
  })

  it('returns 403 when the requesting member does not own the item', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ member_id: 'someone-else' }))
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(403)
    expect(mockVerifyAndReprocess).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('accepts a ready item (reprocess-by-choice, not just failure recovery)', async () => {
    const item = makeItem({ status: 'ready', derived_content: 'stale garbage content', error_message: null })
    mockGetMediaItem.mockResolvedValue(item)

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockVerifyAndReprocess).toHaveBeenCalledWith(item, expect.any(String))
  })
})

describe('POST /api/media/[id]/retry — reacting to verifyAndReprocess', () => {
  it('calls verifyAndReprocess with the item and a correlationId, on a plain failed retry', async () => {
    const item = makeItem()
    mockGetMediaItem.mockResolvedValue(item)

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockVerifyAndReprocess).toHaveBeenCalledWith(item, expect.any(String))
  })

  it('responds { ok: true, needsReupload: true } and does not fail the request when the outcome is needs_reupload', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockVerifyAndReprocess.mockResolvedValue('needs_reupload')

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, needsReupload: true })
  })

  it('logs MEDIA_RETRY_FAILED (needs_reupload: true) in addition to MEDIA_RETRY_REQUESTED when the outcome is needs_reupload', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockVerifyAndReprocess.mockResolvedValue('needs_reupload')

    await POST(makeRequest(), makeParams('item-1'))

    const requestedCall = mockLogMediaEvent.mock.calls.find(([arg]) => arg.action === AuditAction.MEDIA_RETRY_REQUESTED)
    const failedCall = mockLogMediaEvent.mock.calls.find(([arg]) => arg.action === AuditAction.MEDIA_RETRY_FAILED)

    expect(requestedCall).toBeDefined()
    expect(failedCall).toBeDefined()
    expect(failedCall![0]).toEqual(
      expect.objectContaining({
        media_item_id: 'item-1',
        outcome: 'failure',
        correlation_id: requestedCall![0].correlation_id,
        metadata: expect.objectContaining({
          error_message: 'This file needs to be uploaded again',
          needs_reupload: true,
        }),
      }),
    )
  })

  it('does not log MEDIA_RETRY_FAILED when the outcome is reprocessing', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockVerifyAndReprocess.mockResolvedValue('reprocessing')

    await POST(makeRequest(), makeParams('item-1'))

    expect(mockLogMediaEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_RETRY_FAILED }),
    )
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

  it('skips all audit logging when isMediaAuditEnabled() returns false', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    mockGetMediaItem.mockResolvedValue(makeItem())
    mockVerifyAndReprocess.mockResolvedValue('needs_reupload')

    await POST(makeRequest(), makeParams('item-1'))

    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })
})
