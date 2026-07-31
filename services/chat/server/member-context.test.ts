// services/chat/server/member-context.test.ts
//
// Covers the always-on MEMBER CONTEXT injection: no primer_used_at gate or
// stamp, descriptive lines fire every turn a member resolves, and the
// [NAME:]/[EMAIL:]/[PHONE:] marker-emission instruction is gated strictly on
// the caller-supplied isFirstTurn flag (computed deterministically by
// streamChat — see index.test.ts's "isFirstTurn computation" suite).

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown> | null
type Result = { data: Row; error: { message: string } | null }

let sessionRowResult: Result = { data: null, error: null }
let memberIdRowResult: Result = { data: null, error: null }
let memberRowResult: Result = { data: null, error: null }

const mockFrom = vi.fn((table: string) => {
  if (table === 'chat_sessions') {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => sessionRowResult,
          }),
        }),
      }),
    }
  }
  if (table === 'members') {
    return {
      select: (cols: string) => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => (cols === 'id' ? memberIdRowResult : memberRowResult),
          }),
        }),
      }),
    }
  }
  throw new Error(`unexpected table in test: ${table}`)
})

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

import { getMemberContext } from './member-context'

beforeEach(() => {
  mockFrom.mockClear()
  sessionRowResult = { data: null, error: null }
  memberIdRowResult = { data: null, error: null }
  memberRowResult = { data: null, error: null }
})

describe('getMemberContext', () => {
  it('returns null when tenantId is null', async () => {
    const result = await getMemberContext('session-1', null, 'member-1', true)
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns null when neither sessionId nor memberId is provided', async () => {
    const result = await getMemberContext(null, 'tenant-1', null, true)
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  describe('memberId path (pre-auth invite holder)', () => {
    it('returns descriptive lines + marker instruction on the first turn', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: 'They mentioned their dog Biscuit last visit.', invited_name: 'Sarah', email: 'sarah@example.com', phone: '+15551234567' },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain("Member's name is Sarah.")
      expect(result).toContain('Email: sarah@example.com.')
      expect(result).toContain('Phone: +15551234567.')
      expect(result).toContain('They mentioned their dog Biscuit last visit.')
      expect(result).toContain('[NAME: Sarah]')
      expect(result).toContain('[EMAIL: sarah@example.com]')
      expect(result).toContain('[PHONE: +15551234567]')
    })

    it('returns descriptive lines only — no marker instruction — on a later turn', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, invited_name: 'Sarah', email: 'sarah@example.com', phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', false)

      expect(result).toContain("Member's name is Sarah.")
      expect(result).toContain('Email: sarah@example.com.')
      expect(result).not.toContain('[NAME:')
      expect(result).not.toContain('[EMAIL:')
      expect(result).not.toContain('hidden markers')
    })

    it('never gates on or references primer_used_at — same result on repeated calls', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: 'Custom primer text.', invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const first = await getMemberContext(null, 'tenant-1', 'member-1', true)
      const second = await getMemberContext(null, 'tenant-1', 'member-1', true)

      // Identical result on repeated calls — no lock, nothing consumed.
      // The mocked `members` table object exposes only `select`, not
      // `update`; if the implementation still tried to stamp a lock it would
      // throw here instead of resolving cleanly.
      expect(first).not.toBeNull()
      expect(second).toEqual(first)
    })

    it('only emits marker lines for fields that actually exist', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, invited_name: null, email: 'only-email@example.com', phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain('Email: only-email@example.com.')
      expect(result).toContain('[EMAIL: only-email@example.com]')
      expect(result).not.toContain('[NAME:')
      expect(result).not.toContain('[PHONE:')
      expect(result).not.toContain("Member's name is")
      expect(result).not.toContain('Phone:')
    })

    it('returns null when the member row has no name/email/phone/primer at all', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, invited_name: null, email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)
      expect(result).toBeNull()
    })

    it('returns null when no member row is found', async () => {
      memberRowResult = { data: null, error: null }
      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)
      expect(result).toBeNull()
    })

    it('fails open on a DB error fetching the member row', async () => {
      memberRowResult = { data: null, error: { message: 'db exploded' } }
      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)
      expect(result).toBeNull()
    })
  })

  describe('sessionId path (signed-in member)', () => {
    it('resolves user_id from the session, then the member by user_id', async () => {
      sessionRowResult = { data: { user_id: 'user-1' }, error: null }
      memberIdRowResult = { data: { id: 'member-1' }, error: null }
      memberRowResult = {
        data: { id: 'member-1', primer: null, invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext('session-1', 'tenant-1', null, true)
      expect(result).toContain("Member's name is Sarah.")
    })

    it('returns null when the session has no user_id (anonymous)', async () => {
      sessionRowResult = { data: { user_id: null }, error: null }
      const result = await getMemberContext('session-1', 'tenant-1', null, true)
      expect(result).toBeNull()
      // Never reaches the member table since there's no user_id to look up.
      expect(memberIdRowResult).toEqual({ data: null, error: null })
    })

    it('returns null when no member row exists for the resolved user_id', async () => {
      sessionRowResult = { data: { user_id: 'user-1' }, error: null }
      memberIdRowResult = { data: null, error: null }
      const result = await getMemberContext('session-1', 'tenant-1', null, true)
      expect(result).toBeNull()
    })

    it('fails open on a DB error resolving the session', async () => {
      sessionRowResult = { data: null, error: { message: 'db exploded' } }
      const result = await getMemberContext('session-1', 'tenant-1', null, true)
      expect(result).toBeNull()
    })

    it('fails open on a DB error resolving the member id from user_id', async () => {
      sessionRowResult = { data: { user_id: 'user-1' }, error: null }
      memberIdRowResult = { data: null, error: { message: 'db exploded' } }
      const result = await getMemberContext('session-1', 'tenant-1', null, true)
      expect(result).toBeNull()
    })
  })
})
