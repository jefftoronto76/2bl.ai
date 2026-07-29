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

interface FilterCall {
  fn: string
  args: unknown[]
}

// A generic chainable + thenable query-builder stand-in that also records every
// filter call (.eq/.is/.neq/...) it receives, so tests can assert on scoping —
// this feature's correctness lives entirely in the WHERE clauses. Resolves to
// `result` whether the caller awaits it directly (a .then() consumer) or calls
// a terminal .maybeSingle()/.single().
// `result` may be a plain value, or a function of the accumulated filters —
// needed for a query whose outcome depends on filters only known once the
// caller finishes chaining .eq()/.is()/etc (e.g. distinguishing the
// composer-clear update from the type-clear update, which share a payload).
function makeQuery(
  result: unknown | ((filters: FilterCall[]) => unknown),
  onSettle?: (filters: FilterCall[]) => void,
) {
  const filters: FilterCall[] = []
  const obj: Record<string, unknown> = {}
  const resolveResult = () => (typeof result === 'function' ? (result as (f: FilterCall[]) => unknown)(filters) : result)
  for (const fn of ['eq', 'is', 'in', 'or', 'neq', 'limit', 'order', 'select']) {
    obj[fn] = (...args: unknown[]) => {
      filters.push({ fn, args })
      return obj
    }
  }
  obj.maybeSingle = async () => {
    const resolved = resolveResult()
    onSettle?.(filters)
    return resolved
  }
  obj.single = async () => {
    const resolved = resolveResult()
    onSettle?.(filters)
    return resolved
  }
  obj.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const resolved = resolveResult()
    onSettle?.(filters)
    return Promise.resolve(resolved).then(resolve, reject)
  }
  return obj
}

