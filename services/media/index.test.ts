import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Build a self-referential chainable Supabase mock via vi.hoisted ───────────

const supabaseMocks = vi.hoisted(() => {
  // Track calls to methods we want to assert on
  const insertCalls: unknown[] = []
  const updateCalls: unknown[] = []
  const eqCalls: [string, unknown][] = []
  const orderCalls: Array<[string, unknown]> = []
  const singleFn = vi.fn()
  // resolveWith drives the final await for both .single() and direct await
  let resolveWith: { data: unknown; error: unknown } = { data: null, error: null }

  const qb: any = {}
  qb.insert = (data: unknown) => { insertCalls.push(data); return qb }
  qb.update = (data: unknown) => { updateCalls.push(data); return qb }
  qb.select = () => qb
  qb.eq = (col: string, val: unknown) => { eqCalls.push([col, val]); return qb }
  qb.order = (col: string, opts: unknown) => { orderCalls.push([col, opts]); return qb }
  qb.in = () => qb
  qb.single = singleFn
  // Thenable: allows `await query` without .single() (update, list)
  qb.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)

  const setResolve = (data: unknown, error: unknown = null) => {
    resolveWith = { data, error }
    singleFn.mockResolvedValue({ data, error })
  }
  const reset = () => {
    insertCalls.length = 0
    updateCalls.length = 0
    eqCalls.length = 0
    orderCalls.length = 0
    resolveWith = { data: null, error: null }
    singleFn.mockReset()
  }

  return { qb, singleFn, insertCalls, updateCalls, eqCalls, orderCalls, setResolve, reset }
})

// Also mock logEvent to avoid audit DB calls
vi.mock('@/services/audit', () => ({ logEvent: vi.fn() }))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => supabaseMocks.qb,
  }),
}))

import {
  createMediaItem,
  updateMediaItem,
  getMediaItem,
  listByChat,
  listByMember,
} from './index'
import type { CreateMediaItemInput, MediaItem } from './index'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INPUT: CreateMediaItemInput = {
  id: 'media-123',
  tenant_id: 'tenant-abc',
  member_id: 'member-xyz',
  chat_id: 'chat-001',
  type: 'image',
  original_filename: 'photo.jpg',
  storage_path: 'tenants/tenant-abc/media-123/photo.jpg',
  file_size_bytes: 102400,
  mime_type: 'image/jpeg',
}

const ITEM: MediaItem = {
  ...INPUT,
  story_id: null,
  status: 'pending',
  derived_content: null,
  classification: null,
  error_message: null,
  processed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  supabaseMocks.reset()
})

// ── createMediaItem ───────────────────────────────────────────────────────────

describe('createMediaItem', () => {
  it('inserts with status: pending and returns the created record', async () => {
    supabaseMocks.setResolve(ITEM)

    const result = await createMediaItem(INPUT)

    expect(result).toEqual(ITEM)

    const inserted = supabaseMocks.insertCalls[0] as Record<string, unknown>
    expect(inserted.status).toBe('pending')
    expect(inserted.id).toBe('media-123')
    expect(inserted.tenant_id).toBe('tenant-abc')
    expect(inserted.story_id).toBeNull()
  })

  it('throws when Supabase returns an error', async () => {
    supabaseMocks.setResolve(null, { message: 'unique constraint violated' })

    await expect(createMediaItem(INPUT)).rejects.toThrow(
      'Failed to create media item: unique constraint violated',
    )
  })

  it('throws when data is null with no error message', async () => {
    supabaseMocks.setResolve(null, null)

    await expect(createMediaItem(INPUT)).rejects.toThrow('Failed to create media item')
  })
})

// ── updateMediaItem ───────────────────────────────────────────────────────────

