// services/chat/server/stream.ts
//
// Server-side streaming engine for the chat service. Owns the model-provider
// abstraction (Amendment 4) and the streamText call. Server-only — imports
// the service-role Supabase client and the Anthropic SDK; never imported by
// client code.

import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getAdminClient } from '@/lib/supabase-admin'
import type { ChatMessage, ModelConfig, ModelProvider, TokenUsage } from './types'

// Fallback model defaults. These are the ONLY hardcoded model IDs in the
// service, and they live here in the config resolver — call sites read the
// resolved ModelConfig, never a literal.
const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_NAME_EXTRACTOR_MODEL = 'claude-haiku-4-5'
const DEFAULT_MAX_TOKENS = 1000

/**
 * Resolve the model configuration for a tenant. Reads `tenant_model_config`
 * when a row exists; otherwise (no tenant, no row, or any error) returns the
 * Anthropic defaults. `select('*')` + per-field fallback keeps this resilient
 * to the exact column set, so a schema mismatch degrades to defaults rather
 * than breaking the chat.
 *
 * Assumed columns: `provider`, `chat_model`, `name_extractor_model`,
 * `max_tokens` (keyed by `tenant_id`). Confirm/adjust against the live table.
 */
export async function resolveModelConfig(tenantId: string | null): Promise<ModelConfig> {
  const fallback: ModelConfig = {
    provider: 'anthropic',
    chatModel: DEFAULT_CHAT_MODEL,
    nameExtractorModel: DEFAULT_NAME_EXTRACTOR_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
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
      typeof row.chat_model === 'string' && row.chat_model ? row.chat_model : fallback.chatModel
    const nameExtractorModel =
      typeof row.name_extractor_model === 'string' && row.name_extractor_model
        ? row.name_extractor_model
        : fallback.nameExtractorModel
    const maxTokens =
      typeof row.max_tokens === 'number' && row.max_tokens > 0 ? row.max_tokens : fallback.maxTokens

    console.log('[chat/stream] tenant_model_config resolved for tenant_id:', tenantId, {
      provider,
      chatModel,
    })
    return { provider, chatModel, nameExtractorModel, maxTokens }
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
}

/**
 * Run one streamed chat turn and return the Vercel AI SDK data-stream
 * Response (the frozen /api/sage wire format). `onFinish` fires after the
 * stream completes; its argument normalizes the SDK usage shape to TokenUsage.
 */
export async function runChatStream(params: RunChatStreamParams): Promise<Response> {
  const { config, system, messages, onFinish } = params
  const result = await streamText({
    model: getModelInstance(config.provider, config.chatModel),
    system,
    messages,
    maxTokens: config.maxTokens,
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
