// Coverage for services/crm/stories.ts — the real story-persistence backend
// (2026-08-09), sibling to memories.test.ts's own pattern: mocks
// @supabase/supabase-js's createClient directly, since getAdminClient()
// (services/auth/supabase-admin.ts) bottoms out there.
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => adminHolder.client,
}))
vi.mock('@/services/audit', () => ({ logEvent: vi.fn() }))

import { createStory, listStories, discardStory, STORY_ACCOUNT_REQUIRED_ERROR } from './stories'
import { logEvent } from '@/services/audit'

const mockLogEvent = vi.mocked(logEvent)

type Row = Record<string, unknown>
type SelectResult = { data: Row | null; error: { message: string } | null }

function makeClient(opts: {
  memberResult?: SelectResult
  insertResult?: SelectResult
  updateResult?: SelectResult
  listResult?: { data: Row[] | null; error: { message: string } | null }
}) {
  const insertCalls: Row[] = []
  const updateCalls: Row[] = []

  const client = {
    from(table: string) {
      if (table === 'members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => opts.memberResult ?? { data: null, error: null },
              }),
            }),
          }),
        }
      }
      if (table === 'artifacts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: async () => opts.listResult ?? { data: [], error: null },
                  }),
                }),
              }),
            }),
          }),
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
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      select: () => ({
                        maybeSingle: async () => opts.updateResult ?? { data: null, error: { message: 'not configured' } },
                      }),
                    }),
                  }),
                }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  return { client, insertCalls, updateCalls }
}

/** A memberId that resolves to a linked account — the common non-anonymous case. */
const LINKED_MEMBER_RESULT: SelectResult = { data: { user_id: 'user-1' }, error: null }

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
        expect.objectContaining({ id: 'story-1', title: 'A Life in Full', body: 'The long arc.' }),
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
