// services/auth/claim-membership.test.ts
//
// Gate 3: claimMembership's getAdminClient call now carries explicit
// source attribution ('claim_membership') for the identity audit trigger.
// No prior test file existed for this function — minimal coverage added
// alongside the attribution assertion.

import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder, getAdminClientCalls } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
  getAdminClientCalls: [] as unknown[][],
}))

vi.mock('./supabase-admin', () => ({
  getAdminClient: (...args: unknown[]) => {
    getAdminClientCalls.push(args)
    return adminHolder.client
  },
}))

import { claimMembership } from './claim-membership'

function makeClient({ existing }: { existing: unknown }) {
  const insertCalls: unknown[] = []
  const client = {
    from() {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
          }),
        }),
        insert: (payload: unknown) => {
          insertCalls.push(payload)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { client, insertCalls }
}

beforeEach(() => {
  adminHolder.client = null
  getAdminClientCalls.length = 0
})

describe('claimMembership', () => {
  it('calls getAdminClient with source "claim_membership" (Gate 3 attribution)', async () => {
    const { client } = makeClient({ existing: null })
    adminHolder.client = client

    await claimMembership('clerk-1', 'tenant-1')

    expect(getAdminClientCalls[0]).toEqual(['claim_membership'])
  })

  it('is a no-op when a row already exists for this clerk_id', async () => {
    const { client, insertCalls } = makeClient({ existing: { id: 'm1', status: 'active' } })
    adminHolder.client = client

    const result = await claimMembership('clerk-1', 'tenant-1')

    expect(result).toEqual({ ok: true })
    expect(insertCalls).toHaveLength(0)
  })

  it('inserts a pending row with the supplied contact info when none exists', async () => {
    const { client, insertCalls } = makeClient({ existing: null })
    adminHolder.client = client

    await claimMembership('clerk-1', 'tenant-1', { name: 'Jane', email: 'jane@example.com' })

    expect(insertCalls).toHaveLength(1)
    const payload = insertCalls[0] as Record<string, unknown>
    expect(payload.status).toBe('pending')
    expect(payload.name).toBe('Jane')
    expect(payload.email).toBe('jane@example.com')
  })

  it("stamps members.source as 'self_serve_clerk' on insert — this function's only caller is GateView's Clerk-modal claim flow", async () => {
    const { client, insertCalls } = makeClient({ existing: null })
    adminHolder.client = client

    await claimMembership('clerk-1', 'tenant-1')

    const payload = insertCalls[0] as Record<string, unknown>
    expect(payload.source).toBe('self_serve_clerk')
  })
})
