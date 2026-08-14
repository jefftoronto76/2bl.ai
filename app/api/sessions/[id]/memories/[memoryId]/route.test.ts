// Covers the PATCH route's action dispatch, including the new
// 'revise_blocks' action (Memory Canvas V1 backend). Mirrors the sibling
// collection route's test mocking pattern (../route.test.ts) — mocks
// @/services/crm/memories directly rather than the DB client, since this
// file is only testing the route's own validation/dispatch, not
// reviseMemoryBlocks's own logic (covered in services/crm/memories.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPublishMemory = vi.fn()
const mockDiscardMemory = vi.fn()
const mockRenameMemory = vi.fn()
const mockReviseMemoryBlocks = vi.fn()
const mockLogEvent = vi.fn()
const mockAssignMemoryToStory = vi.fn()
const mockRemoveMemoryFromStory = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))
const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()

vi.mock('@/services/crm/memories', () => ({
  publishMemory: (...args: unknown[]) => mockPublishMemory(...args),
  discardMemory: (...args: unknown[]) => mockDiscardMemory(...args),
  renameMemory: (...args: unknown[]) => mockRenameMemory(...args),
  reviseMemoryBlocks: (...args: unknown[]) => mockReviseMemoryBlocks(...args),
}))

vi.mock('@/services/crm/story-containments', () => ({
  assignMemoryToStory: (...args: unknown[]) => mockAssignMemoryToStory(...args),
  removeMemoryFromStory: (...args: unknown[]) => mockRemoveMemoryFromStory(...args),
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}))

import { PATCH } from './route'

function makeParams(id: string, memoryId: string) {
  return { params: Promise.resolve({ id, memoryId }) }
}

function makeRequest(body: unknown): Request {
  return {
    headers: { get: () => 'example.heirloom.app' },
    json: async () => {
      if (body === '__throw__') throw new Error('invalid json')
      return body
    },
  } as unknown as Request
}

const A_MEMORY = {
  id: 'mem-1',
  session_id: 's1',
  anchor_message_id: 'm1',
  source_kind: 'conversation',
  title: 'The Lake House',
  body: 'It was a quiet summer.',
  body_blocks: null,
  status: 'draft',
  created_at: 'now',
  updated_at: 'now',
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockPublishMemory.mockReset()
  mockDiscardMemory.mockReset()
  mockRenameMemory.mockReset()
  mockReviseMemoryBlocks.mockReset().mockResolvedValue({ ok: true, data: A_MEMORY })
  mockAssignMemoryToStory.mockReset()
  mockRemoveMemoryFromStory.mockReset()
  mockLogEvent.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PATCH /api/sessions/[id]/memories/[memoryId] — action validation', () => {
  it('400s on an unrecognized action, mentioning all six valid actions', async () => {
    const res = await PATCH(makeRequest({ action: 'bogus' }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('revise_blocks')
    expect(body.error).toContain('assign_story')
    expect(body.error).toContain('remove_story')
    expect(mockReviseMemoryBlocks).not.toHaveBeenCalled()
  })

  it('400s when tenant resolution fails', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ action: 'revise_blocks', blocks: [] }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(400)
    expect(mockReviseMemoryBlocks).not.toHaveBeenCalled()
  })

  it('400s when the body is not valid JSON', async () => {
    const res = await PATCH(makeRequest('__throw__'), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(400)
    expect(mockReviseMemoryBlocks).not.toHaveBeenCalled()
  })
})

