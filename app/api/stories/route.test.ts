// Covers GET /api/stories' timing instrumentation (story-route timing,
// 2026-09, measurement only). The listing logic itself is exercised at the
// service layer (services/crm/stories.test.ts); this pins the route's own
// wiring: one PII-free STORY_ROUTE_TIMING event per request, on every path.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockListStories = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))
vi.mock('@/services/crm/stories', () => ({
  listStories: (...args: unknown[]) => mockListStories(...args),
  createStory: vi.fn(),
}))
vi.mock('@/services/crm/feedback', () => ({ resolveMemberId: vi.fn() }))
vi.mock('@/services/audit/audit', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }))

import { GET } from './route'

const req = { headers: { get: () => 'example.com' } } as unknown as Request

function timingEvents() {
  return mockLogEvent.mock.calls.map(c => c[0]).filter(e => e.action === 'story.route_timing')
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockListStories.mockReset()
  mockLogEvent.mockReset()
})

describe('GET /api/stories — timing instrumentation', () => {
  it('passes a timer into listStories and logs one success event with the row count, no ids', async () => {
    mockListStories.mockResolvedValue({
      ok: true,
      data: [{ id: 'story-1', title: 'A Life', body: '', hasActiveInviteOrSubscribers: false, isOwner: true, memoryCount: 2, viewMode: 'list' }],
    })

    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(mockListStories).toHaveBeenCalledWith('tenant-1', 'user-1', expect.objectContaining({ time: expect.any(Function) }))

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ path: 'app/api/stories/route.ts', method: 'GET', status: 200, rowCount: 1 })
    expect(Object.keys(events[0].metadata.phases).sort()).toEqual(['auth', 'tenant'])
    const serialized = JSON.stringify(events[0])
    for (const s of ['tenant-1', 'user-1', 'story-1', 'A Life']) expect(serialized).not.toContain(s)
  })

  it('logs one event for the anonymous empty-list path (status 200, rowCount 0)', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await GET(req)
    const body = await res.json()
    expect(body).toEqual({ stories: [] })

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ status: 200, rowCount: 0 })
    expect(mockListStories).not.toHaveBeenCalled()
  })

  it('logs one failure event when listStories fails', async () => {
    mockListStories.mockResolvedValue({ ok: false, status: 500, error: 'db down' })

    const res = await GET(req)
    expect(res.status).toBe(500)
    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].outcome).toBe('failure')
    expect(events[0].metadata.status).toBe(500)
  })
})
