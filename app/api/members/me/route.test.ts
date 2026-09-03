// app/api/members/me/route.test.ts
//
// Read-only endpoint backing item 3b's name-completion gate. Covers: happy
// path, invitedName passthrough (no server-side resolution — that's the
// client's job via the shared resolveMemberName), the no-row-exists case
// (200 + nulls, not 404 — fails open), 401 when signed out, and confirms
// the lookup is scoped by tenant_id + clerk_id only, never by anything the
// client sends.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = { name: string | null; invited_name: string | null; created_at: string } | null

let memberRowResult: Row = null
const eqCalls: Array<[string, unknown]> = []
const authHolder: { user: { providerUserId: string } | null } = { user: null }

const mockFrom = vi.fn((table: string) => {
  if (table !== 'members') throw new Error(`unexpected table in test: ${table}`)
  return {
    select: () => ({
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return {
          eq: (col2: string, val2: unknown) => {
            eqCalls.push([col2, val2])
            return { maybeSingle: async () => ({ data: memberRowResult, error: null }) }
          },
        }
      },
    }),
  }
})

vi.mock('@/services/auth', () => ({
  getCurrentUser: async () => authHolder.user,
  getTenantFromRequest: async () => 'tenant-heirloom',
  HEIRLOOM_TENANT_ID: 'tenant-heirloom',
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

import { GET } from './route'

function req(query?: Record<string, string>): Request {
  const url = new URL('http://test/api/members/me')
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
  return new Request(url, { method: 'GET' })
}

beforeEach(() => {
  mockFrom.mockClear()
  eqCalls.length = 0
  authHolder.user = { providerUserId: 'clerk-1' }
  memberRowResult = null
})

describe('GET /api/members/me', () => {
  it('returns 401 when no Clerk session exists', async () => {
    authHolder.user = null

    const res = await GET(req())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns name, invitedName, and createdAt when a members row exists', async () => {
    memberRowResult = { name: 'Jane', invited_name: null, created_at: '2026-09-10T00:00:00Z' }

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ name: 'Jane', invitedName: null, createdAt: '2026-09-10T00:00:00Z' })
  })

  it('passes invitedName through untouched as a fallback field, without resolving it server-side', async () => {
    memberRowResult = { name: null, invited_name: 'Invited Jane', created_at: '2026-09-10T00:00:00Z' }

    const res = await GET(req())
    const body = await res.json()

    expect(body).toEqual({ name: null, invitedName: 'Invited Jane', createdAt: '2026-09-10T00:00:00Z' })
  })

  it('returns 200 with all-null fields when no members row exists for this caller, not a 404', async () => {
    memberRowResult = null

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ name: null, invitedName: null, createdAt: null })
  })

  it('scopes the lookup by tenant_id and clerk_id only, ignoring anything the client sends', async () => {
    memberRowResult = { name: 'Jane', invited_name: null, created_at: '2026-09-10T00:00:00Z' }

    await GET(req({ memberId: 'spoofed-id', clerk_id: 'attacker-id' }))
    // The spoofed query params above must never reach the query — the
    // clerk_id used is always authHolder.user.providerUserId, resolved
    // server-side via getCurrentUser(), not anything on the request.

    expect(eqCalls).toEqual([
      ['tenant_id', 'tenant-heirloom'],
      ['clerk_id', 'clerk-1'],
    ])
  })
})
