import { vi, describe, it, expect, beforeEach } from 'vitest'

// Hoist the holder so the mock factory captures it before any import runs.
const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
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
  hardDeleteMember,
} from './members'

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
//   .from().select().eq().is().maybeSingle()
function makeTokenSelectClient(returnData: unknown, returnError: unknown = null) {
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                is(_col: string, _val: unknown) {
                  return { maybeSingle: async () => ({ data: returnData, error: returnError }) }
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

// Three-call mock for linkInvitedMember:
//   Call 1: from('users').upsert().select('id').single()
//   Call 2: from('members').select().ilike().eq().is().maybeSingle()
//   Call 3: from('members').update().eq()
function makeLinkClient({
  userRow,
  userError = null,
  inviteRow,
  findError = null,
  updateError = null,
}: {
  userRow: unknown
  userError?: unknown
  inviteRow: unknown
  findError?: unknown
  updateError?: unknown
}) {
  const updateCalls: unknown[] = []
  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          upsert(_payload: unknown, _opts: unknown) {
            return {
              select(_cols: string) {
                return { single: async () => ({ data: userRow, error: userError }) }
              },
            }
          },
        }
      }
      // members table
      return {
        select(_cols: string) {
          return {
            ilike(_col: string, _val: unknown) {
              return {
                eq(_col: string, _val: unknown) {
                  return {
                    is(_col: string, _val: unknown) {
                      return {
                        maybeSingle: async () => ({ data: inviteRow, error: findError }),
                      }
                    },
                  }
                },
              }
            },
          }
        },
        update(payload: unknown) {
          updateCalls.push(payload)
          return { eq: async (_col: string, _val: unknown) => ({ error: updateError }) }
        },
      }
    },
  }
  return { client, getUpdateCalls: () => updateCalls }
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
  it('no-ops when email is empty', async () => {
    // client should never be called — this guard is at the top of the function
    adminHolder.client = { from: vi.fn() }

    await expect(linkInvitedMember('clerk-1', '')).resolves.toBe(false)
    expect((adminHolder.client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('updates the members row with clerk_id, user_id, status=active when a matching invite is found', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-1' },
      inviteRow: { id: 'member-uuid-1', tenant_id: 'tenant-1' },
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-xyz', 'alice@example.com')

    const updates = getUpdateCalls()
    expect(updates).toHaveLength(1)
    const update = updates[0] as Record<string, unknown>
    expect(update.clerk_id).toBe('clerk-xyz')
    expect(update.user_id).toBe('user-uuid-1')
    expect(update.status).toBe('active')
    expect(typeof update.used_at).toBe('string')
  })

  it('no-ops on the members update when no matching invite row exists (normal sign-up)', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-2' },
      inviteRow: null,
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-abc', 'new-user@example.com')

    expect(getUpdateCalls()).toHaveLength(0)
  })

  it('returns early without updating members when the users upsert fails', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: null,
      userError: { message: 'upsert failed' },
      inviteRow: { id: 'member-uuid-3', tenant_id: 'tenant-1' },
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-zzz', 'bad@example.com')

    expect(getUpdateCalls()).toHaveLength(0)
  })

  it('returns early without updating members when the invite find fails', async () => {
    const { client, getUpdateCalls } = makeLinkClient({
      userRow: { id: 'user-uuid-4' },
      inviteRow: null,
      findError: { message: 'find failed' },
    })
    adminHolder.client = client

    await linkInvitedMember('clerk-yyy', 'error@example.com')

    expect(getUpdateCalls()).toHaveLength(0)
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