function hasFilter(filters: FilterCall[], fn: string, ...args: unknown[]) {
  return filters.some(f => f.fn === fn && JSON.stringify(f.args) === JSON.stringify(args))
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
  targetSet = { id: 'set-1', prompt_type_id: null, is_composer_prompt: false } as Record<string, unknown> | null,
  targetSetError = null,
  historyInsertError = null,
  updateError = null,
  insertError = null,
  clearCompiledError = null,
  clearSetsError = null,
  clearComposerSetsError = null,
  activateSetError = null,
}: {
  blocks?: unknown[]
  blocksError?: unknown
  existing?: Record<string, unknown> | null
  targetSet?: Record<string, unknown> | null
  targetSetError?: unknown
  historyInsertError?: unknown
  updateError?: unknown
  insertError?: unknown
  clearCompiledError?: unknown
  clearSetsError?: unknown
  clearComposerSetsError?: unknown
  activateSetError?: unknown
} = {}) {
  const historyInserts: unknown[] = []
  const compiledClearUpdates: Array<{ payload: unknown; filters: FilterCall[] }> = []
  const compiledMainUpdates: Array<{ payload: unknown; filters: FilterCall[] }> = []
  const compiledInserts: unknown[] = []
  const setsClearUpdates: Array<{ payload: unknown; filters: FilterCall[] }> = []
  const composerClearUpdates: Array<{ payload: unknown; filters: FilterCall[] }> = []
  const setsActivateUpdates: Array<{ payload: unknown; filters: FilterCall[] }> = []
  const promptSetsSelects: FilterCall[][] = []

  const isComposerClearFilters = (filters: FilterCall[]) =>
    filters.some(f => f.fn === 'eq' && f.args[0] === 'is_composer_prompt' && f.args[1] === true)

  const client = {
    from(table: string) {
      if (table === 'blocks') {
        return makeQuery({ data: blocks, error: blocksError })
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
          select: () => makeQuery({ data: existing, error: null }),
          update(payload: unknown) {
            const isClear = (payload as Record<string, unknown>)?.status === 'retired'
            return makeQuery({ error: isClear ? clearCompiledError : updateError }, filters => {
              if (isClear) compiledClearUpdates.push({ payload, filters })
              else compiledMainUpdates.push({ payload, filters })
            })
          },
          insert(payload: unknown) {
            compiledInserts.push(payload)
            return Promise.resolve({ error: insertError })
          },
        }
      }
      if (table === 'prompt_sets') {
        return {
          select: () =>
            makeQuery({ data: targetSet, error: targetSetError }, filters => {
              promptSetsSelects.push(filters)
            }),
          update(payload: unknown) {
            const isClear = (payload as Record<string, unknown>)?.status === 'retired'
            if (!isClear) {
              return makeQuery({ error: activateSetError }, filters => {
                setsActivateUpdates.push({ payload, filters })
              })
            }
            // Composer-clear and type-clear share the exact same payload
            // ({status: 'retired'}) — only distinguishable by which filter
            // this particular call chained, known only once resolved.
            return makeQuery(
              (filters: FilterCall[]) => ({ error: isComposerClearFilters(filters) ? clearComposerSetsError : clearSetsError }),
              filters => {
                if (isComposerClearFilters(filters)) composerClearUpdates.push({ payload, filters })
                else setsClearUpdates.push({ payload, filters })
              },
            )
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }

  return {
    client,
    historyInserts,
    compiledClearUpdates,
    compiledMainUpdates,
    compiledInserts,
    setsClearUpdates,
    composerClearUpdates,
    setsActivateUpdates,
    promptSetsSelects,
  }
}

const NOTE: ReleaseNote = { summary: 'Tighten escalation', why: 'Billing disputes', changed_block_ids: ['block-1'] }

describe('compilePrompt — release note persistence', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('first-ever compile (no existing row): writes the note directly, no history insert', async () => {
    const { client, historyInserts, compiledInserts } = makeClient({ existing: null })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.version).toBe(1)

    expect(historyInserts).toHaveLength(0)
    expect(compiledInserts).toHaveLength(1)
    const payload = compiledInserts[0] as Record<string, unknown>
    expect(payload.release_summary).toBe('Tighten escalation')
    expect(payload.release_why).toBe('Billing disputes')
    expect(payload.release_changed_block_ids).toEqual(['block-1'])
  })

  it('re-compile with an existing row: writes the NEW note onto the live row', async () => {
    const { client, compiledMainUpdates } = makeClient({
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

    expect(compiledMainUpdates).toHaveLength(1)
    const payload = compiledMainUpdates[0].payload as Record<string, unknown>
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
    const { client, compiledInserts } = makeClient({ existing: null })
    adminHolder.client = client

    await compilePrompt('tenant-1', null, { summary: 'Update guardrails', why: '', changed_block_ids: [] })

    const payload = compiledInserts[0] as Record<string, unknown>
    expect(payload.release_why).toBeNull()
  })

  it('still returns ok:false on a blocks-fetch error without touching compiled_prompts', async () => {
    const { client, compiledMainUpdates, compiledInserts } = makeClient({ blocks: [], blocksError: { message: 'db down' } })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(false)
    expect(compiledMainUpdates).toHaveLength(0)
    expect(compiledInserts).toHaveLength(0)
  })
})

describe('compilePrompt — single-live-per-(tenant_id, prompt_type_id) activation (July 2026)', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('publishing a typed set clears any other live compiled_prompts row for that (tenant, type) before writing', async () => {
    const { client, compiledClearUpdates } = makeClient({
      existing: { id: 'cp-1', version: 2, content: 'old', release_summary: null, release_why: null, release_changed_block_ids: [] },
      targetSet: { id: 'set-1', prompt_type_id: 'type-base' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(true)
    expect(compiledClearUpdates).toHaveLength(1)
    const { payload, filters } = compiledClearUpdates[0]
    expect(payload).toEqual({ status: 'retired' })
    expect(hasFilter(filters, 'eq', 'tenant_id', 'tenant-1')).toBe(true)
    expect(hasFilter(filters, 'eq', 'status', 'live')).toBe(true)
    expect(hasFilter(filters, 'eq', 'prompt_type_id', 'type-base')).toBe(true)
    expect(hasFilter(filters, 'neq', 'id', 'cp-1')).toBe(true)
  })

  it('publishing an untyped (default-slot) set clears via .is(prompt_type_id, null), not .eq', async () => {
    const { client, compiledClearUpdates } = makeClient({
      existing: { id: 'cp-1', version: 2, content: 'old', release_summary: null, release_why: null, release_changed_block_ids: [] },
      targetSet: { id: 'set-1', prompt_type_id: null },
    })
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-1', NOTE)

    const { filters } = compiledClearUpdates[0]
    expect(hasFilter(filters, 'is', 'prompt_type_id', null)).toBe(true)
    expect(filters.some(f => f.fn === 'eq' && f.args[0] === 'prompt_type_id')).toBe(false)
  })

  it('the main write always activates: status=live and prompt_type_id set on the compiled row', async () => {
    const { client, compiledMainUpdates } = makeClient({
      existing: { id: 'cp-1', version: 2, content: 'old', release_summary: null, release_why: null, release_changed_block_ids: [] },
      targetSet: { id: 'set-1', prompt_type_id: 'type-base' },
    })
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-1', NOTE)

    const payload = compiledMainUpdates[0].payload as Record<string, unknown>
    expect(payload.status).toBe('live')
    expect(payload.prompt_type_id).toBe('type-base')
  })

  it('publish always activates the target prompt_set — unconditional, no prior-status check', async () => {
    const { client, setsActivateUpdates } = makeClient({
      existing: null,
      targetSet: { id: 'set-1', prompt_type_id: 'type-base' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(true)
    expect(setsActivateUpdates).toHaveLength(1)
    expect(setsActivateUpdates[0].payload).toEqual({ status: 'live' })
    expect(hasFilter(setsActivateUpdates[0].filters, 'eq', 'id', 'set-1')).toBe(true)
    expect(hasFilter(setsActivateUpdates[0].filters, 'eq', 'tenant_id', 'tenant-1')).toBe(true)
  })

  it('publishing set A clears a sibling live set B sharing the same (tenant, type) in prompt_sets', async () => {
    const { client, setsClearUpdates } = makeClient({
      existing: null,
      targetSet: { id: 'set-a', prompt_type_id: 'type-base' },
    })
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-a', NOTE)

    expect(setsClearUpdates).toHaveLength(1)
    const { payload, filters } = setsClearUpdates[0]
    expect(payload).toEqual({ status: 'retired' })
    expect(hasFilter(filters, 'eq', 'tenant_id', 'tenant-1')).toBe(true)
    expect(hasFilter(filters, 'eq', 'status', 'live')).toBe(true)
    expect(hasFilter(filters, 'eq', 'prompt_type_id', 'type-base')).toBe(true)
    expect(hasFilter(filters, 'neq', 'id', 'set-a')).toBe(true)
  })

  it('legacy no-set compile (promptSetId null): never touches prompt_sets at all', async () => {
    const { client, setsClearUpdates, setsActivateUpdates, promptSetsSelects } = makeClient({ existing: null })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', null, NOTE)

    expect(result.ok).toBe(true)
    expect(promptSetsSelects).toHaveLength(0)
    expect(setsClearUpdates).toHaveLength(0)
    expect(setsActivateUpdates).toHaveLength(0)
  })

  it('404s fast when the target prompt_set does not exist, without writing anything', async () => {
    const { client, compiledClearUpdates, compiledMainUpdates, compiledInserts, historyInserts } = makeClient({
      targetSet: null,
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'missing-set', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
    expect(compiledClearUpdates).toHaveLength(0)
    expect(compiledMainUpdates).toHaveLength(0)
    expect(compiledInserts).toHaveLength(0)
    expect(historyInserts).toHaveLength(0)
  })

  it('surfaces a unique-constraint race on the main UPDATE as a friendly 409, not a raw 500', async () => {
    const { client } = makeClient({
      existing: { id: 'cp-1', version: 2, content: 'old', release_summary: null, release_why: null, release_changed_block_ids: [] },
      targetSet: { id: 'set-1', prompt_type_id: 'type-base' },
      updateError: { code: '23505', message: 'duplicate key value violates unique constraint "compiled_prompts_single_live_typed_idx"' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toMatch(/just landed/i)
  })

  it('surfaces a unique-constraint race on the main INSERT as a friendly 409, not a raw 500', async () => {
    const { client } = makeClient({
      existing: null,
      targetSet: { id: 'set-1', prompt_type_id: 'type-base' },
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint "compiled_prompts_single_live_typed_idx"' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toMatch(/just landed/i)
  })

  it('surfaces a unique-constraint race on the prompt_sets activation UPDATE as a friendly 409, not a raw 500', async () => {
    const { client } = makeClient({
      existing: null,
      targetSet: { id: 'set-1', prompt_type_id: 'type-base' },
      activateSetError: { code: '23505', message: 'duplicate key value violates unique constraint "prompt_sets_single_composer_idx"' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toMatch(/just landed/i)
  })
})

describe('compilePrompt — composer-family exclusivity (is_composer_prompt, July 2026)', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('publishing a composer set clears any other live composer set, independent of type slot', async () => {
    const { client, composerClearUpdates } = makeClient({
      existing: null,
      targetSet: { id: 'set-composer-b', prompt_type_id: null, is_composer_prompt: true },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-sbl', 'set-composer-b', NOTE)

    expect(result.ok).toBe(true)
    expect(composerClearUpdates).toHaveLength(1)
    const { payload, filters } = composerClearUpdates[0]
    expect(payload).toEqual({ status: 'retired' })
    expect(hasFilter(filters, 'eq', 'is_composer_prompt', true)).toBe(true)
    expect(hasFilter(filters, 'eq', 'status', 'live')).toBe(true)
    expect(hasFilter(filters, 'neq', 'id', 'set-composer-b')).toBe(true)
    // Platform-wide — never scoped to tenant_id or prompt_type_id, unlike the
    // ordinary type-based clear (a composer set in a different type slot must
    // still be caught).
    expect(filters.some(f => f.fn === 'eq' && f.args[0] === 'tenant_id')).toBe(false)
    expect(filters.some(f => f.args[0] === 'prompt_type_id')).toBe(false)
  })

  it('publishing an ordinary (non-composer) set never runs the composer clear', async () => {
    const { client, composerClearUpdates, setsClearUpdates } = makeClient({
      existing: null,
      targetSet: { id: 'set-1', prompt_type_id: 'type-base', is_composer_prompt: false },
    })
    adminHolder.client = client

    await compilePrompt('tenant-1', 'set-1', NOTE)

    expect(composerClearUpdates).toHaveLength(0)
    // The ordinary type-based clear still runs, unaffected.
    expect(setsClearUpdates).toHaveLength(1)
  })

  it('a composer set still gets the ordinary type-based clear too, when it has a type', async () => {
    const { client, setsClearUpdates, composerClearUpdates } = makeClient({
      existing: null,
      targetSet: { id: 'set-composer-a', prompt_type_id: 'type-base', is_composer_prompt: true },
    })
    adminHolder.client = client

    await compilePrompt('tenant-sbl', 'set-composer-a', NOTE)

    expect(setsClearUpdates).toHaveLength(1)
    expect(composerClearUpdates).toHaveLength(1)
  })

  it('propagates a failure from the composer clear step as a 500, without activating', async () => {
    const { client, setsActivateUpdates } = makeClient({
      existing: null,
      targetSet: { id: 'set-composer-b', prompt_type_id: null, is_composer_prompt: true },
      clearComposerSetsError: { message: 'db down' },
    })
    adminHolder.client = client

    const result = await compilePrompt('tenant-sbl', 'set-composer-b', NOTE)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(500)
    expect(setsActivateUpdates).toHaveLength(0)
  })
})
