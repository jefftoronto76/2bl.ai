// Covers the same-turn media-context gap: an item attached in the current
// turn is almost always still `pending` in the DB by the time this same
// request builds its system prompt (processing is async, triggered by a
// separate webhook). Before this fix, resolveMediaContext only ever
// surfaced `status='ready'` rows, so a same-turn attach produced zero
// signal — the model had no way to know an attach had just happened.
//
// Also covers stripMediaMarkers' companion fix: a turn that was ONLY an
// attachment marker (no typed caption) must never collapse to empty
// content once the marker is stripped.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MediaAttachmentInput } from './types'

let queryResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }

function makeQueryBuilder() {
  const builder: {
    select: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    not: ReturnType<typeof vi.fn>
    then: (resolve: (v: typeof queryResult) => void, reject?: (e: unknown) => void) => Promise<void>
  } = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(queryResult).then(resolve, reject),
  }
  return builder
}

const mockFrom = vi.fn(() => makeQueryBuilder())

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

import { resolveMediaContext, stripMediaMarkers } from './media-context'

beforeEach(() => {
  queryResult = { data: [], error: null }
  mockFrom.mockClear()
})

describe('resolveMediaContext', () => {
  const singleItem: MediaAttachmentInput[] = [
    { mediaItemId: 'id-1', type: 'image', filename: 'dog.jpg' },
  ]

  it('returns "" when mediaItems is null/empty', async () => {
    expect(await resolveMediaContext(null, 'tenant-1', 'member-1')).toBe('')
    expect(await resolveMediaContext([], 'tenant-1', 'member-1')).toBe('')
  })

  it('returns "" when tenantId or memberId is missing', async () => {
    expect(await resolveMediaContext(singleItem, null, 'member-1')).toBe('')
    expect(await resolveMediaContext(singleItem, 'tenant-1', null)).toBe('')
  })

  it('regression: an item already ready by request time still surfaces ATTACHED MEDIA (existing path unchanged)', async () => {
    queryResult = {
      data: [
        { id: 'id-1', original_filename: 'dog.jpg', type: 'image', derived_content: 'A photo of a dog.' },
      ],
      error: null,
    }
    const result = await resolveMediaContext(singleItem, 'tenant-1', 'member-1')
    expect(result).toBe('ATTACHED MEDIA:\n\n[dog.jpg (image)]\nA photo of a dog.')
  })

  it('the fix: an item still pending at request time gets an ATTACHMENT IN PROGRESS line, not silence', async () => {
    queryResult = { data: [], error: null } // nothing ready yet — the common same-turn case
    const result = await resolveMediaContext(singleItem, 'tenant-1', 'member-1')
    expect(result).toBe('ATTACHMENT IN PROGRESS: dog.jpg (image), still processing')
  })

  it('attach-of-multiple-items: some ready, some still pending — both sections present together', async () => {
    const multi: MediaAttachmentInput[] = [
      { mediaItemId: 'id-1', type: 'image', filename: 'dog.jpg' },
      { mediaItemId: 'id-2', type: 'document', filename: 'letter.pdf' },
      { mediaItemId: 'id-3', type: 'audio', filename: 'memo.m4a' },
    ]
    queryResult = {
      data: [
        { id: 'id-1', original_filename: 'dog.jpg', type: 'image', derived_content: 'A photo of a dog.' },
      ],
      error: null,
    }
    const result = await resolveMediaContext(multi, 'tenant-1', 'member-1')
    expect(result).toBe(
      'ATTACHED MEDIA:\n\n[dog.jpg (image)]\nA photo of a dog.\n\n' +
        'ATTACHMENT IN PROGRESS: letter.pdf (document), still processing\n' +
        'ATTACHMENT IN PROGRESS: memo.m4a (audio), still processing',
    )
  })

  it('attach-of-multiple-items: all still pending — one IN PROGRESS line per item, no ATTACHED MEDIA section', async () => {
    const multi: MediaAttachmentInput[] = [
      { mediaItemId: 'id-2', type: 'document', filename: 'letter.pdf' },
      { mediaItemId: 'id-3', type: 'audio', filename: 'memo.m4a' },
    ]
    queryResult = { data: [], error: null }
    const result = await resolveMediaContext(multi, 'tenant-1', 'member-1')
    expect(result).toBe(
      'ATTACHMENT IN PROGRESS: letter.pdf (document), still processing\n' +
        'ATTACHMENT IN PROGRESS: memo.m4a (audio), still processing',
    )
  })

  it('returns "" on a DB error rather than guessing at status', async () => {
    queryResult = { data: null, error: { message: 'boom' } }
    const result = await resolveMediaContext(singleItem, 'tenant-1', 'member-1')
    expect(result).toBe('')
  })
})

describe('stripMediaMarkers', () => {
  it('attach-with-caption: strips the marker, keeps the typed caption as-is', () => {
    const messages = [
      { role: 'user' as const, content: '[MEDIA_UPLOAD: dog.jpg | id-1 | image]\nhow does this look?' },
    ]
    const result = stripMediaMarkers(messages)
    expect(result[0].content).toBe('how does this look?')
  })

  it('the fix — attach-with-no-caption: never sends empty content to the model', () => {
    const messages = [{ role: 'user' as const, content: '[MEDIA_UPLOAD: dog.jpg | id-1 | image]' }]
    const result = stripMediaMarkers(messages)
    expect(result[0].content.length).toBeGreaterThan(0)
    expect(result[0].content).toBe('(Sent dog.jpg with no message.)')
  })

  it('attach-of-multiple-items with no caption: fallback names every file', () => {
    const messages = [
      {
        role: 'user' as const,
        content: '[MEDIA_UPLOAD: dog.jpg | id-1 | image]\n[MEDIA_UPLOAD: letter.pdf | id-2 | document]',
      },
    ]
    const result = stripMediaMarkers(messages)
    expect(result[0].content).toBe('(Sent 2 files with no message: dog.jpg, letter.pdf.)')
  })

  it('attach-of-multiple-items WITH a caption: markers strip, typed caption is preserved (not overwritten by fallback)', () => {
    const messages = [
      {
        role: 'user' as const,
        content:
          '[MEDIA_UPLOAD: dog.jpg | id-1 | image]\n[MEDIA_UPLOAD: letter.pdf | id-2 | document]\nhere is what I found',
      },
    ]
    const result = stripMediaMarkers(messages)
    expect(result[0].content).toBe('here is what I found')
  })

  it('regression: messages with no marker at all pass through unchanged (same array reference)', () => {
    const messages = [
      { role: 'user' as const, content: 'hello there' },
      { role: 'assistant' as const, content: 'hi! how can I help?' },
    ]
    const result = stripMediaMarkers(messages)
    expect(result).toBe(messages)
  })

  it('regression: an assistant message is never touched even if it happens to contain marker-shaped text', () => {
    const messages = [{ role: 'assistant' as const, content: '[MEDIA_UPLOAD: x | y | z]' }]
    const result = stripMediaMarkers(messages)
    expect(result).toBe(messages)
    expect(result[0].content).toBe('[MEDIA_UPLOAD: x | y | z]')
  })
})
