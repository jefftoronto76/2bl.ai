// services/auth/ensure-clerk-user.test.ts
//
// Gate 3: ensureClerkUser's getAdminClient call now carries explicit
// source attribution ('ensure_clerk_user'). No prior test file existed for
// this function — minimal coverage added alongside the attribution
// assertion.

import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder, clerkHolder, getAdminClientCalls } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
  clerkHolder: { user: null as unknown },
  getAdminClientCalls: [] as unknown[][],
}))

vi.mock('./supabase-admin', () => ({
  getAdminClient: (...args: unknown[]) => {
    getAdminClientCalls.push(args)
    return adminHolder.client
  },
}))

vi.mock('./providers/clerk/server', () => ({
  clerkCurrentUser: async () => clerkHolder.user,
}))

import { ensureClerkUser } from './ensure-clerk-user'

function makeClient() {
  const upsertCalls: unknown[] = []
  adminHolder.client = {
    from() {
      return {
        upsert(payload: unknown) {
          upsertCalls.push(payload)
          return {
            select() {
              return { single: async () => ({ data: { id: 'user-1' }, error: null }) }
            },
          }
        },
      }
    },
  }
  return () => upsertCalls[0] as Record<string, unknown>
}

beforeEach(() => {
  adminHolder.client = null
  clerkHolder.user = null
  getAdminClientCalls.length = 0
})

describe('ensureClerkUser', () => {
  it('calls getAdminClient with source "ensure_clerk_user" (Gate 3 attribution)', async () => {
    makeClient()
    clerkHolder.user = { id: 'clerk-1', emailAddresses: [], phoneNumbers: [], firstName: 'Jane', lastName: null }

    await ensureClerkUser()

    expect(getAdminClientCalls[0]).toEqual(['ensure_clerk_user'])
  })

  it('returns null without writing when there is no Clerk session', async () => {
    makeClient()
    clerkHolder.user = null

    expect(await ensureClerkUser()).toBeNull()
    expect(getAdminClientCalls).toHaveLength(0)
  })

  it('resolves to the upserted users.id', async () => {
    makeClient()
    clerkHolder.user = { id: 'clerk-1', emailAddresses: [{ emailAddress: 'a@x.com' }], phoneNumbers: [], firstName: 'Jane', lastName: null }

    expect(await ensureClerkUser()).toBe('user-1')
  })
})
