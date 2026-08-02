// Coverage for the verbatim create path (no model call): title resolution
// ([MEMORY_TITLE] marker vs. the fallback truncation), verbatim body with
// every marker stripped, anchor-not-found handling, and the title-only
// rename path. Mocks @supabase/supabase-js's createClient directly (mirrors
// sessions.test.ts's own pattern) rather than @/services/auth/supabase-admin
// — services/crm/memories.ts's getAdminClient() and services/crm/sessions.ts's
// own LOCAL getAdminClient(label) helper (a separate, file-local function,
// not the shared one) both bottom out in the same @supabase/supabase-js
// createClient call, so mocking it there is what actually covers both
// createMemoryFromAnchor's own writes and its call into getSessionMessages.
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => adminHolder.client,
}))
vi.mock('@/services/audit', () => ({ logEvent: vi.fn() }))

import { createMemoryFromAnchor, renameMemory, deriveFallbackMemoryTitle } from './memories'

type Row = Record<string, unknown>
type SelectResult = { data: Row | null; error: { message: string } | null }

function makeClient(opts: {
  sessionMessages?: Row[]
  insertResult?: SelectResult
  updateResult?: SelectResult
}) {
  const insertCalls: Row[] = []
  const updateCalls: Row[] = []

  const client = {
    from(table: string) {
      if (table === 'chat_sessions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { messages: opts.sessionMessages ?? [] }, error: null }),
              }),
            }),
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
  return { client, insertCalls, updateCalls }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
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
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: null,
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(true)
    expect(insertCalls[0].title).toBe('The Lake House')
    expect(insertCalls[0].body).toBe('It was a quiet summer by the lake.')
  })

  it('falls back to a truncated title when no [MEMORY_TITLE] marker is present — the common case', async () => {
    const { client, insertCalls } = makeClient({
      sessionMessages: [{ id: 'm1', role: 'user', content: 'What made you decide to capture that memory when you did?' }],
    })
    adminHolder.client = client

    const result = await createMemoryFromAnchor('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: null,
      sourceKind: 'conversation',
    })

    expect(result.ok).toBe(true)
    expect(insertCalls[0].title).toBe('What made you decide to capture that memory when you did?')
    expect(insertCalls[0].body).toBe('What made you decide to capture that memory when you did?')
  })

  it('returns a 400 when the anchor message id has no match in the session', async () => {
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
  })

  it('rejects a message that is only markers, once stripped there is no body left', async () => {
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
