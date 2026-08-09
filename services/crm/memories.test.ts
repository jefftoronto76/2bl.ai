// Coverage for the verbatim create path (no model call): title resolution
// ([MEMORY_TITLE] marker vs. the fallback truncation), verbatim body with
// every marker stripped, anchor-not-found handling, the title-only rename
// path, user_id resolution (Bug A), the audit_events logging added for
// every previously-silent failure branch (Bug C groundwork / Task 4), and
// the revise_blocks mutation (Memory Canvas V1 backend). Mocks
// @supabase/supabase-js's createClient directly (mirrors sessions.test.ts's
// own pattern) rather than @/services/auth/supabase-admin — services/crm/
// memories.ts's getAdminClient() and services/crm/sessions.ts's own LOCAL
// getAdminClient(label) helper (a separate, file-local function, not the
// shared one) both bottom out in the same @supabase/supabase-js createClient
// call, so mocking it there is what actually covers both
// createMemoryFromAnchor's own writes/lookups and its call into
// getSessionMessages. reviseMemoryBlocks's own dependency on
// services/media's getMediaItem/listByChat is mocked directly instead
// (that module's own query-building has its own coverage — this file is
// only testing memories.ts's orchestration of it).
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => adminHolder.client,
}))
vi.mock('@/services/audit', () => ({ logEvent: vi.fn() }))

const mockGetMediaItem = vi.fn()
const mockListByChat = vi.fn()
vi.mock('@/services/media', () => ({
  getMediaItem: (...args: unknown[]) => mockGetMediaItem(...args),
  listByChat: (...args: unknown[]) => mockListByChat(...args),
}))

import {
  createMemoryFromAnchor,
  createPhotoMemoryFromMedia,
  renameMemory,
  reviseMemoryBlocks,
  deriveFallbackMemoryTitle,
  createDraftMemory,
  ACCOUNT_REQUIRED_ERROR,
} from './memories'
import { logEvent } from '@/services/audit'

const mockLogEvent = vi.mocked(logEvent)

type Row = Record<string, unknown>
type SelectResult = { data: Row | null; error: { message: string } | null }

function makeClient(opts: {
  sessionMessages?: Row[]
  sessionLookupResult?: SelectResult
  memberResult?: SelectResult
  insertResult?: SelectResult
  updateResult?: SelectResult
}) {
  const insertCalls: Row[] = []
  const updateCalls: Row[] = []
  const memberLookupCalls: string[] = []

  const client = {
    from(table: string) {
      if (table === 'chat_sessions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  opts.sessionLookupResult ?? { data: { messages: opts.sessionMessages ?? [] }, error: null },
              }),
            }),
          }),
        }
      }
      if (table === 'members') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              memberLookupCalls.push(val)
              return {
                eq: () => ({
                  maybeSingle: async () => opts.memberResult ?? { data: null, error: null },
                }),
              }
            },
          }),
        }
      }
      if (table === 'artifacts') {
        return {
          insert: (row: Row) => {
            insertCalls.push(row)
            return {
              select: () => ({
                single: async () =>
                  opts.insertResult ?? { data: { ...row, id: 'mem-1', status: 'draft', created_at: 'now', updated_at: 'now' }, error: null },
              }),
            }
          },
          update: (patch: Row) => {
            updateCalls.push(patch)
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      select: () => ({
                        maybeSingle: async () => opts.updateResult ?? { data: null, error: { message: 'not configured' } },
                      }),
                    }),
                  }),
                }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  return { client, insertCalls, updateCalls, memberLookupCalls }
}

/** A memberId that resolves to a linked account — the common non-anonymous case. */
const LINKED_MEMBER_RESULT: SelectResult = { data: { user_id: 'user-1' }, error: null }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  mockLogEvent.mockClear()
  mockGetMediaItem.mockReset()
  mockListByChat.mockReset().mockResolvedValue([])
})

