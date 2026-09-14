import { vi, describe, it, expect, beforeEach } from 'vitest'

// Hoist the holder so the mock factory captures it before any import runs.
const { adminHolder, getAdminClientCalls } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
  getAdminClientCalls: [] as unknown[][],
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: (...args: unknown[]) => {
    getAdminClientCalls.push(args)
    return adminHolder.client
  },
}))

const logEventMock = vi.fn()
vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
}))

const deleteClerkUserMock = vi.fn()
vi.mock('@/services/auth', () => ({
  deleteClerkUser: (...args: unknown[]) => deleteClerkUserMock(...args),
}))

import {
  createMemberInvite,
  validateMemberToken,
  linkInvitedMember,
  acceptInvite,
  hardDeleteMember,
  HEIRLOOM_TENANT_ID,
} from './members'

beforeEach(() => {
  getAdminClientCalls.length = 0
})

// ── helpers ──────────────────────────────────────────────────────────────────

// Chainable insert mock: records the payload, resolves with supplied data/error.
function makeInsertClient(
  returnData: unknown,
  returnError: unknown = null,
) {
  let capturedPayload: unknown = null
  const client = {
    from(_table: string) {
      return {
        insert(payload: unknown) {
          capturedPayload = payload
          return {
            select(_cols: string) {
              return { single: async () => ({ data: returnData, error: returnError }) }
            },
          }
        },
      }
    },
  }
  return { client, getCaptured: () => capturedPayload }
}

// Chainable select mock for validateMemberToken:
//   .from().select().eq().is('used_at', null).is('revoked_at', null).maybeSingle()
function makeTokenSelectClient(returnData: unknown, returnError: unknown = null) {
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                is(_col: string, _val: unknown) {
                  return {
                    is(_col2: string, _val2: unknown) {
                      return { maybeSingle: async () => ({ data: returnData, error: returnError }) }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
  return { client }
}

// Mock for linkInvitedMember, covering its full new call sequence:
//   1. from('users').upsert().select('id').single()
//   2. (if token) from('members').select().eq('token').eq('status').is('used_at').maybeSingle()
//   3. (if no token, or step 2 empty) .select().ilike('email').eq('status').is('used_at').maybeSingle()
//   4. from('members').delete().eq('clerk_id').eq('tenant_id').neq('id').select('id,name')
//      — the orphan cleanup, shared with acceptInvite's own deleteOrphanRows
//   5. from('members').update(claimPayload).eq('id').is('used_at').select('id,name').maybeSingle()
//      — the atomic claim. claimQueue is consumed in order: index 0 is the
//      first attempt, index 1 (if present) is the one-shot retry after a
//      23505 on index 0.
//   6. (if step 5 succeeds and a name-fill is needed) a second, distinct
//      .update({name}).eq('id') — distinguished from the claim update by
//      payload shape ('status' in payload => claim; otherwise => name-fill).
//   Steps 4-5 can each run twice (initial + 23505 retry) — orphanQueue/
//   claimQueue are consumed one entry per call, falling back to a safe
//   default (no orphans / unused by design) once exhausted.
type QueueItem<T = unknown> = { data: T; error: unknown }

function makeLinkClient({
  userRow,
  userError = null,
  tokenRow = null,
  tokenLookupError = null,
  emailRow = null,
  emailLookupError = null,
  orphanQueue = [{ data: [], error: null }],
  claimQueue,
  nameFillError = null,
}: {
  userRow: unknown
  userError?: unknown
  tokenRow?: unknown
  tokenLookupError?: unknown
  emailRow?: unknown
  emailLookupError?: unknown
  orphanQueue?: QueueItem<unknown[] | null>[]
  claimQueue: QueueItem[]
  nameFillError?: unknown
}) {
  const updateCalls: Record<string, unknown>[] = []
  const deleteCalls: unknown[] = []
  const usersUpsertCalls: unknown[] = []
  const orphanResults = [...orphanQueue]
  const claimResults = [...claimQueue]

  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          upsert(payload: unknown, _opts: unknown) {
            usersUpsertCalls.push(payload)
            return {
              select(_cols: string) {
                return { single: async () => ({ data: userRow, error: userError }) }
              },
            }
          },
        }
      }
      // members
      return {
        select(_cols: string) {
          return {
            // token lookup: .eq('token').eq('status').is('used_at').maybeSingle()
            eq(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    is(_col3: string, _val3: unknown) {
                      return { maybeSingle: async () => ({ data: tokenRow, error: tokenLookupError }) }
                    },
                  }
                },
              }
            },
            // email fallback: .ilike('email').eq('status').is('used_at').maybeSingle()
            ilike(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    is(_col3: string, _val3: unknown) {
                      return { maybeSingle: async () => ({ data: emailRow, error: emailLookupError }) }
                    },
                  }
                },
              }
            },
          }
        },
        delete() {
          deleteCalls.push(true)
          return {
            eq(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    neq(_col3: string, _val3: unknown) {
                      return {
                        select: async (_cols: string) => orphanResults.shift() ?? { data: [], error: null },
                      }
                    },
                  }
                },
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload)
          // The claim payload always carries status:'active'; the name-fill
          // payload is name-only. Distinguishing by shape (rather than call
          // order) mirrors how the real code branches on which write this is.
          if ('status' in payload) {
            return {
              eq(_col: string, _val: unknown) {
                return {
                  is(_col2: string, _val2: unknown) {
                    return {
                      select(_cols: string) {
                        return { maybeSingle: async () => claimResults.shift() ?? { data: null, error: null } }
                      },
                    }
                  },
                }
              },
            }
          }
          return { eq: async (_col: string, _val: unknown) => ({ error: nameFillError }) }
        },
      }
    },
  }
  return {
    client,
    getUpdateCalls: () => updateCalls,
    getDeleteCalls: () => deleteCalls,
    getUsersUpsertCalls: () => usersUpsertCalls,
  }
}

