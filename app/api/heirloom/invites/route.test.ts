// Covers POST /api/heirloom/invites — the member-facing collaborator-invite
// creation route backing SidebarV2's per-story invite icon. Distinct from
// /api/admin/members/invite: this resolves identity via getCurrentUser() +
// a direct `members` lookup by clerk_id, never getAuthContext() (see the
// route's own doc comment for why).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockCreateMemberInvite = vi.fn()
const mockLogEvent = vi.fn()
const mockMembersMaybeSingle = vi.fn()
const mockTenantsMaybeSingle = vi.fn()

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
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: (...args: unknown[]) => mockTenantsMaybeSingle(...args),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.mock('@/services/members', () => ({
  createMemberInvite: (...args: unknown[]) => mockCreateMemberInvite(...args),
  HEIRLOOM_TENANT_ID: '20767f1d-1148-4e43-ab73-f6da88f0ac56',
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  AuditAction: { MEMBER_INVITE_CREATED: 'member.invite_created' },
}))

vi.mock('@/app/admin/members/inviteLink', () => ({
  inviteUrlFor: (token: string, domain: string | null) => (domain ? `https://${domain}/invite/${token}` : null),
}))

import { POST } from './route'

function makeRequest(body?: unknown): Request {
  return {
    headers: { get: () => null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  } as unknown as Request
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockCreateMemberInvite.mockReset()
  mockLogEvent.mockReset()
  mockMembersMaybeSingle.mockReset()
  mockTenantsMaybeSingle.mockReset().mockResolvedValue({
    data: { domain: 'heirloom.life', default_primer: 'Default context' },
    error: null,
  })
})

describe('POST /api/heirloom/invites', () => {
  it('401s when there is no Clerk session', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(401)
    expect(mockCreateMemberInvite).not.toHaveBeenCalled()
  })

  it('403s when the caller has no members row for the Heirloom tenant', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(403)
    expect(mockCreateMemberInvite).not.toHaveBeenCalled()
  })

  it('creates an invite with the supplied primer + story_id and returns the link', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockCreateMemberInvite.mockResolvedValue({
      ok: true,
      data: { token: 'tok-123', memberId: 'invited-member-1' },
    })

    const res = await POST(makeRequest({ primer: 'Ask about the lake house.', story_id: 'story-1' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({
      token: 'tok-123',
      member_id: 'invited-member-1',
      invite_url: 'https://heirloom.life/invite/tok-123',
    })
    expect(mockCreateMemberInvite).toHaveBeenCalledWith(
      '20767f1d-1148-4e43-ab73-f6da88f0ac56',
      'user-1',
      null,
      null,
      null,
      false,
      'Ask about the lake house.',
      'story-1',
    )
  })

  it('falls back to the tenant default_primer when no primer is supplied', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockCreateMemberInvite.mockResolvedValue({
      ok: true,
      data: { token: 'tok-456', memberId: 'invited-member-2' },
    })

    await POST(makeRequest({ story_id: 'story-1' }))

    expect(mockCreateMemberInvite).toHaveBeenCalledWith(
      '20767f1d-1148-4e43-ab73-f6da88f0ac56',
      'user-1',
      null,
      null,
      null,
      false,
      'Default context',
      'story-1',
    )
  })

  it('passes story_id through as null when omitted', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockCreateMemberInvite.mockResolvedValue({
      ok: true,
      data: { token: 'tok-789', memberId: 'invited-member-3' },
    })

    await POST(makeRequest({}))

    expect(mockCreateMemberInvite).toHaveBeenCalledWith(
      '20767f1d-1148-4e43-ab73-f6da88f0ac56',
      'user-1',
      null,
      null,
      null,
      false,
      'Default context',
      null,
    )
  })

  it('propagates a createMemberInvite failure as the same status/error', async () => {
    mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-1' })
    mockMembersMaybeSingle.mockResolvedValue({ data: { id: 'member-1' }, error: null })
    mockCreateMemberInvite.mockResolvedValue({ ok: false, status: 500, error: 'insert failed' })

    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'insert failed' })
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', metadata: { error: 'insert failed' } }),
    )
  })
})