describe('deriveFallbackMemoryTitle', () => {
  it('returns short text unchanged', () => {
    expect(deriveFallbackMemoryTitle('A short memory.')).toBe('A short memory.')
  })

  it('collapses internal whitespace', () => {
    expect(deriveFallbackMemoryTitle('Line one\n\n  line two')).toBe('Line one line two')
  })

  it('truncates at the last word boundary under the 60-char cap, with an ellipsis', () => {
    const long = 'This is a much longer message than sixty characters that should get truncated cleanly'
    const result = deriveFallbackMemoryTitle(long)
    expect(result.length).toBeLessThanOrEqual(61) // 60 chars + ellipsis glyph
    expect(result.endsWith('…')).toBe(true)
    expect(result.slice(0, -1).endsWith(' ')).toBe(false)
  })

  it('falls back to a hard cut when there is no space within the cap', () => {
    const noSpaces = 'a'.repeat(80)
    expect(deriveFallbackMemoryTitle(noSpaces)).toBe(`${'a'.repeat(60)}…`)
  })
})

describe('createMemoryFromAnchor', () => {
  it('uses the [MEMORY_TITLE] marker when present, and strips every marker from the verbatim body', async () => {
    const { client, insertCalls } = makeClient({
      sessionMessages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'It was a quiet summer by the lake. [MEMORY_TITLE: The Lake House] [SAVE_MEMORY]',
        },
      ],
      memberResult: LINKED_MEMBER_RESULT,
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: 'member-1',
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(true)
    expect(insertCalls[0].title).toBe('The Lake House')
    expect(insertCalls[0].body).toBe('It was a quiet summer by the lake.')
    expect(insertCalls[0].user_id).toBe('user-1')
  })

  it('falls back to a truncated title when no [MEMORY_TITLE] marker is present — the common case', async () => {
    const { client, insertCalls } = makeClient({
      sessionMessages: [{ id: 'm1', role: 'user', content: 'What made you decide to capture that memory when you did?' }],
      memberResult: LINKED_MEMBER_RESULT,
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: 'member-1',
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(true)
    expect(insertCalls[0].title).toBe('What made you decide to capture that memory when you did?')
    expect(insertCalls[0].body).toBe('What made you decide to capture that memory when you did?')
    expect(insertCalls[0].user_id).toBe('user-1')
  })

  // Regression (2026-08-08): bookmarking a photo message via the
  // whole-message "Keep this as a memory" button (as opposed to
  // PhotoUploadActions.tsx's per-photo Bookmark) used to leave the raw
  // [MEDIA_UPLOAD: ...] marker in both the fallback title and the body,
  // since the marker registry never learned this marker type — see
  // services/chat/ui/v1/registry.ts's MEDIA_UPLOAD_MARKER. This is the
  // exact anchor content shape a photo-with-caption user message has.
  it("strips a [MEDIA_UPLOAD: ...] marker from the anchor content, leaving only the person's own typed caption", async () => {
    const { client, insertCalls } = makeClient({
      sessionMessages: [
        {
          id: 'm1',
          role: 'user',
          content: '[MEDIA_UPLOAD: Jeff_L.jpeg | c6791970-5a98-4681-a20c-32867de9d153 | image] This is a picture of me.',
        },
      ],
      memberResult: LINKED_MEMBER_RESULT,
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: 'member-1',
      sourceKind: 'photo',
    })

    expect(result.ok).toBe(true)
    expect(insertCalls[0].body).toBe('This is a picture of me.')
    expect(insertCalls[0].title).toBe('This is a picture of me.')
    expect(insertCalls[0].body).not.toContain('MEDIA_UPLOAD')
    expect(insertCalls[0].title).not.toContain('MEDIA_UPLOAD')
    // No media_item_id — this creation path never attaches one; only
    // createPhotoMemoryFromMedia does (see that function's own tests below).
    expect(insertCalls[0].media_item_id).toBe(null)
  })

  it('returns a 400 when the anchor message id has no match in the session, and logs the failure', async () => {
    const { client } = makeClient({ sessionMessages: [{ id: 'other', role: 'assistant', content: 'hi' }] })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'missing',
      memberId: null,
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'anchor_not_found' }),
      }),
    )
  })

  it('returns a 400 and logs the failure when the anchor message has non-string content', async () => {
    const { client } = makeClient({
      sessionMessages: [{ id: 'm1', role: 'assistant', content: { not: 'a string' } }],
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: null,
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'anchor_content_not_string' }),
      }),
    )
  })

  it('returns a 500 and logs the failure when the session lookup itself fails', async () => {
    const { client } = makeClient({ sessionLookupResult: { data: null, error: { message: 'db unreachable' } } })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: null,
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'session_lookup_failed' }),
      }),
    )
  })

  it('rejects a message that is only markers, once stripped there is no body left, and logs the failure', async () => {
    const { client } = makeClient({
      sessionMessages: [{ id: 'm1', role: 'assistant', content: '[SAVE_MEMORY]' }],
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: null,
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'empty_body_after_marker_strip' }),
      }),
    )
  })
})

