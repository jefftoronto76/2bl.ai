// services/chat/server/turn-context/blocked-turn.ts
//
// The account-status rule's action. select-prompt.ts decides — synchronously,
// with no I/O — that a suspended or deleted member's turn is blocked (on
// every tenant); this module turns that decision into a fixed reply, before
// any model call, and records it the same way every other turn is recorded.
//
// The reply text is the live compiled prompt in the slot the tenant's own
// SlotRuleConfig entry names as its `blockedSlotKey` (a real prompt_types /
// prompt_set / Compile & Publish entry, so the copy is editable in the admin
// UI), with the compile-time section tags stripped. A tenant with no such
// entry never has a slot read on its behalf — it gets
// BLOCKED_TURN_FALLBACK_TEXT directly, rather than a lookup for a slot it
// never published. The same copy is used if the configured slot has no live
// row or the read fails: a blocked member is still blocked, never let
// through because the copy could not be loaded.
//
// Wire format: the same Vercel AI SDK data stream /api/sage always returns,
// so the client (services/chat/ui/v1/useChatTurn.ts → readDataStream) renders
// it like any other reply with no client change.

import { formatStreamPart } from 'ai'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
import { compiledContentToPlainText, selectCompiledPrompt } from '@/services/prompt/select'
import { tokensFor } from '@/services/prompt/tokenize'
import { deriveTurnSignals } from './index'
import { selectPromptSlot, tenantSlotConfig } from './select-prompt'
import { buildTurnContextMetadata } from './trace'
import type { PromptSelection, ResolvedTurnPrompt, TurnContextInput, TurnContextRequest } from './types'

/**
 * Draft copy (2026-09-15). Also the text to paste into the 'blocked' slot's
 * block when it is created in the admin UI — deliberately the same words, so
 * the fallback and the editable version start identical. Does not
 * distinguish suspended from deleted.
 */
export const BLOCKED_TURN_FALLBACK_TEXT =
  "Your account isn't able to use this chat right now. If you'd like to start fresh, you're welcome to create a new account — or contact support and we'll help sort things out."

export interface BlockedTurn {
  /** The fixed reply, ready to send. */
  text: string
  selection: PromptSelection
}

/**
 * Returns the blocked reply when the slot rules route this turn to the
 * blocked slot, or null when the turn should proceed normally. Never throws:
 * a failure loading the editable copy falls back to the built-in copy — the
 * block itself is the rule's decision, not the read's.
 */
export async function resolveBlockedTurn(request: TurnContextRequest): Promise<BlockedTurn | null> {
  const input: TurnContextInput = { ...request, ...deriveTurnSignals(request.messages) }
  const slot = selectPromptSlot(input)
  // Keyed on the rule, not the slot key: a tenant may name its own blocked slot.
  if (slot.ruleId !== 'account-status') return null

  let text = BLOCKED_TURN_FALLBACK_TEXT
  let selection: PromptSelection = {
    slotKey: slot.slotKey,
    ruleId: slot.ruleId,
    compiledPromptId: null,
    version: null,
    fallback: true,
  }
  // Only a tenant that declared a blocked slot gets a read; everyone else
  // keeps the built-in copy with no lookup attempted.
  const configuredSlot = tenantSlotConfig(request.tenantId)?.blockedSlotKey ?? null
  try {
    const compiled = configuredSlot ? await selectCompiledPrompt(request.tenantId, configuredSlot) : null
    if (compiled) {
      const plain = compiledContentToPlainText(compiled.content)
      if (plain.length > 0) {
        text = plain
        selection = { ...selection, compiledPromptId: compiled.compiledPromptId, version: compiled.version, fallback: false }
      }
    }
  } catch (err) {
    console.error('[chat/turn-context] blocked slot read threw — using fallback copy:', err instanceof Error ? err.message : err)
  }

  recordBlockedTurn(request, input, selection, text)
  return { text, selection }
}

function recordBlockedTurn(
  request: TurnContextRequest,
  input: TurnContextInput,
  selection: PromptSelection,
  text: string,
): void {
  const resolved: ResolvedTurnPrompt = {
    system: '',
    blocks: [],
    selection,
    injections: [],
    budget: { capTokens: 0, enforce: false, usedTokens: tokensFor(text), budgetedTokens: 0, overCap: false, droppedIds: [] },
    isFirstTurn: input.isFirstTurn,
    turnIndex: input.turnIndex,
  }
  try {
    void logEvent({
      action: AuditAction.CHAT_TURN_CONTEXT_RESOLVED,
      tenant_id: request.tenantId,
      actor_type: request.memberId ? 'user' : 'anonymous',
      target_type: 'chat_session',
      target_id: request.sessionId,
      correlation_id: request.correlationId,
      outcome: 'success',
      metadata: buildTurnContextMetadata(resolved, { shadow: false, blocked: true }),
    })
  } catch (err) {
    console.error('[chat/turn-context] blocked-turn audit write threw:', err instanceof Error ? err.message : err)
  }
}

/**
 * The fixed reply as a Vercel AI SDK data-stream Response — the same
 * headers and part format `streamText().toDataStreamResponse()` produces,
 * so the client cannot tell the difference. One text part, one finish part.
 */
export function blockedTurnResponse(text: string): Response {
  const body =
    formatStreamPart('text', text) +
    formatStreamPart('finish_message', {
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 },
    })
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  })
}
