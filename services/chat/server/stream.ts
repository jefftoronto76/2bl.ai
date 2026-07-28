// services/chat/server/stream.ts
//
// Server-side streaming engine for the chat service. Owns the model-provider
// abstraction (Amendment 4) and the streamText call. Server-only — imports
// the service-role Supabase client and the Anthropic SDK; never imported by
// client code.

import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { ChatMessage, ModelConfig, ModelProvider, TokenUsage } from './types'

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
 */
export function getModelInstance(provider: ModelProvider, modelId: string) {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId)
    case 'openai':
      // Injection point: add @ai-sdk/openai + OPENAI_API_KEY, then return the
      // openai(modelId) instance here.
      throw new Error('[chat/stream] OpenAI provider requested but not yet wired')
    default:
      return anthropic(modelId)
  }
}

export interface RunChatStreamParams {
  config: ModelConfig
  system: string
  messages: ChatMessage[]
  onFinish?: (args: { text: string; usage: TokenUsage | null }) => Promise<void> | void
  /**
   * Aborts the underlying model call when the client disconnects (passed
   * through from the incoming request's Request.signal — see ChatStreamRequest
   * in ./types.ts). streamText does not call onFinish for an aborted call, so
   * a turn nobody's waiting on no longer runs handleSessionFinish /
   * recordConversionEvents in the background after the fact.
   */
  abortSignal?: AbortSignal
}

/**
 * Run one streamed chat turn and return the Vercel AI SDK data-stream
 * Response (the frozen /api/sage wire format). `onFinish` fires after the
 * stream completes; its argument normalizes the SDK usage shape to TokenUsage.
 */
export async function runChatStream(params: RunChatStreamParams): Promise<Response> {
  const { config, system, messages, onFinish, abortSignal } = params
  const result = await streamText({
    model: getModelInstance(config.provider, config.chatModel),
    system,
    messages,
    maxTokens: config.maxTokens,
    abortSignal,
    onFinish: onFinish
      ? async ({ text, usage }) => {
          const normalized: TokenUsage | null = usage
            ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens }
            : null
          await onFinish({ text, usage: normalized })
        }
      : undefined,
  })
  return result.toDataStreamResponse()
}
