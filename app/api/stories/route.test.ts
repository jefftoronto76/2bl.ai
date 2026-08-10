// Mirrors app/api/sessions/[id]/memories/route.test.ts's mock-the-service
// pattern, adapted for /api/stories: no dynamic segment (no `params`), GET
// resolves userId directly (not via resolveMemberId), POST mirrors the
// memories POST route's validation/resolveMemberId/error-propagation shape.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockListStories = vi.fn()
const mockCreateDraftStory = vi.fn()
const mockResolveMemberId = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))

vi.mock('@/services/crm/stories', () => ({
  listStories: (...args: unknown[]) => mockListStories(...args),
  createDraftStory: (...args: unknown[]) => mockCreateDraftStory(...args),
}))

vi.mock('@/services/crm/feedback', () => ({
  resolveMemberId: (...args: unknown[]) => mockResolveMemberId(...args),
}))

import { GET, POST } from './route'

function makeRequest(body?: unknown): Request {
  return {
    headers: { get: () => 'example.heirloom.app' },
    json: async () => {
      if (body === '__throw__') throw new Error('invalid json')
      return body
    },
  } as unknown as Request
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockListStories.mockReset().mockResolvedValue({
    ok: true,
    data: [{ id: 'story-1', title: 'A Life in Full', body: 'childhood to now', created_at: 'now', updated_at: 'now' }],
  })
  mockCreateDraftStory.mockReset().mockResolvedValue({
    ok: true,
    data: { id: 'story-1', title: 'A Life in Full', body: 'childhood to now', created_at: 'now', updated_at: 'now' },
  })
  mockResolveMemberId.mockReset().mockResolvedValue('member-1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/stories', () => {
  it('returns an empty list when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    const bodyJson = await res.json()
    expect(bodyJson).toEqual({ stories: [] })
    expect(mockListStories).not.toHaveBeenCalled()
  })

  it('returns an empty list when no signed-in user resolves (anonymous)', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await GET(makeRequest())

    expect(res.status).toBe(200)
    const bodyJson = await res.json()
    expect(bodyJson).toEqual({ stories: [] })
    expect(mockListStories).not.toHaveBeenCalled()
  })

  it('maps title/body to name/description for the client shape', async () => {
    const res = await GET(makeRequest())

    expect(mockListStories).toHaveBeenCalledWith('tenant-1', 'user-1')
    const bodyJson = await res.json()
    expect(bodyJson.stories).toEqual([{ id: 'story-1', name: 'A Life in Full', description: 'childhood to now' }])
  })

  it('omits description when body is empty', async () => {
    mockListStories.mockResolvedValue({
      ok: true,
      data: [{ id: 'story-2', title: 'Untitled', body: '', created_at: 'now', updated_at: 'now' }],
    })

    const res = await GET(makeRequest())

    const bodyJson = await res.json()
    expect(bodyJson.stories).toEqual([{ id: 'story-2', name: 'Untitled', description: undefined }])
  })
})

describe('POST /api/stories', () => {
  it('returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await POST(makeRequest({ name: 'A Life in Full', description: '' }))

    expect(res.status).toBe(400)
    expect(mockCreateDraftStory).not.toHaveBeenCalled()
  })

  it('returns 400 when the body is not valid JSON', async () => {
    const res = await POST(makeRequest('__throw__'))

    expect(res.status).toBe(400)
    expect(mockCreateDraftStory).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing or empty', async () => {
    const res = await POST(makeRequest({ name: '   ', description: 'x' }))

    expect(res.status).toBe(400)
    expect(mockCreateDraftStory).not.toHaveBeenCalled()
  })

  it('creates a story, trimming name/description and defaulting description to empty', async () => {
    const res = await POST(makeRequest({ name: '  A Life in Full  ' }))

    expect(res.status).toBe(200)
    expect(mockResolveMemberId).toHaveBeenCalledWith('tenant-1', null)
    expect(mockCreateDraftStory).toHaveBeenCalledWith('tenant-1', {
      memberId: 'member-1',
      name: 'A Life in Full',
      description: '',
    })
    const bodyJson = await res.json()
    expect(bodyJson.story).toEqual({ id: 'story-1', name: 'A Life in Full', description: 'childhood to now' })
  })

  it('propagates the 401 account-required rejection from createDraftStory unchanged', async () => {
    mockCreateDraftStory.mockResolvedValue({ ok: false, status: 401, error: 'An account is required to save memories.' })

    const res = await POST(makeRequest({ name: 'A Life in Full' }))

    expect(res.status).toBe(401)
    const bodyJson = await res.json()
    expect(bodyJson.error).toBe('An account is required to save memories.')
  })
})
