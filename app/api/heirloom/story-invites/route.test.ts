// Covers DELETE /api/heirloom/story-invites — added Phase 5
// (invite_modal_updates, 2026-08-10) to back InviteCollaboratorsModal.tsx's
// invalidation warning (Continue revokes the current link without minting a
// replacement). POST (create/reset) predates this file and is exercised at
// the service layer (services/crm/story-invites.test.ts); these tests focus
// on the auth/ownership gating this route file itself owns for DELETE,
// mirroring app/api/heirloom/invites/route.test.ts's mock shape.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockMembersMaybeSingle = vi.fn()
const mockArtifactsMaybeSingle = vi.fn()
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
  revokeStoryInviteLink: (...args: unknown[]) => mockRevokeStoryInviteLink(...args),
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
  mockArtifactsMaybeSingle.mockReset()
  mockRevokeStoryInviteLink.mockReset()
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
