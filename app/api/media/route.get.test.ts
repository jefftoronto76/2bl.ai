// Covers GET /api/media's pagination branch — the actual cost this closes
// (System Docs/Known Gaps.md's "fetches everything upfront, signs every
// item before anything renders" entry) is signed-URL generation, not just
// which items come back in the response. So these tests assert on how many
// times generateSignedDownloadUrl was called, not just on response.items —
// a route that paginated the returned list but still signed the full
// result set server-side would still pass a naive items-length assertion.
//
// The unpaginated branch (no `limit` query param) is asserted to still work
// unchanged — chatStore.tsx's catch-up/poll fetches and any other caller
// that never passes `limit` must keep getting the complete list, not a
// silently-truncated first page. See services/media/index.ts's
// listByChat/listByMember doc comments for why pagination is opt-in.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockSingle = vi.fn()
const mockListByChat = vi.fn()
const mockListByMember = vi.fn()
const mockGenerateSignedDownloadUrl = vi.fn()

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

vi.mock('@/services/media', async () => {
  const actual = await vi.importActual<typeof import('@/services/media')>('@/services/media')
  return {
    ...actual,
    listByChat: (...args: unknown[]) => mockListByChat(...args),
    listByMember: (...args: unknown[]) => mockListByMember(...args),
  }
})

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
    original_filename: 'photo.jpg',
    storage_path: 'tenant-1/media/member-1/item-1/photo.jpg',
    file_size_bytes: 1024,
    mime_type: 'image/jpeg',
    status: 'ready',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeItems(n: number, prefix: string): MediaItem[] {
  return Array.from({ length: n }, (_, i) => makeItem({ id: `${prefix}-${i}` }))
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetTenantFromRequest.mockReset()
  mockSingle.mockReset()
  mockListByChat.mockReset()
  mockListByMember.mockReset()
  mockGenerateSignedDownloadUrl.mockReset()

  mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
  mockGetTenantFromRequest.mockResolvedValue('tenant-1')
  mockSingle.mockResolvedValue({ data: { id: 'member-1' } })
  mockGenerateSignedDownloadUrl.mockImplementation(async (path: string) => `https://signed.example/${path}`)
})

describe('GET /api/media — paginated (limit param present)', () => {
  it('signs URLs only for the requested page — not the full account/chat result set', async () => {
    // The account genuinely has far more than one page's worth of media;
    // listByMember (mocked, standing in for the real paginated query) only
    // ever returns the page it was asked for, exactly like the real
    // paginated overload does.
    mockListByMember.mockResolvedValue({
      items: makeItems(5, 'page1'),
      hasMore: true,
      nextCursor: '2026-08-01T00:00:04.000Z',
    })

    const req = new Request('http://localhost/api/media?limit=5')
    const res = await GET(req)
    const body = await res.json()

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1', { limit: 5, cursor: null, sort: undefined })
    expect(body.items.length).toBe(5)
    // Exactly one signed-url generation per item on the page — not per
    // item in some larger, unfetched result set.
    expect(mockGenerateSignedDownloadUrl).toHaveBeenCalledTimes(5)
  })

  it('propagates hasMore and nextCursor from the page result', async () => {
    mockListByMember.mockResolvedValue({
      items: makeItems(2, 'p'),
      hasMore: true,
      nextCursor: '2026-08-01T00:00:01.000Z',
    })

    const req = new Request('http://localhost/api/media?limit=2')
    const body = await (await GET(req)).json()

    expect(body.hasMore).toBe(true)
    expect(body.nextCursor).toBe('2026-08-01T00:00:01.000Z')
  })

  it('reports hasMore: false and nextCursor: null on the last page', async () => {
    mockListByMember.mockResolvedValue({ items: makeItems(1, 'last'), hasMore: false, nextCursor: null })

    const req = new Request('http://localhost/api/media?limit=5')
    const body = await (await GET(req)).json()

    expect(body.hasMore).toBe(false)
    expect(body.nextCursor).toBeNull()
  })

  it('passes cursor through to listByChat for a chat-scoped paginated request', async () => {
    mockListByChat.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })

    const req = new Request(
      'http://localhost/api/media?chat_id=chat-1&limit=10&cursor=2026-08-01T00%3A00%3A00.000Z',
    )
    await GET(req)

    expect(mockListByChat).toHaveBeenCalledWith('chat-1', 'tenant-1', undefined, {
      limit: 10,
      cursor: '2026-08-01T00:00:00.000Z',
    })
  })

  it('passes cursor through to listByMember for an account-wide paginated request', async () => {
    // Regression coverage: this previously never reached listByMember at
    // all, so "load more" on the standalone Media page silently refetched
    // page one forever instead of advancing.
    mockListByMember.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })

    const req = new Request(
      'http://localhost/api/media?limit=10&cursor=2026-08-01T00%3A00%3A00.000Z',
    )
    await GET(req)

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1', {
      limit: 10,
      cursor: '2026-08-01T00:00:00.000Z',
      sort: undefined,
    })
  })

  it('passes sort=oldest through to listByMember when requested', async () => {
    mockListByMember.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })

    const req = new Request('http://localhost/api/media?limit=10&sort=oldest')
    await GET(req)

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1', {
      limit: 10,
      cursor: null,
      sort: 'oldest',
    })
  })

  it('ignores an unrecognized sort value and keeps the default (newest) order', async () => {
    mockListByMember.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })

    const req = new Request('http://localhost/api/media?limit=10&sort=bogus')
    await GET(req)

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1', {
      limit: 10,
      cursor: null,
      sort: undefined,
    })
  })

  it('clamps an oversized limit to the maximum page size', async () => {
    mockListByMember.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })

    const req = new Request('http://localhost/api/media?limit=99999')
    await GET(req)

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1', { limit: 100, cursor: null, sort: undefined })
  })

  it('falls back to the default page size on a non-numeric limit', async () => {
    mockListByMember.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })

    const req = new Request('http://localhost/api/media?limit=notanumber')
    await GET(req)

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1', { limit: 24, cursor: null, sort: undefined })
  })

  it('still filters out items not owned by the resolved member (defense-in-depth)', async () => {
    mockListByMember.mockResolvedValue({
      items: [makeItem({ id: 'mine', member_id: 'member-1' }), makeItem({ id: 'not-mine', member_id: 'someone-else' })],
      hasMore: false,
      nextCursor: null,
    })

    const req = new Request('http://localhost/api/media?limit=5')
    const body = await (await GET(req)).json()

    expect(body.items.map((i: MediaItem) => i.id)).toEqual(['mine'])
    expect(mockGenerateSignedDownloadUrl).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/media — unpaginated (no limit param, existing callers)', () => {
  it('calls listByMember with no pagination arg and signs every returned item', async () => {
    mockListByMember.mockResolvedValue(makeItems(8, 'all'))

    const req = new Request('http://localhost/api/media')
    const body = await (await GET(req)).json()

    expect(mockListByMember).toHaveBeenCalledWith('member-1', 'tenant-1')
    expect(body.items.length).toBe(8)
    expect(mockGenerateSignedDownloadUrl).toHaveBeenCalledTimes(8)
    expect(body.hasMore).toBeUndefined()
    expect(body.nextCursor).toBeUndefined()
  })

  it('calls listByChat with no pagination arg for a chat-scoped unpaginated request', async () => {
    mockListByChat.mockResolvedValue(makeItems(3, 'chat'))

    const req = new Request('http://localhost/api/media?chat_id=chat-1&status=ready,failed')
    await GET(req)

    expect(mockListByChat).toHaveBeenCalledWith('chat-1', 'tenant-1', ['ready', 'failed'])
  })
})
