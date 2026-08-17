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

import { assignMemoryToStory, removeMemoryFromStory, getStoryIdsForMemories, getMemoriesForStory, getMemoryCountsForStories, moveMemoryInStory } from './story-containments'

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
    order: () => chain,
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
        upsert: (payload: unknown, opts?: unknown) => {
          calls[table].push({ op: 'upsert', payload: { rows: payload, opts } })
          return Promise.resolve(next(table))
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

describe('removeMemoryFromStory', () => {
  it('memory owned by the caller, has a containment row — deletes it and logs success', async () => {
    const { client, calls } = makeClient({
      artifacts: [MEMORY_ROW],
      artifact_containments: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await removeMemoryFromStory('tenant-1', 'user-owner', 'mem-1')

    expect(result.ok).toBe(true)
    const deleteCall = calls.artifact_containments.find(c => c.op === 'delete')
    expect(deleteCall).toBeDefined()
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_REMOVED_FROM_STORY,
        target_id: 'mem-1',
        outcome: 'success',
      }),
    )
  })

  it('memory owned by the caller, no existing containment row — still a success, not a 404 (removing an already-unassigned memory is a no-op)', async () => {
    const { client } = makeClient({
      artifacts: [MEMORY_ROW],
      artifact_containments: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await removeMemoryFromStory('tenant-1', 'user-owner', 'mem-1')

    expect(result.ok).toBe(true)
  })

  it('never checks story access — removal is owner-scoped on the memory only, unlike assign', async () => {
    const { client, calls } = makeClient({
      artifacts: [MEMORY_ROW],
      artifact_containments: [{ data: null, error: null }],
    })
    adminHolder.client = client

    await removeMemoryFromStory('tenant-1', 'user-owner', 'mem-1')

    // Only one artifacts lookup happened (the memory itself) — no second
    // call for a story row, unlike assignMemoryToStory's hasStoryAccess.
    expect(calls.artifacts).toHaveLength(1)
  })

  it('404s and never touches artifact_containments when the memory does not belong to this tenant/user', async () => {
    const { client, calls } = makeClient({
      artifacts: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await removeMemoryFromStory('tenant-1', 'user-1', 'mem-missing')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toBe('Memory not found')
    }
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('500s and logs a failure when the delete itself errors', async () => {
    const { client } = makeClient({
      artifacts: [MEMORY_ROW],
      artifact_containments: [{ data: null, error: { message: 'delete failed' } }],
    })
    adminHolder.client = client

    const result = await removeMemoryFromStory('tenant-1', 'user-owner', 'mem-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEMORY_REMOVED_FROM_STORY, outcome: 'failure' }),
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

describe('getMemoriesForStory', () => {
  it('404s and never queries containments when the caller has no access to the story', async () => {
    const { client, calls } = makeClient({
      artifacts: [{ data: { id: 'story-1', user_id: 'the-owner' }, error: null }],
      members: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'stranger-user', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toBe('Story not found')
    }
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('500s when the access check itself errors', async () => {
    const { client } = makeClient({
      artifacts: [{ data: null, error: { message: 'db down' } }],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'user-owner', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })

  it('returns an empty list when the story has no containment rows', async () => {
    const { client } = makeClient({
      artifacts: [OWNED_STORY_ROW],
      artifact_containments: [{ data: [], error: null }],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'user-owner', 'story-1')

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('500s when the containment query errors', async () => {
    const { client } = makeClient({
      artifacts: [OWNED_STORY_ROW],
      artifact_containments: [{ data: null, error: { message: 'db down' } }],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'user-owner', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })

  it('500s when the memory lookup errors', async () => {
    // artifacts' cursor is shared across BOTH the story-access lookup
    // (hasStoryAccess) and this function's own memory lookup — first entry
    // serves the former, second serves the latter.
    const { client } = makeClient({
      artifacts: [OWNED_STORY_ROW, { data: null, error: { message: 'db down' } }],
      artifact_containments: [{ data: [{ child_artifact_id: 'mem-1', position: null, created_at: '2026-08-01T00:00:00Z' }], error: null }],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'user-owner', 'story-1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })

  it('returns memories ordered exactly as the containment rows were ordered by the query, dropping any missing/discarded ones', async () => {
    const { client } = makeClient({
      artifacts: [
        OWNED_STORY_ROW,
        {
          data: [
            { id: 'mem-2', session_id: 'sess-a', title: 'Second', body: 'B', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' },
            { id: 'mem-1', session_id: 'sess-b', title: 'First', body: 'A', source_kind: 'photo', created_at: '2026-08-01T00:00:00Z' },
            // mem-3 is deliberately absent from this result — simulates a
            // discarded/missing memory the second query's own filters
            // already excluded.
          ],
          error: null,
        },
      ],
      artifact_containments: [
        {
          data: [
            { child_artifact_id: 'mem-2', position: null, created_at: '2026-08-02T00:00:00Z' },
            { child_artifact_id: 'mem-1', position: null, created_at: '2026-08-01T00:00:00Z' },
            { child_artifact_id: 'mem-3', position: null, created_at: '2026-08-03T00:00:00Z' },
          ],
          error: null,
        },
      ],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'user-owner', 'story-1')

    expect(result).toEqual({
      ok: true,
      data: [
        { id: 'mem-2', session_id: 'sess-a', title: 'Second', body: 'B', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' },
        { id: 'mem-1', session_id: 'sess-b', title: 'First', body: 'A', source_kind: 'photo', created_at: '2026-08-01T00:00:00Z' },
      ],
    })
  })

  it('a story the caller is subscribed to (not owned) is a valid read too — owned-OR-subscribed, not owner-only', async () => {
    const { client } = makeClient({
      artifacts: [
        { data: { id: 'story-1', user_id: 'the-owner' }, error: null },
        { data: [], error: null },
      ],
      members: [{ data: { id: 'member-1' }, error: null }],
      artifact_subscribers: [{ data: { id: 'sub-1' }, error: null }],
      artifact_containments: [{ data: [], error: null }],
    })
    adminHolder.client = client

    const result = await getMemoriesForStory('tenant-1', 'collaborator-user', 'story-1')

    expect(result).toEqual({ ok: true, data: [] })
  })
})

describe('getMemoryCountsForStories', () => {
  it('returns an empty map without querying when storyIds is empty', async () => {
    const { client, calls } = makeClient({})
    adminHolder.client = client

    const result = await getMemoryCountsForStories('tenant-1', [])

    expect(result).toEqual({ ok: true, data: {} })
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('returns an empty map without a second query when no containment rows exist', async () => {
    const { client, calls } = makeClient({
      artifact_containments: [{ data: [], error: null }],
    })
    adminHolder.client = client

    const result = await getMemoryCountsForStories('tenant-1', ['story-1', 'story-2'])

    expect(result).toEqual({ ok: true, data: {} })
    expect(calls.artifacts).toBeUndefined()
  })

  it('counts containment rows per parent story, dropping rows whose memory is missing/discarded', async () => {
    const { client } = makeClient({
      artifact_containments: [
        {
          data: [
            { parent_artifact_id: 'story-1', child_artifact_id: 'mem-1' },
            { parent_artifact_id: 'story-1', child_artifact_id: 'mem-2' },
            { parent_artifact_id: 'story-2', child_artifact_id: 'mem-3' },
            // mem-4's containment row outlived its memory (discardMemory
            // never cleans up artifact_containments) — must not count.
            { parent_artifact_id: 'story-2', child_artifact_id: 'mem-4' },
          ],
          error: null,
        },
      ],
      artifacts: [
        { data: [{ id: 'mem-1' }, { id: 'mem-2' }, { id: 'mem-3' }], error: null },
      ],
    })
    adminHolder.client = client

    const result = await getMemoryCountsForStories('tenant-1', ['story-1', 'story-2'])

    expect(result).toEqual({ ok: true, data: { 'story-1': 2, 'story-2': 1 } })
  })

  it('a story with zero remaining memories is simply absent from the map', async () => {
    const { client } = makeClient({
      artifact_containments: [
        { data: [{ parent_artifact_id: 'story-1', child_artifact_id: 'mem-1' }], error: null },
      ],
      artifacts: [{ data: [], error: null }],
    })
    adminHolder.client = client

    const result = await getMemoryCountsForStories('tenant-1', ['story-1'])

    expect(result).toEqual({ ok: true, data: {} })
  })

  it('500s when the containment query errors', async () => {
    const { client } = makeClient({
      artifact_containments: [{ data: null, error: { message: 'db down' } }],
    })
    adminHolder.client = client

    const result = await getMemoryCountsForStories('tenant-1', ['story-1'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })

  it('500s when the memory lookup errors', async () => {
    const { client } = makeClient({
      artifact_containments: [
        { data: [{ parent_artifact_id: 'story-1', child_artifact_id: 'mem-1' }], error: null },
      ],
      artifacts: [{ data: null, error: { message: 'db down' } }],
    })
    adminHolder.client = client

    const result = await getMemoryCountsForStories('tenant-1', ['story-1'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})

describe('moveMemoryInStory', () => {
  const MEM_A = { id: 'mem-a', session_id: 'sess-1', title: 'A', body: '', source_kind: 'conversation', created_at: '2026-08-01T00:00:00Z' }
  const MEM_B = { id: 'mem-b', session_id: 'sess-1', title: 'B', body: '', source_kind: 'conversation', created_at: '2026-08-02T00:00:00Z' }
  const MEM_C = { id: 'mem-c', session_id: 'sess-1', title: 'C', body: '', source_kind: 'conversation', created_at: '2026-08-03T00:00:00Z' }

  /** Three memories, current effective order A, B, C (every position NULL,
   *  so it's the created_at fallback order — exactly what a never-touched
   *  story looks like). */
  function makeThreeMemoryClient() {
    return makeClient({
      artifacts: [
        OWNED_STORY_ROW,
        { data: [MEM_A, MEM_B, MEM_C], error: null },
      ],
      artifact_containments: [
        {
          data: [
            { child_artifact_id: 'mem-a', position: null, created_at: MEM_A.created_at },
            { child_artifact_id: 'mem-b', position: null, created_at: MEM_B.created_at },
            { child_artifact_id: 'mem-c', position: null, created_at: MEM_C.created_at },
          ],
          error: null,
        },
        { data: null, error: null }, // the upsert call
      ],
    })
  }

  it('404s and never reaches artifact_containments when the caller has no access to the story', async () => {
    const { client, calls } = makeClient({
      artifacts: [{ data: { id: 'story-1', user_id: 'the-owner' }, error: null }],
      members: [{ data: null, error: null }],
    })
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'stranger-user', 'story-1', 'mem-a', 'up')

    expect(result).toEqual({ ok: false, status: 404, error: 'Story not found' })
    expect(calls.artifact_containments).toBeUndefined()
  })

  it('404s when the memory is not in this story\'s list at all', async () => {
    const { client } = makeThreeMemoryClient()
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-missing', 'up')

    expect(result).toEqual({ ok: false, status: 404, error: 'Memory not found in this story' })
  })

  it('400s moving the first item up — already at the top', async () => {
    const { client, calls } = makeThreeMemoryClient()
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-a', 'up')

    expect(result).toEqual({ ok: false, status: 400, error: 'Already at the top of the list' })
    expect(calls.artifact_containments?.some(c => c.op === 'upsert')).toBe(false)
  })

  it('400s moving the last item down — already at the bottom', async () => {
    const { client, calls } = makeThreeMemoryClient()
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-c', 'down')

    expect(result).toEqual({ ok: false, status: 400, error: 'Already at the bottom of the list' })
    expect(calls.artifact_containments?.some(c => c.op === 'upsert')).toBe(false)
  })

  it('moving the middle item up renumbers ALL three (0,1,2 matching current order) then swaps, in one batch upsert', async () => {
    const { client, calls } = makeThreeMemoryClient()
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-b', 'up')

    expect(result.ok).toBe(true)
    const upsertCall = calls.artifact_containments.find(c => c.op === 'upsert')
    expect(upsertCall).toBeDefined()
    const { rows, opts } = upsertCall!.payload as { rows: unknown[]; opts: { onConflict: string } }
    expect(opts).toEqual({ onConflict: 'parent_artifact_id,child_artifact_id' })
    expect(rows).toEqual([
      { tenant_id: 'tenant-1', parent_artifact_id: 'story-1', child_artifact_id: 'mem-a', position: 1 },
      { tenant_id: 'tenant-1', parent_artifact_id: 'story-1', child_artifact_id: 'mem-b', position: 0 },
      { tenant_id: 'tenant-1', parent_artifact_id: 'story-1', child_artifact_id: 'mem-c', position: 2 },
    ])
  })

  it('moving the first item down swaps it with its neighbor, leaving the third untouched in position', async () => {
    const { client, calls } = makeThreeMemoryClient()
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-a', 'down')

    expect(result.ok).toBe(true)
    const upsertCall = calls.artifact_containments.find(c => c.op === 'upsert')
    const { rows } = upsertCall!.payload as { rows: unknown[] }
    expect(rows).toEqual([
      { tenant_id: 'tenant-1', parent_artifact_id: 'story-1', child_artifact_id: 'mem-a', position: 1 },
      { tenant_id: 'tenant-1', parent_artifact_id: 'story-1', child_artifact_id: 'mem-b', position: 0 },
      { tenant_id: 'tenant-1', parent_artifact_id: 'story-1', child_artifact_id: 'mem-c', position: 2 },
    ])
  })

  it('logs STORY_MEMORY_REORDERED success with direction and the new positions on success', async () => {
    const { client } = makeThreeMemoryClient()
    adminHolder.client = client

    await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-b', 'up')

    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.STORY_MEMORY_REORDERED,
        target_id: 'mem-b',
        outcome: 'success',
        metadata: expect.objectContaining({ story_id: 'story-1', direction: 'up' }),
      }),
    )
  })

  it('500s and logs failure when the upsert itself errors', async () => {
    const { client } = makeClient({
      artifacts: [
        OWNED_STORY_ROW,
        { data: [MEM_A, MEM_B, MEM_C], error: null },
      ],
      artifact_containments: [
        {
          data: [
            { child_artifact_id: 'mem-a', position: null, created_at: MEM_A.created_at },
            { child_artifact_id: 'mem-b', position: null, created_at: MEM_B.created_at },
            { child_artifact_id: 'mem-c', position: null, created_at: MEM_C.created_at },
          ],
          error: null,
        },
        { data: null, error: { message: 'db down' } },
      ],
    })
    adminHolder.client = client

    const result = await moveMemoryInStory('tenant-1', 'user-owner', 'story-1', 'mem-b', 'up')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).toBe('db down')
    }
    expect(logEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STORY_MEMORY_REORDERED, outcome: 'failure' }),
    )
  })
})
