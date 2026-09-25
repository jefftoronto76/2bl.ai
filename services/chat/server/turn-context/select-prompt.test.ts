import { describe, it, expect, vi } from 'vitest'
import { HEIRLOOM_TENANT_ID } from '@/services/members'
import {
  selectPromptSlot,
  buildSlotRules,
  tenantSlotConfig,
  DEFAULT_SLOT_KEY,
  BLOCKED_SLOT_KEY,
  BLOCKED_MEMBER_STATUSES,
  DEFAULT_SLOT_RULE_CONFIG,
  type SlotRule,
  type SlotRuleConfig,
} from './select-prompt'
import { makeInput } from './test-input'
import type { TurnContextInput } from './types'

// Real production tenants.id values (verified 2026-09-25). Neither has an
// entry in DEFAULT_SLOT_RULE_CONFIG, and neither has published any slot
// other than 'base'.
const JEFF_LOUGHEED_TENANT_ID = 'e07334a0-2afd-4544-898b-edb124d2dd33'
const SECOND_BRAIN_LABS_TENANT_ID = '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb'
const UNKNOWN_TENANT_ID = '00000000-0000-4000-8000-000000000000'

const heirloom = (o: Partial<TurnContextInput> = {}) => makeInput({ tenantId: HEIRLOOM_TENANT_ID, ...o })

/** Calls one rule by id directly, so a test can assert *that rule's* opinion, not just the end result. */
function ruleOpinion(id: string, input: TurnContextInput, config?: SlotRuleConfig): string | null {
  const rule = buildSlotRules(config).find(r => r.id === id)
  if (!rule) throw new Error(`no rule ${id}`)
  return rule.slotFor(input)
}

describe('selectPromptSlot — rule order and determinism', () => {
  it('lists the rules in the documented order, account-status first', () => {
    expect(buildSlotRules().map(r => r.id)).toEqual(['account-status', 'mode', 'member-status', 'default-slot'])
  })

  it('is deterministic — same input, same answer, no I/O', () => {
    const input = heirloom({ memberId: null, mode: 'question' })
    expect(selectPromptSlot(input)).toEqual(selectPromptSlot(input))
  })

  it('the default config has exactly one tenant entry: Heirloom', () => {
    expect(Object.keys(DEFAULT_SLOT_RULE_CONFIG)).toEqual([HEIRLOOM_TENANT_ID])
    expect(DEFAULT_SLOT_RULE_CONFIG[HEIRLOOM_TENANT_ID]).toEqual({
      blockedSlotKey: BLOCKED_SLOT_KEY,
      memberStatusSlots: { visitor: 'visitor' },
    })
  })

  it('HEIRLOOM_TENANT_ID is the real Heirloom tenants.id', () => {
    expect(HEIRLOOM_TENANT_ID).toBe('20767f1d-1148-4e43-ab73-f6da88f0ac56')
  })
})

describe('Heirloom (has an entry)', () => {
  // The regression that matters most: this is the one slot rule live in
  // production today, and it must be byte-for-byte unchanged.
  it.each(['suspended', 'deleted'])('a %s member still routes to blocked via account-status — unchanged', status => {
    expect(selectPromptSlot(heirloom({ memberId: 'm', memberStatus: status }))).toEqual({
      slotKey: 'blocked',
      ruleId: 'account-status',
    })
    expect(BLOCKED_SLOT_KEY).toBe('blocked')
  })

  it('a suspended member is blocked even in question mode (account-status wins over everything)', () => {
    expect(selectPromptSlot(heirloom({ memberId: 'm', memberStatus: 'suspended', mode: 'question' }))).toEqual({
      slotKey: 'blocked',
      ruleId: 'account-status',
    })
  })

  it('an anonymous visitor routes to visitor via member-status', () => {
    expect(selectPromptSlot(heirloom({ memberId: null, memberStatus: null }))).toEqual({
      slotKey: 'visitor',
      ruleId: 'member-status',
    })
  })

  it.each(['active', 'invited', 'waitlist', 'pending'])('a %s member falls through to default-slot (no member slot configured)', status => {
    expect(selectPromptSlot(heirloom({ memberId: 'm', memberStatus: status }))).toEqual({
      slotKey: DEFAULT_SLOT_KEY,
      ruleId: 'default-slot',
    })
  })

  it('has no mode slot, so mode never has an opinion', () => {
    expect(ruleOpinion('mode', heirloom({ mode: 'question' }))).toBeNull()
  })
})

