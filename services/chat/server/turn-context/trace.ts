// services/chat/server/turn-context/trace.ts
//
// One audit_events row per turn saying what went into the prompt and why —
// the observability the design (§5.8) requires from the first version, so
// "why did the AI do X" has a trail to follow instead of being reconstructed
// from Vercel logs.
//
// Content-free by construction: the record carries ids, statuses, token
// estimates, timings, the selected slot/compiled-prompt id, and whatever a
// provider put in its block `meta` — which the ContextProvider contract
// restricts to presence/length/hash. Never a block body, never a raw
// identity value, never a coordinate (CLAUDE.md rule 6; design §5.7).

import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import type { ResolvedTurnPrompt } from './types'

export interface TurnContextTraceContext {
  tenantId: string | null
  sessionId: string | null
  memberId: string | null
  correlationId: string | null
  /**
   * True while the traffic cop runs alongside the legacy assembly and its
   * output is NOT what the model received (Phase 2). `parity` then says
   * whether the two strings matched.
   */
  shadow: boolean
  parity?: boolean
}

export function buildTurnContextMetadata(
  resolved: ResolvedTurnPrompt,
  ctx: Pick<TurnContextTraceContext, 'shadow' | 'parity'>,
): Record<string, unknown> {
  return {
    selection: resolved.selection,
    injections: resolved.injections,
    budget: resolved.budget,
    isFirstTurn: resolved.isFirstTurn,
    turnIndex: resolved.turnIndex,
    systemLength: resolved.system.length,
    shadow: ctx.shadow,
    ...(ctx.parity !== undefined ? { parity: ctx.parity } : {}),
  }
}

/** Fire-and-forget, like every other logEvent call site — never blocks or fails the turn. */
export function recordTurnContext(resolved: ResolvedTurnPrompt, ctx: TurnContextTraceContext): void {
  void logEvent({
    action: AuditAction.CHAT_TURN_CONTEXT_RESOLVED,
    tenant_id: ctx.tenantId,
    actor_type: ctx.memberId ? 'user' : 'anonymous',
    target_type: 'chat_session',
    target_id: ctx.sessionId,
    correlation_id: ctx.correlationId,
    outcome: 'success',
    metadata: buildTurnContextMetadata(resolved, ctx),
  })
}
