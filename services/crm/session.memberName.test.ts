// services/crm/session.memberName.test.ts
//
// D7 fix: a name captured via the [NAME:] marker (or the free-text regex
// fallback) previously reached chat_sessions.visitor_name only, never
// `members`, even when the session belongs to a signed-in member. Covers
// the new fill-only-when-null write onto members.name, independent of the
// existing chat_sessions.visitor_name write (already covered by
// session-shortcircuit.test.ts, untouched here).

import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder, updateClerkMock } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
  updateClerkMock: vi.fn(async (_clerkId: string, _name: string) => {}),
}))
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))
vi.mock('@/services/auth', () => ({
  updateClerkUserFirstName: (clerkId: string, name: string) => updateClerkMock(clerkId, name),
}))

import { handleSessionFinish } from './session'

type Row = Record<string, unknown>

/** Multi-table stand-in — chat_sessions and members each get their own row
 *  and their own recorded selects/updates, since a single onFinish call can
 *  touch both tables. */
function makeAdminClient(chatSessionRow: Row, memberRow: Row | null) {
  const memberSelectCols: string[] = []
  const memberUpdates: Row[] = []
  const memberTableCalls: number[] = []

  const client = {
    from(table: string) {
      if (table === 'chat_sessions') {
        return {
          select() {
            return {
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: chatSessionRow, error: null }) }),
              }),
            }
          },
          update(obj: Row) {
            return {
              eq: () => ({
                eq: async () => {
                  Object.assign(chatSessionRow, obj)
                  return { error: null }
                },
              }),
            }
          },
        }
      }
      if (table === 'members') {
        memberTableCalls.push(1)
        return {
          select(cols: string) {
            memberSelectCols.push(cols)
            return {
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: memberRow, error: null }) }),
              }),
            }
          },
          update(obj: Row) {
            return {
              eq: () => ({
                eq: async () => {
                  memberUpdates.push(obj)
                  if (memberRow) Object.assign(memberRow, obj)
                  return { error: null }
                },
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    },
  }
  return { client, memberSelectCols, memberUpdates, memberTableCalls }
}

beforeEach(() => {
  adminHolder.client = null
  updateClerkMock.mockClear()
})

describe('handleSessionFinish — D7, [NAME:] marker also reaches members', () => {
  it('writes the marker-captured name onto members.name when memberId is provided and it is currently null', async () => {
    const { client, memberUpdates } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: null },
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: 'Nice to meet you. [NAME: Priya]',
      usage: null,
      memberId: 'm1',
    })

    expect(memberUpdates).toEqual([{ name: 'Priya' }])
  })

  it('does not overwrite an existing members.name', async () => {
    const { client, memberUpdates } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: 'Already Set' },
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: 'Nice to meet you. [NAME: Priya]',
      usage: null,
      memberId: 'm1',
    })

    expect(memberUpdates).toEqual([])
  })

  it('does not touch the members table at all when no memberId is provided (anonymous visitor)', async () => {
    const { client, memberTableCalls } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      null,
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: 'Nice to meet you. [NAME: Priya]',
      usage: null,
      memberId: null,
    })

    expect(memberTableCalls).toHaveLength(0)
  })

  it('also writes via the free-text fallback when no [NAME:] marker is present', async () => {
    const { client, memberUpdates } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: null },
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: 'What brings you here today?',
      usage: null,
      visitorText: 'my name is Priya',
      memberId: 'm1',
    })

    expect(memberUpdates).toEqual([{ name: 'Priya' }])
  })

  it('does not write to members when the member row cannot be found', async () => {
    const { client, memberUpdates } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      null, // no matching members row
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: '[NAME: Priya]',
      usage: null,
      memberId: 'm1',
    })

    expect(memberUpdates).toEqual([])
  })
})

describe('handleSessionFinish — D3, persistMemberName also pushes the name to Clerk', () => {
  it('calls updateClerkUserFirstName with the row clerk_id after a successful write', async () => {
    const { client } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: null, clerk_id: 'clerk-1' },
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: '[NAME: Priya]',
      usage: null,
      memberId: 'm1',
    })

    expect(updateClerkMock).toHaveBeenCalledWith('clerk-1', 'Priya')
  })

  it('does not call updateClerkUserFirstName when the member row has no clerk_id', async () => {
    const { client } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: null, clerk_id: null },
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: '[NAME: Priya]',
      usage: null,
      memberId: 'm1',
    })

    expect(updateClerkMock).not.toHaveBeenCalled()
  })

  it('does not call updateClerkUserFirstName when the Supabase write itself was skipped (name already set)', async () => {
    const { client } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: 'Already Set', clerk_id: 'clerk-1' },
    )
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      tenantId: 't1',
      text: '[NAME: Priya]',
      usage: null,
      memberId: 'm1',
    })

    expect(updateClerkMock).not.toHaveBeenCalled()
  })

  it('does not throw or block when updateClerkUserFirstName rejects — non-fatal', async () => {
    updateClerkMock.mockRejectedValueOnce(new Error('clerk down'))
    const { client, memberUpdates } = makeAdminClient(
      { visitor_name: null, calendar_offered: true },
      { name: null, clerk_id: 'clerk-1' },
    )
    adminHolder.client = client

    await expect(
      handleSessionFinish({
        sessionId: 's1',
        tenantId: 't1',
        text: '[NAME: Priya]',
        usage: null,
        memberId: 'm1',
      }),
    ).resolves.not.toThrow()

    // The Supabase write already succeeded before the Clerk call — a
    // rejected Clerk push must not roll it back or hide it.
    expect(memberUpdates).toEqual([{ name: 'Priya' }])
  })
})
