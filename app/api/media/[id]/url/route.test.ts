// First-ever test coverage for this route — returns a short-lived signed
// download URL for member-facing access to a media item.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockGetMediaItem = vi.fn()
const mockGenerateSignedDownloadUrl = vi.fn()
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
}))

vi.mock('@/services/media/storage', () => ({
  generateSignedDownloadUrl: (...args: unknown[]) => mockGenerateSignedDownloadUrl(...args),
}))

import { GET } from './route'

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
    status: 'ready',
    derived_content: 'A photo of a dog.',
    classification: 'photo',
    error_message: null,
    processed_at: '2026-08-05T00:00:00.000Z',
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeRequest(): Request {
  return {} as unknown as Request
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockGetCurrentUser.mockReset().mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetMediaItem.mockReset().mockResolvedValue(makeItem())
  mockGenerateSignedDownloadUrl.mockReset().mockResolvedValue('https://signed.example/dog.jpg')
  mockSingle.mockReset().mockResolvedValue({ data: { id: 'member-1' }, error: null })
})

describe('GET /api/media/[id]/url', () => {
  it('returns 401 when there is no authenticated user', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the item does not exist', async () => {
    mockGetMediaItem.mockResolvedValue(null)
    const res = await GET(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when the requesting member does not own the item', async () => {
    mockGetMediaItem.mockResolvedValue(makeItem({ member_id: 'someone-else' }))
    const res = await GET(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(403)
    expect(mockGenerateSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('returns the signed url on the happy path', async () => {
    const res = await GET(makeRequest(), makeParams('item-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://signed.example/dog.jpg' })
    expect(mockGenerateSignedDownloadUrl).toHaveBeenCalledWith('tenant-1/media/member-1/item-1/dog.jpg')
  })
})
