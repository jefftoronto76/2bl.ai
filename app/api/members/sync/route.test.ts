// app/api/members/sync/route.test.ts
//
// PR #448 review finding: this route used to fall back to Clerk's own name
// whenever the visitor supplied none, so that a brand-new signup never
// landed nameless. That fallback fires unconditionally, including for
// MagicLinkCard's "already signed in" mount effect (fires on every mount
// with an empty name for an EXISTING member, chatStore.tsx) — a name typed
// during sign-in is written to Supabase only, never back to Clerk, so the
// fallback would silently roll a newer Supabase name back to Clerk's stale
// one. Removed; these assert the fallback is gone and identityValue's
// no-value semantics (the D1 fix) still hold.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { authHolder, syncMemberMock, updateClerkUserFirstNameMock } = vi.hoisted(() => ({
  authHolder: { user: null as { providerUserId: string; email?: string; phone?: string; name?: string } | null },
  syncMemberMock: vi.fn(async (_input: Record<string, unknown>) => ({ ok: true as const, data: { id: 'member-1' } })),
  updateClerkUserFirstNameMock: vi.fn(async (_id: string, _firstName: string) => {}),
}))

vi.mock('@/services/auth', () => ({
  getCurrentUser: async () => authHolder.user,
  syncMember: (input: Record<string, unknown>) => syncMemberMock(input),
  HEIRLOOM_TENANT_ID: 'tenant-heirloom',
  getTenantFromRequest: async () => 'tenant-heirloom',
  updateClerkUserFirstName: (id: string, firstName: string) => updateClerkUserFirstNameMock(id, firstName),
}))

import { POST } from './route'

function req(body: unknown): Request {
  return new Request('http://test/api/members/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  syncMemberMock.mockClear()
  updateClerkUserFirstNameMock.mockClear()
  authHolder.user = { providerUserId: 'clerk-1', email: 'e@x.com', name: 'Clerk Stale Name' }
})

describe('POST /api/members/sync — no Clerk-name fallback', () => {
  it('passes undefined for name when the visitor supplied none, even though Clerk has one', async () => {
    await POST(req({ name: null }))

    const [call] = syncMemberMock.mock.calls[0] as [Record<string, unknown>]
    expect(call.name).toBeUndefined()
  })

  it('passes undefined for name when the visitor supplied an empty string', async () => {
    await POST(req({ name: '' }))

    const [call] = syncMemberMock.mock.calls[0] as [Record<string, unknown>]
    expect(call.name).toBeUndefined()
  })

  it('passes undefined for name when no body is sent at all', async () => {
    await POST(req({}))

    const [call] = syncMemberMock.mock.calls[0] as [Record<string, unknown>]
    expect(call.name).toBeUndefined()
  })

  it('still passes through a real name the visitor supplied', async () => {
    await POST(req({ name: '  Real Visitor Name  ' }))

    const [call] = syncMemberMock.mock.calls[0] as [Record<string, unknown>]
    expect(call.name).toBe('Real Visitor Name')
  })

  it('never reads Clerk\'s own name as a fallback value', async () => {
    authHolder.user = { providerUserId: 'clerk-1', email: 'e@x.com', name: 'Should Never Appear' }

    await POST(req({ name: null }))

    const [call] = syncMemberMock.mock.calls[0] as [Record<string, unknown>]
    expect(call.name).not.toBe('Should Never Appear')
    expect(call.name).toBeUndefined()
  })
})

describe('POST /api/members/sync — syncToClerk (item 3b correction)', () => {
  it('calls updateClerkUserFirstName when syncToClerk is true and a name is supplied', async () => {
    await POST(req({ name: 'Jane', syncToClerk: true }))

    expect(updateClerkUserFirstNameMock).toHaveBeenCalledWith('clerk-1', 'Jane')
  })

  it('does not call updateClerkUserFirstName when syncToClerk is absent — the default for every other caller of this route', async () => {
    await POST(req({ name: 'Jane' }))

    expect(updateClerkUserFirstNameMock).not.toHaveBeenCalled()
  })

  it('does not call updateClerkUserFirstName when syncToClerk is false', async () => {
    await POST(req({ name: 'Jane', syncToClerk: false }))

    expect(updateClerkUserFirstNameMock).not.toHaveBeenCalled()
  })

  it('does not call updateClerkUserFirstName when syncToClerk is true but no real name was supplied', async () => {
    await POST(req({ name: '   ', syncToClerk: true }))

    expect(updateClerkUserFirstNameMock).not.toHaveBeenCalled()
  })

  it('still returns 200 with the member when updateClerkUserFirstName rejects — non-fatal', async () => {
    updateClerkUserFirstNameMock.mockRejectedValueOnce(new Error('clerk down'))

    const res = await POST(req({ name: 'Jane', syncToClerk: true }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ member: { id: 'member-1' } })
  })
})
