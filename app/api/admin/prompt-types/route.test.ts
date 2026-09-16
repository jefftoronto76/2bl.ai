// Covers the ownership-scoped find-or-create fix (2026-09-16): prompt_types
// gained tenant_id back (null = platform-shared, non-null = owned by that one
// tenant), and POST's find-or-create must never let one tenant's request
// reuse a different tenant's private type for the same key. Before this fix
// it took "the first existing row" for a key regardless of owner.
//
// Mocking convention matches services/prompt/select.test.ts exactly: a
// chainable fake builder recording every filter call, resolved by awaiting
// (or .maybeSingle()/.single()), over a mocked @/services/auth/supabase-admin.

import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder, authHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
  authHolder: {
    getAuthContext: null as unknown as () => Promise<{ owner_id: string; tenant_id: string }>,
    requirePlatformAdmin: null as unknown as () => Promise<{ isPlatformAdmin: boolean } | null>,
  },
}))
vi.mock('@/services/auth/supabase-admin', () => ({ getAdminClient: () => adminHolder.client }))
vi.mock('@/services/auth', () => ({
  getAuthContext: () => authHolder.getAuthContext(),
  requirePlatformAdmin: () => authHolder.requirePlatformAdmin(),
}))

import { POST } from './route'

interface Call { fn: string; args: unknown[] }

/** Chainable builder that records filter calls and resolves to `result`; awaitable or terminated by .maybeSingle()/.single(). */
function makeQuery(result: unknown) {
  const calls: Call[] = []
  const obj: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'is', 'order', 'limit', 'insert', 'update', 'delete']) {
    obj[fn] = (...args: unknown[]) => { calls.push({ fn, args }); return obj }
  }
  obj.maybeSingle = async () => result
  obj.single = async () => result
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  obj.__calls = calls
  return obj
}

function makeClient(byTable: Record<string, unknown[]>) {
  const queries: Record<string, ReturnType<typeof makeQuery>[]> = {}
  return {
    from: (table: string) => {
      const results = byTable[table] ?? []
      const q = makeQuery(results[(queries[table] ?? []).length])
      queries[table] = [...(queries[table] ?? []), q]
      return q
    },
    __queries: queries,
  }
}

const has = (calls: Call[], fn: string, ...args: unknown[]) =>
  calls.some(c => c.fn === fn && JSON.stringify(c.args) === JSON.stringify(args))

function req(body: unknown): Request {
  return new Request('http://x/api/admin/prompt-types', { method: 'POST', body: JSON.stringify(body) })
}

const TENANT_A = 'tenant-a'

beforeEach(() => {
  adminHolder.client = null
  authHolder.getAuthContext = async () => ({ owner_id: 'owner-a', tenant_id: TENANT_A })
  authHolder.requirePlatformAdmin = async () => null
})

