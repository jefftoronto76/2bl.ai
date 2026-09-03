// services/auth/sync-user.test.ts
//
// D4: syncUser wrote `name` unconditionally, and
// `[firstName, lastName].filter(Boolean).join(' ')` yields '' when Clerk holds
// no name — so every admin page load overwrote a good users.name with an empty
// string. Two rows were damaged in production before this was found.

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

import { syncUser } from './sync-user'

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

function clerkUser(firstName: string | null, lastName: string | null) {
  return {
    id: 'clerk-1',
    emailAddresses: [{ emailAddress: 'Sarah@Example.com' }],
    firstName,
    lastName,
  }
}

beforeEach(() => {
  adminHolder.client = null
  clerkHolder.user = null
  getAdminClientCalls.length = 0
})

describe('syncUser — identity-write invariant (D4)', () => {
  it('omits name when Clerk has neither first nor last name', async () => {
    const payload = makeClient()
    clerkHolder.user = clerkUser(null, null)

    await syncUser()

    // Previously wrote name: '' here, clobbering an existing users.name.
    expect('name' in payload()).toBe(false)
  })

  it('omits name when Clerk name is whitespace only', async () => {
    const payload = makeClient()
    clerkHolder.user = clerkUser('  ', ' ')

    await syncUser()

    expect('name' in payload()).toBe(false)
  })

  it('writes the joined name when Clerk has one', async () => {
    const payload = makeClient()
    clerkHolder.user = clerkUser('Sarah', 'Chen')

    await syncUser()

    expect(payload().name).toBe('Sarah Chen')
  })

  it('writes a first name alone when there is no last name', async () => {
    const payload = makeClient()
    clerkHolder.user = clerkUser('Sarah', null)

    await syncUser()

    expect(payload().name).toBe('Sarah')
  })

  it('normalises email case', async () => {
    const payload = makeClient()
    clerkHolder.user = clerkUser('Sarah', 'Chen')

    await syncUser()

    expect(payload().email).toBe('sarah@example.com')
  })

  it('returns null without writing when there is no Clerk session', async () => {
    const payload = makeClient()
    clerkHolder.user = null

    expect(await syncUser()).toBeNull()
    expect(payload()).toBeUndefined()
  })

  it('calls getAdminClient with source "sync_user" (Gate 3 attribution)', async () => {
    makeClient()
    clerkHolder.user = clerkUser('Sarah', 'Chen')

    await syncUser()

    expect(getAdminClientCalls[0]).toEqual(['sync_user'])
  })
})
