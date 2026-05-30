import { vi, describe, it, expect } from 'vitest'

// Hoisted holder so the supabase-admin mock can resolve to a per-test client.
const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))

import { handleSessionFinish } from './session'

type Row = Record<string, unknown>

// Minimal chainable stand-in for the service-role client used by session.ts:
//   .from(t).select(cols).eq(id, v).maybeSingle()  → { data: row, error: null }
//   .from(t).update(obj).eq(id, v)                 → records the write, mutates row
// `selectCols` records every selected column string (one per persist/pre-check),
// and `updates` records every written object — together they reveal whether the
// regex fallback's persist actually ran.
function makeAdminClient(row: Row) {
  const selectCols: string[] = []
  const updates: Row[] = []
  const client = {
    from() {
      return {
        select(cols: string) {
          selectCols.push(cols)
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row, error: null }) }
            },
          }
        },
        update(obj: Row) {
          return {
            eq: async () => {
              updates.push(obj)
              Object.assign(row, obj)
              return { error: null }
            },
          }
        },
      }
    },
  }
  return { client, selectCols, updates }
}

describe('handleSessionFinish — marker/regex short-circuit', () => {
  it('skips the regex phone fallback when the [PHONE:] marker captures', async () => {
    const { client, selectCols, updates } = makeAdminClient({
      visitor_name: 'Sam',
      email: 'set@example.com',
      phone: null,
      calendar_offered: true,
    })
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's1',
      text: 'Got it. [PHONE: +15551234567]',
      usage: null,
      // A *different* number in free text — if the regex ran it would write this.
      visitorText: 'you can also reach me at 999-555-1234',
    })

    expect(updates.filter(u => 'phone' in u)).toEqual([{ phone: '+15551234567' }])
    // Only the marker persist selected 'phone'; the regex fallback was skipped.
    expect(selectCols.filter(c => c === 'phone')).toHaveLength(1)
  })

  it('runs the regex phone fallback when no [PHONE:] marker is present', async () => {
    const { client, selectCols, updates } = makeAdminClient({
      visitor_name: 'Sam',
      email: 'set@example.com',
      phone: null,
      calendar_offered: true,
    })
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's2',
      text: 'Sounds good, talk soon.',
      usage: null,
      visitorText: 'call me at 555-123-4567',
    })

    expect(updates.filter(u => 'phone' in u)).toEqual([{ phone: '+15551234567' }])
    // No marker persist; the regex fallback's persist is the only 'phone' select.
    expect(selectCols.filter(c => c === 'phone')).toHaveLength(1)
  })

  it('skips the regex email fallback when the [EMAIL:] marker captures', async () => {
    const { client, selectCols, updates } = makeAdminClient({
      visitor_name: 'Sam',
      email: null,
      phone: '+10000000000',
      calendar_offered: true,
    })
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's3',
      text: 'Thanks. [EMAIL: marker@example.com]',
      usage: null,
      visitorText: 'or email me at regex@example.com',
    })

    expect(updates.filter(u => 'email' in u)).toEqual([{ email: 'marker@example.com' }])
    expect(selectCols.filter(c => c === 'email')).toHaveLength(1)
  })

  it('runs the regex email fallback when no [EMAIL:] marker is present', async () => {
    const { client, selectCols, updates } = makeAdminClient({
      visitor_name: 'Sam',
      email: null,
      phone: '+10000000000',
      calendar_offered: true,
    })
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's4',
      text: 'Sounds good.',
      usage: null,
      visitorText: 'reach me at hello@example.com',
    })

    expect(updates.filter(u => 'email' in u)).toEqual([{ email: 'hello@example.com' }])
    expect(selectCols.filter(c => c === 'email')).toHaveLength(1)
  })

  it('skips the regex name fallback when the [NAME:] marker captures', async () => {
    const { client, updates } = makeAdminClient({
      visitor_name: null,
      email: null,
      phone: null,
      calendar_offered: true,
    })
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's5',
      text: 'Great to meet you. [NAME: cassandra]',
      usage: null,
      // A different name in free text — if the regex ran it would write this.
      visitorText: 'my name is Priya',
    })

    // Only the marker name (titlecased from 'cassandra') should be written.
    expect(updates.filter(u => 'visitor_name' in u)).toEqual([{ visitor_name: 'Cassandra' }])
  })

  it('runs the regex name fallback when no [NAME:] marker is present', async () => {
    const { client, updates } = makeAdminClient({
      visitor_name: null,
      email: null,
      phone: null,
      calendar_offered: true,
    })
    adminHolder.client = client

    await handleSessionFinish({
      sessionId: 's6',
      text: 'What brings you here today?',
      usage: null,
      visitorText: 'my name is Cassandra',
    })

    expect(updates.filter(u => 'visitor_name' in u)).toEqual([{ visitor_name: 'Cassandra' }])
  })
})
