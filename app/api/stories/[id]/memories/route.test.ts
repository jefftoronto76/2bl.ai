// Covers GET /api/stories/[id]/memories (real-story-view-1a-static-list).
// Mirrors app/api/stories/[id]/route.test.ts's shape: mocks the service
// layer directly, focuses on the auth wiring this route file owns — access
// scoping and the actual DB reads are exercised at the service layer
// (services/crm/story-containments.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockGetMemoriesForStory = vi.fn()
const mockMoveMemoryInStory = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))

vi.mock('@/services/crm/story-containments', () => ({
  getMemoriesForStory: (...args: unknown[]) => mockGetMemoriesForStory(...args),
  moveMemoryInStory: (...args: unknown[]) => mockMoveMemoryInStory(...args),
}))

import { GET, PATCH } from './route'

function makeRequest(body?: unknown): Request {
  return {
    headers: { get: () => 'example.com' },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  } as unknown as Request
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockGetMemoriesForStory.mockReset()
  mockMoveMemoryInStory.mockReset()
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

describe('PATCH /api/stories/[id]/memories', () => {
  it('400s when tenant resolution fails', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'up' }), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockMoveMemoryInStory).not.toHaveBeenCalled()
  })

  it('401s when not signed in — unlike GET, this is a real write and is never anonymous-safe', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'up' }), makeParams('story-1'))

    expect(res.status).toBe(401)
    expect(mockMoveMemoryInStory).not.toHaveBeenCalled()
  })

  it('400s when the body is missing/unparseable', async () => {
    const res = await PATCH(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockMoveMemoryInStory).not.toHaveBeenCalled()
  })

  it('400s when memoryId is missing', async () => {
    const res = await PATCH(makeRequest({ direction: 'up' }), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockMoveMemoryInStory).not.toHaveBeenCalled()
  })

  it('400s when direction is missing or not "up"/"down"', async () => {
    const res1 = await PATCH(makeRequest({ memoryId: 'mem-1' }), makeParams('story-1'))
    expect(res1.status).toBe(400)

    const res2 = await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'sideways' }), makeParams('story-1'))
    expect(res2.status).toBe(400)

    expect(mockMoveMemoryInStory).not.toHaveBeenCalled()
  })

  it('calls the service layer scoped by tenant/user/id/memoryId/direction and returns ok on success', async () => {
    mockMoveMemoryInStory.mockResolvedValue({ ok: true, data: null })

    const res = await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'down' }), makeParams('story-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockMoveMemoryInStory).toHaveBeenCalledWith('tenant-1', 'user-1', 'story-1', 'mem-1', 'down')
  })

  it('propagates a service-layer 400 (already at an edge) as-is', async () => {
    mockMoveMemoryInStory.mockResolvedValue({ ok: false, status: 400, error: 'Already at the top of the list' })

    const res = await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'up' }), makeParams('story-1'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: 'Already at the top of the list' })
  })

  it('propagates a service-layer 404 (no access, or memory not in this story)', async () => {
    mockMoveMemoryInStory.mockResolvedValue({ ok: false, status: 404, error: 'Memory not found in this story' })

    const res = await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'up' }), makeParams('story-1'))

    expect(res.status).toBe(404)
  })
})
