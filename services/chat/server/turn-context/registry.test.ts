// The registry is the extension point, so this test is the lint that keeps
// "add a provider" a contained change: unique ids and orders, every
// declared field present, exactly one budget-exempt provider (the base
// prompt), and a colocated test file for every provider.

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// The providers reach real resolvers at import time only through their
// module graph — stub the DB client so importing the registry in a test
// never constructs a Supabase client.
import { vi } from 'vitest'
vi.mock('@/services/auth/supabase-admin', () => ({ getAdminClient: () => ({}) }))

import { PROVIDERS } from './registry'

describe('PROVIDERS registry', () => {
  it('registers the six Phase 1 providers in prompt order', () => {
    expect(PROVIDERS.map(p => p.id)).toEqual([
      'base-prompt',
      'booking',
      'member-context',
      'session-context',
      'media',
      'question-mode',
    ])
    const orders = PROVIDERS.map(p => p.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('has unique ids and unique orders', () => {
    expect(new Set(PROVIDERS.map(p => p.id)).size).toBe(PROVIDERS.length)
    expect(new Set(PROVIDERS.map(p => p.order)).size).toBe(PROVIDERS.length)
  })

  it('declares freshness, trust, pii, and a numeric priority on every provider', () => {
    for (const p of PROVIDERS) {
      expect(['turn', 'session', 'static'], p.id).toContain(p.freshness)
      expect(['system', 'operator', 'participant'], p.id).toContain(p.trust)
      expect(['none', 'identity', 'location'], p.id).toContain(p.pii)
      expect(typeof p.priority, p.id).toBe('number')
    }
  })

  it('exempts exactly one provider from the budget — the base prompt', () => {
    expect(PROVIDERS.filter(p => p.budgetExempt).map(p => p.id)).toEqual(['base-prompt'])
  })

  it('has a colocated test file for every provider', () => {
    for (const p of PROVIDERS) {
      const testFile = join(__dirname, 'providers', `${p.id}.test.ts`)
      expect(existsSync(testFile), `${p.id} needs providers/${p.id}.test.ts`).toBe(true)
    }
  })

  it('applies no per-provider timeout in Phase 1 (deadlines wait for shadow data)', () => {
    for (const p of PROVIDERS) expect(p.timeoutMs, p.id).toBeUndefined()
  })
})
