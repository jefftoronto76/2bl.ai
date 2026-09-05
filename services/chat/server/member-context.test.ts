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
/** Column lists passed to members.select() — lets a test assert the query
 *  actually asks for `name`, not just that the output happens to be right. */
let selectCalls: string[] = []

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
      select: (cols: string) => {
        selectCalls.push(cols)
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => (cols === 'id' ? memberIdRowResult : memberRowResult),
            }),
          }),
        }
      },
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
  selectCalls = []
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
        data: { id: 'member-1', primer: 'They mentioned their dog Biscuit last visit.', name: 'Sarah Chen', invited_name: 'Sarah', email: 'sarah@example.com', phone: '+15551234567' },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain("Member's name is Sarah Chen.")
      expect(result).toContain('Email: sarah@example.com.')
      expect(result).toContain('Phone: +15551234567.')
      expect(result).toContain('They mentioned their dog Biscuit last visit.')
      expect(result).toContain('[NAME: Sarah Chen]')
      expect(result).toContain('[EMAIL: sarah@example.com]')
      expect(result).toContain('[PHONE: +15551234567]')
    })

    it('returns descriptive lines only — no marker instruction — on a later turn', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: 'Sarah Chen', invited_name: 'Sarah', email: 'sarah@example.com', phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', false)

      expect(result).toContain("Member's name is Sarah Chen.")
      expect(result).toContain('Email: sarah@example.com.')
      expect(result).not.toContain('[NAME:')
      expect(result).not.toContain('[EMAIL:')
      expect(result).not.toContain('hidden markers')
    })

    it('never gates on or references primer_used_at — same result on repeated calls', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: 'Custom primer text.', name: 'Sarah Chen', invited_name: 'Sarah', email: null, phone: null },
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
        data: { id: 'member-1', primer: null, name: null, invited_name: null, email: 'only-email@example.com', phone: null },
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
        data: { id: 'member-1', primer: null, name: null, invited_name: null, email: null, phone: null },
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

  // ── D2: members.name is the member's name; invited_name is a fallback ─────
  //
  // This function read invited_name alone and never selected `name`. Live
  // impact when found: 11 members with a name and no invited_name were
  // nameless to the model, and 1 whose name had changed was addressed by a
  // stale invite-time name — on every single turn.
  //
  // Every fixture in this file also used to set only invited_name, so all 14
  // tests passed against the defect. The fixtures now always set `name`
  // explicitly, and use a different value from invited_name wherever both
  // exist, so no assertion here can be satisfied by reading the wrong column.
  describe('display-name precedence (D2)', () => {
    it('uses members.name when invited_name is null — the self-service member case', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: 'Sarah Chen', invited_name: null, email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain("Member's name is Sarah Chen.")
      expect(result).toContain('[NAME: Sarah Chen]')
    })

    it('prefers members.name over a stale invited_name', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: 'Sarah Chen', invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain("Member's name is Sarah Chen.")
      expect(result).not.toContain("Member's name is Sarah.")
      expect(result).toContain('[NAME: Sarah Chen]')
    })

    it('falls back to invited_name when name is null — the pre-signup invite holder', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: null, invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain("Member's name is Sarah.")
      expect(result).toContain('[NAME: Sarah]')
    })

    it('falls back to invited_name when name is empty or whitespace', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: '   ', invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).toContain("Member's name is Sarah.")
    })

    it('emits no name at all when neither column has a usable value', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: '', invited_name: null, email: 'e@x.com', phone: null },
        error: null,
      }

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      expect(result).not.toContain("Member's name is")
      expect(result).not.toContain('[NAME:')
    })

    // The defect was as much a missing column in the select as a wrong
    // variable — a fix that read some other stale field would satisfy the
    // assertions above on the memberId path but not this one.
    it('requests the name column from the members table', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: 'Sarah Chen', invited_name: null, email: null, phone: null },
        error: null,
      }

      await getMemberContext(null, 'tenant-1', 'member-1', true)

      // Split on commas: a substring check would be satisfied by `invited_name`
      // alone, which is exactly the defect, so it must be a standalone column.
      const columns = selectCalls
        .filter((c) => c !== 'id')
        .flatMap((c) => c.split(',').map((s) => s.trim()))
      expect(columns).toContain('name')
      expect(columns).toContain('invited_name')
    })

    it('applies the same precedence on the sessionId path', async () => {
      sessionRowResult = { data: { user_id: 'user-1' }, error: null }
      memberIdRowResult = { data: { id: 'member-1' }, error: null }
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: 'Sarah Chen', invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext('session-1', 'tenant-1', null, true)

      expect(result).toContain("Member's name is Sarah Chen.")
    })
  })

  describe('sessionId path (signed-in member)', () => {
    it('resolves user_id from the session, then the member by user_id', async () => {
      sessionRowResult = { data: { user_id: 'user-1' }, error: null }
      memberIdRowResult = { data: { id: 'member-1' }, error: null }
      memberRowResult = {
        data: { id: 'member-1', primer: null, name: 'Sarah Chen', invited_name: 'Sarah', email: null, phone: null },
        error: null,
      }

      const result = await getMemberContext('session-1', 'tenant-1', null, true)
      expect(result).toContain("Member's name is Sarah Chen.")
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

  // D9 fix: the "found" success log's resultPreview field used to slice the
  // built prose (name/email/phone/primer, and the [NAME:]/[EMAIL:]/[PHONE:]
  // marker instruction on a first turn) straight into the log line.
  describe('D9 — no raw PII in console output', () => {
    it('never logs the raw name/email/phone/primer text, logging only a result length', async () => {
      memberRowResult = {
        data: { id: 'member-1', primer: 'They mentioned their dog Biscuit last visit.', name: 'Sarah Chen', invited_name: 'Sarah', email: 'sarah@example.com', phone: '+15551234567' },
        error: null,
      }
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await getMemberContext(null, 'tenant-1', 'member-1', true)

      const output = logSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n')
      logSpy.mockRestore()

      expect(result).not.toBeNull()
      expect(output).not.toContain('Sarah Chen')
      expect(output).not.toContain('sarah@example.com')
      expect(output).not.toContain('+15551234567')
      expect(output).not.toContain('Biscuit')
      expect(output).toContain('"resultLength"')
      expect(output).toContain('[chat/member-context] found')
    })
  })
})