// Two-call delete mock for hardDeleteMember:
//   Call 1: from('users').select('clerk_id').eq('id', userId).maybeSingle()
//   Call 2: from('users').delete().eq('id', userId)
function makeDeleteClient(
  deleteError: unknown = null,
  clerkId: string | null = null,
  lookupError: unknown = null,
) {
  let callCount = 0
  const client = {
    from(_table: string) {
      callCount++
      if (callCount === 1) {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                return {
                  maybeSingle: async () => ({
                    data: lookupError ? null : (clerkId ? { clerk_id: clerkId } : null),
                    error: lookupError ?? null,
                  }),
                }
              },
            }
          },
        }
      }
      return {
        delete() {
          return { eq: async (_col: string, _val: unknown) => ({ error: deleteError }) }
        },
      }
    },
  }
  return { client }
}

// ── createMemberInvite ───────────────────────────────────────────────────────

describe('createMemberInvite', () => {
  beforeEach(() => { logEventMock.mockReset() })

  it('inserts with status=invited, role=member, and returns token + memberId', async () => {
    const { client, getCaptured } = makeInsertClient({ id: 'member-1', token: '__tok__' })
    adminHolder.client = client

    const result = await createMemberInvite('tenant-1', 'actor-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.memberId).toBe('member-1')
    // token in the returned value should match what the DB returned
    expect(result.data.token).toBe('__tok__')

    const payload = getCaptured() as Record<string, unknown>
    expect(payload.tenant_id).toBe('tenant-1')
    expect(payload.status).toBe('invited')
    expect(payload.role).toBe('member')
    // token was generated and included in the insert
    expect(typeof payload.token).toBe('string')
    expect((payload.token as string).length).toBeGreaterThan(0)
    // invited_name not set when not supplied
    expect('invited_name' in payload).toBe(false)
  })

  it('includes invited_name when supplied and non-empty', async () => {
    const { client, getCaptured } = makeInsertClient({ id: 'member-2', token: '__tok2__' })
    adminHolder.client = client

    const result = await createMemberInvite('tenant-1', 'actor-1', '  Alice  ')

    expect(result.ok).toBe(true)
    const payload = getCaptured() as Record<string, unknown>
    expect(payload.invited_name).toBe('Alice') // trimmed
  })

  it('calls getAdminClient with source "members_admin" (Gate 3 attribution)', async () => {
    const { client } = makeInsertClient({ id: 'member-3', token: '__tok3__' })
    adminHolder.client = client

    await createMemberInvite('tenant-1', 'actor-1')

    expect(getAdminClientCalls[0]).toEqual(['members_admin'])
  })

  it('omits invited_name when value is whitespace-only', async () => {
    const { client, getCaptured } = makeInsertClient({ id: 'member-3', token: 'tok3' })
    adminHolder.client = client

    await createMemberInvite('tenant-1', 'actor-1', '   ')

    const payload = getCaptured() as Record<string, unknown>
    expect('invited_name' in payload).toBe(false)
  })

  it('stamps invited_by with the acting admin users.id', async () => {
    const { client, getCaptured } = makeInsertClient({ id: 'member-5', token: 'tok5' })
    adminHolder.client = client

    await createMemberInvite('tenant-1', 'actor-1')

    const payload = getCaptured() as Record<string, unknown>
    expect(payload.invited_by).toBe('actor-1')
  })

  it('omits invited_by when actorId is null', async () => {
    const { client, getCaptured } = makeInsertClient({ id: 'member-6', token: 'tok6' })
    adminHolder.client = client

    await createMemberInvite('tenant-1', null)

    const payload = getCaptured() as Record<string, unknown>
    expect('invited_by' in payload).toBe(false)
  })

  it('fires a MEMBER_INVITE_CREATED audit event on success', async () => {
    const { client } = makeInsertClient({ id: 'member-4', token: 'tok4' })
    adminHolder.client = client

    await createMemberInvite('tenant-1', 'actor-1', 'Bob')

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.invite_created')
    expect(arg.tenant_id).toBe('tenant-1')
    expect(arg.actor_id).toBe('actor-1')
    expect(arg.target_id).toBe('member-4')
    expect((arg.metadata as Record<string, unknown>).has_invited_name).toBe(true)
  })

  it('returns ok:false on DB error and does not throw', async () => {
    const { client } = makeInsertClient(null, { message: 'duplicate key' })
    adminHolder.client = client

    const result = await createMemberInvite('tenant-1', 'actor-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(500)
    expect(result.error).toBe('duplicate key')
  })
})

// ── validateMemberToken ──────────────────────────────────────────────────────

describe('validateMemberToken', () => {
  it('returns the member row for a valid unused token', async () => {
    const row = { id: 'member-1', tenant_id: 'tenant-1', status: 'invited', used_at: null }
    const { client } = makeTokenSelectClient(row)
    adminHolder.client = client

    const result = await validateMemberToken('valid-token')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('member-1')
  })

  it('returns phone alongside email on the row (used to pre-fill the sign-up form)', async () => {
    const row = { id: 'member-1', tenant_id: 'tenant-1', email: 'a@example.com', phone: '+15551234567' }
    const { client } = makeTokenSelectClient(row)
    adminHolder.client = client

    const result = await validateMemberToken('valid-token')

    expect(result?.email).toBe('a@example.com')
    expect(result?.phone).toBe('+15551234567')
  })

  it('returns null for an empty token string', async () => {
    const { client } = makeTokenSelectClient({ id: 'member-1' })
    adminHolder.client = client

    expect(await validateMemberToken('')).toBeNull()
  })

  it('returns null for a whitespace-only token', async () => {
    const { client } = makeTokenSelectClient({ id: 'member-1' })
    adminHolder.client = client

    expect(await validateMemberToken('   ')).toBeNull()
  })

  it('returns null when no row matches (token not found or already used)', async () => {
    const { client } = makeTokenSelectClient(null)
    adminHolder.client = client

    expect(await validateMemberToken('nonexistent-token')).toBeNull()
  })

  it('returns null on DB error', async () => {
    const { client } = makeTokenSelectClient(null, { message: 'network error' })
    adminHolder.client = client

    expect(await validateMemberToken('some-token')).toBeNull()
  })
})

// ── linkInvitedMember ────────────────────────────────────────────────────────

describe('linkInvitedMember', () => {
  beforeEach(() => { logEventMock.mockReset() })

  it('no-ops when email is empty', async () => {
    // client should never be called — this guard is at the top of the function
    adminHolder.client = { from: vi.fn() }

    await expect(linkInvitedMember('clerk-1', '')).resolves.toBe(false)
    expect((adminHolder.client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('updates the members row with clerk_id, user_id, status=active when a matching invite is found', async () => {
    // No token passed — this call goes through the email-lookup branch.
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-1' },
      emailRow: { id: 'member-uuid-1', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-1', name: null }, error: null }],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-xyz', 'alice@example.com')

    const updates = getUpdateCalls()
    expect(updates).toHaveLength(1) // just the claim — no name to fill
    const claim = updates[0]
    expect(claim.clerk_id).toBe('clerk-xyz')
    expect(claim.user_id).toBe('user-uuid-1')
    expect(claim.status).toBe('active')
    expect(typeof claim.used_at).toBe('string')
  })

  it('calls getAdminClient with source "link_invited_member" (Gate 3 attribution)', async () => {
    const { client } = makeLinkClient({
      userRow: { id: 'user-uuid-2' },
      emailRow: { id: 'member-uuid-2', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-2', name: null }, error: null }],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-xyz', 'alice@example.com')

    expect(getAdminClientCalls[0]).toEqual(['link_invited_member'])
  })

  // ── D5: the users-leg upsert must not write an empty email ───────────────
  //
  // The Clerk webhook calls this as `linkInvitedMember(clerkId, email ?? '', …)`.
  // '' is not nullish, so `email?.toLowerCase() ?? null` previously evaluated to
  // '' and wrote it over a good users.email on every phone-only signup.
  it('omits email from the users upsert when called with an empty email and a token', async () => {
    const { client, getUsersUpsertCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-d5' },
      tokenRow: { id: 'member-uuid-d5', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-d5', name: null }, error: null }],
    })
    adminHolder.client = client

    // Empty email + a token is the phone-only signup shape: the top-of-function
    // guard passes because a token is present, and the users upsert still runs.
    await linkInvitedMember('clerk-d5', '', 'tok_abc')

    const [payload] = getUsersUpsertCalls() as [Record<string, unknown>]
    expect('email' in payload).toBe(false)
    expect(payload.clerk_id).toBe('clerk-d5')
  })

  it('writes a real email lowercased on the users upsert', async () => {
    const { client, getUsersUpsertCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-d5b' },
      emailRow: { id: 'member-uuid-d5b', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-d5b', name: null }, error: null }],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-d5b', '  Alice@Example.COM ')

    const [payload] = getUsersUpsertCalls() as [Record<string, unknown>]
    expect(payload.email).toBe('alice@example.com')
  })

  it('no-ops on the members update when no matching invite row exists (normal sign-up)', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-2' },
      emailRow: null,
      claimQueue: [],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-abc', 'new-user@example.com')

    expect(getUpdateCalls()).toHaveLength(0)
  })

  it('returns early without updating members when the users upsert fails', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: null,
      userError: { message: 'upsert failed' },
      emailRow: { id: 'member-uuid-3', tenant_id: 'tenant-1' },
      claimQueue: [],
    })
    adminHolder.client = client

    const result = await linkInvitedMember('clerk-zzz', 'bad@example.com')

    expect(result).toBe(false)
    expect(getUpdateCalls()).toHaveLength(0)

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.user_resolve_failed')
    expect(arg.outcome).toBe('failure')
    expect(arg.clerk_user_id).toBe('clerk-zzz')
  })

  it('returns early without updating members when the invite find fails', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-4' },
      emailRow: null,
      emailLookupError: { message: 'find failed' },
      claimQueue: [],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-yyy', 'error@example.com')

    expect(getUpdateCalls()).toHaveLength(0)
  })

  it('returns false and logs MEMBER_LINK_UPDATE_FAILED (with pg_code) when the claim fails on both the initial attempt and the retry', async () => {
    // A 23505 now triggers one bounded retry (see the "closes the race" suite
    // below) rather than an immediate failure — this asserts the eventual-
    // failure path once both attempts are exhausted, still failing the same
    // way and logging the same audit event as before.
    const conflict = { message: 'duplicate key value violates unique constraint', code: '23505' }
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-13' },
      emailRow: { id: 'member-uuid-13', tenant_id: 'tenant-1' },
      claimQueue: [{ data: null, error: conflict }, { data: null, error: conflict }],
    })
    adminHolder.client = client

    const result = await linkInvitedMember('clerk-13', 'thirteen@example.com')

    expect(result).toBe(false)
    expect(getUpdateCalls()).toHaveLength(2) // initial claim attempt + the one retry

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.link_update_failed')
    expect(arg.outcome).toBe('failure')
    expect(arg.target_id).toBe('member-uuid-13')
    expect((arg.metadata as Record<string, unknown>).pg_code).toBe('23505')
  })

  // ── name capture (from Clerk firstName/lastName) ───────────────────────────
  //
  // The name-fill is now its own follow-up write after the claim, not part
  // of the claim's own payload — getUpdateCalls()[0] is always the claim;
  // getUpdateCalls()[1], when present, is the name-fill.

  it('sets name from Clerk when the claimed row has none', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-14' },
      emailRow: { id: 'member-uuid-14', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-14', name: null }, error: null }],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-14', 'ada@example.com', null, 'Ada Lovelace')

    const updates = getUpdateCalls()
    expect(updates).toHaveLength(2)
    expect(updates[1].name).toBe('Ada Lovelace')
  })

  it('does not set name when Clerk has none on file', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-15' },
      emailRow: { id: 'member-uuid-15', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-15', name: null }, error: null }],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-15', 'noname@example.com', null, null)

    expect(getUpdateCalls()).toHaveLength(1) // claim only, no name-fill attempted
  })

  it('does not overwrite an existing claimed-row name with the Clerk name', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-16' },
      emailRow: { id: 'member-uuid-16', tenant_id: 'tenant-1' },
      claimQueue: [{ data: { id: 'member-uuid-16', name: 'Already Set' }, error: null }],
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-16', 'already@example.com', null, 'New Clerk Name')

    expect(getUpdateCalls()).toHaveLength(1)
  })

  // ── closes the race: linkInvitedMember side ───────────────────────────────
  //
  // System Docs/Identity System.md §1.3: this function and acceptInvite both
  // fire for the same signup event with no ordering guarantee. These prove
  // the fix directly — a claim that matches zero rows is treated as success
  // (the row IS linked, just not by this call), not as a failure to retry or
  // report; and a 23505 on the first attempt is retried exactly once, and
  // succeeds when the retry's claim matches.

  it('returns true without error when the claim matches zero rows — already linked by a concurrent acceptInvite call', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-race1' },
      emailRow: { id: 'member-uuid-race1', tenant_id: 'tenant-1' },
      claimQueue: [{ data: null, error: null }], // zero rows, no error — the race outcome
    })
    adminHolder.client = client

    const result = await linkInvitedMember('clerk-race1', 'race1@example.com')

    expect(result).toBe(true)
    expect(getUpdateCalls()).toHaveLength(1) // one attempt, no retry — this wasn't an error
    expect(logEventMock).not.toHaveBeenCalled() // linkInvitedMember logs nothing on success, matching its pre-existing behavior
  })

  it('retries exactly once after a 23505 and succeeds when the retry claim matches', async () => {
    const conflict = { message: 'duplicate key value violates unique constraint', code: '23505' }
    const { client, getUpdateCalls, getDeleteCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-race2' },
      emailRow: { id: 'member-uuid-race2', tenant_id: 'tenant-1' },
      orphanQueue: [{ data: [], error: null }, { data: [], error: null }],
      claimQueue: [
        { data: null, error: conflict },
        { data: { id: 'member-uuid-race2', name: null }, error: null },
      ],
    })
    adminHolder.client = client

    const result = await linkInvitedMember('clerk-race2', 'race2@example.com')

    expect(result).toBe(true)
    expect(getUpdateCalls()).toHaveLength(2) // failed attempt + successful retry
    expect(getDeleteCalls()).toHaveLength(2) // initial orphan cleanup + retry cleanup
  })
})

