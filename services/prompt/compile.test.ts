import { vi, describe, it, expect, beforeEach } from 'vitest'

// Hoist the holder so the mock factory captures it before any import runs.
const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))

import { compilePrompt } from './compile'
import type { ReleaseNote } from './release-note'

// ── helpers ──────────────────────────────────────────────────────────────────

// A generic chainable + thenable query-builder stand-in. Every filter method
// (.eq/.is/.in/.or/.limit/.order/.select) returns itself; it resolves to
// `result` whether the caller awaits it directly (compile.ts's blocks query
// and the update/insert chains do this) or calls a terminal .maybeSingle()/
// .single() (the existing-row lookup does this).
function chain(result: unknown) {
  const obj: Record<string, unknown> = {
    eq: () => obj,
    is: () => obj,
    in: () => obj,
    or: () => obj,
    limit: () => obj,
    order: () => obj,
    select: () => obj,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return obj
}

const ACTIVE_BLOCK = {
  id: 'block-1',
  title: 'Be helpful',
  type: 'identity',
  body: 'Be helpful and concise.',
  order: null,
  prompt_set_id: null,
}

function makeClient({
  blocks = [ACTIVE_BLOCK],
  blocksError = null,
  existing = null as Record<string, unknown> | null,
  historyInsertError = null,
  updateError = null,
  insertError = null,
}: {
  blocks?: unknown[]
  blocksError?: unknown
  existing?: Record<string, unknown> | null
  historyInsertError?: unknown
  updateError?: unknown
  insertError?: unknown
} = {}) {
  const historyInserts: unknown[] = []
  const updates: unknown[] = []
  const inserts: unknown[] = []

  const client = {
    from(table: string) {
      if (table === 'blocks') {
        return chain({ data: blocks, error: blocksError })
      }
      if (table === 'compiled_prompts_history') {
        return {
          insert(payload: unknown) {
            historyInserts.push(payload)
            return Promise.resolve({ error: historyInsertError })
          },
        }
      }
      if (table === 'compiled_prompts') {
        return {
          select: () => chain({ data: existing, error: null }),
          update(payload: unknown) {
            updates.push(payload)
            return chain({ error: updateError })
          },
          insert(payload: unknown) {
            inserts.push(payload)
            return Promise.resolve({ error: insertError })
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }

  return { client, historyInserts, updates, inserts }
}

const NOTE: ReleaseNote = { summary: 'Tighten escalation', why: 'Billing disputes', changed_block_ids: ['block-1'] }

describe('compilePrompt — release note persistence', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('first-ever compile (no existing row): writes the note directly, no history insert', async () => {
    const { client, historyInserts, inserts } = makeClient({ existing: null })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.version).toBe(1)

    expect(historyInserts).toHaveLength(0)
    expect(inserts).toHaveLength(1)
    const payload = inserts[0] as Record<string, unknown>
    expect(payload.release_summary).toBe('Tighten escalation')
    expect(payload.release_why).toBe('Billing disputes')
    expect(payload.release_changed_block_ids).toEqual(['block-1'])
  })

  it('re-compile with an existing row: writes the NEW note onto the live row', async () => {
    const { client, updates } = makeClient({
      existing: {
        id: 'cp-1',
        version: 7,
        content: 'old content',
        release_summary: 'Old summary',
        release_why: 'Old why',
        release_changed_block_ids: ['old-block'],
      },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.version).toBe(8)

    expect(updates).toHaveLength(1)
    const payload = updates[0] as Record<string, unknown>
    expect(payload.release_summary).toBe('Tighten escalation')
    expect(payload.release_why).toBe('Billing disputes')
    expect(payload.release_changed_block_ids).toEqual(['block-1'])
  })

  it('re-compile with an existing row: archives the OUTGOING (old) note to history, not the new one', async () => {
    const { client, historyInserts } = makeClient({
      existing: {
        id: 'cp-1',
        version: 7,
        content: 'old content',
        release_summary: 'Old summary',
        release_why: 'Old why',
        release_changed_block_ids: ['old-block'],
      },
    })
    adminHolder.client = client

    await compilePrompt('tenant-1', null, NOTE)

    expect(historyInserts).toHaveLength(1)
    const payload = historyInserts[0] as Record<string, unknown>
    expect(payload.version).toBe(7)
    expect(payload.content).toBe('old content')
    expect(payload.release_summary).toBe('Old summary')
    expect(payload.release_why).toBe('Old why')
    expect(payload.release_changed_block_ids).toEqual(['old-block'])
  })

  it('archives a null outgoing note gracefully (row compiled before the note columns existed)', async () => {
    const { client, historyInserts } = makeClient({
      existing: { id: 'cp-1', version: 3, content: 'old content', release_summary: null, release_why: null, release_changed_block_ids: null },
    })
    adminHolder.client = client

    await compilePrompt('tenant-1', null, NOTE)

    const payload = historyInserts[0] as Record<string, unknown>
    expect(payload.release_summary).toBeNull()
    expect(payload.release_why).toBeNull()
    expect(payload.release_changed_block_ids).toEqual([])
  })

  it('stores an empty why as null, not an empty string', async () => {
    const { client, inserts } = makeClient({ existing: null })
    adminHolder.client = client

    await compilePrompt('tenant-1', null, { summary: 'Update guardrails', why: '', changed_block_ids: [] })

    const payload = inserts[0] as Record<string, unknown>
    expect(payload.release_why).toBeNull()
  })

  it('still returns ok:false on a blocks-fetch error without touching compiled_prompts', async () => {
    const { client, updates, inserts } = makeClient({ blocks: [], blocksError: { message: 'db down' } })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(false)
    expect(updates).toHaveLength(0)
    expect(inserts).toHaveLength(0)
  })
})
