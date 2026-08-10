// Coverage for services/crm/story-invites.ts — the durable, multi-person
// per-story invite link (reusable-story-invite-links, 2026-08-10). Mocks
// @/services/auth/supabase-admin directly (same pattern as services/
// members/members.test.ts), since every function here bottoms out at
// getAdminClient().
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

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

import {
  createOrGetActiveStoryInviteLink,
  resetStoryInviteLink,
  revokeStoryInviteLink,
  validateStoryInviteToken,
  acceptStoryInvite,
} from './story-invites'

type Result = { data: unknown; error: unknown }

/** A generic chainable mock — eq/is/in/or/order/select all return the chain
 *  itself, so any call sequence resolves; both a terminal .maybeSingle()/
 *  .single() and a direct `await` on the chain (via .then) work. */
function makeChain(result: Result) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    or: () => chain,
    order: () => chain,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

/**
 * Per-table result queues, consumed in call order (repeating the last entry
 * once exhausted) — lets a single test configure e.g. story_invite_links'
 * first call (an existence check) and second call (an insert) separately.
 */
function makeClient(queues: Partial<Record<string, Result[]>>) {
  const cursors: Record<string, number> = {}
  const calls: Record<string, Array<{ op: string; payload?: unknown; opts?: unknown }>> = {}

  function next(table: string): Result {
    const queue = queues[table] ?? []
    const idx = Math.min(cursors[table] ?? 0, Math.max(queue.length - 1, 0))
    cursors[table] = (cursors[table] ?? 0) + 1
    return queue[idx] ?? { data: null, error: null }
  }

  const client = {
    from(table: string) {
      calls[table] = calls[table] ?? []
      return {
        select: (...args: unknown[]) => {
          calls[table].push({ op: 'select', payload: args })
          return makeChain(next(table))
        },
        insert: (payload: unknown) => {
          calls[table].push({ op: 'insert', payload })
          const result = next(table)
          return { select: () => ({ single: async () => result }) }
        },
        update: (payload: unknown) => {
          calls[table].push({ op: 'update', payload })
          return makeChain(next(table))
        },
        upsert: (payload: unknown, opts: unknown) => {
          calls[table].push({ op: 'upsert', payload, opts })
          return Promise.resolve(next(table))
        },
      }
    },
  }
  return { client, calls }
}

const LINK_COLUMNS_ROW = {
  id: 'link-1',
  tenant_id: 'tenant-1',
  story_id: 'story-1',
  token: 'tok-abc',
  created_by: 'member-owner',
  primer: 'Say hi warmly.',
  expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  revoked_at: null,
  created_at: 'now',
  updated_at: 'now',
}

beforeEach(() => {
  logEventMock.mockClear()
})

describe('createOrGetActiveStoryInviteLink', () => {
  it('returns the existing active link without inserting a new row', async () => {
    const { client, calls } = makeClient({
      story_invite_links: [{ data: LINK_COLUMNS_ROW, error: null }],
    })
    adminHolder.client = client

    const result = await createOrGetActiveStoryInviteLink('tenant-1', 'story-1', 'member-owner', 'user-1', '')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.token).toBe('tok-abc')
    expect(calls.story_invite_links.filter(c => c.op === 'insert')).toHaveLength(0)
  })

  it('inserts a fresh link, defaulting expires_at to 7 days out, when none is active', async () => {
    const { client, calls } = makeClient({
      story_invite_links: [
        { data: null, error: null }, // existence check — none active
        { data: { ...LINK_COLUMNS_ROW, id: 'link-2', token: 'tok-new' }, error: null }, // insert result
      ],
    })
    adminHolder.client = client

    const before = Date.now()
    const result = await createOrGetActiveStoryInviteLink('tenant-1', 'story-1', 'member-owner', 'user-1', 'Hi there')

    expect(result.ok).toBe(true)
    const insertCall = calls.story_invite_links.find(c => c.op === 'insert')
    expect(insertCall).toBeDefined()
    const payload = insertCall!.payload as Record<string, unknown>
    expect(payload.primer).toBe('Hi there')
    const expiresAt = new Date(payload.expires_at as string).getTime()
    const expectedMs = 7 * 24 * 60 * 60 * 1000
    expect(expiresAt).toBeGreaterThanOrEqual(before + expectedMs - 5000)
    expect(expiresAt).toBeLessThanOrEqual(before + expectedMs + 5000)
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_INVITE_LINK_CREATED }),
    )
  })

  it('gracefully absorbs a 23505 race by fetching and returning the link that won', async () => {
    const { client } = makeClient({
      story_invite_links: [
        { data: null, error: null }, // existence check — none active (racing with another request)
        { data: null, error: { message: 'duplicate key', code: '23505' } }, // insert loses the race
        { data: LINK_COLUMNS_ROW, error: null }, // re-fetch — the winner's row
      ],
    })
    adminHolder.client = client

    const result = await createOrGetActiveStoryInviteLink('tenant-1', 'story-1', 'member-owner', 'user-1', '')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.id).toBe('link-1')
  })
})

