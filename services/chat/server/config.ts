import type { ModelConfig } from './types'

// Base model config shared by admin routes (blocks/chat, prompt-chat). These
// routes are platform-internal and do not go through resolveModelConfig — they
// always use Anthropic claude-sonnet-4-6. maxTokens is overridden per-route at
// the runChatStream call site (4000 for the block composer, 800 for prompt chat).
//
// Note: the spec listed `rateLimitRph` and omitted `fallbackModel`; ModelConfig
// requires `rateLimitRequestsPerHour` and `fallbackModel` (both non-optional),
// so the correct field names are used here to satisfy strict TypeScript.
export const DEFAULT_ADMIN_MODEL_CONFIG: ModelConfig = {
  provider: 'anthropic',
  chatModel: 'claude-sonnet-4-6',
  fallbackModel: 'gpt-4o',
  maxTokens: 1000,
  rateLimitRequestsPerHour: 100,
}
