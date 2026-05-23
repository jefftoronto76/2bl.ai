// services/chat/types.ts
//
// Shared types for the chat service (services/chat). Framework-agnostic —
// no Next.js imports. These describe the public contract the route adapter
// (app/api/sage/route.ts) and future product consumers (e.g. Heirloom) use.

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** Visitor arrival mode. `'question'` skips the name-ask/discovery phase. */
export type ChatMode = 'question' | null

/**
 * Tenant context resolved by the caller (today: host → tenant via the auth
 * helper) and handed to the chat service. The service never resolves tenancy
 * itself — that stays in the route/auth layer.
 */
export interface ChatTenantContext {
  tenantId: string | null
}

/** Everything the chat service needs to stream one assistant turn. */
export interface ChatStreamRequest {
  messages: ChatMessage[]
  mode?: ChatMode
  sessionId?: string | null
  tenant: ChatTenantContext
}

/** Model provider abstraction (Amendment 4). */
export type ModelProvider = 'anthropic' | 'openai'

/**
 * Resolved per-turn model configuration. Defaults live in code
 * (claude-sonnet-4-6 / claude-haiku-4-5); a per-tenant override source
 * (e.g. a tenant_model_config table) is NOT yet available — see Phase 3
 * blockers. Until then `resolveModelConfig` returns the defaults.
 */
export interface ModelConfig {
  provider: ModelProvider
  chatModel: string
  nameExtractorModel: string
  maxTokens: number
}

/** Token deltas reported by a single model turn. */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

/**
 * The single batched write applied to chat_sessions in onFinish
 * (Amendment 3) — replaces the current 4+ sequential round-trips with one
 * read (current state) + one write.
 */
export interface SessionFinishUpdate {
  sessionId: string
  inputTokensDelta: number
  outputTokensDelta: number
  /** Set true only on the transition (pre-checked false). */
  calendarOffered?: boolean
  /** Set only when newly captured and not already present. */
  visitorName?: string | null
}

// ── Booking cards ───────────────────────────────────────────────────────
// `open_as`/`embed_code` are intentionally NOT carried in the bracket
// syntax; the client resolves them from /api/sage/parameters by url match.

export type OpenAs = 'new_tab' | 'popup'

export interface BookingCardData {
  label: string
  description: string
  ctaLabel: string
  url: string
}

/** Result of parsing an assistant message into prose + extracted cards. */
export interface ParsedBookingResult {
  prose: string
  cards: BookingCardData[]
}
