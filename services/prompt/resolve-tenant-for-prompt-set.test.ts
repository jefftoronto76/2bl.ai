import { vi, describe, it, expect, beforeEach } from 'vitest'

const { adminHolder } = vi.hoisted(() => ({
  adminHolder: { client: null as unknown },
}))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => adminHolder.client,
}))

import { resolveTenantForPromptSet } from './resolve-tenant-for-prompt-set'

function makeClient(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from(table: string) {
      if (table !== 'prompt_sets') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }
    },
  }
}

const AUTH_CTX = { tenant_id: 'tenant-own' }

describe('resolveTenantForPromptSet', () => {
  beforeEach(() => {
    adminHolder.client = null
  })

  it('returns the caller\'s own tenant unchanged when no set id is given', async () => {
    adminHolder.client = makeClient(null)
    const result = await resolveTenantForPromptSet(null, AUTH_CTX, false)
    expect(result).toEqual({ ok: true, tenantId: 'tenant-own' })
  })

  it('returns the caller\'s own tenant unchanged for an ordinary (non-composer) set, admin or not', async () => {
    adminHolder.client = makeClient({ tenant_id: 'tenant-other', is_composer_prompt: false })
    const asAdmin = await resolveTenantForPromptSet('set-1', AUTH_CTX, true)
    const asMember = await resolveTenantForPromptSet('set-1', AUTH_CTX, false)
    expect(asAdmin).toEqual({ ok: true, tenantId: 'tenant-own' })
    expect(asMember).toEqual({ ok: true, tenantId: 'tenant-own' })
  })

  it('overrides to the set\'s own tenant for a composer-family set, when the caller is a platform admin', async () => {
    adminHolder.client = makeClient({ tenant_id: 'tenant-sbl', is_composer_prompt: true })
    const result = await resolveTenantForPromptSet('set-composer', AUTH_CTX, true)
    expect(result).toEqual({ ok: true, tenantId: 'tenant-sbl' })
  })

  it('403s for a composer-family set when the caller is not a platform admin', async () => {
    adminHolder.client = makeClient({ tenant_id: 'tenant-sbl', is_composer_prompt: true })
    const result = await resolveTenantForPromptSet('set-composer', AUTH_CTX, false)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it('falls back to the caller\'s own tenant on a lookup miss (id does not exist)', async () => {
    adminHolder.client = makeClient(null)
    const result = await resolveTenantForPromptSet('missing-set', AUTH_CTX, true)
    expect(result).toEqual({ ok: true, tenantId: 'tenant-own' })
  })

  it('falls back to the caller\'s own tenant on a query error, rather than failing the request here', async () => {
    adminHolder.client = makeClient(null, { message: 'db down' })
    const result = await resolveTenantForPromptSet('set-1', AUTH_CTX, true)
    expect(result).toEqual({ ok: true, tenantId: 'tenant-own' })
  })
})