describe.each([
  ['jefflougheed.ca', JEFF_LOUGHEED_TENANT_ID],
  ['Second Brain Labs', SECOND_BRAIN_LABS_TENANT_ID],
  ['an unknown tenant id', UNKNOWN_TENANT_ID],
  ['no tenant at all', null],
])('%s (no entry) — untouched by every tenant-scoped rule', (_label, tenantId) => {
  const input = (o: Partial<TurnContextInput> = {}) => makeInput({ tenantId, ...o })

  it('has no config entry at all', () => {
    expect(tenantSlotConfig(tenantId)).toBeNull()
  })

  it.each([
    ['anonymous visitor', { memberId: null, memberStatus: null }],
    ['anonymous visitor in question mode', { memberId: null, memberStatus: null, mode: 'question' as const }],
    ['active member', { memberId: 'm', memberStatus: 'active' }],
    ['active member in question mode', { memberId: 'm', memberStatus: 'active', mode: 'question' as const }],
  ])('%s: mode and member-status each decline, result is default-slot', (_l, o) => {
    expect(ruleOpinion('mode', input(o))).toBeNull()
    expect(ruleOpinion('member-status', input(o))).toBeNull()
    expect(ruleOpinion('account-status', input(o))).toBeNull()
    expect(selectPromptSlot(input(o))).toEqual({ slotKey: DEFAULT_SLOT_KEY, ruleId: 'default-slot' })
  })

  it.each(['suspended', 'deleted'])('a %s member is still blocked (platform-wide), with no tenant-chosen slot in play', status => {
    // Blocking is universal by decision (2026-09-25); what this tenant lacks
    // is an editable copy, so blocked-turn.ts serves the built-in one and
    // reads no slot (asserted in blocked-turn.test.ts).
    expect(selectPromptSlot(input({ memberId: 'm', memberStatus: status }))).toEqual({
      slotKey: BLOCKED_SLOT_KEY,
      ruleId: 'account-status',
    })
    expect(tenantSlotConfig(tenantId)?.blockedSlotKey).toBeUndefined()
  })

  it('never reads any tenant-scoped field from the config', () => {
    // A config that records every property read. For a tenant with no
    // entry the rules may only ask "is there an entry?" — never reach into
    // blockedSlotKey / modeSlots / memberStatusSlots of anything.
    const reads: string[] = []
    const heirloomEntry = new Proxy(DEFAULT_SLOT_RULE_CONFIG[HEIRLOOM_TENANT_ID], {
      get(target, key, receiver) {
        reads.push(String(key))
        return Reflect.get(target, key, receiver)
      },
    })
    const config: SlotRuleConfig = { [HEIRLOOM_TENANT_ID]: heirloomEntry }
    const rules = buildSlotRules(config)
    for (const o of [
      { memberId: null, memberStatus: null, mode: 'question' as const },
      { memberId: 'm', memberStatus: 'active' },
      { memberId: 'm', memberStatus: 'suspended' },
    ]) {
      selectPromptSlot(input(o), rules)
    }
    expect(reads).toEqual([])
  })
})

describe('the per-tenant config is the extension point — and stays per-tenant', () => {
  const OTHER = 'tenant-other'
  const config: SlotRuleConfig = {
    [HEIRLOOM_TENANT_ID]: { blockedSlotKey: 'heirloom-blocked', modeSlots: { question: 'faq' }, memberStatusSlots: { member: 'members-only', visitor: 'visitor' } },
  }
  const rules = buildSlotRules(config)

  it('a mode slot, once configured, wins over member-status and default — for that tenant', () => {
    expect(selectPromptSlot(heirloom({ mode: 'question', memberId: 'm' }), rules)).toEqual({ slotKey: 'faq', ruleId: 'mode' })
  })

  it('a member-status slot applies to the matching status only', () => {
    expect(selectPromptSlot(heirloom({ memberId: null }), rules)).toEqual({ slotKey: 'visitor', ruleId: 'member-status' })
    expect(selectPromptSlot(heirloom({ memberId: 'm' }), rules)).toEqual({ slotKey: 'members-only', ruleId: 'member-status' })
  })

  it('a mode slot is ignored when the turn has no mode', () => {
    expect(ruleOpinion('mode', heirloom({ mode: null }), config)).toBeNull()
  })

  it("a tenant's custom blocked slot key is used for that tenant's blocked members", () => {
    expect(selectPromptSlot(heirloom({ memberId: 'm', memberStatus: 'suspended' }), rules)).toEqual({
      slotKey: 'heirloom-blocked',
      ruleId: 'account-status',
    })
  })

  it("never applies to another tenant: every one of Heirloom's choices is invisible to it", () => {
    const other = (o: Partial<TurnContextInput>) => makeInput({ tenantId: OTHER, ...o })
    expect(selectPromptSlot(other({ mode: 'question', memberId: 'm' }), rules)).toEqual({ slotKey: 'base', ruleId: 'default-slot' })
    expect(selectPromptSlot(other({ memberId: null }), rules)).toEqual({ slotKey: 'base', ruleId: 'default-slot' })
    expect(selectPromptSlot(other({ memberId: 'm', memberStatus: 'suspended' }), rules)).toEqual({
      slotKey: BLOCKED_SLOT_KEY, // the platform key, never Heirloom's 'heirloom-blocked'
      ruleId: 'account-status',
    })
  })

  it('an entry with every field unset behaves exactly like no entry', () => {
    const empty = buildSlotRules({ [OTHER]: {} })
    const other = (o: Partial<TurnContextInput>) => makeInput({ tenantId: OTHER, ...o })
    expect(selectPromptSlot(other({ memberId: null, mode: 'question' }), empty)).toEqual({ slotKey: 'base', ruleId: 'default-slot' })
  })

  it('a tenant id that names an inherited Object key is not an entry', () => {
    expect(tenantSlotConfig('constructor')).toBeNull()
    expect(tenantSlotConfig('__proto__')).toBeNull()
    expect(selectPromptSlot(makeInput({ tenantId: 'toString', memberId: null }))).toEqual({ slotKey: 'base', ruleId: 'default-slot' })
  })
})

describe('BLOCKED_MEMBER_STATUSES — shared, not per-tenant', () => {
  it('blocks exactly suspended and deleted', () => {
    expect([...BLOCKED_MEMBER_STATUSES]).toEqual(['suspended', 'deleted'])
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
