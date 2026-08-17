// Covers listByChat/listByMember's paginated overload — the cursor-based
// pagination added to close the "fetches every item upfront" gap (see
// System Docs/Known Gaps.md and app/api/media/route.test.ts's paginated
// GET /api/media coverage, which exercises the actual cost this unlocks:
// signing URLs for only the requested page). This file is scoped to the
// query-building/hasMore/nextCursor logic itself.

import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FilterCall {
  fn: string
  args: unknown[]
}

// Chainable query-builder stand-in mirroring supabase-js's real builder —
// same shape as services/prompt/compiler.test.ts's makeQuery, extended with
// .in()/.gt()/.lt() for the filters this pagination logic issues. Thenable
// so `await query` / `await query.limit(n)` both resolve directly, matching
// how listByChat/listByMember actually call it (no terminal .single()/
// .maybeSingle() call in either path).
function makeQuery(result: { data: unknown[] | null; error: { message: string } | null }) {
  const filters: FilterCall[] = []
  const obj: Record<string, unknown> = {}
  for (const fn of ['eq', 'order', 'in', 'gt', 'lt', 'limit', 'select']) {
    obj[fn] = (...args: unknown[]) => {
      filters.push({ fn, args })
      return obj
    }
  }
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  obj.__filters = filters
  return obj
}

function hasFilter(filters: FilterCall[], fn: string, ...args: unknown[]) {
  return filters.some((f) => f.fn === fn && JSON.stringify(f.args) === JSON.stringify(args))
}

let lastQuery: ReturnType<typeof makeQuery> | null = null
let queuedResult: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null }

const mockFrom = vi.fn(() => {
  lastQuery = makeQuery(queuedResult)
  return lastQuery
})

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

import { listByChat, listByMember } from './index'
import type { MediaItem } from './types'

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'image',
    original_filename: 'photo.jpg',
    storage_path: 'tenant-1/media/member-1/item-1/photo.jpg',
    file_size_bytes: 1024,
    mime_type: 'image/jpeg',
    status: 'ready',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeItems(n: number, prefix: string, startMinute = 0): MediaItem[] {
  return Array.from({ length: n }, (_, i) =>
    makeItem({
      id: `${prefix}-${i}`,
      created_at: `2026-08-01T00:${String(startMinute + i).padStart(2, '0')}:00.000Z`,
    }),
  )
}

beforeEach(() => {
  mockFrom.mockClear()
  lastQuery = null
  queuedResult = { data: [], error: null }
})

describe('listByChat — unpaginated overload (existing callers)', () => {
  it('returns a plain array and never calls .limit() when no pagination arg is given', async () => {
    queuedResult = { data: makeItems(3, 'chat'), error: null }
    const result = await listByChat('chat-1', 'tenant-1')
    expect(Array.isArray(result)).toBe(true)
    expect((result as MediaItem[]).length).toBe(3)
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'limit')).toBe(false)
  })

  it('still orders ascending by created_at — unchanged from before pagination existed', async () => {
    queuedResult = { data: [], error: null }
    await listByChat('chat-1', 'tenant-1')
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'order', 'created_at', { ascending: true })).toBe(true)
  })
})

describe('listByMember — unpaginated overload (existing callers)', () => {
  it('returns a plain array and never calls .limit() when no pagination arg is given', async () => {
    queuedResult = { data: makeItems(3, 'mem'), error: null }
    const result = await listByMember('member-1', 'tenant-1')
    expect(Array.isArray(result)).toBe(true)
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'limit')).toBe(false)
  })

  it('still orders descending by created_at — unchanged from before pagination existed', async () => {
    queuedResult = { data: [], error: null }
    await listByMember('member-1', 'tenant-1')
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'order', 'created_at', { ascending: false })).toBe(true)
  })
})