describe('POST /api/admin/prompt-types — ownership-scoped find-or-create', () => {
  it('a platform-type request reuses an existing platform row (unchanged behavior)', async () => {
    const client = makeClient({
      prompt_types: [{ data: { id: 'pt-1', key: 'sales', name: 'Sales', description: null, sort_order: null, is_platform: true }, error: null }],
      prompt_type_tenants: [{ error: null }],
    })
    adminHolder.client = client
    authHolder.requirePlatformAdmin = async () => ({ isPlatformAdmin: true })

    const res = await POST(req({ name: 'Sales', make_platform: true }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('pt-1')

    const lookupCalls = (client.__queries.prompt_types[0] as { __calls: Call[] }).__calls
    expect(has(lookupCalls, 'eq', 'key', 'sales')).toBe(true)
    expect(has(lookupCalls, 'is', 'tenant_id', null)).toBe(true)
    // No insert — the row was reused.
    expect(has(lookupCalls, 'insert')).toBe(false)
  })

  it('THE BUG THIS FIXES: tenant A requesting a key tenant B privately owns creates a new row for A, never reuses B\'s', async () => {
    // Tenant A's own-scoped lookup finds nothing (B's row is excluded by the
    // query itself), so it falls through to insert with A's own tenant_id.
    const client = makeClient({
      prompt_types: [
        { data: null, error: null }, // scoped lookup: nothing owned by tenant A
        { data: { id: 'pt-new', key: 'onboarding', name: 'Onboarding', description: null, sort_order: null }, error: null }, // insert
      ],
      prompt_type_tenants: [{ error: null }],
    })
    adminHolder.client = client

    const res = await POST(req({ name: 'Onboarding' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('pt-new')

    const lookupCalls = (client.__queries.prompt_types[0] as { __calls: Call[] }).__calls
    expect(has(lookupCalls, 'eq', 'key', 'onboarding')).toBe(true)
    expect(has(lookupCalls, 'eq', 'tenant_id', TENANT_A)).toBe(true) // scoped to caller's own tenant
    expect(has(lookupCalls, 'is', 'tenant_id', null)).toBe(false) // never the platform-null scope

    const insertCalls = (client.__queries.prompt_types[1] as { __calls: Call[] }).__calls
    const insertCall = insertCalls.find(c => c.fn === 'insert')
    expect(insertCall?.args[0]).toMatchObject({ key: 'onboarding', tenant_id: TENANT_A, is_platform: false })
  })

  it('a tenant reusing its own previously-created private type finds and reuses it, no duplicate insert', async () => {
    const client = makeClient({
      prompt_types: [{ data: { id: 'pt-mine', key: 'onboarding', name: 'Onboarding', description: null, sort_order: null, is_platform: false }, error: null }],
      prompt_type_tenants: [{ error: null }],
    })
    adminHolder.client = client

    const res = await POST(req({ name: 'Onboarding' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('pt-mine')

    const lookupCalls = (client.__queries.prompt_types[0] as { __calls: Call[] }).__calls
    expect(has(lookupCalls, 'eq', 'tenant_id', TENANT_A)).toBe(true)
    expect(client.__queries.prompt_types.length).toBe(1) // no second query — no insert, no promote
  })

  it('promoting a found row to platform sets is_platform:true AND tenant_id:null in the same update', async () => {
    // Under the scoped lookup, a wantsPlatform=true request only ever finds
    // rows via `.is('tenant_id', null)` — so the only row this branch can
    // reach already has a null tenant_id. is_platform:false here models the
    // (narrow, but not impossible) case of a null-tenant row not yet flagged
    // platform. tenant_id:null is still asserted explicitly in the update:
    // harmless when it was already null, and load-bearing if it wasn't —
    // the invariant (is_platform implies null tenant_id) must hold by
    // construction of the update, not by assuming the row already satisfied it.
    const client = makeClient({
      prompt_types: [
        { data: { id: 'pt-1', key: 'onboarding', name: 'Onboarding', description: null, sort_order: null, is_platform: false }, error: null }, // scoped (tenant_id IS NULL) lookup
        { data: { id: 'pt-1', key: 'onboarding', name: 'Onboarding', description: null, sort_order: null }, error: null }, // update
      ],
      prompt_type_tenants: [{ error: null }],
    })
    adminHolder.client = client
    authHolder.requirePlatformAdmin = async () => ({ isPlatformAdmin: true })

    const res = await POST(req({ name: 'Onboarding', make_platform: true }))
    expect(res.status).toBe(201)

    const lookupCalls = (client.__queries.prompt_types[0] as { __calls: Call[] }).__calls
    expect(has(lookupCalls, 'is', 'tenant_id', null)).toBe(true)

    const updateCalls = (client.__queries.prompt_types[1] as { __calls: Call[] }).__calls
    const updateCall = updateCalls.find(c => c.fn === 'update')
    expect(updateCall?.args[0]).toEqual({ is_platform: true, tenant_id: null })
  })

  it('rolls back an orphaned insert on a non-409 assignment failure, only when this request created the row', async () => {
    const client = makeClient({
      prompt_types: [
        { data: null, error: null }, // scoped lookup: nothing found
        { data: { id: 'pt-new', key: 'onboarding', name: 'Onboarding', description: null, sort_order: null }, error: null }, // insert
        { error: null }, // delete (rollback)
      ],
      prompt_type_tenants: [{ error: { code: '23503', message: 'fk violation' } }],
    })
    adminHolder.client = client

    const res = await POST(req({ name: 'Onboarding' }))
    expect(res.status).toBe(500)

    const rollbackCalls = (client.__queries.prompt_types[2] as { __calls: Call[] }).__calls
    expect(has(rollbackCalls, 'delete')).toBe(true)
    expect(has(rollbackCalls, 'eq', 'id', 'pt-new')).toBe(true)
  })

  it('returns 409 on a 23505 re-assign without rolling back a reused (not-created-by-this-request) row', async () => {
    const client = makeClient({
      prompt_types: [{ data: { id: 'pt-mine', key: 'onboarding', name: 'Onboarding', description: null, sort_order: null, is_platform: false }, error: null }],
      prompt_type_tenants: [{ error: { code: '23505', message: 'unique_violation' } }],
    })
    adminHolder.client = client

    const res = await POST(req({ name: 'Onboarding' }))
    expect(res.status).toBe(409)
    // Only one prompt_types query happened — the lookup. No delete call exists to check for.
    expect(client.__queries.prompt_types.length).toBe(1)
  })
})
