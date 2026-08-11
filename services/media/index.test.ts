// Covers sweepStaleProcessingItems — the query + per-row guarded update the
// stale-processing sweep (app/api/cron/media-sweep) and the retry route's
// stale-processing backstop both rely on. Per-type threshold correctness
// matters most here: MAX_PROCESSING_AGE_SECONDS is a judgment call for
// document/audio (see System Docs/Utilities/Media.md's "Known Unknowns"
// section) and a real regression risk is one type's threshold silently
// applying to another.

import { describe, it, expect, vi, beforeEach } from 'vitest'

let selectResult: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
}
let updateResults: Array<{ data: unknown[] | null; error: { message: string } | null }> = []

// Mimics supabase-js's chainable, thenable query builder: every method
// returns the same object, and awaiting it resolves to a preset result —
// close enough to the real client for these tests, which only ever chain
// .eq()/.select() before awaiting.
function chainable(result: unknown) {
  const builder: {
    eq: () => typeof builder
    select: () => typeof builder
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
  } = {
    eq: () => builder,
    select: () => builder,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

const mockFrom = vi.fn(() => ({
  select: () => chainable(selectResult),
  // Each call consumes the next queued result, in the order sweepStaleProcessingItems
  // issues its per-row guarded updates.
  update: () => chainable(updateResults.shift() ?? { data: [], error: null }),
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('@/services/audit', () => ({ logEvent: vi.fn() }))

const mockObjectExists = vi.fn()
vi.mock('./storage', () => ({
  objectExists: (...args: unknown[]) => mockObjectExists(...args),
}))

import {
  sweepStaleProcessingItems,
  MAX_PROCESSING_AGE_SECONDS,
  sweepStalePendingItems,
  MAX_PENDING_AGE_SECONDS,
} from './index'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    type: 'image',
    mime_type: 'image/jpeg',
    original_filename: 'photo.jpg',
    file_size_bytes: 1000,
    storage_path: 'tenant-1/media/member-1/item-1/photo.jpg',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function ageIsoString(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString()
}

beforeEach(() => {
  selectResult = { data: [], error: null }
  updateResults = []
  mockFrom.mockClear()
  mockObjectExists.mockReset()
})

describe('sweepStaleProcessingItems', () => {
  it('returns empty when there are no processing rows', async () => {
    expect(await sweepStaleProcessingItems()).toEqual([])
  })

  it('returns empty on a query error rather than throwing', async () => {
    selectResult = { data: null, error: { message: 'boom' } }
    expect(await sweepStaleProcessingItems()).toEqual([])
  })

  it('leaves an image row within its 300s threshold alone', async () => {
    selectResult = { data: [makeRow({ created_at: ageIsoString(60) })], error: null }
    expect(await sweepStaleProcessingItems()).toEqual([])
    // Only the initial select — no update attempted for a non-stale row.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('sweeps an image row past its 300s threshold', async () => {
    const stale = makeRow({ id: 'stale-image', created_at: ageIsoString(400) })
    selectResult = { data: [stale], error: null }
    updateResults = [{ data: [{ id: 'stale-image' }], error: null }]

    const swept = await sweepStaleProcessingItems()
    expect(swept.map((s) => s.id)).toEqual(['stale-image'])
  })

  it('applies per-type thresholds — a document row is left alone at an age that would be stale for an image', async () => {
    const doc = makeRow({ id: 'doc-1', type: 'document', created_at: ageIsoString(400) })
    selectResult = { data: [doc], error: null }
    expect(await sweepStaleProcessingItems()).toEqual([])
  })

  it('sweeps a document row past its 600s threshold', async () => {
    const doc = makeRow({ id: 'doc-stale', type: 'document', created_at: ageIsoString(700) })
    selectResult = { data: [doc], error: null }
    updateResults = [{ data: [{ id: 'doc-stale' }], error: null }]

    expect((await sweepStaleProcessingItems()).map((s) => s.id)).toEqual(['doc-stale'])
  })

  it('applies the audio threshold (5400s) — a 1hr-old row is left alone, a 2hr-old one is swept', async () => {
    const notYetStale = makeRow({ id: 'audio-fresh', type: 'audio', created_at: ageIsoString(60 * 60) })
    const stale = makeRow({ id: 'audio-stale', type: 'audio', created_at: ageIsoString(2 * 60 * 60) })
    selectResult = { data: [notYetStale, stale], error: null }
    updateResults = [{ data: [{ id: 'audio-stale' }], error: null }]

    expect((await sweepStaleProcessingItems()).map((s) => s.id)).toEqual(['audio-stale'])
  })

  it('does not count a row whose guarded update matched nothing — it left processing in the gap between select and update', async () => {
    const stale = makeRow({ id: 'raced', created_at: ageIsoString(400) })
    selectResult = { data: [stale], error: null }
    updateResults = [{ data: [], error: null }]

    expect(await sweepStaleProcessingItems()).toEqual([])
  })

  it('skips a row whose update errors, without throwing', async () => {
    const stale = makeRow({ id: 'update-fails', created_at: ageIsoString(400) })
    selectResult = { data: [stale], error: null }
    updateResults = [{ data: null, error: { message: 'db error' } }]

    await expect(sweepStaleProcessingItems()).resolves.toEqual([])
  })

  it('MAX_PROCESSING_AGE_SECONDS matches the approved per-type thresholds', () => {
    expect(MAX_PROCESSING_AGE_SECONDS).toEqual({ image: 300, document: 600, audio: 5400 })
  })
})

describe('sweepStalePendingItems', () => {
  it('returns empty buckets when there are no pending rows', async () => {
    expect(await sweepStalePendingItems()).toEqual({ recovered: [], abandoned: [] })
  })

  it('returns empty buckets on a query error rather than throwing', async () => {
    selectResult = { data: null, error: { message: 'boom' } }
    expect(await sweepStalePendingItems()).toEqual({ recovered: [], abandoned: [] })
  })

  it('leaves a pending row within MAX_PENDING_AGE_SECONDS alone — no objectExists check, no update', async () => {
    selectResult = { data: [makeRow({ created_at: ageIsoString(10) })], error: null }
    expect(await sweepStalePendingItems()).toEqual({ recovered: [], abandoned: [] })
    expect(mockObjectExists).not.toHaveBeenCalled()
  })

  it('buckets a stale pending row as recovered when its file IS in Storage, without touching the DB', async () => {
    const item = makeRow({ id: 'recovered-1', created_at: ageIsoString(200) })
    selectResult = { data: [item], error: null }
    mockObjectExists.mockResolvedValue(true)

    const result = await sweepStalePendingItems()

    expect(result.recovered.map((r) => r.id)).toEqual(['recovered-1'])
    expect(result.abandoned).toEqual([])
    expect(mockObjectExists).toHaveBeenCalledWith(item.storage_path)
    // No update() call for a recovered row — only the initial select + the objectExists check.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('flips a stale pending row to failed when its file is NOT in Storage — genuinely abandoned', async () => {
    const item = makeRow({ id: 'abandoned-1', created_at: ageIsoString(200) })
    selectResult = { data: [item], error: null }
    mockObjectExists.mockResolvedValue(false)
    updateResults = [{ data: [{ id: 'abandoned-1' }], error: null }]

    const result = await sweepStalePendingItems()

    expect(result.recovered).toEqual([])
    expect(result.abandoned.map((a) => a.id)).toEqual(['abandoned-1'])
  })

  it('does not count an abandoned row whose guarded update matched nothing', async () => {
    const item = makeRow({ id: 'raced', created_at: ageIsoString(200) })
    selectResult = { data: [item], error: null }
    mockObjectExists.mockResolvedValue(false)
    updateResults = [{ data: [], error: null }]

    expect(await sweepStalePendingItems()).toEqual({ recovered: [], abandoned: [] })
  })

  it('MAX_PENDING_AGE_SECONDS is 120', () => {
    expect(MAX_PENDING_AGE_SECONDS).toBe(120)
  })
})
