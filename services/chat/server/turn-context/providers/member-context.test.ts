import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeInput } from '../test-input'

const mockGetMemberContext = vi.fn<
  (sessionId: string | null, tenantId: string | null, memberId: string | null | undefined, isFirstTurn: boolean) => Promise<string | null>
>()
vi.mock('../../member-context', () => ({
  getMemberContext: (...args: [string | null, string | null, string | null | undefined, boolean]) =>
    mockGetMemberContext(...args),
}))

import { memberContextProvider, MEMBER_CONTEXT_HEADER } from './member-context'

beforeEach(() => mockGetMemberContext.mockReset())

describe('memberContextProvider', () => {
  it('applies when a session OR a member is present — streamChat\'s exact gate', () => {
    expect(memberContextProvider.appliesTo(makeInput({ sessionId: 'session-1', memberId: null }))).toBe(true)
    expect(memberContextProvider.appliesTo(makeInput({ sessionId: null, memberId: 'member-1' }))).toBe(true)
    expect(memberContextProvider.appliesTo(makeInput({ sessionId: null, memberId: null }))).toBe(false)
  })

  it('adds the MEMBER CONTEXT header streamChat has always added at the call site', async () => {
    mockGetMemberContext.mockResolvedValue("Member's name is Sarah.")
    const block = await memberContextProvider.resolve(
      makeInput({ sessionId: 'session-1', tenantId: 'tenant-1', memberId: 'member-1', isFirstTurn: true }),
    )
    expect(block).toEqual({
      body: `${MEMBER_CONTEXT_HEADER}Member's name is Sarah.`,
      meta: { firstTurnMarkerInstruction: true },
    })
    expect(MEMBER_CONTEXT_HEADER).toBe('MEMBER CONTEXT:\n')
    expect(mockGetMemberContext).toHaveBeenCalledWith('session-1', 'tenant-1', 'member-1', true)
  })

  it('threads isFirstTurn through unchanged', async () => {
    mockGetMemberContext.mockResolvedValue('x')
    await memberContextProvider.resolve(makeInput({ sessionId: 's', isFirstTurn: false }))
    expect(mockGetMemberContext).toHaveBeenLastCalledWith('s', 'tenant-1', null, false)
  })

  it('returns null (no header, nothing injected) when the member has nothing to say', async () => {
    mockGetMemberContext.mockResolvedValue(null)
    expect(await memberContextProvider.resolve(makeInput({ sessionId: 's' }))).toBeNull()
  })

  it('is declared as carrying identity PII and, in Phase 1, system trust', () => {
    expect(memberContextProvider).toMatchObject({ pii: 'identity', trust: 'system', order: 20 })
  })
})
