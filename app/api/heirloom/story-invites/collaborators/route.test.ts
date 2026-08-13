// Covers DELETE /api/heirloom/story-invites/collaborators — the invite
// modal's roster "Remove" action (2026-08-13). Mirrors
// app/api/heirloom/story-invites/route.test.ts's mock shape (this route's
// own identity resolution is copy-identical to that file's DELETE handler);
// these tests focus on the auth/validation wiring this route file itself
// owns. The ownership check and the artifact_subscribers delete are
// exercised at the service layer (services/crm/story-invites.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockMembersMaybeSingle = vi.fn()
const mockRevokeStoryCollaborator = vi.fn()

vi.mock('@/services/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: (...args: unknown[]) => mockMembersMaybeSingle(...args),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.mock('@/services/members', () => ({
  HEIRLOOM_TENANT_ID: '20767f1d-1148-4e43-ab73-f6da88f0ac56',
}))

vi.mock('@/services/crm/story-invites', () => ({
  revokeStoryCollaborator: (...args: unknown[]) => mockRevokeStoryCollaborator(...args),
}))

import { DELETE } from './route'

function makeDeleteRequest(body?: unknown): Request {
  return {
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  } as unknown as Request
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockMembersMaybeSingle.mockReset()
  mockRevokeStoryCollaborator.mockReset()
})

describe('DELETE /api/heirloom/story-invites/collaborators', () => {
  it('401s when signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1', member_id: 'member-1' }))

    expect(res.status).toBe(401)
    expect(mockRevokeStoryCollaborator).not.toHaveBeenCalled()
  })

  it("403s when the signed-in Clerk user has no Heirloom members row", async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1', member_id: 'member-1' }))

    expect(res.status).toBe(403)
  })

  it('400s when story_id is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-caller' }, error: null })

    const res = await DELETE(makeDeleteRequest({ member_id: 'member-1' }))

    expect(res.status).toBe(400)
    expect(mockRevokeStoryCollaborator).not.toHaveBeenCalled()
  })

  it('400s when member_id is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-caller' }, error: null })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1' }))

    expect(res.status).toBe(400)
    expect(mockRevokeStoryCollaborator).not.toHaveBeenCalled()
  })

  it('removes the collaborator once ownership is confirmed by the service layer', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-caller' }, error: null })
    mockRevokeStoryCollaborator.mockResolvedValue({ ok: true, data: null })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1', member_id: 'member-2' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockRevokeStoryCollaborator).toHaveBeenCalledWith(
      '20767f1d-1148-4e43-ab73-f6da88f0ac56', 'story-1', 'member-2', 'user-1',
    )
  })

  it("404s when the acting user isn't the story's owner (service-layer rejection surfaces as-is)", async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-caller' }, error: null })
    mockRevokeStoryCollaborator.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1', member_id: 'member-2' }))

    expect(res.status).toBe(404)
  })

  it('surfaces a not-found grant as a clean error, not a 500', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-caller' }, error: null })
    mockRevokeStoryCollaborator.mockResolvedValue({ ok: false, status: 404, error: 'Collaborator not found' })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1', member_id: 'member-already-gone' }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Collaborator not found')
  })
})
