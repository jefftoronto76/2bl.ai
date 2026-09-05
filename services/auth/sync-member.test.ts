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

const logEventMock = vi.fn()
vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
  AuditAction: {
    MEMBER_USER_RESOLVE_FAILED: 'member.user_resolve_failed',
  },
}))

import { syncMember } from './sync-member'

// Three-call mock:
//   Call 1: from('users').upsert().select('id').single()
//   Call 2: from('members').select('id').eq().eq().maybeSingle() — the
//     pre-existence check that decides whether memberSource may be written
//   Call 3: from('members').upsert().select().single()
function makeSyncClient({
  userRow,
  userError = null,
  memberRow,
  memberError = null,
  // Defaults to "no existing row" (a genuine first creation) — matches
  // every pre-existing test's expectations, which predate the pre-check.
  existingMemberRow = null,
}: {
  userRow: unknown
  userError?: unknown
  memberRow?: unknown
  memberError?: unknown
  existingMemberRow?: unknown
}) {
  const usersUpsertCalls: unknown[] = []
  const membersUpsertCalls: unknown[] = []
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
      return {
        select(_cols: string) {
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: existingMemberRow, error: null }),
              }),
            }),
          }
        },
        upsert(payload: unknown, _opts: unknown) {
          membersUpsertCalls.push(payload)
          return {
            select() {
              return { single: async () => ({ data: memberRow, error: memberError }) }
            },
          }
        },
      }
    },
  }
  return {
    client,
    getUsersUpsertCalls: () => usersUpsertCalls,
    getMembersUpsertCalls: () => membersUpsertCalls,
  }
}

