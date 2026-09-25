// services/chat/server/turn-context/select-prompt.ts
//
// Job #1 — deterministic prompt-slot selection. An ordered rule list, first
// non-null answer wins, evaluated synchronously from the turn input with no
// I/O: the *decision* costs nothing per turn; only the *fetch* of the chosen
// slot touches the database (Phase 4, services/prompt).
//
// Design Handovers/september_2026/traffic_cop_design_2026-09-05.md §5.4 lists five rules.
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
// Per-tenant configuration (2026-09-25). SlotRuleConfig is keyed by
// tenant_id; each tenant gets its own TenantSlotConfig. The config was
// previously one flat object shared by every tenant, so any slot mapping
// added for one tenant (e.g. Heirloom's 'visitor') would have been
// inherited by every other tenant the moment its rule conditions matched,
// pointing them at a slot they never published. Now:
//
//   - mode and member-status look up input.tenantId first. No entry, or the
//     field unset → null (no opinion) → on to default-slot. A tenant with no
//     entry is never routed by either rule.
//   - account-status is deliberately NOT tenant-gated (Jeff, 2026-09-25): a
//     suspended/deleted member is blocked on every tenant — BLOCKED_MEMBER_
//     STATUSES is a statement about what those statuses mean, not a
//     per-tenant choice. The tenant entry only names the slot holding that
//     tenant's editable blocked copy; blocked-turn.ts reads a slot only when
//     the entry declares one, and serves its built-in copy otherwise.
//
// Giving a tenant a mode-, status- or blocked-specific slot is an edit to
// that tenant's entry in DEFAULT_SLOT_RULE_CONFIG (and the slot must be
// published for that tenant); it never affects any other tenant.

import { HEIRLOOM_TENANT_ID } from '@/services/members'
import type { TurnContextInput } from './types'

/** prompt_types.key of the untyped/default slot — what every tenant runs on today. */
export const DEFAULT_SLOT_KEY = 'base'

/**
 * prompt_types.key of the slot a suspended/deleted member is routed to. Its
 * live compiled content is the fixed reply the member sees — no model call
 * (blocked-turn.ts). Created through the Prompt Sets admin UI so the copy
 * is editable; blocked-turn.ts carries a fallback for tenants without one.
 */
export const BLOCKED_SLOT_KEY = 'blocked'

/**
 * members.status values that are blocked on every tenant. Deliberately not
 * distinguished from each other, and deliberately shared — what these
 * statuses mean is not a per-tenant choice.
 */
export const BLOCKED_MEMBER_STATUSES: readonly string[] = ['suspended', 'deleted']

/** One tenant's slot choices. Every field is optional; unset means "no opinion". */
export interface TenantSlotConfig {
  /**
   * The slot holding this tenant's editable blocked-member copy. Does not
   * decide *whether* a member is blocked (that is universal) — only which
   * published slot blocked-turn.ts reads the reply from.
   */
  blockedSlotKey?: string
  /** Mode → slot key, e.g. `{ question: 'faq' }`. */
  modeSlots?: Partial<Record<NonNullable<TurnContextInput['mode']>, string>>
  /** Member-or-visitor → slot key, e.g. `{ visitor: 'visitor' }`. */
  memberStatusSlots?: { member?: string; visitor?: string }
}

/** tenant_id → that tenant's slot choices. A tenant with no entry is untouched by every tenant-scoped rule. */
export type SlotRuleConfig = Record<string, TenantSlotConfig>

export const DEFAULT_SLOT_RULE_CONFIG: SlotRuleConfig = {
  [HEIRLOOM_TENANT_ID]: {
    blockedSlotKey: BLOCKED_SLOT_KEY,
    memberStatusSlots: { visitor: 'visitor' },
  },
}

/**
 * The tenant's own entry, or null when there is none. Own-property check
 * only, so a tenant id can never resolve to an inherited Object key.
 */
export function tenantSlotConfig(
  tenantId: string | null,
  config: SlotRuleConfig = DEFAULT_SLOT_RULE_CONFIG,
): TenantSlotConfig | null {
  if (tenantId === null || !Object.prototype.hasOwnProperty.call(config, tenantId)) return null
  return config[tenantId]
}

export interface SlotRule {
  id: string
  /** A slot key, or null for "this rule has no opinion on this turn". */
  slotFor(input: TurnContextInput): string | null
}

export function buildSlotRules(config: SlotRuleConfig = DEFAULT_SLOT_RULE_CONFIG): SlotRule[] {
  return [
    {
      // First, and unconditional on everything else — including tenant: a
      // suspended or deleted member never reaches the tenant's normal
      // prompt, whatever the mode or session. The tenant entry only picks
      // the slot key; without one the platform key is used and
      // blocked-turn.ts serves its built-in copy without reading any slot.
      // Anonymous (memberStatus null) and every other status fall through.
      id: 'account-status',
      slotFor: input =>
        input.memberStatus !== null && BLOCKED_MEMBER_STATUSES.includes(input.memberStatus)
          ? tenantSlotConfig(input.tenantId, config)?.blockedSlotKey ?? BLOCKED_SLOT_KEY
          : null,
    },
    {
      id: 'mode',
      slotFor: input => {
        if (!input.mode) return null
        return tenantSlotConfig(input.tenantId, config)?.modeSlots?.[input.mode] ?? null
      },
    },
    {
      id: 'member-status',
      slotFor: input => {
        const slots = tenantSlotConfig(input.tenantId, config)?.memberStatusSlots
        return (input.memberId !== null ? slots?.member : slots?.visitor) ?? null
      },
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
