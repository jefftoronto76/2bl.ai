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

import { sweepStaleProcessingItems, MAX_PROCESSING_AGE_SECONDS } from './index'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    type: 'image',
    mime_type: 'image/jpeg',
    original_filename: 'photo.jpg',
    file_size_bytes: 1000,
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