describe('resetStoryInviteLink', () => {
  it('revokes the current link and inserts a fresh one with a different token', async () => {
    const { client, calls } = makeClient({
      story_invite_links: [
        { data: [{ id: 'link-1' }], error: null }, // revoke's .select('id') — one row revoked
        { data: { ...LINK_COLUMNS_ROW, id: 'link-2', token: 'tok-rotated' }, error: null }, // insert result
      ],
    })
    adminHolder.client = client

    const result = await resetStoryInviteLink('tenant-1', 'story-1', 'member-owner', 'user-1', 'New greeting')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.token).toBe('tok-rotated')
    const updateCall = calls.story_invite_links.find(c => c.op === 'update')
    expect(updateCall).toBeDefined()
    expect(updateCall!.payload).toHaveProperty('revoked_at')
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_INVITE_LINK_REVOKED }),
    )
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_INVITE_LINK_CREATED }),
    )
  })
})

describe('revokeStoryInviteLink', () => {
  it('is idempotent — no rows revoked is not an error and logs nothing', async () => {
    const { client } = makeClient({
      story_invite_links: [{ data: [], error: null }],
    })
    adminHolder.client = client

    const result = await revokeStoryInviteLink('tenant-1', 'story-1', 'user-1')

    expect(result.ok).toBe(true)
    expect(logEventMock).not.toHaveBeenCalled()
  })
})

describe('validateStoryInviteToken', () => {
  it('returns null for a revoked or missing token (the .is(revoked_at, null) filter already excludes it server-side, so a null result covers both)', async () => {
    const { client } = makeClient({ story_invite_links: [{ data: null, error: null }] })
    adminHolder.client = client

    expect(await validateStoryInviteToken('dead-token')).toBeNull()
  })

  it('returns null for an expired token even though revoked_at is null', async () => {
    const expired = { ...LINK_COLUMNS_ROW, expires_at: new Date(Date.now() - 1000).toISOString() }
    const { client } = makeClient({ story_invite_links: [{ data: expired, error: null }] })
    adminHolder.client = client

    expect(await validateStoryInviteToken('tok-abc')).toBeNull()
  })

  it('returns the row for a valid, unexpired, unrevoked token', async () => {
    const { client } = makeClient({ story_invite_links: [{ data: LINK_COLUMNS_ROW, error: null }] })
    adminHolder.client = client

    const row = await validateStoryInviteToken('tok-abc')
    expect(row?.id).toBe('link-1')
  })
})

