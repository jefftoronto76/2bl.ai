import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaAttachmentInput } from '../../types'
import { makeInput } from '../test-input'

const mockResolveMediaContext = vi.fn<
  (items: MediaAttachmentInput[] | null | undefined, tenantId: string | null, memberId: string | null) => Promise<string>
>()
vi.mock('../../media-context', () => ({
  resolveMediaContext: (...args: [MediaAttachmentInput[] | null | undefined, string | null, string | null]) =>
    mockResolveMediaContext(...args),
}))

import { mediaProvider } from './media'

const items: MediaAttachmentInput[] = [{ mediaItemId: 'm1', type: 'image', filename: 'a.jpg' }]

beforeEach(() => mockResolveMediaContext.mockReset())

describe('mediaProvider', () => {
  it('applies only with items AND a tenant AND a member — the resolver\'s own early-return, mirrored', () => {
    expect(mediaProvider.appliesTo(makeInput({ mediaItems: items, tenantId: 't', memberId: 'm' }))).toBe(true)
    expect(mediaProvider.appliesTo(makeInput({ mediaItems: [], tenantId: 't', memberId: 'm' }))).toBe(false)
    expect(mediaProvider.appliesTo(makeInput({ mediaItems: null, tenantId: 't', memberId: 'm' }))).toBe(false)
    expect(mediaProvider.appliesTo(makeInput({ mediaItems: items, tenantId: null, memberId: 'm' }))).toBe(false)
    // Anonymous Sage visitors never get a media section today; that stays true.
    expect(mediaProvider.appliesTo(makeInput({ mediaItems: items, tenantId: 't', memberId: null }))).toBe(false)
  })

  it('returns the media section verbatim', async () => {
    mockResolveMediaContext.mockResolvedValue('ATTACHED MEDIA:\n\n[a.jpg (image)]\nA photo of a dog.')
    const out = await mediaProvider.resolve(makeInput({ mediaItems: items, tenantId: 't', memberId: 'm' }))
    expect(out).toBe('ATTACHED MEDIA:\n\n[a.jpg (image)]\nA photo of a dog.')
    expect(mockResolveMediaContext).toHaveBeenCalledWith(items, 't', 'm')
  })
})