describe('updateMediaItem', () => {
  it('updates only supplied fields plus updated_at', async () => {
    supabaseMocks.setResolve(null, null) // update returns { data: null, error: null }

    await updateMediaItem('media-123', { status: 'ready', derived_content: 'text here' })

    const updated = supabaseMocks.updateCalls[0] as Record<string, unknown>
    expect(updated.status).toBe('ready')
    expect(updated.derived_content).toBe('text here')
    expect(typeof updated.updated_at).toBe('string') // ISO timestamp set by the service
  })

  it('scopes update by id via eq', async () => {
    supabaseMocks.setResolve(null, null)

    await updateMediaItem('media-123', { status: 'failed' })

    const idEq = supabaseMocks.eqCalls.find(([col]) => col === 'id')
    expect(idEq).toBeDefined()
    expect(idEq![1]).toBe('media-123')
  })

  it('throws on Supabase error', async () => {
    supabaseMocks.setResolve(null, { message: 'permission denied' })

    await expect(updateMediaItem('media-123', { status: 'failed' })).rejects.toThrow(
      'Failed to update media item: permission denied',
    )
  })
})

// ── getMediaItem ──────────────────────────────────────────────────────────────

describe('getMediaItem', () => {
  it('returns the item when found', async () => {
    supabaseMocks.setResolve(ITEM)

    const result = await getMediaItem('media-123', 'tenant-abc')
    expect(result).toEqual(ITEM)
  })

  it('scopes query by both id and tenant_id', async () => {
    supabaseMocks.setResolve(ITEM)

    await getMediaItem('media-123', 'tenant-abc')

    const idEq = supabaseMocks.eqCalls.find(([col]) => col === 'id')
    const tenantEq = supabaseMocks.eqCalls.find(([col]) => col === 'tenant_id')
    expect(idEq![1]).toBe('media-123')
    expect(tenantEq![1]).toBe('tenant-abc')
  })

  it('returns null on Supabase error', async () => {
    supabaseMocks.setResolve(null, { message: 'not found' })

    const result = await getMediaItem('media-123', 'tenant-abc')
    expect(result).toBeNull()
  })
})

// ── listByChat ────────────────────────────────────────────────────────────────

describe('listByChat', () => {
  it('returns items ordered by created_at asc', async () => {
    const items = [ITEM, { ...ITEM, id: 'media-456' }]
    supabaseMocks.setResolve(items)

    const result = await listByChat('chat-001', 'tenant-abc')
    expect(result).toEqual(items)

    const orderCall = supabaseMocks.orderCalls[0]
    expect(orderCall[0]).toBe('created_at')
    expect((orderCall[1] as any).ascending).toBe(true)
  })

  it('scopes by chat_id and tenant_id', async () => {
    supabaseMocks.setResolve([])

    await listByChat('chat-001', 'tenant-abc')

    expect(supabaseMocks.eqCalls).toContainEqual(['chat_id', 'chat-001'])
    expect(supabaseMocks.eqCalls).toContainEqual(['tenant_id', 'tenant-abc'])
  })

  it('returns [] on Supabase error', async () => {
    supabaseMocks.setResolve(null, { message: 'DB error' })

    const result = await listByChat('chat-001', 'tenant-abc')
    expect(result).toEqual([])
  })

  it('returns [] when data is null with no error', async () => {
    supabaseMocks.setResolve(null)

    const result = await listByChat('chat-001', 'tenant-abc')
    expect(result).toEqual([])
  })
})

// ── listByMember ──────────────────────────────────────────────────────────────

describe('listByMember', () => {
  it('returns items ordered by created_at desc', async () => {
    const items = [ITEM]
    supabaseMocks.setResolve(items)

    const result = await listByMember('member-xyz', 'tenant-abc')
    expect(result).toEqual(items)

    const orderCall = supabaseMocks.orderCalls[0]
    expect(orderCall[0]).toBe('created_at')
    expect((orderCall[1] as any).ascending).toBe(false)
  })

  it('scopes by member_id and tenant_id', async () => {
    supabaseMocks.setResolve([])

    await listByMember('member-xyz', 'tenant-abc')

    expect(supabaseMocks.eqCalls).toContainEqual(['member_id', 'member-xyz'])
    expect(supabaseMocks.eqCalls).toContainEqual(['tenant_id', 'tenant-abc'])
  })

  it('returns [] on Supabase error', async () => {
    supabaseMocks.setResolve(null, { message: 'DB error' })

    const result = await listByMember('member-xyz', 'tenant-abc')
    expect(result).toEqual([])
  })
})
