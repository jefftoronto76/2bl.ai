// app/api/heirloom/members/waitlist/route.test.ts
//
// Covers the optional name field added alongside the existing
// email-only waitlist request — captured now (when offered) since no
// Clerk account exists yet to enforce a name against, carried forward on
// the same members row through promotion to a real invite.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { insertMock, existingRowResult, getAdminClientCalls } = vi.hoisted(() => ({
  insertMock: vi.fn(async (_payload: Record<string, unknown>) => ({ error: null })),
  existingRowResult: { data: null as { id: string; status: string } | null },
  getAdminClientCalls: [] as unknown[][],
}))

const mockFrom = vi.fn((table: string) => {
  if (table !== 'members') throw new Error(`unexpected table in test: ${table}`)
  return {
    select: () => ({
      eq: () => ({
        ilike: () => ({
          maybeSingle: async () => ({ data: existingRowResult.data }),
        }),
      }),
    }),
    insert: (payload: Record<string, unknown>) => insertMock(payload),
  }
})

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: (...args: unknown[]) => {
    getAdminClientCalls.push(args)
    return { from: mockFrom }
  },
}))

vi.mock('@/services/members', () => ({
  HEIRLOOM_TENANT_ID: 'tenant-heirloom',
}))

import { POST } from './route'

function req(body: unknown): Request {
  return new Request('http://test/api/heirloom/members/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  insertMock.mockClear()
  mockFrom.mockClear()
  existingRowResult.data = null
  getAdminClientCalls.length = 0
})

describe('POST /api/heirloom/members/waitlist — Gate 3 attribution', () => {
  it('calls getAdminClient with source "waitlist_request"', async () => {
    await POST(req({ email: 'e@x.com' }))

    expect(getAdminClientCalls[0]).toEqual(['waitlist_request'])
  })
})

describe('POST /api/heirloom/members/waitlist — optional name', () => {
  it('includes name in the insert payload when supplied', async () => {
    await POST(req({ email: 'e@x.com', name: 'Jane' }))

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'e@x.com', name: 'Jane', status: 'waitlist' }),
    )
  })

  it('omits name entirely from the insert payload when not supplied — no null/empty column', async () => {
    await POST(req({ email: 'e@x.com' }))

    const [payload] = insertMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload).not.toHaveProperty('name')
  })

  it('omits name when supplied as whitespace-only', async () => {
    await POST(req({ email: 'e@x.com', name: '   ' }))

    const [payload] = insertMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload).not.toHaveProperty('name')
  })

  it('trims a supplied name before writing it', async () => {
    await POST(req({ email: 'e@x.com', name: '  Jane  ' }))

    const [payload] = insertMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload.name).toBe('Jane')
  })

  it('still requires a valid email regardless of name', async () => {
    const res = await POST(req({ name: 'Jane' }))

    expect(res.status).toBe(400)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('does not call insert at all for an already-existing row (idempotent branch unaffected by name)', async () => {
    existingRowResult.data = { id: 'm1', status: 'waitlist' }

    const res = await POST(req({ email: 'e@x.com', name: 'Jane' }))

    expect(insertMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body).toEqual({ ok: true, already_exists: true })
  })
})
