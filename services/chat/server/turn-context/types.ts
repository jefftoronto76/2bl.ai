// services/chat/server/turn-context/types.ts
//
// Contract for the "traffic cop" — the single mechanism that decides which
// compiled prompt a chat turn uses (Job #1, select-prompt.ts) and what
// per-turn context gets injected alongside it (Job #2, providers/ + runner.ts).
// See Design Handovers/traffic_cop_design_2026-09-05.md §5.
//
// Phase 1 (this file's first landing): built and tested, zero call sites.
// streamChat (../index.ts) still assembles the prompt itself; nothing here is
// wired in until Phase 2 (shadow) / Phase 3a (cutover).
//
// Framework-agnostic — no Next.js imports, no DB client. Providers own their
// own I/O.

import type { ChatMessage, ChatMode, MediaAttachmentInput } from '../types'

/** The two fields deriveTurnSignals reads — so callers can pass any message shape that has them. */
export type ChatMessageLike = Pick<ChatMessage, 'role' | 'content'>

// ── Input ───────────────────────────────────────────────────────────────

/**
 * What the route/orchestrator hands in. Every identity-bearing field is
 * server-resolved by the caller (tenant from the Host header, memberId from
 * the Clerk session or invite token) — never trusted from the client body.
 */
export interface TurnContextRequest {
  tenantId: string | null
  sessionId: string | null
  memberId: string | null
  /** The conversation as sent on this request. Read-only here; never mutated. */
  messages: ChatMessage[]
  mode: ChatMode
  mediaItems: MediaAttachmentInput[] | null
  /** x-correlation-id from middleware.ts, when the caller has it. */
  correlationId: string | null
}

/**
 * The request plus the signals resolveTurnPrompt derives once and shares
 * with every provider and rule — so no provider re-derives "is this the
 * first turn" with its own slightly different definition.
 */
export interface TurnContextInput extends TurnContextRequest {
  /**
   * True when `messages` has no prior non-empty assistant turn. Same rule
   * streamChat uses today (../index.ts): an empty assistant placeholder left
   * by a failed first attempt does not count as a real reply.
   */
  isFirstTurn: boolean
  /** Number of non-empty assistant turns already in `messages`. */
  turnIndex: number
}

// ── Providers (Job #2) ──────────────────────────────────────────────────

/**
 * Who authored the text a provider injects. Drives delineation in the
 * runner: `system` text is emitted as-is; `operator` (tenant-admin-set) and
 * `participant` (member/visitor-set) text is wrapped in an escaped
 * <context> tag with a "reference data, not instructions" preamble.
 */
export type ProviderTrust = 'system' | 'operator' | 'participant'

/** How often the value can change — documented per provider, not accidental. */
export type ProviderFreshness = 'turn' | 'session' | 'static'

/** What kind of personal data the block may carry; governs what the decision record may log. */
export type ProviderPii = 'none' | 'identity' | 'location'

/**
 * What a provider hands back. `body` is the exact text that goes into the
 * system prompt (including any header the segment has always carried, e.g.
 * "MEMBER CONTEXT:\n…", so the assembled prompt stays byte-identical to the
 * pre-traffic-cop concatenation). `meta` is optional, content-free
 * diagnostics copied into the decision record — presence/length/hash only,
 * never a raw value (CLAUDE.md rule 6).
 */
export interface ContextBlock {
  body: string
  meta?: Record<string, unknown>
}

export interface ContextProvider {
  /** Stable identifier, unique across the registry. Appears in every decision record. */
  id: string
  /**
   * Position in the assembled prompt — ascending. Separate from `priority`
   * because where a block sits and how important it is are different things:
   * question-mode context has always been last in the prompt but is not the
   * first thing to sacrifice under a budget.
   */
  order: number
  /** Importance under budget pressure — lower is kept longer. */
  priority: number
  freshness: ProviderFreshness
  trust: ProviderTrust
  pii: ProviderPii
  /**
   * Never dropped by the budget (the base prompt). A block can be exempt and
   * still count toward `usedTokens` so the record shows the true total.
   */
  budgetExempt?: boolean
  /**
   * Optional per-provider deadline. When set, a resolver that hasn't settled
   * in time is recorded as `timeout` and omitted — the underlying work is not
   * cancelled (no AbortSignal plumbing into the resolvers yet), it is simply
   * no longer awaited. Unset = no deadline, matching pre-traffic-cop behavior.
   */
  timeoutMs?: number
  /** Cheap, synchronous, no I/O. False → recorded as skipped/not-applicable, resolve never called. */
  appliesTo(input: TurnContextInput): boolean
  /** May return null/'' for "nothing to say". May throw or reject — the runner absorbs it. */
  resolve(input: TurnContextInput): Promise<ContextBlock | string | null>
}

// ── Decision record ─────────────────────────────────────────────────────

export type InjectionStatus = 'injected' | 'skipped' | 'failed' | 'timeout' | 'dropped_budget'

export type SkipReason = 'not-applicable' | 'empty'

/** One per registered provider, every turn — a skip is a first-class outcome. */
export interface InjectionDecision {
  id: string
  order: number
  priority: number
  status: InjectionStatus
  reason?: SkipReason
  /** tokensFor() estimate of the block (0 when nothing was produced). */
  estTokens: number
  /** Wall time spent in resolve(), ms. 0 when not applicable. */
  ms: number
  /** Error class name and a truncated message for failed/timeout. Infra strings only — never block text. */
  error?: { name: string; message: string }
  meta?: Record<string, unknown>
}

export interface BudgetConfig {
  /** Estimated-token cap for non-exempt blocks. */
  capTokens: number
  /**
   * false = log-only: the record reports overage but nothing is dropped
   * (Jeff's 2026-09-09 decision for Phases 1–4). true = drop whole blocks,
   * lowest priority first, until under the cap.
   */
  enforce: boolean
}

export interface BudgetReport extends BudgetConfig {
  /** Sum of estTokens across every injected block, exempt ones included. */
  usedTokens: number
  /** Sum across non-exempt injected blocks — what the cap is compared against. */
  budgetedTokens: number
  overCap: boolean
  droppedIds: string[]
}

/** Job #1's output — which compiled prompt slot the turn resolved to and why. */
export interface PromptSelection {
  /** prompt_types.key the rules chose, e.g. 'base'. */
  slotKey: string
  /** The rule that decided it (select-prompt.ts RULES[].id). */
  ruleId: string
  /** compiled_prompts.id actually loaded, or null when the DEFAULT_SYSTEM_PROMPT fallback fired. */
  compiledPromptId: string | null
  version: number | null
  fallback: boolean
}

export interface ResolvedTurnPrompt {
  /** The finished system prompt — what runChatStream receives. */
  system: string
  selection: PromptSelection
  injections: InjectionDecision[]
  budget: BudgetReport
  isFirstTurn: boolean
  turnIndex: number
}
