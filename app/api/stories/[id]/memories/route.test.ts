// Covers GET /api/stories/[id]/memories (real-story-view-1a-static-list).
// Mirrors app/api/stories/[id]/route.test.ts's shape: mocks the service
// layer directly, focuses on the auth wiring this route file owns — access
// scoping and the actual DB reads are exercised at the service layer
// (services/crm/story-containments.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockGetMemoriesForStory = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))

vi.mock('@/services/crm/story-containments', () => ({
  getMemoriesForStory: (...args: unknown[]) => mockGetMemoriesForStory(...args),
}))

import { GET } from './route'

function makeRequest(): Request {
  return { headers: { get: () => 'example.com' } } as unknown as Request
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockGetMemoriesForStory.mockReset()
})

describe('GET /api/stories/[id]/memories', () => {
  it('400s when tenant resolution fails', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await GET(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockGetMemoriesForStory).not.toHaveBeenCalled()
  })

  it('401s when not signed in', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await GET(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(401)
    expect(mockGetMemoriesForStory).not.toHaveBeenCalled()
  })

  it('calls the service layer scoped by tenant/user/id and returns its ordered list', async () => {
    const memories = [
      { id: 'mem-1', session_id: 'sess-a', title: 'First', body: 'A', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' },
    ]
    mockGetMemoriesForStory.mockResolvedValue({ ok: true, data: memories })

    const res = await GET(makeRequest(), makeParams('story-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ memories })
    expect(mockGetMemoriesForStory).toHaveBeenCalledWith('tenant-1', 'user-1', 'story-1')
  })

  it('propagates a service-layer 404 (no access, or story does not exist) as-is', async () => {
    mockGetMemoriesForStory.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })

    const res = await GET(makeRequest(), makeParams('story-1'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: 'Story not found' })
  })

  it('propagates a service-layer 500', async () => {
    mockGetMemoriesForStory.mockResolvedValue({ ok: false, status: 500, error: 'db down' })

    const res = await GET(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(500)
  })
})
