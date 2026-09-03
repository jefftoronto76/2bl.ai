import { describe, it, expect } from 'vitest'
import { mergeMediaItem, mergeMediaItems } from './mediaItemMerge'
import type { ClientMediaItem } from './chatStore'

function makeItem(overrides: Partial<ClientMediaItem> = {}): ClientMediaItem {
  return {
    id: 'item-1',
    tenant_id: 'tenant-1',
    member_id: 'member-1',
    chat_id: 'chat-1',
    story_id: null,
    type: 'image',
    original_filename: 'dog.jpg',
    storage_path: 'tenant-1/media/member-1/item-1/dog.jpg',
    file_size_bytes: 1024,
    mime_type: 'image/jpeg',
    status: 'pending',
    derived_content: null,
    classification: null,
    error_message: null,
    processed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('mergeMediaItem', () => {
  it('with no previous item, passes the incoming item through as-is (url defaults to null)', () => {
    const incoming = makeItem()
    expect(mergeMediaItem(undefined, incoming)).toEqual({
      ...incoming,
      localPreviewUrl: undefined,
      url: null,
    })
  })

  it('preserves localPreviewUrl from the previous item when a Realtime/API update has none', () => {
    const prev = makeItem({ localPreviewUrl: 'blob:local-preview' })
    const incoming = makeItem({ status: 'ready', derived_content: 'A dog.' })

    const result = mergeMediaItem(prev, incoming)

    expect(result.localPreviewUrl).toBe('blob:local-preview')
    expect(result.status).toBe('ready')
    expect(result.derived_content).toBe('A dog.')
  })

  it('preserves a previously-fetched url when a Realtime update carries none', () => {
    const prev = makeItem({ url: 'https://signed.example/dog.jpg' })
    const incoming = makeItem({ status: 'ready' }) // Realtime payload — no url field

    const result = mergeMediaItem(prev, incoming)

    expect(result.url).toBe('https://signed.example/dog.jpg')
  })

  it('prefers a fresh non-null url from the incoming item over the previous one', () => {
    const prev = makeItem({ url: 'https://signed.example/stale.jpg' })
    const incoming = makeItem({ url: 'https://signed.example/fresh.jpg' })

    const result = mergeMediaItem(prev, incoming)

    expect(result.url).toBe('https://signed.example/fresh.jpg')
  })

  it('falls back to the previous url when the incoming one is explicitly null (a transient signing failure)', () => {
    const prev = makeItem({ url: 'https://signed.example/dog.jpg' })
    const incoming = makeItem({ url: null })

    const result = mergeMediaItem(prev, incoming)

    expect(result.url).toBe('https://signed.example/dog.jpg')
  })
})

// Regression coverage for the chronological-order bug: all three merge sites
// (chatStore.tsx's catch-up fetch, poll fetch, and addMediaItem) used to push
// an unmatched incoming item onto the end of the array unconditionally,
// regardless of its actual created_at relative to items already present. A
// late-arriving item (a missed Realtime event only caught by a later poll,
// or a catch-up fetch racing a fresh upload) could have an EARLIER created_at
// than items already in the array, and would still land last — visually
// jumping to the wrong position once rendered in chatStore.tsx's created_at
// order. mergeMediaItems is the one shared merge+sort path all three sites
// now go through.
describe('mergeMediaItems', () => {
  it('sorts newly-appended items into their correct chronological position, not just onto the end', () => {
    const prev = [
      makeItem({ id: 'a', created_at: '2026-08-01T00:00:00.000Z' }),
      makeItem({ id: 'c', created_at: '2026-08-01T00:02:00.000Z' }),
    ]
    // 'b' arrives late (e.g. a missed Realtime event caught by a poll) with a
    // created_at between 'a' and 'c' — it must land in the middle, not at the
    // end just because it was fetched last.
    const incoming = [makeItem({ id: 'b', created_at: '2026-08-01T00:01:00.000Z' })]

    const result = mergeMediaItems(prev, incoming)

    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('re-sorts an updated-in-place item too, if somehow its created_at moved it out of order', () => {
    const prev = [
      makeItem({ id: 'a', created_at: '2026-08-01T00:00:00.000Z', status: 'pending' }),
      makeItem({ id: 'b', created_at: '2026-08-01T00:01:00.000Z', status: 'ready' }),
    ]
    // A status update for an existing item — id already present, so this hits
    // the update-in-place branch, not the append branch. The sort still runs
    // unconditionally after either branch.
    const incoming = [makeItem({ id: 'a', created_at: '2026-08-01T00:00:00.000Z', status: 'ready' })]

    const result = mergeMediaItems(prev, incoming)

    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
    expect(result[0].status).toBe('ready')
  })

  it('merges multiple incoming items into their correct positions in one call', () => {
    const prev = [makeItem({ id: 'b', created_at: '2026-08-01T00:01:00.000Z' })]
    const incoming = [
      makeItem({ id: 'c', created_at: '2026-08-01T00:02:00.000Z' }),
      makeItem({ id: 'a', created_at: '2026-08-01T00:00:00.000Z' }),
    ]

    const result = mergeMediaItems(prev, incoming)

    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('preserves relative order for items sharing the same created_at (stable sort)', () => {
    const same = '2026-08-01T00:00:00.000Z'
    const prev = [makeItem({ id: 'a', created_at: same }), makeItem({ id: 'b', created_at: same })]
    const incoming = [makeItem({ id: 'c', created_at: same })]

    const result = mergeMediaItems(prev, incoming)

    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the previous array (returns a new one)', () => {
    const prev = [makeItem({ id: 'a', created_at: '2026-08-01T00:00:00.000Z' })]
    const incoming = [makeItem({ id: 'b', created_at: '2026-08-01T00:01:00.000Z' })]

    const result = mergeMediaItems(prev, incoming)

    expect(prev).toHaveLength(1)
    expect(result).toHaveLength(2)
    expect(result).not.toBe(prev)
  })

  it('an empty incoming batch returns the previous order unchanged', () => {
    const prev = [
      makeItem({ id: 'a', created_at: '2026-08-01T00:00:00.000Z' }),
      makeItem({ id: 'b', created_at: '2026-08-01T00:01:00.000Z' }),
    ]

    const result = mergeMediaItems(prev, [])

    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
  })
})
