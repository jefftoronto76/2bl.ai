// Covers the Step 2 trigger-ordering fix: this route (called by the client
// right after its Storage PUT resolves) is now the only thing that starts
// processing for a fresh upload — the DB webhook is an intentional no-op on
// INSERT. Also covers that it logs MEDIA_UPLOAD_COMPLETED itself, replacing
// the old /api/events/media call for that event.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'
import { AuditAction } from '@/services/audit/types'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockGetMediaItem = vi.fn()
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
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
}))

vi.mock('@/services/media/processor', () => ({
  processMediaItem: (...args: unknown[]) => mockProcessMediaItem(...args),
}))

// after() requires a real Next.js request-scoped context that a route
// handler invoked directly in Vitest doesn't have — same shim as the
// webhook and retry routes' own test files.
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
}))

import { POST } from './route'

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'image',
    original_filename: 'dog.jpg',
    storage_path: 'tenant-1/media/member-1/item-1/dog.jpg',
    file_size_bytes: 1024,
    mime_type: 'image/jpeg',
    status: 'pending',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
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
  mockProcessMediaItem.mockReset().mockResolvedValue(undefined)
  mockSingle.mockReset()

  mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockResolvedValue('tenant-1')
  mockSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
})

describe('POST /api/media/[id]/start-processing', () => {
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

  it('returns 403 when the requesting member does not own the item', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ member_id: 'someone-else' }))
    const res = await POST(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(403)
    expect(mockProcessMediaItem).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('logs MEDIA_UPLOAD_COMPLETED and triggers processMediaItem on a valid pending item', async () => {
    const item = makeItem()
    mockGetMediaItem.mockResolvedValue(item)

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockLogMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        member_id: 'member-1',
        media_item_id: 'item-1',
        action: AuditAction.MEDIA_UPLOAD_COMPLETED,
        outcome: 'success',
      }),
    )
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
  })

  it('skips MEDIA_UPLOAD_COMPLETED logging when isMediaAuditEnabled() returns false, but still triggers processing', async () => {
    mockIsMediaAuditEnabled.mockReturnValue(false)
    mockGetMediaItem.mockResolvedValue(makeItem())

    const res = await POST(makeRequest(), makeParams('item-1'))

    expect(res.status).toBe(200)
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
    expect(mockProcessMediaItem).toHaveBeenCalledTimes(1)
  })
})