describe("PATCH — action: 'revise_blocks'", () => {
  it('forwards the raw blocks value to reviseMemoryBlocks and relays a success response', async () => {
    const blocks = [{ id: 'b1', type: 'text', content: 'A passage.' }]

    const res = await PATCH(makeRequest({ action: 'revise_blocks', blocks }), makeParams('s1', 'mem-1'))

    expect(mockReviseMemoryBlocks).toHaveBeenCalledWith('tenant-1', 's1', 'mem-1', blocks)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.memory).toEqual(A_MEMORY)
    // The route itself never logs for this action — reviseMemoryBlocks does its own logging.
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('relays reviseMemoryBlocks\'s error status and message unchanged (e.g. a validation 400)', async () => {
    mockReviseMemoryBlocks.mockResolvedValue({ ok: false, status: 400, error: 'blocks must be a non-empty array' })

    const res = await PATCH(makeRequest({ action: 'revise_blocks', blocks: [] }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('blocks must be a non-empty array')
  })
})

describe('PATCH — existing actions are unaffected', () => {
  it('still dispatches keep correctly', async () => {
    mockPublishMemory.mockResolvedValue({ ok: true, data: A_MEMORY })

    const res = await PATCH(makeRequest({ action: 'keep' }), makeParams('s1', 'mem-1'))

    expect(mockPublishMemory).toHaveBeenCalledWith('tenant-1', 's1', 'mem-1')
    expect(res.status).toBe(200)
  })

  it('still dispatches discard correctly', async () => {
    mockDiscardMemory.mockResolvedValue({ ok: true, data: null })

    const res = await PATCH(makeRequest({ action: 'discard' }), makeParams('s1', 'mem-1'))

    expect(mockDiscardMemory).toHaveBeenCalledWith('tenant-1', 's1', 'mem-1')
    expect(res.status).toBe(200)
  })

  it('still dispatches retitle correctly', async () => {
    mockRenameMemory.mockResolvedValue({ ok: true, data: A_MEMORY })

    const res = await PATCH(makeRequest({ action: 'retitle', title: 'New Title' }), makeParams('s1', 'mem-1'))

    expect(mockRenameMemory).toHaveBeenCalledWith('tenant-1', 's1', 'mem-1', 'New Title')
    expect(res.status).toBe(200)
  })
})

describe("PATCH — action: 'assign_story'", () => {
  it('calls assignMemoryToStory with the resolved user id and relays a success response', async () => {
    mockAssignMemoryToStory.mockResolvedValue({ ok: true, data: null })

    const res = await PATCH(makeRequest({ action: 'assign_story', story_id: 'story-1' }), makeParams('s1', 'mem-1'))

    expect(mockAssignMemoryToStory).toHaveBeenCalledWith('tenant-1', 'user-1', 'mem-1', 'story-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('401s and never calls assignMemoryToStory when no user is signed in', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ action: 'assign_story', story_id: 'story-1' }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(401)
    expect(mockAssignMemoryToStory).not.toHaveBeenCalled()
  })

  it('400s when story_id is missing, and never calls assignMemoryToStory', async () => {
    const res = await PATCH(makeRequest({ action: 'assign_story' }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(400)
    expect(mockAssignMemoryToStory).not.toHaveBeenCalled()
  })

  it('relays assignMemoryToStory\'s error status and message unchanged (e.g. a 404 for an inaccessible story)', async () => {
    mockAssignMemoryToStory.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })

    const res = await PATCH(makeRequest({ action: 'assign_story', story_id: 'story-1' }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Story not found')
  })
})

describe("PATCH — action: 'remove_story'", () => {
  it('calls removeMemoryFromStory with the resolved user id and relays a success response — no story_id needed', async () => {
    mockRemoveMemoryFromStory.mockResolvedValue({ ok: true, data: null })

    const res = await PATCH(makeRequest({ action: 'remove_story' }), makeParams('s1', 'mem-1'))

    expect(mockRemoveMemoryFromStory).toHaveBeenCalledWith('tenant-1', 'user-1', 'mem-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('401s and never calls removeMemoryFromStory when no user is signed in — same gate as assign_story', async () => {
    mockGetCurrentUserId.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ action: 'remove_story' }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(401)
    expect(mockRemoveMemoryFromStory).not.toHaveBeenCalled()
  })

  it('relays removeMemoryFromStory\'s error status and message unchanged (e.g. a 404 for a memory the caller doesn\'t own)', async () => {
    mockRemoveMemoryFromStory.mockResolvedValue({ ok: false, status: 404, error: 'Memory not found' })

    const res = await PATCH(makeRequest({ action: 'remove_story' }), makeParams('s1', 'mem-1'))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Memory not found')
  })
})