describe('syncMember', () => {
  beforeEach(() => {
    logEventMock.mockReset()
    getAdminClientCalls.length = 0
  })

  it('defaults getAdminClient source to "sync_member" when the caller does not specify one (Gate 3 attribution)', async () => {
    const { client } = makeSyncClient({
      userRow: { id: 'user-uuid-src1' },
      memberRow: { id: 'member-uuid-src1' },
    })
    adminHolder.client = client

    await syncMember({ clerkUserId: 'clerk-src1' })

    expect(getAdminClientCalls[0]).toEqual(['sync_member', { correlationId: undefined }])
  })

  it('passes through an explicit source and correlationId from the caller', async () => {
    const { client } = makeSyncClient({
      userRow: { id: 'user-uuid-src2' },
      memberRow: { id: 'member-uuid-src2' },
    })
    adminHolder.client = client

    await syncMember({ clerkUserId: 'clerk-src2', source: 'clerk_webhook', correlationId: 'corr-abc' })

    expect(getAdminClientCalls[0]).toEqual(['clerk_webhook', { correlationId: 'corr-abc' }])
  })

  it('includes the resolved users.id as user_id in the members upsert payload', async () => {
    const { client, getMembersUpsertCalls } = makeSyncClient({
      userRow: { id: 'user-uuid-9' },
      memberRow: { id: 'member-uuid-9' },
    })
    adminHolder.client = client

    const result = await syncMember({ clerkUserId: 'clerk-9', email: 'nine@example.com' })

    expect(result.ok).toBe(true)
    const [payload] = getMembersUpsertCalls() as [Record<string, unknown>]
    expect(payload.user_id).toBe('user-uuid-9')
    expect(payload.clerk_id).toBe('clerk-9')
    expect(payload.status).toBe('active')
  })

  it('resolves/creates the users row before writing members, even with no name/email/phone supplied', async () => {
    const { client, getUsersUpsertCalls, getMembersUpsertCalls } = makeSyncClient({
      userRow: { id: 'user-uuid-10' },
      memberRow: { id: 'member-uuid-10' },
    })
    adminHolder.client = client

    await syncMember({ clerkUserId: 'clerk-10' })

    expect(getUsersUpsertCalls()).toHaveLength(1)
    const [usersPayload] = getUsersUpsertCalls() as [Record<string, unknown>]
    expect(usersPayload.clerk_id).toBe('clerk-10')
    expect('email' in usersPayload).toBe(false)

    const [membersPayload] = getMembersUpsertCalls() as [Record<string, unknown>]
    expect(membersPayload.user_id).toBe('user-uuid-10')
  })

  it('returns ok:false and logs MEMBER_USER_RESOLVE_FAILED without writing members when the users upsert fails', async () => {
    const { client, getMembersUpsertCalls } = makeSyncClient({
      userRow: null,
      userError: { message: 'users upsert failed' },
    })
    adminHolder.client = client

    const result = await syncMember({ clerkUserId: 'clerk-11', email: 'eleven@example.com' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('users upsert failed')
    expect(getMembersUpsertCalls()).toHaveLength(0)

    expect(logEventMock).toHaveBeenCalledOnce()
    const [arg] = logEventMock.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe('member.user_resolve_failed')
    expect(arg.outcome).toBe('failure')
    expect(arg.clerk_user_id).toBe('clerk-11')
  })

  it('returns ok:false on members upsert failure', async () => {
    const { client } = makeSyncClient({
      userRow: { id: 'user-uuid-12' },
      memberRow: null,
      memberError: { message: 'members upsert failed' },
    })
    adminHolder.client = client

    const result = await syncMember({ clerkUserId: 'clerk-12' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('members upsert failed')
  })

  // ── D1: a no-value name must never reach a column ────────────────────────
  //
  // The upsert conflicts on clerk_id, so a `name` key present with a null
  // value overwrites an existing members.name. Absence is what leaves it
  // alone. These assert on key presence for that reason, not on the value.
  describe('identity-write invariant (D1)', () => {
    async function upsertPayloadsFor(input: Parameters<typeof syncMember>[0]) {
      const { client, getUsersUpsertCalls, getMembersUpsertCalls } = makeSyncClient({
        userRow: { id: 'user-uuid-d1' },
        memberRow: { id: 'member-uuid-d1' },
      })
      adminHolder.client = client
      await syncMember(input)
      return {
        users: getUsersUpsertCalls()[0] as Record<string, unknown>,
        members: getMembersUpsertCalls()[0] as Record<string, unknown>,
      }
    }

    // Fails before the fix: `if (name !== undefined)` let null through and
    // members.name was written as NULL. This is the defect, in one case.
    it('omits name from both payloads when name is explicitly null', async () => {
      const { users, members } = await upsertPayloadsFor({ clerkUserId: 'c', name: null })
      expect('name' in members).toBe(false)
      expect('name' in users).toBe(false)
    })

    it('omits name from both payloads when name is an empty string', async () => {
      const { users, members } = await upsertPayloadsFor({ clerkUserId: 'c', name: '' })
      expect('name' in members).toBe(false)
      expect('name' in users).toBe(false)
    })

    it('omits name from both payloads when name is whitespace only', async () => {
      const { users, members } = await upsertPayloadsFor({ clerkUserId: 'c', name: '   ' })
      expect('name' in members).toBe(false)
      expect('name' in users).toBe(false)
    })

    it('omits name from both payloads when name is undefined', async () => {
      const { users, members } = await upsertPayloadsFor({ clerkUserId: 'c' })
      expect('name' in members).toBe(false)
      expect('name' in users).toBe(false)
    })

    it('writes a real name, trimmed, to both payloads', async () => {
      const { users, members } = await upsertPayloadsFor({ clerkUserId: 'c', name: '  Sarah Chen  ' })
      expect(members.name).toBe('Sarah Chen')
      expect(users.name).toBe('Sarah Chen')
    })

    it('applies the same rule to email and phone', async () => {
      const { users, members } = await upsertPayloadsFor({
        clerkUserId: 'c',
        email: null,
        phone: '',
      })
      expect('email' in members).toBe(false)
      expect('phone' in members).toBe(false)
      expect('email' in users).toBe(false)
      expect('phone' in users).toBe(false)
    })

    it('normalises email case on both payloads', async () => {
      const { users, members } = await upsertPayloadsFor({
        clerkUserId: 'c',
        email: ' Sarah@Example.COM ',
      })
      expect(members.email).toBe('sarah@example.com')
      expect(users.email).toBe('sarah@example.com')
    })

    // Belt-and-braces: whatever the input, no identity column may ever carry a
    // null into an upsert payload. Guards against a future field being added
    // without routing through setIdentityField.
    it('never puts a null identity value on either payload, for any input', async () => {
      for (const v of [null, '', '   ', undefined]) {
        const { users, members } = await upsertPayloadsFor({
          clerkUserId: 'c',
          name: v as string | null | undefined,
          email: v as string | null | undefined,
          phone: v as string | null | undefined,
        })
        for (const key of ['name', 'email', 'phone']) {
          expect(members[key]).toBeUndefined()
          expect(users[key]).toBeUndefined()
        }
      }
    })
  })

  // ── members.source (distinct from Gate 3's `source`/IdentitySource) ──────
  describe('memberSource — members.source, written once at genuine creation only', () => {
    it('writes memberSource into the members upsert payload for a brand-new clerk_id', async () => {
      const { client, getMembersUpsertCalls } = makeSyncClient({
        userRow: { id: 'user-uuid-ms1' },
        memberRow: { id: 'member-uuid-ms1' },
        existingMemberRow: null,
      })
      adminHolder.client = client

      await syncMember({ clerkUserId: 'clerk-ms1', memberSource: 'self_serve_chat' })

      const [payload] = getMembersUpsertCalls() as [Record<string, unknown>]
      expect(payload.source).toBe('self_serve_chat')
    })

    it('never writes source when a members row already exists for this clerk_id — the overwrite-on-re-login regression guard', async () => {
      const { client, getMembersUpsertCalls } = makeSyncClient({
        userRow: { id: 'user-uuid-ms2' },
        memberRow: { id: 'member-uuid-ms2' },
        existingMemberRow: { id: 'member-uuid-ms2' },
      })
      adminHolder.client = client

      await syncMember({ clerkUserId: 'clerk-ms2', memberSource: 'self_serve_clerk' })

      const [payload] = getMembersUpsertCalls() as [Record<string, unknown>]
      expect('source' in payload).toBe(false)
    })

    it('omits source from the payload when the caller supplies no memberSource, even for a brand-new row', async () => {
      const { client, getMembersUpsertCalls } = makeSyncClient({
        userRow: { id: 'user-uuid-ms3' },
        memberRow: { id: 'member-uuid-ms3' },
        existingMemberRow: null,
      })
      adminHolder.client = client

      await syncMember({ clerkUserId: 'clerk-ms3' })

      const [payload] = getMembersUpsertCalls() as [Record<string, unknown>]
      expect('source' in payload).toBe(false)
    })
  })
})
