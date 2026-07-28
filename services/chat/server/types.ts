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

/**
 * A single media attachment reference sent by the client alongside a message.
 * The server resolves derived_content from media_items where status='ready'.
 */
export interface MediaAttachmentInput {
  mediaItemId: string
  type: 'audio' | 'image' | 'document'
  filename: string
}

/** Everything the chat service needs to stream one assistant turn. */
export interface ChatStreamRequest {
  messages: ChatMessage[]
  mode?: ChatMode
  sessionId?: string | null
  /** Supabase members.id for a pre-auth invited member. When set, getMemberPrimer
   *  looks up the member directly by id rather than via chat_sessions.user_id. */
  memberId?: string | null
  tenant: ChatTenantContext
  /** Accepted for forward-compatibility but currently ignored: getSystemPrompt
   *  resolves the tenant's highest-version compiled_prompts regardless of slot. */
  promptType?: string | null
  /** Media items attached to this turn. Resolved server-side via resolveMediaContext. */
  mediaItems?: MediaAttachmentInput[] | null
  /**
   * The incoming request's abort signal (Request.signal in app/api/sage/route.ts),
   * threaded through to streamText's own abortSignal option. Fires when the
   * client disconnects — e.g. Stop, or editMessage/resendMessage's hard-cancel
   * of an in-flight turn (services/chat/ui/v1/useChatTurn.ts) — so the model
   * call actually stops generating instead of finishing in the background
   * after the client has moved on. onFinish (and therefore handleSessionFinish
   * / recordConversionEvents) does not fire for an aborted call.
   */
  signal?: AbortSignal
}

/** Model provider abstraction (Amendment 4). */
export type ModelProvider = 'anthropic' | 'openai'

/**
 * Resolved per-turn model configuration. Defaults live in code
 * (claude-sonnet-4-6 / claude-haiku-4-5); a per-tenant override source
 * (e.g. a tenant_model_config table) is NOT yet available — see Phase 3
 * blockers — but tenant_model_config now exists; resolveModelConfig reads it
 * when a row is present and falls back to these code defaults otherwise.
 */
export interface ModelConfig {
  provider: ModelProvider
  /** tenant_model_config.model_id — primary chat model. */
  chatModel: string
  /** tenant_model_config.model_id_fallback — circuit-breaker fallback model. */
  fallbackModel: string
  /** tenant_model_config.max_tokens — chat-turn output cap. */
  maxTokens: number
  /** tenant_model_config.rate_limit_requests_per_hour — per-tenant rate cap. */
  rateLimitRequestsPerHour: number
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
