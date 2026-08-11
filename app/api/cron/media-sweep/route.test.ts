// Covers auth (shared-secret Bearer header, same pattern as
// media-process/route.ts's own signature check) and that this route only
// does two things: call sweepStaleProcessingItems() and log one
// MEDIA_PROCESS_FAILED audit event per row it swept. The actual sweep
// query/threshold logic is covered in services/media/index.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const mockSweepStaleProcessingItems = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()

vi.mock('@/services/media', () => ({
  sweepStaleProcessingItems: (...args: unknown[]) => mockSweepStaleProcessingItems(...args),
  STALE_PROCESSING_ERROR_MESSAGE: 'Processing stalled and timed out',
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
}))

import { GET } from './route'

const SECRET = 'test-cron-secret'

function makeRequest(authHeader: string | null = `Bearer ${SECRET}`): Request {
  return { headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? authHeader : null) } } as unknown as Request
}

function makeStaleItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    type: 'image',
    mime_type: 'image/jpeg',
    original_filename: 'photo.jpg',
    file_size_bytes: 1000,
    created_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockSweepStaleProcessingItems.mockReset().mockResolvedValue([])
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  process.env.CRON_SECRET = SECRET
})

afterEach(() => {
  delete process.env.CRON_SECRET
})

describe('GET /api/cron/media-sweep', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    expect(mockSweepStaleProcessingItems).not.toHaveBeenCalled()
  })

  it('returns 401 when the secret does not match', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockSweepStaleProcessingItems).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET is not configured, even with a header present', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(mockSweepStaleProcessingItems).not.toHaveBeenCalled()
  })

  it('runs the sweep and returns the swept count when nothing was stale', async () => {
    mockSweepStaleProcessingItems.mockResolvedValue([])
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 0 })
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('logs one MEDIA_PROCESS_FAILED audit event per swept item, with the sweep breadcrumb', async () => {
    const items = [makeStaleItem({ id: 'a' }), makeStaleItem({ id: 'b', type: 'document' })]
    mockSweepStaleProcessingItems.mockResolvedValue(items)

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 2 })
    expect(mockLogMediaEvent).toHaveBeenCalledTimes(2)
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        media_item_id: 'a',
        action: AuditAction.MEDIA_PROCESS_FAILED,
        outcome: 'failure',
        metadata: expect.objectContaining({
          error_message: 'Processing stalled and timed out',
          pipeline_step: 'stale_processing_sweep',
          stalled_since: '2026-08-06T00:00:00.000Z',
        }),
      }),
    )
  })

  it('skips audit logging entirely when isMediaAuditEnabled() returns false', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    mockSweepStaleProcessingItems.mockResolvedValue([makeStaleItem()])

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 1 })
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })
})
