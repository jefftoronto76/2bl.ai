// services/chat/server/prompt.ts
//
// Thin re-export. The runtime prompt compiler moved to
// services/prompt/compiler.ts (the prompt service). This shim keeps existing
// chat-service importers (services/chat/server/index.ts) resolving unchanged.

export { getSystemPrompt, QUESTION_MODE_CONTEXT } from '@/services/prompt/compiler'
export { DEFAULT_SYSTEM_PROMPT } from '@/lib/sage-prompt'
