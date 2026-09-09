import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SystemPromptRecord } from '@/services/prompt/compiler'
import { makeInput } from '../test-input'

const mockGetSystemPromptRecord = vi.fn<(tenantId: string | null) => Promise<SystemPromptRecord>>()
vi.mock('@/services/prompt/compiler', () => ({
  getSystemPromptRecord: (tenantId: string | null) => mockGetSystemPromptRecord(tenantId),
}))

import { basePromptProvider } from './base-prompt'

beforeEach(() => mockGetSystemPromptRecord.mockReset())

describe('basePromptProvider', () => {
  it('is tier 0, budget-exempt, and applies to every turn — even with no tenant', () => {
    expect(basePromptProvider).toMatchObject({ id: 'base-prompt', order: 0, priority: 0, budgetExempt: true, trust: 'system' })
    expect(basePromptProvider.appliesTo(makeInput({ tenantId: null }))).toBe(true)
  })

  it('returns the compiled content with the row id/version in meta', async () => {
    mockGetSystemPromptRecord.mockResolvedValue({ content: 'LIVE', compiledPromptId: 'cp-1', version: 23, fallback: false })
    const block = await basePromptProvider.resolve(makeInput({ tenantId: 'tenant-1' }))
    expect(block).toEqual({ body: 'LIVE', meta: { compiledPromptId: 'cp-1', version: 23, fallback: false } })
    expect(mockGetSystemPromptRecord).toHaveBeenCalledWith('tenant-1')
  })

  it('surfaces the fallback and its reason in meta', async () => {
    mockGetSystemPromptRecord.mockResolvedValue({ content: 'DEFAULT', compiledPromptId: null, version: null, fallback: true, fallbackReason: 'no-live-row' })
    const block = await basePromptProvider.resolve(makeInput())
    expect(block).toEqual({ body: 'DEFAULT', meta: { compiledPromptId: null, version: null, fallback: true, fallbackReason: 'no-live-row' } })
  })
})
