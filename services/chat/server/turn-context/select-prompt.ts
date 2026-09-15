// services/chat/server/turn-context/select-prompt.ts
//
// Job #1 — deterministic prompt-slot selection. An ordered rule list, first
// non-null answer wins, evaluated synchronously from the turn input with no
// I/O: the *decision* costs nothing per turn; only the *fetch* of the chosen
// slot touches the database (Phase 4, services/prompt).
//
// Design Handovers/traffic_cop_design_2026-09-05.md §5.4 lists five rules.
// Phase 1 shipped rules 3–5; the account-status rule (2026-09-15) sits ahead
// of all of them. Rules 1–2 need schema that does not exist yet:
//   1. session-token   — chat_sessions has no link to the session_tokens row
//                         that opened it.
//   2. session-context-type — a context_type → slot mapping; the
//                         chat_session_context row is read by the
//                         session-context provider, not yet shared here.
// Both are Jeff's Studio work (design §9.3) and land as rules here, not as
// changes to the runner or the providers.
//
// Rules 3 and 4 are present but have no opinion today: no tenant has
// published a mode-specific or member/visitor-specific slot. They return
// null so the decision record truthfully says `default-slot` rather than
// implying a mode- or status-driven choice was made. Giving either an
// opinion is a data change to SlotRuleConfig, not a code change.

import type { TurnContextInput } from './types'

/** prompt_types.key of the untyped/default slot — what every tenant runs on today. */
export const DEFAULT_SLOT_KEY = 'base'

/**
 * prompt_types.key of the slot a suspended/deleted member is routed to. Its
 * live compiled content is the fixed reply the member sees — no model call
 * (blocked-turn.ts). Created through the Prompt Sets admin UI so the copy
 * is editable; blocked-turn.ts carries a fallback until it exists.
 */
export const BLOCKED_SLOT_KEY = 'blocked'

/** members.status values that route to the blocked slot. Deliberately not distinguished from each other. */
export const BLOCKED_MEMBER_STATUSES: readonly string[] = ['suspended', 'deleted']

export interface SlotRuleConfig {
  /** members.status values routed to `blockedSlotKey` before any other rule runs. */
  blockedStatuses: readonly string[]
  blockedSlotKey: string
  /** Mode → slot key, e.g. `{ question: 'faq' }`. Empty today. */
  modeSlots: Partial<Record<NonNullable<TurnContextInput['mode']>, string>>
  /** Member-status → slot key, e.g. `{ visitor: 'onboarding' }`. Empty today. */
  memberStatusSlots: { member?: string; visitor?: string }
}

export const DEFAULT_SLOT_RULE_CONFIG: SlotRuleConfig = {
  blockedStatuses: BLOCKED_MEMBER_STATUSES,
  blockedSlotKey: BLOCKED_SLOT_KEY,
  modeSlots: {},
  memberStatusSlots: {},
}

export interface SlotRule {
  id: string
  /** A slot key, or null for "this rule has no opinion on this turn". */
  slotFor(input: TurnContextInput): string | null
}

export function buildSlotRules(config: SlotRuleConfig = DEFAULT_SLOT_RULE_CONFIG): SlotRule[] {
  return [
    {
      // First, and unconditional on everything else: a suspended or deleted
      // member never reaches the tenant's normal prompt, whatever the mode
      // or session. Anonymous (memberStatus null) and every other status
      // fall through untouched.
      id: 'account-status',
      slotFor: input =>
        input.memberStatus !== null && config.blockedStatuses.includes(input.memberStatus)
          ? config.blockedSlotKey
          : null,
    },
    {
      id: 'mode',
      slotFor: input => (input.mode ? config.modeSlots[input.mode] ?? null : null),
    },
    {
      id: 'member-status',
      slotFor: input =>
        (input.memberId !== null ? config.memberStatusSlots.member : config.memberStatusSlots.visitor) ?? null,
    },
    {
      id: 'default-slot',
      slotFor: () => DEFAULT_SLOT_KEY,
    },
  ]
}

export interface SlotDecision {
  slotKey: string
  ruleId: string
}

/**
 * First rule with an opinion wins. A rule that throws is skipped (fail-open
 * to the next rule, and ultimately to default-slot), never surfaced as a
 * turn failure — the same posture the runner gives providers.
 */
export function selectPromptSlot(
  input: TurnContextInput,
  rules: readonly SlotRule[] = buildSlotRules(),
): SlotDecision {
  for (const rule of rules) {
    try {
      const slotKey = rule.slotFor(input)
      if (slotKey) return { slotKey, ruleId: rule.id }
    } catch (err) {
      console.error('[chat/turn-context] slot rule threw — skipping:', rule.id, err instanceof Error ? err.message : err)
    }
  }
  return { slotKey: DEFAULT_SLOT_KEY, ruleId: 'default-slot' }
}
