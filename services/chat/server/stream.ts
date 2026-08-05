// services/chat/server/stream.ts
//
// Server-side streaming engine for the chat service. Owns the model-provider
// abstraction (Amendment 4) and the streamText call. Server-only — imports
// the service-role Supabase client and the Anthropic SDK; never imported by
// client code.

import { streamText } from 'ai'
import type { CoreMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { ChatMessage, ModelConfig, ModelProvider, TokenUsage } from './types'

/** Anthropic prompt-cache usage reported on a turn, when cacheControl is enabled. */
export interface CacheUsage {
  cacheCreationInputTokens: number | null
  cacheReadInputTokens: number | null
}

// Fallback model defaults. These are the ONLY hardcoded model IDs in the
// service, and they live here in the config resolver — call sites read the
// resolved ModelConfig, never a literal.
const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_FALLBACK_MODEL = 'gpt-4o'
const DEFAULT_MAX_TOKENS = 1000
const DEFAULT_RATE_LIMIT_RPH = 100

/**
 * Resolve the model configuration for a tenant. Reads `tenant_model_config`
 * when a row exists; otherwise (no tenant, no row, or any error) returns the
 * Anthropic defaults. `select('*')` + per-field fallback keeps this resilient
 * to the exact column set, so a schema mismatch degrades to defaults rather
 * than breaking the chat.
 *
 * Columns: `provider`, `model_id`, `model_id_fallback`, `max_tokens`,
 * `rate_limit_requests_per_hour` (keyed by `tenant_id`).
 */
export async function resolveModelConfig(tenantId: string | null): Promise<ModelConfig> {
  const fallback: ModelConfig = {
    provider: 'anthropic',
    chatModel: DEFAULT_CHAT_MODEL,
    fallbackModel: DEFAULT_FALLBACK_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    rateLimitRequestsPerHour: DEFAULT_RATE_LIMIT_RPH,
  }
  if (!tenantId) return fallback

  try {
    const { data, error } = await getAdminClient()
      .from('tenant_model_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) {
      console.error('[chat/stream] tenant_model_config query failed:', error.message)
      return fallback
    }
    if (!data) {
      console.log('[chat/stream] no tenant_model_config row for tenant_id:', tenantId, '— using defaults')
      return fallback
    }

    const row = data as Record<string, unknown>
    const provider: ModelProvider = row.provider === 'openai' ? 'openai' : 'anthropic'
    const chatModel =
      typeof row.model_id === 'string' && row.model_id ? row.model_id : fallback.chatModel
    const fallbackModel =
      typeof row.model_id_fallback === 'string' && row.model_id_fallback
        ? row.model_id_fallback
        : fallback.fallbackModel
    const maxTokens =
      typeof row.max_tokens === 'number' && row.max_tokens > 0 ? row.max_tokens : fallback.maxTokens
    const rateLimitRequestsPerHour =
      typeof row.rate_limit_requests_per_hour === 'number' && row.rate_limit_requests_per_hour > 0
        ? row.rate_limit_requests_per_hour
        : fallback.rateLimitRequestsPerHour

    console.log('[chat/stream] tenant_model_config resolved for tenant_id:', tenantId, {
      provider,
      chatModel,
    })
    return { provider, chatModel, fallbackModel, maxTokens, rateLimitRequestsPerHour }
  } catch (err) {
    console.error(
      '[chat/stream] resolveModelConfig threw:',
      err instanceof Error ? err.message : err,
    )
    return fallback
  }
}

/**
 * Map a (provider, modelId) pair to an AI SDK model instance. The provider
 * switch is the injection point for additional providers. OpenAI is NOT yet
 * wired (no @ai-sdk/openai dependency, no OPENAI_API_KEY) — requesting it
 * throws rather than silently misbehaving.
 *
 * `cacheControl: true` is always set on the Anthropic model: it adds the
 * `prompt-caching-2024-07-31` beta header and unlocks the cache-usage fields
 * on the response. It's inert unless a message actually carries
 * `providerMetadata.anthropic.cacheControl` (see runChatStream below) — the
 * admin-chat callers of this module, which never set that metadata, are
 * unaffected.
 */
export function getModelInstance(provider: ModelProvider, modelId: string) {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId, { cacheControl: true })
    case 'openai':
      // Injection point: add @ai-sdk/openai + OPENAI_API_KEY, then return the
      // openai(modelId) instance here.
      throw new Error('[chat/stream] OpenAI provider requested but not yet wired')
    default:
      return anthropic(modelId, { cacheControl: true })
  }
}

