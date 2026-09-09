import { describe, it, expect, vi } from 'vitest'
import { selectPromptSlot, buildSlotRules, DEFAULT_SLOT_KEY, type SlotRule } from './select-prompt'
import { makeInput } from './test-input'

describe('selectPromptSlot — Phase 1 rules 3–5', () => {
  it.each([
    ['anonymous visitor, no mode', makeInput({ memberId: null, mode: null })],
    ['member, no mode', makeInput({ memberId: 'member-1', mode: null })],
    ['visitor in question mode', makeInput({ memberId: null, mode: 'question' })],
    ['member in question mode', makeInput({ memberId: 'member-1', mode: 'question' })],
    ['no tenant at all', makeInput({ tenantId: null })],
  ])('resolves to the base slot via default-slot for: %s', (_label, input) => {
    expect(selectPromptSlot(input)).toEqual({ slotKey: DEFAULT_SLOT_KEY, ruleId: 'default-slot' })
    expect(DEFAULT_SLOT_KEY).toBe('base')
  })

  it('is deterministic — same input, same answer, no I/O', () => {
    const input = makeInput({ memberId: 'member-1', mode: 'question' })
    expect(selectPromptSlot(input)).toEqual(selectPromptSlot(input))
  })

  it('lists the rules in the documented order', () => {
    expect(buildSlotRules().map(r => r.id)).toEqual(['mode', 'member-status', 'default-slot'])
  })
})

describe('selectPromptSlot — rule data is the extension point', () => {
  it('a mode slot, once configured, wins over member-status and default', () => {
    const rules = buildSlotRules({ modeSlots: { question: 'faq' }, memberStatusSlots: { member: 'members-only' } })
    expect(selectPromptSlot(makeInput({ mode: 'question', memberId: 'member-1' }), rules)).toEqual({ slotKey: 'faq', ruleId: 'mode' })
  })

  it('a member-status slot applies to the matching status only', () => {
    const rules = buildSlotRules({ modeSlots: {}, memberStatusSlots: { visitor: 'onboarding' } })
    expect(selectPromptSlot(makeInput({ memberId: null }), rules)).toEqual({ slotKey: 'onboarding', ruleId: 'member-status' })
    expect(selectPromptSlot(makeInput({ memberId: 'member-1' }), rules)).toEqual({ slotKey: 'base', ruleId: 'default-slot' })
  })

  it('a mode slot is ignored when the turn has no mode', () => {
    const rules = buildSlotRules({ modeSlots: { question: 'faq' }, memberStatusSlots: {} })
    expect(selectPromptSlot(makeInput({ mode: null }), rules).ruleId).toBe('default-slot')
  })
})

describe('selectPromptSlot — fail-open', () => {
  it('skips a rule that throws and continues to the next', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rules: SlotRule[] = [
      { id: 'broken', slotFor: () => { throw new Error('rule bug') } },
      { id: 'next', slotFor: () => 'next-slot' },
    ]
    expect(selectPromptSlot(makeInput(), rules)).toEqual({ slotKey: 'next-slot', ruleId: 'next' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('falls back to default-slot when every rule declines or throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rules: SlotRule[] = [
      { id: 'declines', slotFor: () => null },
      { id: 'throws', slotFor: () => { throw new Error('x') } },
    ]
    expect(selectPromptSlot(makeInput(), rules)).toEqual({ slotKey: 'base', ruleId: 'default-slot' })
    spy.mockRestore()
  })
})
