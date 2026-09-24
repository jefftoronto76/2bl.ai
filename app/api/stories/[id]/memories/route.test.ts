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

const mockLogEvent = vi.fn()
vi.mock('@/services/audit/audit', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }))

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
  mockLogEvent.mockReset()
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
    expect(mockGetMemoriesForStory).toHaveBeenCalledWith('tenant-1', 'user-1', 'story-1', expect.objectContaining({ time: expect.any(Function) }))
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

// Story-route timing (2026-09, measurement only): exactly one
// STORY_ROUTE_TIMING event per GET, on every return path, PII-free.
describe('GET /api/stories/[id]/memories — timing instrumentation', () => {
  function timingEvents() {
    return mockLogEvent.mock.calls.map(c => c[0]).filter(e => e.action === 'story.route_timing')
  }

  it('logs one event on success with tenant/auth phases, status 200 and the row count', async () => {
    mockGetMemoriesForStory.mockResolvedValue({ ok: true, data: [{ id: 'mem-1' }, { id: 'mem-2' }] })

    await GET(makeRequest(), makeParams('story-1'))

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({
      path: 'app/api/stories/[id]/memories/route.ts',
      method: 'GET',
      status: 200,
      rowCount: 2,
    })
    expect(Object.keys(events[0].metadata.phases).sort()).toEqual(['auth', 'tenant'])
    expect(typeof events[0].metadata.totalMs).toBe('number')
    // No ids anywhere in what's logged.
    const serialized = JSON.stringify(events[0])
    for (const id of ['tenant-1', 'user-1', 'story-1', 'mem-1']) expect(serialized).not.toContain(id)
  })

  it('logs one failure event on 401, with only the phases that actually ran', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    await GET(makeRequest(), makeParams('story-1'))

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].outcome).toBe('failure')
    expect(events[0].metadata.status).toBe(401)
    expect(Object.keys(events[0].metadata.phases).sort()).toEqual(['auth', 'tenant'])
  })

  it('logs one event on 400 (tenant) and on a service 404', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)
    await GET(makeRequest(), makeParams('story-1'))
    expect(timingEvents()).toHaveLength(1)
    expect(timingEvents()[0].metadata.status).toBe(400)

    mockLogEvent.mockReset()
    mockGetTenantFromRequest.mockResolvedValue('tenant-1')
    mockGetMemoriesForStory.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })
    await GET(makeRequest(), makeParams('story-1'))
    expect(timingEvents()).toHaveLength(1)
    expect(timingEvents()[0].metadata.status).toBe(404)
  })

  it('does not instrument PATCH (a write, not loading)', async () => {
    mockMoveMemoryInStory.mockResolvedValue({ ok: true, data: undefined })
    await PATCH(makeRequest({ memoryId: 'mem-1', direction: 'down' }), makeParams('story-1'))
    expect(timingEvents()).toHaveLength(0)
  })
})