export interface RunChatStreamParams {
  config: ModelConfig
  /**
   * Tenant-static system content, safe to cache across calls (e.g. the
   * compiled base prompt + booking section — both keyed only by tenantId,
   * identical on every turn for that tenant). When present, sent as its own
   * leading system message marked `cache_control: { type: 'ephemeral' }`.
   * Omit when there's nothing safe to cache (e.g. the admin prompt/blocks
   * chat routes, which pass their whole prompt via `system` instead).
   */
  cachedSystem?: string
  /**
   * Additional system content that must NOT be cached — either genuinely
   * per-turn content (member context, attached media) or, for callers with
   * no `cachedSystem`, the entire system prompt. Sent as its own leading
   * system message with no cache_control, after `cachedSystem`. Omitted
   * entirely (no message emitted) when empty, to avoid sending an empty
   * Anthropic content block.
   */
  system: string
  messages: ChatMessage[]
  onFinish?: (args: {
    text: string
    usage: TokenUsage | null
    cacheUsage: CacheUsage | null
  }) => Promise<void> | void
  /**
   * Cancels the underlying Anthropic call when it fires — built by
   * streamChat()'s createServerAbortController (services/chat/server/index.ts),
   * which triggers it either from the inbound request's own signal (best
   * effort) or, reliably, from polling chat_sessions.stop_requested_at.
   * Threaded straight into streamText's own abortSignal, which the AI SDK
   * forwards to the provider's doStream() call. When it fires mid-generation
   * the stream errors out rather than reaching its normal finish step, so
   * `onFinish` correctly does not run — no handleSessionFinish /
   * recordConversionEvents for text the visitor never saw finish.
   */
  abortSignal?: AbortSignal
}

/**
 * Run one streamed chat turn and return the Vercel AI SDK data-stream
 * Response (the frozen /api/sage wire format). `onFinish` fires after the
 * stream completes; its argument normalizes the SDK usage shape to TokenUsage.
 *
 * System content is sent as leading `role: 'system'` entries in `messages`,
 * NOT via streamText's `system:` string shorthand. This is deliberate, not
 * stylistic: ai@3.4.33's standardizePrompt()/convertToLanguageModelPrompt()
 * silently strips any providerMetadata from the `system:` shorthand — a
 * message-array entry is the only path that actually reaches the Anthropic
 * provider's cache_control handling. Multiple contiguous leading system
 * messages are supported by the provider (each becomes its own Anthropic
 * system content-block, independently cacheable).
 */
export async function runChatStream(params: RunChatStreamParams): Promise<Response> {
  const { config, cachedSystem, system, messages, onFinish, abortSignal } = params

  const leadingSystemMessages: CoreMessage[] = []
  if (cachedSystem) {
    leadingSystemMessages.push({
      role: 'system',
      content: cachedSystem,
      experimental_providerMetadata: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    })
  }
  if (system) {
    leadingSystemMessages.push({ role: 'system', content: system })
  }

  const result = await streamText({
    model: getModelInstance(config.provider, config.chatModel),
    messages: [...leadingSystemMessages, ...messages],
    maxTokens: config.maxTokens,
    abortSignal,
    onFinish: onFinish
      ? async ({ text, usage, experimental_providerMetadata }) => {
          const normalized: TokenUsage | null = usage
            ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens }
            : null
          const anthropicMeta = experimental_providerMetadata?.anthropic as
            | { cacheCreationInputTokens?: number | null; cacheReadInputTokens?: number | null }
            | undefined
          const cacheUsage: CacheUsage | null = anthropicMeta
            ? {
                cacheCreationInputTokens: anthropicMeta.cacheCreationInputTokens ?? null,
                cacheReadInputTokens: anthropicMeta.cacheReadInputTokens ?? null,
              }
            : null
          await onFinish({ text, usage: normalized, cacheUsage })
        }
      : undefined,
  })
  return result.toDataStreamResponse()
}