describe('createPhotoMemoryFromMedia', () => {
  const baseInput = {
    sessionId: 's1',
    anchorMessageId: 'm1',
    mediaItemId: 'media-1',
    memberId: 'member-1',
  }

  it("creates a draft memory from the photo's own derived_content caption, with anchor_message_id AND media_item_id both populated", async () => {
    mockGetMediaItem.mockResolvedValue({
      id: 'media-1',
      tenant_id: 'tenant-1',
      chat_id: 's1',
      status: 'ready',
      derived_content: 'A quiet afternoon by the lake.',
    })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])
    const { client, insertCalls } = makeClient({ memberResult: LINKED_MEMBER_RESULT })
    adminHolder.client = client

    const result = await createPhotoMemoryFromMedia('tenant-1', baseInput)

    expect(result.ok).toBe(true)
    expect(insertCalls[0].anchor_message_id).toBe('m1')
    expect(insertCalls[0].media_item_id).toBe('media-1')
    expect(insertCalls[0].source_kind).toBe('photo')
    expect(insertCalls[0].title).toBe('A quiet afternoon by the lake.')
    expect(insertCalls[0].body).toBe('A quiet afternoon by the lake.')
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEMORY_CREATED, outcome: 'success' }),
    )
  })

  it('truncates a long caption via deriveFallbackMemoryTitle, same as every other fallback-titled memory', async () => {
    const longCaption =
      'This is a much longer caption than sixty characters that should get truncated cleanly for the title'
    mockGetMediaItem.mockResolvedValue({
      id: 'media-1',
      tenant_id: 'tenant-1',
      chat_id: 's1',
      status: 'ready',
      derived_content: longCaption,
    })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])
    const { client, insertCalls } = makeClient({ memberResult: LINKED_MEMBER_RESULT })
    adminHolder.client = client

    const result = await createPhotoMemoryFromMedia('tenant-1', baseInput)

    expect(result.ok).toBe(true)
    expect(insertCalls[0].title).toBe(deriveFallbackMemoryTitle(longCaption))
    expect(insertCalls[0].title).not.toBe(longCaption)
  })

  it('409s (not 400) when the media item has not finished processing yet, with no insert attempted — the server-side race guard behind the client\'s own ready gate', async () => {
    mockGetMediaItem.mockResolvedValue({ id: 'media-1', tenant_id: 'tenant-1', chat_id: 's1', status: 'processing', derived_content: null })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])
    const { client, insertCalls } = makeClient({})
    adminHolder.client = client

    const result = await createPhotoMemoryFromMedia('tenant-1', baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(409)
    expect(insertCalls.length).toBe(0)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'media_item_not_ready' }),
      }),
    )
  })

  it("409s when the item is ready but derived_content is still null (the AI caption pass hasn't landed yet)", async () => {
    mockGetMediaItem.mockResolvedValue({ id: 'media-1', tenant_id: 'tenant-1', chat_id: 's1', status: 'ready', derived_content: null })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])

    const result = await createPhotoMemoryFromMedia('tenant-1', baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(409)
  })

  it('400s when the media item does not resolve for this tenant at all', async () => {
    mockGetMediaItem.mockResolvedValue(null)
    mockListByChat.mockResolvedValue([])

    const result = await createPhotoMemoryFromMedia('tenant-1', baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'media_item_not_in_session' }),
      }),
    )
  })

  it('400s when the media item belongs to a different session (tenant matches, but not a member of this chat)', async () => {
    mockGetMediaItem.mockResolvedValue({ id: 'media-1', tenant_id: 'tenant-1', chat_id: 'other-session', status: 'ready', derived_content: 'caption' })
    mockListByChat.mockResolvedValue([]) // this session's own media items — media-1 isn't among them

    const result = await createPhotoMemoryFromMedia('tenant-1', baseInput)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it("propagates createDraftMemory's own 401 account-required rejection for an anonymous visitor", async () => {
    mockGetMediaItem.mockResolvedValue({ id: 'media-1', tenant_id: 'tenant-1', chat_id: 's1', status: 'ready', derived_content: 'caption' })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])
    const { client } = makeClient({})
    adminHolder.client = client

    const result = await createPhotoMemoryFromMedia('tenant-1', { ...baseInput, memberId: null })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe(ACCOUNT_REQUIRED_ERROR)
    }
  })
})

