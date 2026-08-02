// Covers the batch signed-url attachment used to fix the reload slowness bug:
// GET /api/media used to return bare rows, forcing every InlineImage in a
// reloaded conversation to do its own per-image GET /api/media/[id]/url round
// trip. withDisplayUrl attaches a signed url per image item in the batch
// response itself, generated in parallel across the whole list.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaItem } from '@/services/media'

const mockGenerateSignedDownloadUrl = vi.fn()

vi.mock('@/services/media/storage', () => ({
  generateSignedDownloadUrl: (...args: unknown[]) => mockGenerateSignedDownloadUrl(...args),
}))

import { withDisplayUrl } from '@/services/media/display-url'

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
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
    status: 'ready',
    derived_content: 'A photo of a dog.',
    classification: 'photo',
    error_message: null,
    processed_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockGenerateSignedDownloadUrl.mockReset()
})

describe('withDisplayUrl', () => {
  it('attaches a signed url for image items', async () => {
    mockGenerateSignedDownloadUrl.mockResolvedValueOnce('https://signed.example/dog.jpg')

    const result = await withDisplayUrl(makeItem({ type: 'image' }))

    expect(result.url).toBe('https://signed.example/dog.jpg')
    expect(mockGenerateSignedDownloadUrl).toHaveBeenCalledWith(
      'tenant-1/media/member-1/item-1/dog.jpg',
    )
  })

  it('does not sign a url for audio items — chips have no inline preview', async () => {
    const result = await withDisplayUrl(makeItem({ type: 'audio' }))

    expect(result.url).toBeNull()
    expect(mockGenerateSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('does not sign a url for document items', async () => {
    const result = await withDisplayUrl(makeItem({ type: 'document' }))

    expect(result.url).toBeNull()
    expect(mockGenerateSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('falls back to url: null (not a thrown error) when signing fails', async () => {
    mockGenerateSignedDownloadUrl.mockRejectedValueOnce(new Error('signing service down'))

    const result = await withDisplayUrl(makeItem({ type: 'image' }))

    expect(result.url).toBeNull()
  })

  it('preserves every other field on the item unchanged', async () => {
    mockGenerateSignedDownloadUrl.mockResolvedValueOnce('https://signed.example/dog.jpg')
    const item = makeItem({ type: 'image' })

    const result = await withDisplayUrl(item)

    expect(result).toMatchObject(item)
  })
})
