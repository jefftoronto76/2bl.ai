// Coverage for services/crm/stories.ts — the real story-persistence backend
// (2026-08-09), sibling to memories.test.ts's own pattern: mocks
// @supabase/supabase-js's createClient directly, since getAdminClient()
// (services/auth/supabase-admin.ts) bottoms out there.
//
// listStories' owned-OR-subscribed widening (reusable-story-invite-links,
// 2026-08-10) touches three tables beyond the original owner-only query —
// members (resolve the caller's own members.id), artifact_subscribers
// (twice: the caller's own grants, and which of the returned stories have
// ANY subscriber), and story_invite_links (which returned stories have an
// active link) — makeClient below grew generic chain mocks for these
// rather than the original single-shape nested-object mocks, so arbitrary
// eq/is/in/or/order call sequences all resolve correctly regardless of
// exact call count.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => adminHolder.client,
}))
vi.mock('@/services/audit', () => ({ logEvent: vi.fn() }))

import { createStory, listStories, discardStory, updateStoryDescription, STORY_ACCOUNT_REQUIRED_ERROR } from './stories'
import { logEvent } from '@/services/audit'

const mockLogEvent = vi.mocked(logEvent)

type Row = Record<string, unknown>
type SelectResult = { data: Row | null; error: { message: string } | null }
type ListResult = { data: Row[] | null; error: { message: string } | null }

/** A generic chainable mock — every intermediate method returns the chain
 *  itself so any call sequence (eq/is/in/or/order in any combination) is
 *  accepted; both a terminal .maybeSingle()/.single() and a direct `await`
 *  on the chain (via .then) resolve to `result`. */
