import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeInput } from '../test-input'

const mockGetSessionContext = vi.fn<(sessionId: string | null, tenantId: string | null, isFirstTurn: boolean) => Promise<string | null>>()
vi.mock('../../session-context', () => ({
  getSessionContext: (...args: [string | null, string | null, boolean]) => mockGetSessionContext(...args),
}))

import { sessionContextProvider } from './session-context'

beforeEach(() => mockGetSessionContext.mockReset())

describe('sessionContextProvider', () => {
  it('applies only with both a session and a tenant (the resolver\'s own precondition)', () => {
    expect(sessionContextProvider.appliesTo(makeInput({ sessionId: 's', tenantId: 't' }))).toBe(true)
    expect(sessionContextProvider.appliesTo(makeInput({ sessionId: null, tenantId: 't' }))).toBe(false)
    expect(sessionContextProvider.appliesTo(makeInput({ sessionId: 's', tenantId: null }))).toBe(false)
  })

  it('returns the already-delineated block verbatim and stays system-trust so it is not double-wrapped', async () => {
    const block = 'The following is reference context…\n\n<session_context>\n  <name>Trip</name>\n</session_context>'
    mockGetSessionContext.mockResolvedValue(block)
    expect(await sessionContextProvider.resolve(makeInput({ sessionId: 's', isFirstTurn: false }))).toBe(block)
    expect(mockGetSessionContext).toHaveBeenCalledWith('s', 'tenant-1', false)
    expect(sessionContextProvider.trust).toBe('system')
  })

  it('returns null when the session has no attached context', async () => {
    mockGetSessionContext.mockResolvedValue(null)
    expect(await sessionContextProvider.resolve(makeInput({ sessionId: 's' }))).toBeNull()
  })
})
