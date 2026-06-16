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

// ── Media block resolution ────────────────────────────────────────────────────

const MEDIA_UPLOAD_RE = /\[MEDIA_UPLOAD:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]/g

/**
 * For the last user message, parse [MEDIA_UPLOAD: filename | mediaItemId | type]
 * markers. For image-type items, fetch a short-lived signed URL via Supabase Storage
 * and inject an Anthropic image content block so the guide can actually see the photo.
 * Non-image markers are stripped from the text and the filename is left as context.
 * Degrades gracefully: if the URL fetch fails, the text marker is left in place.
 */
async function resolveMediaBlocks(
  messages: ChatMessage[],
): Promise<Array<ChatMessage | { role: 'user'; content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> }>> {
  // Find the last user message index
  const lastUserIdx = [...messages.entries()].reduce<number>(
    (acc, [i, m]) => (m.role === 'user' ? i : acc),
    -1,
  )
  if (lastUserIdx === -1) return messages

  const lastUser = messages[lastUserIdx]
  const markers: Array<{ filename: string; mediaItemId: string; type: string }> = []

  MEDIA_UPLOAD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MEDIA_UPLOAD_RE.exec(lastUser.content)) !== null) {
    markers.push({ filename: m[1].trim(), mediaItemId: m[2].trim(), type: m[3].trim() })
  }

  const imageMarkers = markers.filter((mk) => mk.type === 'image')
  if (imageMarkers.length === 0) return messages

  // Strip all MEDIA_UPLOAD markers from text; keep any remaining prose
  const prose = lastUser.content
    .replace(/\[MEDIA_UPLOAD:[^\]]+\]/g, '')
    .replace(/\[MEDIA_UPLOAD_FAILED:[^\]]+\]/g, '')
    .trim()

  // Fetch signed URLs for image items
  const supabase = getAdminClient()
  const imageParts: Array<{ type: 'image'; image: string }> = []

  await Promise.all(
    imageMarkers.map(async (mk) => {
      try {
        // Look up the actual storage_path from the media_items table
        const { data: item } = await supabase
          .from('media_items')
          .select('storage_path')
          .eq('id', mk.mediaItemId)
          .maybeSingle()

        if (!item?.storage_path) {
          console.warn('[chat/stream] no storage_path for media_item', mk.mediaItemId)
          return
        }

        const { data: signedData, error: signedError } = await supabase.storage
          .from('chat-attachments')
          .createSignedUrl(item.storage_path, 60)

        if (signedError || !signedData?.signedUrl) {
          console.warn('[chat/stream] signed URL failed for', mk.mediaItemId, signedError?.message)
          return
        }

        imageParts.push({ type: 'image', image: signedData.signedUrl })
      } catch (err) {
        console.error('[chat/stream] resolveMediaBlocks error for', mk.mediaItemId, err)
      }
    }),
  )

  if (imageParts.length === 0) {
    // All URL fetches failed — leave the message unchanged (text marker still context)
    return messages
  }

  // Build the enriched content array: image blocks first, then the text
  const contentParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [
    ...imageParts,
    ...(prose ? [{ type: 'text' as const, text: prose }] : []),
  ]

  const enriched = [...messages]
  enriched[lastUserIdx] = { role: 'user', content: contentParts as unknown as string }
  return enriched as Array<ChatMessage | { role: 'user'; content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> }>
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

  // Resolve image media blocks before calling the model. Degrades to plain text
  // on any error so the stream is never blocked by a storage lookup failure.
  const enrichedMessages = await resolveMediaBlocks(messages).catch((err) => {
    console.error('[chat/stream] resolveMediaBlocks failed — falling back to plain text:', err)
    return messages
  })

  const result = await streamText({
    model: getModelInstance(config.provider, config.chatModel),
    system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: enrichedMessages as any,
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