// ── acceptInvite ─────────────────────────────────────────────────────────────

// Mock for acceptInvite, covering its full new call sequence:
//   1. from('members').select().eq('token').is('used_at').is('revoked_at').maybeSingle()
//      — the pre-check. Gates step 2 and gives a fast 404/403; not the claim.
//   2. (skipOrphanCleanup) .select().eq('clerk_id').eq('tenant_id').neq('id').maybeSingle()
//      OR (default) .delete().eq('clerk_id').eq('tenant_id').neq('id').select('id,name')
//   3. from('members').update(claimPayload).eq('token').eq('tenant_id').is('used_at')
//      .is('revoked_at').select('id,name').maybeSingle() — the atomic claim.
//      claimQueue is consumed in order: index 0 is the first attempt, index 1
//      (if present) is the one-shot retry after a 23505 on index 0.
//   4. (if the claim succeeds and a name-fill is needed) a second, distinct
//      .update({name}).eq('id') — distinguished from the claim by payload
//      shape ('status' in payload => claim; otherwise => name-fill).
function makeAcceptInviteClient({
  preRow,
  preError = null,
  orphanQueue = [{ data: [], error: null }],
  claimQueue,
  conflictingRow = null,
  conflictError = null,
  nameFillError = null,
}: {
  preRow: unknown
  preError?: unknown
  orphanQueue?: QueueItem<unknown[] | null>[]
  claimQueue: QueueItem[]
  conflictingRow?: unknown
  conflictError?: unknown
  nameFillError?: unknown
}) {
  const updateCalls: Record<string, unknown>[] = []
  const deleteCalls: unknown[] = []
  const orphanResults = [...orphanQueue]
  const claimResults = [...claimQueue]

  // Step 1 (the pre-check) and the skipOrphanCleanup conflict check are both
  // a `select(...).eq(...)` chain on `members`, but end differently
  // (`.is().is().maybeSingle()` vs `.eq().neq().maybeSingle()`). Exposing
  // both continuations on the same returned object handles either without
  // needing to track call order.
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                is(_col2: string, _val2: unknown) {
                  return {
                    is(_col3: string, _val3: unknown) {
                      return { maybeSingle: async () => ({ data: preRow, error: preError }) }
                    },
                  }
                },
                eq(_col2: string, _val2: unknown) {
                  return {
                    neq(_col3: string, _val3: unknown) {
                      return {
                        maybeSingle: async () => ({ data: conflictingRow, error: conflictError }),
                      }
                    },
                  }
                },
              }
            },
          }
        },
        delete() {
          deleteCalls.push(true)
          return {
            eq(_col: string, _val: unknown) {
              return {
                eq(_col2: string, _val2: unknown) {
                  return {
                    neq(_col3: string, _val3: unknown) {
                      return {
                        select: async (_cols: string) => orphanResults.shift() ?? { data: [], error: null },
                      }
                    },
                  }
                },
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload)
          // The claim payload always carries status:'active'; the name-fill
          // payload is name-only. Distinguishing by shape (rather than call
          // order) mirrors how the real code branches on which write this is.
          if ('status' in payload) {
            // .eq('token').eq('tenant_id').is('used_at').is('revoked_at').select().maybeSingle()
            return {
              eq(_col: string, _val: unknown) {
                return {
                  eq(_col2: string, _val2: unknown) {
                    return {
                      is(_col3: string, _val3: unknown) {
                        return {
                          is(_col4: string, _val4: unknown) {
                            return {
                              select(_cols: string) {
                                return { maybeSingle: async () => claimResults.shift() ?? { data: null, error: null } }
                              },
                            }
                          },
                        }
                      },
                    }
                  },
                }
              },
            }
          }
          return { eq: async (_col: string, _val: unknown) => ({ error: nameFillError }) }
        },
      }
    },
  }
  return { client, getUpdateCalls: () => updateCalls, getDeleteCalls: () => deleteCalls }
}