describe('createDraftMemory — user_id resolution (Bug A)', () => {
  const baseInput = {
    sessionId: 's1',
    anchorMessageId: 'm1',
    sourceKind: 'conversation' as const,
    title: 'A title',
    body: 'A body',
  }

  it('resolves user_id from the member row and includes it on the insert', async () => {
    const { client, insertCalls } = makeClient({ memberResult: LINKED_MEMBER_RESULT })
    adminHolder.client = client

    const result = await createDraftMemory('tenant-1', { ...baseInput, memberId: 'member-1' })

    expect(result.ok).toBe(true)
    expect(insertCalls[0].user_id).toBe('user-1')
    expect(insertCalls[0].member_id).toBe('member-1')
  })

  it('rejects a fully anonymous visitor (no memberId) with a distinguishable 401, not a generic 500 — no insert attempted', async () => {
    const { client, insertCalls } = makeClient({})
    adminHolder.client = client

    const result = await createDraftMemory('tenant-1', { ...baseInput, memberId: null })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe(ACCOUNT_REQUIRED_ERROR)
    }
    expect(insertCalls.length).toBe(0)
  })

  it('rejects a member that exists but has no linked account yet (invited, not signed up) with the same 401 — no insert attempted', async () => {
    const { client, insertCalls } = makeClient({ memberResult: { data: { user_id: null }, error: null } })
    adminHolder.client = client

    const result = await createDraftMemory('tenant-1', { ...baseInput, memberId: 'member-invited' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toBe(ACCOUNT_REQUIRED_ERROR)
    }
    expect(insertCalls.length).toBe(0)
  })

  it('treats a genuine DB error resolving user_id as a 500 infra failure, distinct from the 401 "no account" case', async () => {
    const { client, insertCalls } = makeClient({ memberResult: { data: null, error: { message: 'db unreachable' } } })
    adminHolder.client = client

    const result = await createDraftMemory('tenant-1', { ...baseInput, memberId: 'member-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).not.toBe(ACCOUNT_REQUIRED_ERROR)
    }
    expect(insertCalls.length).toBe(0)
  })
})

describe('createMemoryFromAnchor — anonymous-member rejection is covered by the generic failure-branch audit log', () => {
  it('logs MEMORY_CREATED failure with the account-required error_detail when the member has no linked user_id', async () => {
    const { client } = makeClient({
      sessionMessages: [{ id: 'm1', role: 'assistant', content: 'A passage worth keeping.' }],
      memberResult: { data: { user_id: null }, error: null },
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: 'member-invited',
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        actor_type: 'user',
        metadata: expect.objectContaining({ error_detail: ACCOUNT_REQUIRED_ERROR }),
      }),
    )
  })
})

describe('renameMemory', () => {
  it('updates the title only and returns the row', async () => {
    const { client, updateCalls } = makeClient({
      updateResult: {
        data: {
          id: 'mem-1',
          session_id: 's1',
          anchor_message_id: 'm1',
          source_kind: 'conversation',
          title: 'New Title',
          body: 'body',
          status: 'draft',
          created_at: 'now',
          updated_at: 'now',
        },
        error: null,
      },
    })
    adminHolder.client = client

    const result = await renameMemory('tenant-1', 's1', 'mem-1', 'New Title')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.title).toBe('New Title')
    expect(updateCalls[0]).toEqual(expect.objectContaining({ title: 'New Title' }))
    expect(updateCalls[0]).not.toHaveProperty('body')
  })

  it('404s when no row matches id + tenant + session', async () => {
    const { client } = makeClient({ updateResult: { data: null, error: null } })
    adminHolder.client = client

    const result = await renameMemory('tenant-1', 's1', 'nope', 'New Title')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })
})