describe('listByChat — paginated overload', () => {
  it('fetches limit+1 rows and reports hasMore when the extra row comes back', async () => {
    queuedResult = { data: makeItems(4, 'chat'), error: null } // 4 rows for a limit of 3
    const page = await listByChat('chat-1', 'tenant-1', undefined, { limit: 3 })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'limit', 4)).toBe(true)
    expect(page.items.map((i) => i.id)).toEqual(['chat-0', 'chat-1', 'chat-2'])
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBe(page.items[2].created_at)
  })

  it('reports hasMore: false and nextCursor: null when fewer rows than limit+1 come back', async () => {
    queuedResult = { data: makeItems(2, 'chat'), error: null }
    const page = await listByChat('chat-1', 'tenant-1', undefined, { limit: 5 })

    expect(page.items.length).toBe(2)
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })

  it('applies created_at > cursor (moving forward through ascending order) on a subsequent page', async () => {
    queuedResult = { data: [], error: null }
    await listByChat('chat-1', 'tenant-1', undefined, { limit: 3, cursor: '2026-08-01T00:02:00.000Z' })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'gt', 'created_at', '2026-08-01T00:02:00.000Z')).toBe(true)
  })

  it('does not filter by created_at at all on the first page (no cursor)', async () => {
    queuedResult = { data: [], error: null }
    await listByChat('chat-1', 'tenant-1', undefined, { limit: 3 })

    expect(hasFilter((lastQuery!.__filters as FilterCall[]), 'gt')).toBe(false)
  })

  it('still applies a status filter alongside pagination', async () => {
    queuedResult = { data: [], error: null }
    await listByChat('chat-1', 'tenant-1', ['ready', 'failed'], { limit: 3 })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'in', 'status', ['ready', 'failed'])).toBe(true)
  })

  it('falls back to an empty page on a query error, without throwing', async () => {
    queuedResult = { data: null, error: { message: 'boom' } }
    const page = await listByChat('chat-1', 'tenant-1', undefined, { limit: 3 })
    expect(page).toEqual({ items: [], hasMore: false, nextCursor: null })
  })
})

describe('listByMember — paginated overload', () => {
  it('fetches limit+1 rows and reports hasMore when the extra row comes back', async () => {
    queuedResult = { data: makeItems(4, 'mem'), error: null }
    const page = await listByMember('member-1', 'tenant-1', { limit: 3 })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'limit', 4)).toBe(true)
    expect(page.items.length).toBe(3)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toBe(page.items[2].created_at)
  })

  it('applies created_at < cursor (moving backward through descending order) on a subsequent page', async () => {
    queuedResult = { data: [], error: null }
    await listByMember('member-1', 'tenant-1', { limit: 3, cursor: '2026-08-01T00:05:00.000Z' })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'lt', 'created_at', '2026-08-01T00:05:00.000Z')).toBe(true)
  })

  it('falls back to an empty page on a query error, without throwing', async () => {
    queuedResult = { data: null, error: { message: 'boom' } }
    const page = await listByMember('member-1', 'tenant-1', { limit: 3 })
    expect(page).toEqual({ items: [], hasMore: false, nextCursor: null })
  })

  it('orders ascending and applies created_at > cursor when sort is "oldest"', async () => {
    queuedResult = { data: [], error: null }
    await listByMember('member-1', 'tenant-1', {
      limit: 3,
      cursor: '2026-08-01T00:05:00.000Z',
      sort: 'oldest',
    })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'order', 'created_at', { ascending: true })).toBe(true)
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'gt', 'created_at', '2026-08-01T00:05:00.000Z')).toBe(true)
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'lt')).toBe(false)
  })

  it('still orders descending and applies created_at < cursor when sort is "newest" (explicit default)', async () => {
    queuedResult = { data: [], error: null }
    await listByMember('member-1', 'tenant-1', {
      limit: 3,
      cursor: '2026-08-01T00:05:00.000Z',
      sort: 'newest',
    })

    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'order', 'created_at', { ascending: false })).toBe(true)
    expect(hasFilter(lastQuery!.__filters as FilterCall[], 'lt', 'created_at', '2026-08-01T00:05:00.000Z')).toBe(true)
  })
})
