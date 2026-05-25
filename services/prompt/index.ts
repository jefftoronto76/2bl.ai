// services/prompt/index.ts
//
// Public surface of the prompt service. Server-only (every module reaches the
// service-role Supabase client or the model SDK). Consumers may import from
// here or from the specific modules directly.

// Runtime system-prompt assembly
export { getSystemPrompt, QUESTION_MODE_CONTEXT, DEFAULT_SYSTEM_PROMPT } from './compiler'

// Master-prompt compilation + manual save
export { compilePrompt } from './compile'
export type { CompileResult, CompileSuccess } from './compile'
export { saveMasterPrompt } from './save'
export type { SaveResult } from './save'

// Block CRUD
export { listActiveBlocks, updateBlock, createBlock, duplicateBlock } from './blocks'
export type { AuthScope, BlocksResult, BlockUpdate, CreateBlockInput } from './blocks'

// LLM safety review
export { reviewBlockBody, reviewMasterPrompt } from './safety'
export type { CheckResult, CheckIssue } from './safety'
