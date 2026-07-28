import { vi, describe, it, expect } from 'vitest'

// Hoisted holder so the supabase-admin mock can resolve to a per-test client
// — mirrors session-shortcircuit.test.ts's pattern (same shared admin client).
const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))

import { recordConversionEvents, overwriteConversionEventsFrom } from './conversion-events'

type Row = Record<string, unknown>

function makeInsertClient(result: { error: { message: string } | null } = { error: null }) {
  const inserted: Row[][] = []
  const client = {
    from(table: string) {
      expect(table).toBe('conversion_events')
      return {
        insert: async (rows: Row[]) => {
          inserted.push(rows)
          return result
        },
      }
    },
  }
  return { client, inserted }
}

interface UpdateCall {
  patch: Row
  eqs: [string, unknown][]
  gt?: [string, unknown]
}

function makeUpdateClient(result: { error: { message: string } | null } = { error: null }) {
  const calls: UpdateCall[] = []
  const client = {
    from(table: string) {
      expect(table).toBe('conversion_events')
      return {
        update(patch: Row) {
          const call: UpdateCall = { patch, eqs: [] }
          calls.push(call)
          const builder = {
            eq(col: string, val: unknown) {
              call.eqs.push([col, val])
              return builder
            },
            gt(col: string, val: unknown) {
              call.gt = [col, val]
              return Promise.resolve(result)
            },
          }
          return builder
        },
      }
    },
  }
  return { client, calls }
}

describe('recordConversionEvents', () => {
  it('maps BOOKING to booking_offered', async () => {
    const { client, inserted } = makeInsertClient()
    adminHolder.client = client

    await recordConversionEvents({
      tenantId: 't1',
      sessionId: 's1',
      memberId: null,
      text: 'Here you go.\n[BOOKING: Book a call | Talk it through | Book now | https://calendly.com/x]',
    })

    expect(inserted).toEqual([
      [
        {
          tenant_id: 't1',
          session_id: 's1',
          member_id: null,
          event_type: 'booking_offered',
          marker_type: 'BOOKING',
        },
      ],
    ])
  })

  it('maps NAME/EMAIL/PHONE to contact_captured, one row per marker, carrying memberId through', async () => {
    const { client, inserted } = makeInsertClient()
    adminHolder.client = client

    await recordConversionEvents({
      tenantId: 't1',
      sessionId: 's1',
      memberId: 'm1',
      text: 'Thanks. [NAME: Sam] [EMAIL: sam@example.com] [PHONE: +15551234567]',
    })

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toHaveLength(3)
    expect(inserted[0].map(r => r.marker_type).sort()).toEqual(['EMAIL', 'NAME', 'PHONE'])
    expect(inserted[0].every(r => r.event_type === 'contact_captured')).toBe(true)
    expect(inserted[0].every(r => r.member_id === 'm1')).toBe(true)
    expect(inserted[0].every(r => r.tenant_id === 't1' && r.session_id === 's1')).toBe(true)
  })

  it('skips markers with no lookup entry (e.g. ACCOUNT_CREATE) and never calls insert', async () => {
    const { client, inserted } = makeInsertClient()
    adminHolder.client = client

    await recordConversionEvents({
      tenantId: 't1',
      sessionId: 's1',
      memberId: null,
      text: '[ACCOUNT_CREATE: claim_membership]',
    })

    expect(inserted).toHaveLength(0)
  })

  it('never calls insert when the text has no markers at all', async () => {
    const { client, inserted } = makeInsertClient()
    adminHolder.client = client

    await recordConversionEvents({ tenantId: 't1', sessionId: 's1', memberId: null, text: 'Just chatting.' })

    expect(inserted).toHaveLength(0)
  })

  it('catches an insert error rather than throwing', async () => {
    const { client } = makeInsertClient({ error: { message: 'boom' } })
    adminHolder.client = client

    await expect(
      recordConversionEvents({ tenantId: 't1', sessionId: 's1', memberId: null, text: '[NAME: Sam]' }),
    ).resolves.toBeUndefined()
  })

  it('catches a thrown error (e.g. insert unimplemented) rather than throwing', async () => {
    adminHolder.client = { from: () => ({}) } // .insert is undefined on this stub

    await expect(
      recordConversionEvents({ tenantId: 't1', sessionId: 's1', memberId: null, text: '[NAME: Sam]' }),
    ).resolves.toBeUndefined()
  })
})

describe('overwriteConversionEventsFrom', () => {
  it('flips presented rows created after the cutoff to overwritten, tenant + session scoped', async () => {
    const { client, calls } = makeUpdateClient()
    adminHolder.client = client

    await overwriteConversionEventsFrom('t1', 's1', '2026-07-28T00:00:00.000Z')

    expect(calls).toHaveLength(1)
    expect(calls[0].patch.status).toBe('overwritten')
    expect(typeof calls[0].patch.updated_at).toBe('string')
    expect(calls[0].eqs).toEqual([
      ['session_id', 's1'],
      ['tenant_id', 't1'],
      ['status', 'presented'],
    ])
    expect(calls[0].gt).toEqual(['created_at', '2026-07-28T00:00:00.000Z'])
  })

  it('catches an update error rather than throwing', async () => {
    const { client } = makeUpdateClient({ error: { message: 'boom' } })
    adminHolder.client = client

    await expect(
      overwriteConversionEventsFrom('t1', 's1', '2026-07-28T00:00:00.000Z'),
    ).resolves.toBeUndefined()
  })

  it('catches a thrown error rather than throwing', async () => {
    adminHolder.client = { from: () => ({ update: () => ({}) }) } // .eq is undefined on this stub

    await expect(
      overwriteConversionEventsFrom('t1', 's1', '2026-07-28T00:00:00.000Z'),
    ).resolves.toBeUndefined()
  })
})
