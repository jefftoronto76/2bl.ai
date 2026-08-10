// Covers GET/DELETE /api/heirloom/story-invites — added Phase 5
// (invite_modal_updates, 2026-08-10) to back InviteCollaboratorsModal.tsx's
// "Existing members" roster (GET) and the invalidation-warning's Continue
// (DELETE, revoke-without-replacing). POST (create/reset) predates this
// file and is exercised at the service layer (services/crm/
// story-invites.test.ts); these tests focus on the auth/ownership gating
// this route file itself owns for the two new verbs, mirroring
// app/api/heirloom/invites/route.test.ts's mock shape.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockMembersMaybeSingle = vi.fn()
const mockArtifactsMaybeSingle = vi.fn()
const mockListStoryCollaborators = vi.fn()
const mockRevokeStoryInviteLink = vi.fn()

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
      if (table === 'artifacts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      maybeSingle: (...args: unknown[]) => mockArtifactsMaybeSingle(...args),
                    }),
                  }),
                }),
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
  createOrGetActiveStoryInviteLink: vi.fn(),
  resetStoryInviteLink: vi.fn(),
  listStoryCollaborators: (...args: unknown[]) => mockListStoryCollaborators(...args),
  revokeStoryInviteLink: (...args: unknown[]) => mockRevokeStoryInviteLink(...args),
}))

import { GET, DELETE } from './route'

function makeGetRequest(url: string): Request {
  return { url } as unknown as Request
}

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
  mockArtifactsMaybeSingle.mockReset()
  mockListStoryCollaborators.mockReset()
  mockRevokeStoryInviteLink.mockReset()
})

describe('GET /api/heirloom/story-invites', () => {
  it('401s when signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const res = await GET(makeGetRequest('https://x/api/heirloom/story-invites?story_id=story-1'))

    expect(res.status).toBe(401)
  })

  it("403s when the signed-in Clerk user has no Heirloom members row", async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await GET(makeGetRequest('https://x/api/heirloom/story-invites?story_id=story-1'))

    expect(res.status).toBe(403)
  })

  it('400s when story_id is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })

    const res = await GET(makeGetRequest('https://x/api/heirloom/story-invites'))

    expect(res.status).toBe(400)
  })

  it('returns the roster listStoryCollaborators resolves, scoped to the caller as owner', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockListStoryCollaborators.mockResolvedValue({
      ok: true,
      data: [{ memberId: 'm-1', name: 'Eleanor Hayes', email: null, joinedAt: '2026-08-03T00:00:00Z' }],
    })

    const res = await GET(makeGetRequest('https://x/api/heirloom/story-invites?story_id=story-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.collaborators).toHaveLength(1)
    expect(mockListStoryCollaborators).toHaveBeenCalledWith(
      '20767f1d-1148-4e43-ab73-f6da88f0ac56', 'story-1', 'user-1',
    )
  })

  it('propagates a not-found story as 404', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockListStoryCollaborators.mockResolvedValue({ ok: false, status: 404, error: 'Story not found' })

    const res = await GET(makeGetRequest('https://x/api/heirloom/story-invites?story_id=story-1'))

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/heirloom/story-invites', () => {
  it('401s when signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1' }))

    expect(res.status).toBe(401)
  })

  it('400s when story_id is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })

    const res = await DELETE(makeDeleteRequest({}))

    expect(res.status).toBe(400)
  })

  it("404s when the story isn't owned by the caller", async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockArtifactsMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1' }))

    expect(res.status).toBe(404)
    expect(mockRevokeStoryInviteLink).not.toHaveBeenCalled()
  })

  it('revokes the active link without minting a replacement, once ownership is confirmed', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockArtifactsMaybeSingle.mockResolvedValue({ data: { id: 'story-1' }, error: null })
    mockRevokeStoryInviteLink.mockResolvedValue({ ok: true, data: null })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockRevokeStoryInviteLink).toHaveBeenCalledWith(
      '20767f1d-1148-4e43-ab73-f6da88f0ac56', 'story-1', 'user-1',
    )
  })

  it('surfaces a revoke failure as its own status', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockArtifactsMaybeSingle.mockResolvedValue({ data: { id: 'story-1' }, error: null })
    mockRevokeStoryInviteLink.mockResolvedValue({ ok: false, status: 500, error: 'db down' })

    const res = await DELETE(makeDeleteRequest({ story_id: 'story-1' }))

    expect(res.status).toBe(500)
  })
})