describe('reviseMemoryBlocks', () => {
  function mkRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'mem-1',
      session_id: 's1',
      anchor_message_id: 'm1',
      source_kind: 'conversation',
      title: 'The Lake House',
      body: '',
      body_blocks: null,
      status: 'draft',
      created_at: 'now',
      updated_at: 'now',
      ...overrides,
    }
  }

  it('accepts a valid text-only array, flattening body from multiple text blocks (trimmed, blank-line joined, in order)', async () => {
    const blocks = [
      { id: 'b1', type: 'text', content: 'First paragraph.' },
      { id: 'b2', type: 'text', content: '  Second paragraph.  ' },
    ]
    const { client, updateCalls } = makeClient({
      updateResult: { data: mkRow({ body: 'First paragraph.\n\nSecond paragraph.', body_blocks: blocks }), error: null },
    })
    adminHolder.client = client

    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', blocks)

    expect(result.ok).toBe(true)
    expect(updateCalls[0].body_blocks).toEqual(blocks)
    expect(updateCalls[0].body).toBe('First paragraph.\n\nSecond paragraph.')
    if (result.ok) expect(result.data.body_blocks).toEqual(blocks)
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEMORY_BLOCKS_REVISED, outcome: 'success' }),
    )
  })

  it('accepts a valid text+image array, resolving the image block\'s media_item_id via getMediaItem + listByChat membership', async () => {
    const blocks = [
      { id: 'b1', type: 'text', content: 'A photo from that day.' },
      { id: 'b2', type: 'image', media_item_id: 'media-1' },
    ]
    mockGetMediaItem.mockResolvedValue({ id: 'media-1', tenant_id: 'tenant-1', chat_id: 's1' })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])
    const { client } = makeClient({
      updateResult: { data: mkRow({ body: 'A photo from that day.', body_blocks: blocks }), error: null },
    })
    adminHolder.client = client

    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', blocks)

    expect(result.ok).toBe(true)
    expect(mockGetMediaItem).toHaveBeenCalledWith('media-1', 'tenant-1')
    expect(mockListByChat).toHaveBeenCalledWith('s1', 'tenant-1')
  })

  it('rejects an unknown block type (400), no update attempted', async () => {
    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', [
      { id: 'b1', type: 'text', content: 'ok' },
      { id: 'b2', type: 'video', content: 'not supported in V1' },
    ])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(mockGetMediaItem).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEMORY_BLOCKS_REVISED, outcome: 'failure' }),
    )
  })

  it('rejects an image block whose media_item_id does not resolve for this tenant (400)', async () => {
    mockGetMediaItem.mockResolvedValue(null)
    mockListByChat.mockResolvedValue([])

    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', [
      { id: 'b1', type: 'text', content: 'Caption' },
      { id: 'b2', type: 'image', media_item_id: 'someone-elses-media' },
    ])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejects an image block whose media_item_id belongs to a different session (400)', async () => {
    mockGetMediaItem.mockResolvedValue({ id: 'media-1', tenant_id: 'tenant-1', chat_id: 'other-session' })
    mockListByChat.mockResolvedValue([]) // this session's own media items — media-1 isn't among them

    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', [
      { id: 'b1', type: 'text', content: 'Caption' },
      { id: 'b2', type: 'image', media_item_id: 'media-1' },
    ])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejects an array with no surviving non-empty text block (400) — whitespace-only content does not count', async () => {
    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', [{ id: 'b1', type: 'text', content: '   ' }])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('rejects an array with an image block but no text block at all (400)', async () => {
    mockGetMediaItem.mockResolvedValue({ id: 'media-1' })
    mockListByChat.mockResolvedValue([{ id: 'media-1' }])

    const result = await reviseMemoryBlocks('tenant-1', 's1', 'mem-1', [{ id: 'b1', type: 'image', media_item_id: 'media-1' }])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('404s when no row matches id + tenant + session', async () => {
    const { client } = makeClient({ updateResult: { data: null, error: null } })
    adminHolder.client = client

    const result = await reviseMemoryBlocks('tenant-1', 's1', 'nope', [{ id: 'b1', type: 'text', content: 'ok' }])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })
})
