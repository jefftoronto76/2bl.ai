import { describe, it, expect } from 'vitest'
import { deriveTurnSignals } from './index'

vi.mock('@/services/auth/supabase-admin', () => ({ getAdminClient: () => ({}) }))
import { vi } from 'vitest'

// Mirrors index.test.ts's "isFirstTurn computation" suite for streamChat —
// the traffic cop must agree with it exactly.
describe('deriveTurnSignals', () => {
  it('first turn: no prior assistant message', () => {
    expect(deriveTurnSignals([{ role: 'user', content: 'Hi' }])).toEqual({ isFirstTurn: true, turnIndex: 0 })
  })

  it('first turn: empty conversation (the greeting trigger)', () => {
    expect(deriveTurnSignals([])).toEqual({ isFirstTurn: true, turnIndex: 0 })
  })

  it('later turn: a non-empty assistant reply exists', () => {
    expect(
      deriveTurnSignals([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'user', content: 'Tell me more' },
      ]),
    ).toEqual({ isFirstTurn: false, turnIndex: 1 })
  })

  it('still the first turn when the only prior assistant turn is an empty failed-attempt placeholder', () => {
    expect(
      deriveTurnSignals([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Hi' },
      ]),
    ).toEqual({ isFirstTurn: true, turnIndex: 0 })
  })

  it('whitespace-only assistant content does not count as a reply', () => {
    expect(deriveTurnSignals([{ role: 'assistant', content: '   \n' }]).isFirstTurn).toBe(true)
  })

  it('counts every non-empty assistant turn', () => {
    expect(
      deriveTurnSignals([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: 'd' },
        { role: 'user', content: 'e' },
      ]).turnIndex,
    ).toBe(2)
  })
})