describe('acceptStoryInvite', () => {
  const STORY_ROW = { data: { id: 'story-1', title: 'A Life in Full' }, error: null }

  it('404s when the token does not exist', async () => {
    const { client } = makeClient({ story_invite_links: [{ data: null, error: null }] })
    adminHolder.client = client

    const result = await acceptStoryInvite('nope', 'clerk-1', 'user-1', 'tenant-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('410s when the link has been revoked', async () => {
    const { client } = makeClient({
      story_invite_links: [{ data: { ...LINK_COLUMNS_ROW, revoked_at: 'now' }, error: null }],
    })
    adminHolder.client = client

    const result = await acceptStoryInvite('tok-abc', 'clerk-1', 'user-1', 'tenant-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(410)
  })

  it('410s when the link has expired', async () => {
    const expired = { ...LINK_COLUMNS_ROW, expires_at: new Date(Date.now() - 1000).toISOString() }
    const { client } = makeClient({ story_invite_links: [{ data: expired, error: null }] })
    adminHolder.client = client

    const result = await acceptStoryInvite('tok-abc', 'clerk-1', 'user-1', 'tenant-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(410)
  })

  it('404s when the story has been discarded / no longer exists', async () => {
    const { client } = makeClient({
      story_invite_links: [{ data: LINK_COLUMNS_ROW, error: null }],
      artifacts: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await acceptStoryInvite('tok-abc', 'clerk-1', 'user-1', 'tenant-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('brand-new person: inserts a members row directly as status=active with source=story_invite, plus a subscriber grant — no intermediate invited state', async () => {
    const { client, calls } = makeClient({
      story_invite_links: [{ data: LINK_COLUMNS_ROW, error: null }],
      artifacts: [STORY_ROW],
      members: [
        { data: null, error: null }, // no existing members row for this clerk_id
        { data: { id: 'new-member-1' }, error: null }, // insert result
      ],
      artifact_subscribers: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await acceptStoryInvite('tok-abc', 'clerk-1', 'user-1', 'tenant-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.isNewMember).toBe(true)
      expect(result.data.memberId).toBe('new-member-1')
      expect(result.data.storyTitle).toBe('A Life in Full')
    }
    const memberInsert = calls.members.find(c => c.op === 'insert')
    expect(memberInsert).toBeDefined()
    expect(memberInsert!.payload).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        clerk_id: 'clerk-1',
        user_id: 'user-1',
        role: 'member',
        status: 'active',
        source: 'story_invite',
        primer: 'Say hi warmly.',
      }),
    )
    // Never 'invited' anywhere in the payload — this path has no placeholder state.
    expect(memberInsert!.payload).not.toHaveProperty('token')
    expect(memberInsert!.payload).not.toHaveProperty('used_at')

    const subscriberUpsert = calls.artifact_subscribers.find(c => c.op === 'upsert')
    expect(subscriberUpsert).toBeDefined()
    expect(subscriberUpsert!.payload).toEqual({ artifact_id: 'story-1', member_id: 'new-member-1' })

    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_INVITE_ACCEPTED_NEW_MEMBER }),
    )
  })

  it('existing member: only writes an artifact_subscribers grant — no members insert, no status change', async () => {
    const { client, calls } = makeClient({
      story_invite_links: [{ data: LINK_COLUMNS_ROW, error: null }],
      artifacts: [STORY_ROW],
      members: [{ data: { id: 'existing-member-1' }, error: null }], // already a Heirloom member
      artifact_subscribers: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await acceptStoryInvite('tok-abc', 'clerk-1', 'user-1', 'tenant-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.isNewMember).toBe(false)
      expect(result.data.memberId).toBe('existing-member-1')
    }
    expect(calls.members.filter(c => c.op === 'insert')).toHaveLength(0)
    expect(calls.members.filter(c => c.op === 'update')).toHaveLength(0)

    const subscriberUpsert = calls.artifact_subscribers.find(c => c.op === 'upsert')
    expect(subscriberUpsert!.payload).toEqual({ artifact_id: 'story-1', member_id: 'existing-member-1' })

    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_INVITE_ACCEPTED_EXISTING_MEMBER }),
    )
  })
})
