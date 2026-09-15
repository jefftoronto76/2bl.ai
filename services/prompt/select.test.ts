import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder } = vi.hoisted(() => ({ adminHolder: { client: null as unknown } }))
vi.mock('@/services/auth/supabase-admin', () => ({ getAdminClient: () => adminHolder.client }))

import { selectCompiledPrompt, compiledContentToPlainText } from './select'

interface Call { fn: string; args: unknown[] }

/** Chainable builder that records filter calls and resolves to `result`; awaitable at any point. */
function makeQuery(result: unknown) {
  const calls: Call[] = []
  const obj: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'in', 'order', 'limit']) {
    obj[fn] = (...args: unknown[]) => { calls.push({ fn, args }); return obj }
  }
  obj.maybeSingle = async () => result
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  obj.__calls = calls
  return obj
}

function makeClient(byTable: Record<string, unknown>) {
  const queries: Record<string, ReturnType<typeof makeQuery>> = {}
  return {
    from: (table: string) => {
      queries[table] = makeQuery(byTable[table])
      return queries[table]
    },
    __queries: queries,
  }
}

const has = (calls: Call[], fn: string, ...args: unknown[]) =>
  calls.some(c => c.fn === fn && JSON.stringify(c.args) === JSON.stringify(args))

beforeEach(() => { adminHolder.client = null })

describe('selectCompiledPrompt', () => {
  it('resolves the slot key to every matching prompt_types id, then the highest-version live row for the tenant', async () => {
    const client = makeClient({
      prompt_types: { data: [{ id: 'pt-1' }, { id: 'pt-1-dupe' }], error: null },
      compiled_prompts: { data: { id: 'cp-9', version: 4, content: 'BLOCKED TEXT', prompt_type_id: 'pt-1' }, error: null },
    })
    adminHolder.client = client

    const result = await selectCompiledPrompt('tenant-1', 'blocked')
    expect(result).toEqual({ content: 'BLOCKED TEXT', compiledPromptId: 'cp-9', version: 4, promptTypeId: 'pt-1', slotKey: 'blocked' })

    const typeCalls = (client.__queries.prompt_types as { __calls: Call[] }).__calls
    expect(has(typeCalls, 'eq', 'key', 'blocked')).toBe(true)
    const cpCalls = (client.__queries.compiled_prompts as { __calls: Call[] }).__calls
    expect(has(cpCalls, 'eq', 'tenant_id', 'tenant-1')).toBe(true)
    expect(has(cpCalls, 'eq', 'status', 'live')).toBe(true)
    // `.in()` over every id, because prompt_types.key is not unique at the DB level.
    expect(has(cpCalls, 'in', 'prompt_type_id', ['pt-1', 'pt-1-dupe'])).toBe(true)
    expect(has(cpCalls, 'order', 'version', { ascending: false })).toBe(true)
    expect(has(cpCalls, 'limit', 1)).toBe(true)
  })

  it.each([
    ['no tenant', null, 'blocked', {}],
    ['empty slot key', 'tenant-1', '', {}],
    ['slot key unknown to prompt_types', 'tenant-1', 'nope', { prompt_types: { data: [], error: null } }],
    ['no live compiled row in that slot', 'tenant-1', 'blocked', { prompt_types: { data: [{ id: 'pt-1' }], error: null }, compiled_prompts: { data: null, error: null } }],
    ['prompt_types query error', 'tenant-1', 'blocked', { prompt_types: { data: null, error: { message: 'boom' } } }],
    ['compiled_prompts query error', 'tenant-1', 'blocked', { prompt_types: { data: [{ id: 'pt-1' }], error: null }, compiled_prompts: { data: null, error: { message: 'boom' } } }],
  ])('returns null (fail-open) — %s', async (_label, tenantId, slotKey, tables) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    adminHolder.client = makeClient(tables as Record<string, unknown>)
    expect(await selectCompiledPrompt(tenantId, slotKey)).toBeNull()
    vi.restoreAllMocks()
  })

  it('returns null when the client throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    adminHolder.client = { from: () => { throw new Error('connection lost') } }
    expect(await selectCompiledPrompt('tenant-1', 'blocked')).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('compiledContentToPlainText', () => {
  it('strips the compile-time section wrapper lines and returns the block text', () => {
    const compiled = '<identity>\nYour account can\'t use this chat right now.\nContact support.\n</identity>'
    expect(compiledContentToPlainText(compiled)).toBe("Your account can't use this chat right now.\nContact support.")
  })

  it('handles several sections, collapsing the blank lines between them to one', () => {
    const compiled = '<identity>\nA\n</identity>\n\n<guardrail>\nB\n</guardrail>\n\n<output_format>\nC\n</output_format>'
    expect(compiledContentToPlainText(compiled)).toBe('A\n\nB\n\nC')
  })

  it('leaves tags that are not bare compile-section wrappers alone', () => {
    const compiled = '<identity>\nSee <b>bold</b> and <session_context>x</session_context>.\n</identity>'
    expect(compiledContentToPlainText(compiled)).toBe('See <b>bold</b> and <session_context>x</session_context>.')
  })

  it('is a no-op on already-plain text', () => {
    expect(compiledContentToPlainText('  plain  ')).toBe('plain')
  })
})
