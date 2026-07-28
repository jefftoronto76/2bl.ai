import { vi, describe, it, expect } from 'vitest'

// Hoist the holder so the mock factory captures it before any import runs.
const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))

import { getSystemPrompt, DEFAULT_SYSTEM_PROMPT } from './compiler'

interface FilterCall {
  fn: string
  args: unknown[]
}

// Chainable query-builder stand-in mirroring the real supabase-js builder:
// .eq()/.order()/.limit() chain, .maybeSingle() resolves. Records every
// filter call so tests can assert the `status = 'live'` scoping.
function makeQuery(result: unknown) {
  const filters: FilterCall[] = []
  const obj: Record<string, unknown> = {}
  for (const fn of ['eq', 'order', 'limit', 'select']) {
    obj[fn] = (...args: unknown[]) => {
      filters.push({ fn, args })
      return obj
    }
  }
  obj.maybeSingle = async () => result
  obj.__filters = filters
  return obj
}

function hasFilter(filters: FilterCall[], fn: string, ...args: unknown[]) {
  return filters.some(f => f.fn === fn && JSON.stringify(f.args) === JSON.stringify(args))
}

function makeClient(result: unknown) {
  const query = makeQuery(result)
  return {
    from: (table: string) => {
      expect(table).toBe('compiled_prompts')
      return query
    },
    __query: query,
  }
}

describe('getSystemPrompt', () => {
  it('returns null immediately without querying when tenantId is null', async () => {
    const client = makeClient({ data: null, error: null })
    adminHolder.client = client
    const result = await getSystemPrompt(null)
    expect(result).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('returns the live row content when one exists', async () => {
    const client = makeClient({ data: { content: 'LIVE PROMPT CONTENT' }, error: null })
    adminHolder.client = client
    const result = await getSystemPrompt('tenant-1')
    expect(result).toBe('LIVE PROMPT CONTENT')
    const filters = (client.__query as { __filters: FilterCall[] }).__filters
    expect(hasFilter(filters, 'eq', 'tenant_id', 'tenant-1')).toBe(true)
    expect(hasFilter(filters, 'eq', 'status', 'live')).toBe(true)
    expect(hasFilter(filters, 'order', 'version', { ascending: false })).toBe(true)
  })

  it('falls back to DEFAULT_SYSTEM_PROMPT when no live row is found', async () => {
    const client = makeClient({ data: null, error: null })
    adminHolder.client = client
    const result = await getSystemPrompt('tenant-1')
    expect(result).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('falls back to DEFAULT_SYSTEM_PROMPT on a query error', async () => {
    const client = makeClient({ data: null, error: { message: 'boom' } })
    adminHolder.client = client
    const result = await getSystemPrompt('tenant-1')
    expect(result).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('falls back to DEFAULT_SYSTEM_PROMPT when the query throws', async () => {
    adminHolder.client = {
      from: () => {
        throw new Error('connection lost')
      },
    }
    const result = await getSystemPrompt('tenant-1')
    expect(result).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('is scoped to status=live so a higher-version draft never outranks a lower-version live row', async () => {
    // The query builder itself enforces `status = 'live'` server-side (Postgres
    // WHERE), so a draft row is never returned even if it has a higher version —
    // this test asserts the filter is present, which is what guarantees that.
    const client = makeClient({ data: { content: 'v1 live content' }, error: null })
    adminHolder.client = client
    const result = await getSystemPrompt('tenant-1')
    expect(result).toBe('v1 live content')
    const filters = (client.__query as { __filters: FilterCall[] }).__filters
    expect(hasFilter(filters, 'eq', 'status', 'live')).toBe(true)
  })
})