describe('acceptInvite', () => {
  beforeEach(() => { logEventMock.mockReset() })

  it('returns 404 when no matching unused, unrevoked invite token exists', async () => {
    const { client } = makeAcceptInviteClient({ preRow: null, claimQueue: [] })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-1', 'user-1')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
  })

  it('stamps the invited row with clerk_id, user_id, status=active on success', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-1', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: { id: 'member-1', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-1', 'user-1')

    expect(result.ok).toBe(true)
    const [claim] = getUpdateCalls()
    expect(claim.clerk_id).toBe('clerk-1')
    expect(claim.user_id).toBe('user-1')
    expect(claim.status).toBe('active')
  })

  it('calls getAdminClient with source "accept_invite" (Gate 3 attribution)', async () => {
    const { client } = makeAcceptInviteClient({
      preRow: { id: 'member-2', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: { id: 'member-2', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-1', 'user-1')

    expect(getAdminClientCalls[0]).toEqual(['accept_invite'])
  })

  it('logs only MEMBER_INVITE_ACCEPTED (no orphan event) when no orphan row existed', async () => {
    const { client } = makeAcceptInviteClient({
      preRow: { id: 'member-2', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [], error: null }],
      claimQueue: [{ data: { id: 'member-2', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-2', 'user-2')

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.invite_accepted')
  })

  it('logs MEMBER_ORPHAN_RECONCILED with the deleted count when a syncMember-created orphan row is deleted, then MEMBER_INVITE_ACCEPTED', async () => {
    const { client } = makeAcceptInviteClient({
      preRow: { id: 'member-3', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-1', name: null }], error: null }],
      claimQueue: [{ data: { id: 'member-3', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-3', 'user-3')

    expect(logEventMock).toHaveBeenCalledTimes(2)
    const [orphanArg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(orphanArg.action).toBe('member.orphan_reconciled')
    expect((orphanArg.metadata as Record<string, unknown>).deleted_count).toBe(1)
    const [acceptedArg] = logEventMock.mock.calls[1] as [Record<string, unknown>]
    expect(acceptedArg.action).toBe('member.invite_accepted')
  })

  it('logs MEMBER_ORPHAN_CLEANUP_FAILED but still stamps the invited row and logs MEMBER_INVITE_ACCEPTED when the orphan delete fails', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-4', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: null, error: { message: 'delete failed' } }],
      claimQueue: [{ data: { id: 'member-4', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-4', 'user-4')

    expect(result.ok).toBe(true)
    expect(getUpdateCalls()).toHaveLength(1) // the delete failing is non-fatal; one claim attempt, no retry (no 23505)

    expect(logEventMock).toHaveBeenCalledTimes(2)
    const [failedArg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(failedArg.action).toBe('member.orphan_cleanup_failed')
    expect(failedArg.outcome).toBe('failure')
    const [acceptedArg] = logEventMock.mock.calls[1] as [Record<string, unknown>]
    expect(acceptedArg.action).toBe('member.invite_accepted')
  })

  it('returns ok:false when the claim fails with a non-23505 error (no retry)', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-5', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: null, error: { message: 'update failed' } }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-5', 'user-5')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(500)
    expect(getUpdateCalls()).toHaveLength(1) // no retry — only 23505 triggers one
  })

  // ── orphan name rescue (race with /api/members/sync) ──────────────────────
  //
  // The name-fill is now its own follow-up write after the claim, not part
  // of the claim's own payload — getUpdateCalls()[0] is always the claim;
  // getUpdateCalls()[1], when present, is the name-fill.

  it('rescues the deleted orphan\'s name onto the claimed row when it has none', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-6', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-6', name: 'Real Name' }], error: null }],
      claimQueue: [{ data: { id: 'member-6', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-6', 'user-6')

    expect(result.ok).toBe(true)
    const updates = getUpdateCalls()
    expect(updates).toHaveLength(2)
    expect(updates[1].name).toBe('Real Name')
  })

  it('does not overwrite an existing claimed-row name with the orphan\'s name', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-7', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-7', name: 'Orphan Name' }], error: null }],
      claimQueue: [{ data: { id: 'member-7', name: 'Already Set' }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-7', 'user-7')

    expect(getUpdateCalls()).toHaveLength(1)
  })

  it('does not set a name when the orphan row has no name', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-8', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-8', name: null }], error: null }],
      claimQueue: [{ data: { id: 'member-8', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-8', 'user-8')

    expect(getUpdateCalls()).toHaveLength(1)
  })

  it('does not set a name when more than one orphan row is deleted', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-9', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{
        data: [
          { id: 'orphan-9a', name: 'Name A' },
          { id: 'orphan-9b', name: 'Name B' },
        ],
        error: null,
      }],
      claimQueue: [{ data: { id: 'member-9', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-9', 'user-9')

    expect(getUpdateCalls()).toHaveLength(1)
  })

  // ── name parameter (closes the Path 2 race — no orphan to rescue from) ────

  it('falls back to the passed-in name when there is no orphan to rescue from', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-10', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: { id: 'member-10', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-10', 'user-10', 'Clerk Name')

    expect(result.ok).toBe(true)
    const updates = getUpdateCalls()
    expect(updates[1].name).toBe('Clerk Name')
  })

  it('prefers the rescued orphan name over the passed-in name when both are available', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-11', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-11', name: 'Rescued Name' }], error: null }],
      claimQueue: [{ data: { id: 'member-11', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-11', 'user-11', 'Clerk Name')

    const updates = getUpdateCalls()
    expect(updates[1].name).toBe('Rescued Name')
  })

  // PR #448 review: `rescuedName ?? name` treats a whitespace-only
  // rescuedName as present, blocking a real Clerk name fallback.
  it('falls through to the passed-in name when the rescued orphan name is whitespace-only', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-11b', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-11b', name: '   ' }], error: null }],
      claimQueue: [{ data: { id: 'member-11b', name: null }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-11b', 'user-11b', 'Clerk Name')

    const updates = getUpdateCalls()
    expect(updates[1].name).toBe('Clerk Name')
  })

  // PR #448 review: `!row.name` doesn't treat a whitespace-only stored name
  // as absent, so the fallback is wrongly skipped and no real name is set.
  it('treats a whitespace-only claimed-row name as absent, still applying the fallback', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-11c', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: { id: 'member-11c', name: '   ' }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-11c', 'user-11c', 'Clerk Name')

    const updates = getUpdateCalls()
    expect(updates[1].name).toBe('Clerk Name')
  })

  it('does not overwrite an existing claimed-row name with the passed-in name', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-12', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: { id: 'member-12', name: 'Already Set' }, error: null }],
    })
    adminHolder.client = client

    await acceptInvite('tok', 'clerk-12', 'user-12', 'Clerk Name')

    expect(getUpdateCalls()).toHaveLength(1)
  })

  it.each([undefined, null, '', '   '])(
    'omits name when no orphan and the passed-in name is %p',
    async (name) => {
      const { client, getUpdateCalls } = makeAcceptInviteClient({
        preRow: { id: 'member-13', tenant_id: HEIRLOOM_TENANT_ID },
        claimQueue: [{ data: { id: 'member-13', name: null }, error: null }],
      })
      adminHolder.client = client

      await acceptInvite('tok', 'clerk-13', 'user-13', name as string | null | undefined)

      expect(getUpdateCalls()).toHaveLength(1)
    },
  )

  // ── skipOrphanCleanup (already-signed-in visitor — PR #448 review) ────────
  //
  // Without this guard, an already-signed-in member's real membership row
  // (same clerk_id, different id) would be deleted by the orphan cleanup
  // meant for a same-request signup-race artifact. These assert the delete
  // never runs on this path, and that a real conflicting row is reported
  // rather than destroyed.

  it('never calls delete when skipOrphanCleanup is set', async () => {
    const { client, getDeleteCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-14', tenant_id: HEIRLOOM_TENANT_ID },
      conflictingRow: null,
      claimQueue: [{ data: { id: 'member-14', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-14', 'user-14', null, { skipOrphanCleanup: true })

    expect(result.ok).toBe(true)
    expect(getDeleteCalls()).toHaveLength(0)
  })

  it('stamps the invited row normally when skipOrphanCleanup is set and no conflicting row exists', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-15', tenant_id: HEIRLOOM_TENANT_ID },
      conflictingRow: null,
      claimQueue: [{ data: { id: 'member-15', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-15', 'user-15', null, { skipOrphanCleanup: true })

    expect(result.ok).toBe(true)
    const [claim] = getUpdateCalls()
    expect(claim.clerk_id).toBe('clerk-15')
    expect(claim.status).toBe('active')
  })

  it('returns 409 without deleting or stamping when the visitor already has a membership for this tenant', async () => {
    const { client, getUpdateCalls, getDeleteCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-16', tenant_id: HEIRLOOM_TENANT_ID },
      conflictingRow: { id: 'existing-member-16' },
      claimQueue: [],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-16', 'user-16', null, { skipOrphanCleanup: true })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(getDeleteCalls()).toHaveLength(0)
    expect(getUpdateCalls()).toHaveLength(0)
  })

  it('the false→true signup path (skipOrphanCleanup unset) still deletes the orphan as before', async () => {
    const { client, getDeleteCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-17', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [{ id: 'orphan-17', name: 'Real Name' }], error: null }],
      claimQueue: [{ data: { id: 'member-17', name: null }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-17', 'user-17')

    expect(result.ok).toBe(true)
    expect(getDeleteCalls()).toHaveLength(1)
  })

  // ── cross-tenant guard, now folded into the pre-check (was a separate
  //    step 2 before the rewrite; behavior unchanged) ─────────────────────

  it('returns 403 when the pre-check finds a row belonging to a different tenant', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-18', tenant_id: 'some-other-tenant' },
      claimQueue: [],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-18', 'user-18')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(getUpdateCalls()).toHaveLength(0)
  })

  // ── closes the race: acceptInvite side ────────────────────────────────────
  //
  // System Docs/Identity System.md §1.3: this function and linkInvitedMember
  // both fire for the same signup event with no ordering guarantee. These
  // prove the fix directly — a claim that matches zero rows is treated as
  // success (the row IS linked, just not by this call — tagged
  // claimed_by_concurrent_call in the audit metadata), not as a 404/500 to
  // retry or report; and a 23505 on the first attempt is retried exactly
  // once, and succeeds when the retry's claim matches.

  it('returns ok:true with claimed_by_concurrent_call when the claim matches zero rows — already claimed by the racing webhook', async () => {
    const { client, getUpdateCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-race1', tenant_id: HEIRLOOM_TENANT_ID },
      claimQueue: [{ data: null, error: null }], // zero rows, no error — the race outcome
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-race1', 'user-race1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.memberId).toBe('member-race1')
    expect(getUpdateCalls()).toHaveLength(1) // one attempt, no retry — this wasn't an error

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.invite_accepted')
    expect((arg.metadata as Record<string, unknown>).claimed_by_concurrent_call).toBe(true)
  })

  it('retries exactly once after a 23505 and succeeds when the retry claim matches', async () => {
    const conflict = { message: 'duplicate key value violates unique constraint', code: '23505' }
    const { client, getUpdateCalls, getDeleteCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-race2', tenant_id: HEIRLOOM_TENANT_ID },
      orphanQueue: [{ data: [], error: null }, { data: [], error: null }],
      claimQueue: [
        { data: null, error: conflict },
        { data: { id: 'member-race2', name: null }, error: null },
      ],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-race2', 'user-race2')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.memberId).toBe('member-race2')
    expect(getUpdateCalls()).toHaveLength(2) // failed claim attempt + successful retry
    expect(getDeleteCalls()).toHaveLength(2) // initial orphan cleanup + retry cleanup
  })

  it('does not retry the orphan cleanup or claim when skipOrphanCleanup is set and the claim hits 23505', async () => {
    // skipOrphanCleanup's whole premise is "don't delete — this might be a
    // real membership." A 23505 retry that deletes anyway would silently
    // reintroduce exactly the destructive-delete risk that option exists to
    // prevent, so the retry's cleanup step is skipped here too.
    const conflict = { message: 'duplicate key value violates unique constraint', code: '23505' }
    const { client, getDeleteCalls } = makeAcceptInviteClient({
      preRow: { id: 'member-race3', tenant_id: HEIRLOOM_TENANT_ID },
      conflictingRow: null,
      claimQueue: [
        { data: null, error: conflict },
        { data: { id: 'member-race3', name: null }, error: null },
      ],
    })
    adminHolder.client = client

    const result = await acceptInvite('tok', 'clerk-race3', 'user-race3', null, { skipOrphanCleanup: true })

    expect(result.ok).toBe(true)
    expect(getDeleteCalls()).toHaveLength(0)
  })
})

// ── hardDeleteMember ─────────────────────────────────────────────────────────

describe('hardDeleteMember', () => {
  beforeEach(() => {
    logEventMock.mockReset()
    deleteClerkUserMock.mockReset()
  })

  it('fires a MEMBER_HARD_DELETED audit event and returns ok:true on success', async () => {
    adminHolder.client = makeDeleteClient().client

    const result = await hardDeleteMember('user-del-1', 'actor-1', 'tenant-1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.id).toBe('user-del-1')

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('user.hard_deleted')
    expect(arg.target_id).toBe('user-del-1')
    expect(arg.tenant_id).toBe('tenant-1')
    expect(arg.actor_id).toBe('actor-1')
    expect((arg.metadata as Record<string, unknown>).reason_type).toBe('admin_hard_delete')
  })

  it('includes reason in audit metadata when provided', async () => {
    adminHolder.client = makeDeleteClient().client

    await hardDeleteMember('user-del-r', 'actor-1', 'tenant-1', 'Violated community guidelines')

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    const meta = arg.metadata as Record<string, unknown>
    expect(meta.reason_type).toBe('admin_hard_delete')
    expect(meta.reason).toBe('Violated community guidelines')
  })

  it('omits reason key from audit metadata when reason is not provided', async () => {
    adminHolder.client = makeDeleteClient().client

    await hardDeleteMember('user-del-nr', 'actor-1', 'tenant-1')

    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    const meta = arg.metadata as Record<string, unknown>
    expect('reason' in meta).toBe(false)
    expect(meta.reason_type).toBe('admin_hard_delete')
  })

  it('calls deleteClerkUser with the clerk_id when one is found', async () => {
    adminHolder.client = makeDeleteClient(null, 'clerk-abc').client
    deleteClerkUserMock.mockResolvedValue(undefined)

    await hardDeleteMember('user-del-c', 'actor-1', 'tenant-1', 'reason')

    expect(deleteClerkUserMock).toHaveBeenCalledOnce()
    expect(deleteClerkUserMock).toHaveBeenCalledWith('clerk-abc')
  })

  it('does not call deleteClerkUser when no clerk_id is found', async () => {
    adminHolder.client = makeDeleteClient(null, null).client

    await hardDeleteMember('user-del-nc', 'actor-1', 'tenant-1')

    expect(deleteClerkUserMock).not.toHaveBeenCalled()
  })

  it('still deletes the Supabase row when Clerk deletion throws', async () => {
    adminHolder.client = makeDeleteClient(null, 'clerk-xyz').client
    deleteClerkUserMock.mockRejectedValue(new Error('Clerk API error'))

    const result = await hardDeleteMember('user-del-cf', 'actor-1', 'tenant-1')

    expect(result.ok).toBe(true)
    expect(deleteClerkUserMock).toHaveBeenCalledOnce()
  })

  it('returns ok:false on DB delete error', async () => {
    adminHolder.client = makeDeleteClient({ message: 'foreign key violation' }).client

    const result = await hardDeleteMember('user-del-2', null, null)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(500)
    expect(result.error).toBe('foreign key violation')
  })

  it('fires audit before the delete even when the delete fails', async () => {
    adminHolder.client = makeDeleteClient({ message: 'something went wrong' }).client

    await hardDeleteMember('user-del-3', 'actor-2', 'tenant-2')

    expect(logEventMock).toHaveBeenCalledOnce()
  })
})
