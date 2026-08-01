import { describe, it, expect } from 'vitest'
import { mergeMediaItem } from './mediaItemMerge'
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
