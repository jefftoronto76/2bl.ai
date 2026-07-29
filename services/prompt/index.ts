// services/prompt/index.ts
//
// Public surface of the prompt service. Server-only (every module reaches the
// service-role Supabase client or the model SDK). Consumers may import from
// here or from the specific modules directly.

// Runtime system-prompt assembly
export { getSystemPrompt, QUESTION_MODE_CONTEXT, DEFAULT_SYSTEM_PROMPT } from './compiler'

// Master-prompt compilation + manual save
export { compilePrompt, buildCompiledContent } from './compile'
export type { CompileResult, CompileSuccess, BuildContentResult } from './compile'
export { saveCompiledPrompt } from './save'
export type { SaveResult } from './save'

// Cross-tenant resolution for a specific prompt_set (composer-family override
// + platform-admin gate)
export { resolveTenantForPromptSet } from './resolve-tenant-for-prompt-set'
export type { ResolveTenantForPromptSetResult } from './resolve-tenant-for-prompt-set'

// Block CRUD
export { listActiveBlocks, updateBlock, createBlock, duplicateBlock } from './blocks'
export type { AuthScope, BlocksResult, BlockUpdate, CreateBlockInput } from './blocks'

// LLM safety review
export { reviewBlockBody, reviewMasterPrompt } from './safety'
export type { CheckResult, CheckIssue } from './safety'

// Prompt-assembly for admin composer surfaces
export { buildBlocksComposerSystem, buildPromptChatSystem } from './composer'
export type { BlocksComposerInput, PromptChatInput } from './composer'

// Block taxonomy + ordering / token helpers (moved from src/lib)
export {
  BLOCK_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  TYPE_COMPILE_ORDER,
  formatTypeBadgeLabel,
} from './block-types'
export type { BlockType } from './block-types'
export { isOrdered, orderPrefix } from './block-order'
export { tokensFor, CHARS_PER_TOKEN } from './tokenize'