function makeChain(result: SelectResult | ListResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    or: () => chain,
    order: () => result,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

function makeClient(opts: {
  /** members lookup — shared by resolveUserIdForMember (createStory/
   *  discardStory's account check) and listStories' own active-member
   *  lookup; both terminate on .maybeSingle(). */
  memberResult?: SelectResult
  insertResult?: SelectResult
  updateResult?: SelectResult
  /** The owned+subscribed artifacts query's result. */
  listResult?: ListResult
  /** artifact_subscribers .eq('member_id', ...) — the caller's own grants. */
  subscriberIdsResult?: ListResult
  /** story_invite_links .in('story_id', ...) — active-link ids among the returned stories. */
  activeLinkStoryIdsResult?: ListResult
  /** artifact_subscribers .in('artifact_id', ...) — subscriber ids among the returned stories. */
  subscriberStoryIdsResult?: ListResult
}) {
  const insertCalls: Row[] = []
  const updateCalls: Row[] = []
  const orFilterCalls: string[] = []

  const client = {
    from(table: string) {
      if (table === 'members') {
        return { select: () => makeChain(opts.memberResult ?? { data: null, error: null }) }
      }
      if (table === 'artifact_subscribers') {
        return {
          select: () => ({
            eq: () => makeChain(opts.subscriberIdsResult ?? { data: [], error: null }),
            in: () => makeChain(opts.subscriberStoryIdsResult ?? { data: [], error: null }),
          }),
        }
      }
      if (table === 'story_invite_links') {
        return { select: () => makeChain(opts.activeLinkStoryIdsResult ?? { data: [], error: null }) }
      }
      if (table === 'artifacts') {
        return {
          select: () => {
            const chain: Record<string, unknown> = {
              eq: () => chain,
              is: () => chain,
              or: (filter: string) => {
                orFilterCalls.push(filter)
                return chain
              },
              order: () => opts.listResult ?? { data: [], error: null },
              then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                Promise.resolve(opts.listResult ?? { data: [], error: null }).then(resolve, reject),
            }
            return chain
          },
          insert: (row: Row) => {
            insertCalls.push(row)
            return {
              select: () => ({
                single: async () =>
                  opts.insertResult ?? { data: { ...row, id: 'story-1', created_at: 'now', updated_at: 'now' }, error: null },
              }),
            }
          },
          update: (patch: Row) => {
            updateCalls.push(patch)
            return makeChain(opts.updateResult ?? { data: null, error: { message: 'not configured' } })
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  return { client, insertCalls, updateCalls, orFilterCalls }
}

/** A memberId that resolves to a linked account — the common non-anonymous case. */
const LINKED_MEMBER_RESULT: SelectResult = { data: { user_id: 'user-1' }, error: null }
/** listStories' own active-member lookup shape (selects `id`, not `user_id`). */
const ACTIVE_MEMBER_ROW_RESULT: SelectResult = { data: { id: 'member-1' }, error: null }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  mockLogEvent.mockClear()
})

describe('listStories', () => {
  it('returns non-discarded stories for the tenant + user', async () => {
    const { client } = makeClient({
      listResult: {
        data: [
          { id: 'story-1', title: 'A Life in Full', body: 'The long arc.', created_at: 'now', updated_at: 'now' },
        ],
        error: null,
      },
    })
    adminHolder.client = client

    const result = await listStories('tenant-1', 'user-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'story-1', title: 'A Life in Full', body: 'The long arc.', hasActiveInviteOrSubscribers: false }),
      )
    }
  })

  it('has no active member row → subscribedStoryIds is empty and the or() filter degenerates to owner-only, unchanged from before this feature', async () => {
    const { client, orFilterCalls } = makeClient({
      // memberResult unset → default { data: null, error: null } → no active members row
      listResult: { data: [], error: null },
    })
    adminHolder.client = client

    const result = await listStories('tenant-1', 'user-1')

    expect(result.ok).toBe(true)
    expect(orFilterCalls).toEqual(['user_id.eq.user-1'])
  })

  it('an active member with subscriptions gets them OR-ed into the query, and owned + subscribed stories are both returned', async () => {
    const { client, orFilterCalls } = makeClient({
      memberResult: ACTIVE_MEMBER_ROW_RESULT,
      subscriberIdsResult: { data: [{ artifact_id: 'story-2' }], error: null },
      listResult: {
        data: [
          { id: 'story-1', title: 'Owned Story', body: null, created_at: 'now', updated_at: 'now' },
          { id: 'story-2', title: 'Shared Story', body: null, created_at: 'now', updated_at: 'now' },
        ],
        error: null,
      },
      // story-2 has an active link and a subscriber (the caller); story-1 has neither.
      activeLinkStoryIdsResult: { data: [{ story_id: 'story-2' }], error: null },
      subscriberStoryIdsResult: { data: [{ artifact_id: 'story-2' }], error: null },
    })
    adminHolder.client = client

    const result = await listStories('tenant-1', 'user-1')

    expect(result.ok).toBe(true)
    expect(orFilterCalls).toEqual(['user_id.eq.user-1,id.in.(story-2)'])
    if (result.ok) {
      expect(result.data).toHaveLength(2)
      expect(result.data.find(s => s.id === 'story-1')).toEqual(
        expect.objectContaining({ hasActiveInviteOrSubscribers: false }),
      )
      expect(result.data.find(s => s.id === 'story-2')).toEqual(
        expect.objectContaining({ hasActiveInviteOrSubscribers: true }),
      )
    }
  })

  it('500s and surfaces the error message when the query fails', async () => {
    const { client } = makeClient({ listResult: { data: null, error: { message: 'db down' } } })
    adminHolder.client = client

    const result = await listStories('tenant-1', 'user-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})

describe('createStory', () => {
  const baseInput = { name: 'A Life in Full', description: 'The long arc.' }

  it('resolves user_id from the member row and inserts title/body/session_id(null)/status', async () => {
    const { client, insertCalls } = makeClient({ memberResult: LINKED_MEMBER_RESULT })
    adminHolder.client = client

    const result = await createStory('tenant-1', { ...baseInput, memberId: 'member-1' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe('A Life in Full')
      expect(result.data.body).toBe('The long arc.')
      expect(result.data.hasActiveInviteOrSubscribers).toBe(false)
    }
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        member_id: 'member-1',
        session_id: null,
        type: 'story',
        status: 'published',
        title: 'A Life in Full',
        body: 'The long arc.',
      }),
    )
    expect(insertCalls[0]).not.toHaveProperty('anchor_message_id')
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_CREATED, outcome: 'success', target_id: 'story-1' }),
    )
  })

  it('rejects a fully anonymous visitor (no memberId) with a distinguishable 401 — no insert attempted', async () => {
    const { client, insertCalls } = makeClient({})
    adminHolder.client = client

    const result = await createStory('tenant-1', { ...baseInput, memberId: null })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe(STORY_ACCOUNT_REQUIRED_ERROR)
    }
    expect(insertCalls.length).toBe(0)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_CREATED, outcome: 'failure' }),
    )
  })

  it('rejects a member that exists but has no linked account yet (invited, not signed up) with the same 401 — no insert attempted', async () => {
    const { client, insertCalls } = makeClient({ memberResult: { data: { user_id: null }, error: null } })
    adminHolder.client = client

    const result = await createStory('tenant-1', { ...baseInput, memberId: 'member-invited' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe(STORY_ACCOUNT_REQUIRED_ERROR)
    }
    expect(insertCalls.length).toBe(0)
  })

  it('treats a genuine DB error resolving user_id as a 500 infra failure, distinct from the 401 "no account" case', async () => {
    const { client, insertCalls } = makeClient({ memberResult: { data: null, error: { message: 'db unreachable' } } })
    adminHolder.client = client

    const result = await createStory('tenant-1', { ...baseInput, memberId: 'member-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).not.toBe(STORY_ACCOUNT_REQUIRED_ERROR)
    }
    expect(insertCalls.length).toBe(0)
  })

  it('500s and logs a failure when the insert itself errors', async () => {
    const { client } = makeClient({
      memberResult: LINKED_MEMBER_RESULT,
      insertResult: { data: null, error: { message: 'insert failed' } },
    })
    adminHolder.client = client

    const result = await createStory('tenant-1', { ...baseInput, memberId: 'member-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_CREATED, outcome: 'failure' }),
    )
  })
})

describe('discardStory', () => {
  it('stamps discarded_at, scoped by id + tenant + user', async () => {
    const { client, updateCalls } = makeClient({ updateResult: { data: { id: 'story-1' }, error: null } })
    adminHolder.client = client

    const result = await discardStory('tenant-1', 'user-1', 'story-1')

    expect(result.ok).toBe(true)
    expect(updateCalls[0]).toHaveProperty('discarded_at')
  })

  it('404s when no row matches id + tenant + user', async () => {
    const { client } = makeClient({ updateResult: { data: null, error: null } })
    adminHolder.client = client

    const result = await discardStory('tenant-1', 'user-1', 'nope')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('500s when the update itself errors', async () => {
    const { client } = makeClient({ updateResult: { data: null, error: { message: 'db down' } } })
    adminHolder.client = client

    const result = await discardStory('tenant-1', 'user-1', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})

describe('updateStoryDescription', () => {
  it('writes the new description to the body column, scoped by id + tenant + user', async () => {
    const { client, updateCalls } = makeClient({
      updateResult: {
        data: { id: 'story-1', title: 'A Life in Full', body: 'A new description.', created_at: 'now', updated_at: 'now' },
        error: null,
      },
    })
    adminHolder.client = client

    const result = await updateStoryDescription('tenant-1', 'user-1', 'story-1', 'A new description.')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.body).toBe('A new description.')
      expect(result.data.id).toBe('story-1')
    }
    expect(updateCalls[0]).toEqual({ body: 'A new description.' })
    // Only the description column is touched — title is left alone.
    expect(updateCalls[0]).not.toHaveProperty('title')
  })

  it('404s when no row matches id + tenant + user (not found, or not owned by this user)', async () => {
    const { client } = makeClient({ updateResult: { data: null, error: null } })
    adminHolder.client = client

    const result = await updateStoryDescription('tenant-1', 'user-1', 'nope', 'New text')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toBe('Story not found')
    }
  })

  it('500s when the update itself errors', async () => {
    const { client } = makeClient({ updateResult: { data: null, error: { message: 'db down' } } })
    adminHolder.client = client

    const result = await updateStoryDescription('tenant-1', 'user-1', 'story-1', 'New text')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})
