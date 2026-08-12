// First-ever test coverage for this route. Focused on the Step 2 contract
// change: 'upload_completed' is no longer an accepted event here (moved to
// app/api/media/[id]/start-processing/route.ts, which also triggers
// processing — see that file's header comment for why it couldn't stay on
// this ENABLE_MEDIA_AUDIT_LOGGING-gated endpoint).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogMediaEvent = vi.fn()
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
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
}))

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return {
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Request
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetTenantFromRequest.mockReset()
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockSingle.mockReset()

  mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockResolvedValue('tenant-1')
  mockSingle.mockResolvedValue({
    data: {
      id: 'item-1',
      tenant_id: 'tenant-1',
      member_id: 'member-1',
      mime_type: 'image/jpeg',
      original_filename: 'dog.jpg',
      file_size_bytes: 1024,
    },
    error: null,
  })
})

describe('POST /api/events/media', () => {
  it('logs upload_started', async () => {
    const res = await POST(makeRequest({ mediaItemId: 'item-1', event: 'upload_started' }))
    expect(res.status).toBe(200)
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEDIA_UPLOAD_STARTED, outcome: 'success' }),
    )
  })

  it('logs upload_failed with the error outcome', async () => {
    const res = await POST(
      makeRequest({ mediaItemId: 'item-1', event: 'upload_failed', error_message: 'boom' }),
    )
    expect(res.status).toBe(200)
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_UPLOAD_FAILED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_message: 'boom' }),
      }),
    )
  })

  it('rejects upload_completed — that trigger moved to start-processing/route.ts', async () => {
    const res = await POST(makeRequest({ mediaItemId: 'item-1', event: 'upload_completed' }))
    expect(res.status).toBe(400)
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('returns ok without logging when audit logging is disabled', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    const res = await POST(makeRequest({ mediaItemId: 'item-1', event: 'upload_started' }))
    expect(res.status).toBe(200)
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })
})
