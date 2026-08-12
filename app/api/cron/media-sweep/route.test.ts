// Covers auth (shared-secret Bearer header, same pattern as
// media-process/route.ts's own signature check) and that this route runs
// both sweeps (sweepStaleProcessingItems, sweepStalePendingItems) and logs
// the right audit event per outcome: a MEDIA_PROCESS_FAILED for anything
// flipped to 'failed' (stale-processing or abandoned-pending), and a
// retriggered processMediaItem call (via after()) for a recovered pending
// row whose file made it to Storage even though its trigger call didn't.
// The actual sweep query/threshold logic is covered in
// services/media/index.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const mockSweepStaleProcessingItems = vi.fn()
const mockSweepStalePendingItems = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()
const mockProcessMediaItem = vi.fn()

vi.mock('@/services/media', () => ({
  sweepStaleProcessingItems: (...args: unknown[]) => mockSweepStaleProcessingItems(...args),
  sweepStalePendingItems: (...args: unknown[]) => mockSweepStalePendingItems(...args),
  STALE_PROCESSING_ERROR_MESSAGE: 'Processing stalled and timed out',
  STALE_PENDING_ERROR_MESSAGE: 'Upload was never completed',
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
}))

vi.mock('@/services/media/processor', () => ({
  processMediaItem: (...args: unknown[]) => mockProcessMediaItem(...args),
}))

// after() requires a real Next.js request-scoped context that a route
// handler invoked directly in Vitest doesn't have — same shim as every
// other processMediaItem trigger route's own test file.
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
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
  mockSweepStalePendingItems.mockReset().mockResolvedValue({ recovered: [], abandoned: [] })
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockProcessMediaItem.mockReset().mockResolvedValue(undefined)
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
    expect(mockSweepStalePendingItems).not.toHaveBeenCalled()
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

  it('runs both sweeps and returns all-zero counts when nothing was stale', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 0, pendingRecovered: 0, pendingAbandoned: 0 })
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
  })

  it('logs one MEDIA_PROCESS_FAILED audit event per swept stale-processing item, with the sweep breadcrumb', async () => {
    const items = [makeStaleItem({ id: 'a' }), makeStaleItem({ id: 'b', type: 'document' })]
    mockSweepStaleProcessingItems.mockResolvedValue(items)

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 2, pendingRecovered: 0, pendingAbandoned: 0 })
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

  it('logs a MEDIA_PROCESS_FAILED for an abandoned pending item (file never reached Storage)', async () => {
    mockSweepStalePendingItems.mockResolvedValue({ recovered: [], abandoned: [makeStaleItem({ id: 'gone' })] })

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 0, pendingRecovered: 0, pendingAbandoned: 1 })
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        media_item_id: 'gone',
        action: AuditAction.MEDIA_PROCESS_FAILED,
        outcome: 'failure',
        metadata: expect.objectContaining({
          error_message: 'Upload was never completed',
          pipeline_step: 'stale_pending_sweep',
        }),
      }),
    )
  })

  it('retriggers processMediaItem for a recovered pending item (file present, trigger call lost) without failing it', async () => {
    const item = makeStaleItem({ id: 'recovered-1' })
    mockSweepStalePendingItems.mockResolvedValue({ recovered: [item], abandoned: [] })

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 0, pendingRecovered: 1, pendingAbandoned: 0 })
    expect(mockProcessMediaItem).toHaveBeenCalledTimes(1)
    expect(mockProcessMediaItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'recovered-1' }))
    // Retriggering isn't itself a failure — no MEDIA_PROCESS_FAILED for this item.
    expect(mockLogMediaEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ media_item_id: 'recovered-1' }),
    )
  })

  it('does not let a rejected retriggered processMediaItem fail the sweep response', async () => {
    mockSweepStalePendingItems.mockResolvedValue({
      recovered: [makeStaleItem({ id: 'recovered-1' })],
      abandoned: [],
    })
    mockProcessMediaItem.mockRejectedValue(new Error('boom'))

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
  })

  it('skips audit logging entirely when isMediaAuditEnabled() returns false', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    mockSweepStaleProcessingItems.mockResolvedValue([makeStaleItem()])

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, swept: 1, pendingRecovered: 0, pendingAbandoned: 0 })
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })
})
