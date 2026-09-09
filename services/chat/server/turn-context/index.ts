// services/chat/server/turn-context/index.ts
//
// The traffic cop's single entry point: resolveTurnPrompt(request) →
// { system, selection, injections, budget }. Job #1 (which prompt slot) and
// Job #2 (which context blocks) in one call, with one decision record.
//
// Phase 1: built, tested, called by nothing. streamChat (../index.ts) still
// builds its own prompt. Phase 2 calls this alongside that assembly and
// compares (`shadow: true`); Phase 3a hands `system` to runChatStream.
//
// Design: Design Handovers/traffic_cop_design_2026-09-05.md §5.

import { DEFAULT_SYSTEM_PROMPT } from '@/services/prompt/sage-prompt'
import { tokensFor } from '@/services/prompt/tokenize'
import { PROVIDERS } from './registry'
import { runProviders, assembleSystem, type ResolvedBlock } from './runner'
import { selectPromptSlot, type SlotRule } from './select-prompt'
import type {
  BudgetConfig,
  ChatMessageLike,
  ContextProvider,
  PromptSelection,
  ResolvedTurnPrompt,
  TurnContextInput,
  TurnContextRequest,
} from './types'

export type {
  BudgetConfig,
  BudgetReport,
  ContextBlock,
  ContextProvider,
  InjectionDecision,
  InjectionStatus,
  PromptSelection,
  ResolvedTurnPrompt,
  TurnContextInput,
  TurnContextRequest,
} from './types'
export { PROVIDERS } from './registry'
export { selectPromptSlot, buildSlotRules, DEFAULT_SLOT_KEY } from './select-prompt'
export { recordTurnContext, buildTurnContextMetadata } from './trace'

/**
 * Log-only through Phase 4 (2026-09-09 decision): the record reports
 * overage, nothing is dropped. The cap itself is the design's proposed
 * default and is not exercised by the six current segments.
 */
export const DEFAULT_BUDGET: BudgetConfig = { capTokens: 2000, enforce: false }

export interface ResolveTurnPromptOptions {
  providers?: readonly ContextProvider[]
  budget?: BudgetConfig
  slotRules?: readonly SlotRule[]
  now?: () => number
}

/**
 * The deterministic per-turn signals every provider and rule shares.
 * `isFirstTurn` is streamChat's exact rule: no prior non-empty assistant
 * turn (an empty placeholder from a failed first attempt does not count).
 */
export function deriveTurnSignals(messages: readonly ChatMessageLike[]): { isFirstTurn: boolean; turnIndex: number } {
  const turnIndex = messages.filter(m => m.role === 'assistant' && m.content.trim().length > 0).length
  return { isFirstTurn: turnIndex === 0, turnIndex }
}

const BASE_PROMPT_ID = 'base-prompt'

export async function resolveTurnPrompt(
  request: TurnContextRequest,
  options: ResolveTurnPromptOptions = {},
): Promise<ResolvedTurnPrompt> {
  const providers = options.providers ?? PROVIDERS
  const budget = options.budget ?? DEFAULT_BUDGET

  const input: TurnContextInput = { ...request, ...deriveTurnSignals(request.messages) }

  // Job #1 — sync, no I/O. Recorded now; acted on by the base-prompt
  // provider from Phase 4.
  const slot = selectPromptSlot(input, options.slotRules)

  // Job #2.
  const run = await runProviders([...providers], input, { budget, now: options.now })

  // The base prompt is the one block whose absence is not "less context" but
  // "no persona at all." Its provider already falls back to
  // DEFAULT_SYSTEM_PROMPT internally, so this only fires if the provider
  // itself failed or timed out — and then the turn still gets the same
  // degraded-mode prompt getSystemPrompt would have returned.
  const baseDecision = run.injections.find(d => d.id === BASE_PROMPT_ID)
  let blocks: ResolvedBlock[] = run.blocks
  let selection: PromptSelection
  if (baseDecision?.status === 'injected') {
    const meta = (baseDecision.meta ?? {}) as Partial<{
      compiledPromptId: string | null
      version: number | null
      fallback: boolean
    }>
    selection = {
      slotKey: slot.slotKey,
      ruleId: slot.ruleId,
      compiledPromptId: meta.compiledPromptId ?? null,
      version: meta.version ?? null,
      fallback: meta.fallback ?? false,
    }
  } else {
    blocks = [{ id: BASE_PROMPT_ID, order: Number.NEGATIVE_INFINITY, body: DEFAULT_SYSTEM_PROMPT }, ...run.blocks]
    selection = { slotKey: slot.slotKey, ruleId: slot.ruleId, compiledPromptId: null, version: null, fallback: true }
    if (baseDecision) {
      // Keep the decision truthful about what happened AND about what the
      // model actually received.
      baseDecision.meta = { ...(baseDecision.meta ?? {}), rescuedWithDefault: true }
      run.budget.usedTokens += tokensFor(DEFAULT_SYSTEM_PROMPT)
    }
  }

  return {
    system: assembleSystem(blocks),
    selection,
    injections: run.injections,
    budget: run.budget,
    isFirstTurn: input.isFirstTurn,
    turnIndex: input.turnIndex,
  }
}
