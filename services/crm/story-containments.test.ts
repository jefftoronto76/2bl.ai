// Coverage for services/crm/story-containments.ts — story <-> memory
// linking via artifact_containments (assign-memory-to-story, 2026-08-13).
// Mocks @/services/auth/supabase-admin directly, same pattern as
// story-invites.test.ts (every function here bottoms out at
// getAdminClient()).
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

import { assignMemoryToStory, getStoryIdsForMemories } from './story-containments'

type Result = { data: unknown; error: unknown }

/** A generic chainable mock — eq/is/in/select all return the chain itself,
 *  so any call sequence resolves; both a terminal .maybeSingle() and a
 *  direct `await` on the chain (via .then) work. */
function makeChain(result: Result) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

/**
 * Per-table result queues, consumed in call order (repeating the last entry
 * once exhausted) — lets a single test configure e.g. `artifacts`' first
 * call (the memory lookup) and second call (the story lookup inside
 * hasStoryAccess) separately.
 */
function makeClient(queues: Partial<Record<string, Result[]>>) {
  const cursors: Record<string, number> = {}
  const calls: Record<string, Array<{ op: string; payload?: unknown }>> = {}

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
          return Promise.resolve(next(table))
        },
        delete: () => {
          calls[table].push({ op: 'delete' })
          return makeChain(next(table))
        },
      }
    },
  }
  return { client, calls }
}

const OWNED_STORY_ROW = { data: { id: 'story-1', user_id: 'user-owner' }, error: null }
const MEMORY_ROW = { data: { id: 'mem-1' }, error: null }

beforeEach(() => {
  logEventMock.mockClear()
})

describe('assignMemoryToStory', () => {
  it('new assignment: memory found, story owned, no existing containment — deletes (no-op) then inserts, logs success', async () => {
    const { client, calls } = makeClient({
      artifacts: [MEMORY_ROW, OWNED_STORY_ROW],
      artifact_containments: [{ data: null, error: null }, { data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'user-owner', 'mem-1', 'story-1')

    expect(result.ok).toBe(true)
    const deleteCall = calls.artifact_containments.find(c => c.op === 'delete')
    const insertCall = calls.artifact_containments.find(c => c.op === 'insert')
    expect(deleteCall).toBeDefined()
    expect(insertCall).toBeDefined()
    expect(insertCall?.payload).toEqual({
      tenant_id: 'tenant-1',
      parent_artifact_id: 'story-1',
      child_artifact_id: 'mem-1',
    })
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_ASSIGNED_TO_STORY,
        target_id: 'mem-1',
        outcome: 'success',
        metadata: { story_id: 'story-1' },
      }),
    )
  })

  it('reassignment (move): still deletes any existing containment for the memory before inserting the new one', async () => {
    const { client, calls } = makeClient({
      artifacts: [MEMORY_ROW, OWNED_STORY_ROW],
      artifact_containments: [{ data: [{ id: 'old-row' }], error: null }, { data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'user-owner', 'mem-1', 'story-2')

    expect(result.ok).toBe(true)
    const deleteCall = calls.artifact_containments.find(c => c.op === 'delete')
    const insertCall = calls.artifact_containments.find(c => c.op === 'insert')
    expect(deleteCall).toBeDefined()
    expect(insertCall?.payload).toEqual({
      tenant_id: 'tenant-1',
      parent_artifact_id: 'story-2',
      child_artifact_id: 'mem-1',
    })
    // Delete runs before insert — the sequential-write ordering the whole
    // single-story-per-memory rule depends on.
    const containmentOps = calls.artifact_containments.map(c => c.op)
    expect(containmentOps.indexOf('delete')).toBeLessThan(containmentOps.indexOf('insert'))
  })

  it('404s and never touches artifact_containments when the memory does not belong to this tenant/user', async () => {
    const { client, calls } = makeClient({
      artifacts: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'user-1', 'mem-missing', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toBe('Memory not found')
    }
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('a story the caller owns is accessible', async () => {
    const { client } = makeClient({
      artifacts: [MEMORY_ROW, { data: { id: 'story-1', user_id: 'user-owner' }, error: null }],
      artifact_containments: [{ data: null, error: null }, { data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'user-owner', 'mem-1', 'story-1')

    expect(result.ok).toBe(true)
  })

  it('a story the caller is subscribed to (not owned) is accessible — owned-OR-subscribed, not owner-only', async () => {
    const { client } = makeClient({
      artifacts: [MEMORY_ROW, { data: { id: 'story-1', user_id: 'the-owner' }, error: null }],
      members: [{ data: { id: 'member-1' }, error: null }],
      artifact_subscribers: [{ data: { id: 'sub-1' }, error: null }],
      artifact_containments: [{ data: null, error: null }, { data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'collaborator-user', 'mem-1', 'story-1')

    expect(result.ok).toBe(true)
  })

  it('404s and never touches artifact_containments when the caller neither owns nor is subscribed to the story', async () => {
    const { client, calls } = makeClient({
      artifacts: [MEMORY_ROW, { data: { id: 'story-1', user_id: 'the-owner' }, error: null }],
      members: [{ data: { id: 'member-1' }, error: null }],
      artifact_subscribers: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'stranger-user', 'mem-1', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toBe('Story not found')
    }
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('404s when the target story does not exist at all', async () => {
    const { client, calls } = makeClient({
      artifacts: [MEMORY_ROW, { data: null, error: null }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'user-1', 'mem-1', 'story-missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('500s and logs a failure when the insert itself errors', async () => {
    const { client } = makeClient({
      artifacts: [MEMORY_ROW, OWNED_STORY_ROW],
      artifact_containments: [{ data: null, error: null }, { data: null, error: { message: 'insert failed' } }],
    })
    adminHolder.client = client

    const result = await assignMemoryToStory('tenant-1', 'user-owner', 'mem-1', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEMORY_ASSIGNED_TO_STORY, outcome: 'failure' }),
    )
  })
})

describe('getStoryIdsForMemories', () => {
  it('returns an empty map without querying when memoryIds is empty', async () => {
    const { client, calls } = makeClient({})
    adminHolder.client = client

    const result = await getStoryIdsForMemories('tenant-1', [])

    expect(result).toEqual({ ok: true, data: {} })
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('maps child_artifact_id -> parent_artifact_id for every containment row found', async () => {
    const { client } = makeClient({
      artifact_containments: [
        {
          data: [
            { parent_artifact_id: 'story-1', child_artifact_id: 'mem-1' },
            { parent_artifact_id: 'story-2', child_artifact_id: 'mem-2' },
          ],
          error: null,
        },
      ],
    })
    adminHolder.client = client

    const result = await getStoryIdsForMemories('tenant-1', ['mem-1', 'mem-2', 'mem-3'])

    expect(result).toEqual({ ok: true, data: { 'mem-1': 'story-1', 'mem-2': 'story-2' } })
  })

  it('500s when the query errors', async () => {
    const { client } = makeClient({
      artifact_containments: [{ data: null, error: { message: 'db down' } }],
    })
    adminHolder.client = client

    const result = await getStoryIdsForMemories('tenant-1', ['mem-1'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})
