// Covers PATCH/DELETE /api/stories/[id]. PATCH is new (story-admin-panel,
// 2026-08-13) — StoryAdminPanel's description field. Mirrors the mock shape
// used elsewhere in this codebase for tenant/user-scoped routes (e.g.
// app/api/heirloom/story-invites/collaborators/route.test.ts): mocks the
// service layer directly and focuses on the auth/validation wiring this
// route file itself owns. The ownership check and the actual DB update are
// exercised at the service layer (services/crm/stories.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockUpdateStoryDescription = vi.fn()
const mockDiscardStory = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))

vi.mock('@/services/crm/stories', () => ({
  discardStory: (...args: unknown[]) => mockDiscardStory(...args),
  updateStoryDescription: (...args: unknown[]) => mockUpdateStoryDescription(...args),
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}))

import { PATCH, DELETE } from './route'

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
  mockUpdateStoryDescription.mockReset()
  mockDiscardStory.mockReset()
  mockLogEvent.mockReset()
})

describe('PATCH /api/stories/[id]', () => {
  it('400s when tenant resolution fails', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ description: 'New text' }), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockUpdateStoryDescription).not.toHaveBeenCalled()
  })

  it('401s when not signed in', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ description: 'New text' }), makeParams('story-1'))

    expect(res.status).toBe(401)
    expect(mockUpdateStoryDescription).not.toHaveBeenCalled()
  })

  it('400s when description is missing from the body', async () => {
    const res = await PATCH(makeRequest({}), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockUpdateStoryDescription).not.toHaveBeenCalled()
  })

  it('400s when description is not a string', async () => {
    const res = await PATCH(makeRequest({ description: 42 }), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockUpdateStoryDescription).not.toHaveBeenCalled()
  })

  it('trims the description, calls the service layer scoped by tenant/user/id, and logs STORY_DESCRIPTION_UPDATED on success', async () => {
    mockUpdateStoryDescription.mockResolvedValue({
      ok: true,
      data: { id: 'story-1', title: 'A Life in Full', body: 'A new description.', created_at: 'now', updated_at: 'now', hasActiveInviteOrSubscribers: false },
    })

    const res = await PATCH(makeRequest({ description: '  A new description.  ' }), makeParams('story-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ story: { id: 'story-1', name: 'A Life in Full', description: 'A new description.' } })
    expect(mockUpdateStoryDescription).toHaveBeenCalledWith('tenant-1', 'user-1', 'story-1', 'A new description.')
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ target_id: 'story-1', target_type: 'story', outcome: 'success' }),
    )
  })

  it('propagates a service-layer 404 (not found, or not owned by this user) as-is', async () => {
    mockUpdateStoryDescription.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })

    const res = await PATCH(makeRequest({ description: 'New text' }), makeParams('nope'))

    expect(res.status).toBe(404)
    expect(mockLogEvent).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/stories/[id]', () => {
  it('still works unchanged alongside the new PATCH handler', async () => {
    mockDiscardStory.mockResolvedValue({ ok: true, data: null })

    const res = await DELETE(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(200)
    expect(mockDiscardStory).toHaveBeenCalledWith('tenant-1', 'user-1', 'story-1')
  })
})
