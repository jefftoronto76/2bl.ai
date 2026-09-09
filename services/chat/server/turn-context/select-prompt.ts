// services/chat/server/turn-context/select-prompt.ts
//
// Job #1 — deterministic prompt-slot selection. An ordered rule list, first
// non-null answer wins, evaluated synchronously from the turn input with no
// I/O: the *decision* costs nothing per turn; only the *fetch* of the chosen
// slot touches the database (Phase 4, services/prompt).
//
// Design Handovers/traffic_cop_design_2026-09-05.md §5.4 lists five rules.
// Phase 1 ships rules 3–5. Rules 1–2 need schema that does not exist yet:
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

export interface SlotRuleConfig {
  /** Mode → slot key, e.g. `{ question: 'faq' }`. Empty today. */
  modeSlots: Partial<Record<NonNullable<TurnContextInput['mode']>, string>>
  /** Member-status → slot key, e.g. `{ visitor: 'onboarding' }`. Empty today. */
  memberStatusSlots: { member?: string; visitor?: string }
}

export const DEFAULT_SLOT_RULE_CONFIG: SlotRuleConfig = {
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
