// Mirrors app/api/sessions/[id]/memories/[memoryId]/route.test.ts's
// mock-the-service pattern: mocks @/services/crm/stories directly rather
// than the DB client, since this only tests the route's own
// validation/dispatch/audit-logging, not discardStory's own logic.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const mockGetTenantFromRequest = vi.fn()
const mockDiscardStory = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

vi.mock('@/services/crm/stories', () => ({
  discardStory: (...args: unknown[]) => mockDiscardStory(...args),
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}))

import { DELETE } from './route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return { headers: { get: () => 'example.heirloom.app' } } as unknown as Request
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockDiscardStory.mockReset().mockResolvedValue({ ok: true, data: null })
  mockLogEvent.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DELETE /api/stories/[id]', () => {
  it('returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await DELETE(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(400)
    expect(mockDiscardStory).not.toHaveBeenCalled()
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('discards the story, logs STORY_DISCARDED, and returns 204', async () => {
    const res = await DELETE(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(204)
    expect(mockDiscardStory).toHaveBeenCalledWith('tenant-1', 'story-1')
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.STORY_DISCARDED,
        tenant_id: 'tenant-1',
        target_type: 'story',
        target_id: 'story-1',
      }),
    )
  })

  it('returns 404 and does not log when the story is not found', async () => {
    mockDiscardStory.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })

    const res = await DELETE(makeRequest(), makeParams('story-1'))

    expect(res.status).toBe(404)
    expect(mockLogEvent).not.toHaveBeenCalled()
  })
})
