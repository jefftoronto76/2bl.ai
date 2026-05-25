// services/chat/server/index.ts
//
// Public server interface for the chat service. streamChat composes the
// system prompt (base + booking + question-mode), resolves per-tenant model
// config, and runs one streamed turn — returning the Vercel AI SDK
// data-stream Response (the frozen /api/sage wire format). The HTTP route
// adapter (app/api/sage/route.ts) and product consumers (e.g. Heirloom)
// import from here; tenancy/auth resolution and the ANTHROPIC_API_KEY guard
// stay in the caller.

import { runChatStream, resolveModelConfig } from './stream'
import { getSystemPrompt, QUESTION_MODE_CONTEXT } from './prompt'
import { getBookingCardSection } from './booking'
import { handleSessionFinish } from '@/services/crm/session'
import type { ChatMessage, ChatStreamRequest } from './types'

export type {
  ChatMessage,
  ChatMode,
  ChatRole,
  ChatStreamRequest,
  ChatTenantContext,
} from './types'

/**
 * Normalize the inbound conversation for the model. An empty array is the
 * greeting trigger ('Hi'); Anthropic also requires the first message to be a
 * user turn, so a leading assistant message (the stored greeting) gets the
 * implicit 'Hi' prepended.
 */
function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) {
    return [{ role: 'user', content: 'Hi' }]
  }
  const conversation: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }))
  if (conversation[0].role === 'assistant') {
    return [{ role: 'user', content: 'Hi' }, ...conversation]
  }
  return conversation
}

/**
 * Stream one assistant turn. Returns the data-stream Response on success, or a
 * 502 Response when the upstream model call fails (matching the prior route
 * behavior). Callers resolve tenancy/auth and guard ANTHROPIC_API_KEY before
 * invoking.
 */
export async function streamChat(req: ChatStreamRequest): Promise<Response> {
  const tenantId = req.tenant.tenantId
  const questionMode = req.mode === 'question'
  const sessionId =
    typeof req.sessionId === 'string' && req.sessionId.length > 0 ? req.sessionId : null

  console.log('[chat] streamChat:', {
    tenant_id: tenantId,
    mode: questionMode ? 'question' : 'default',
    session_id: sessionId,
  })

  const conversationMessages = normalizeMessages(req.messages)

  const [basePrompt, bookingSection, config] = await Promise.all([
    getSystemPrompt(tenantId),
    tenantId ? getBookingCardSection(tenantId) : Promise.resolve(''),
    resolveModelConfig(tenantId),
  ])

  const systemPrompt = [basePrompt, bookingSection, questionMode ? QUESTION_MODE_CONTEXT : '']
    .filter(segment => segment.length > 0)
    .join('\n\n')

  try {
    return await runChatStream({
      config,
      system: systemPrompt,
      messages: conversationMessages,
      onFinish: async ({ text, usage }) => {
        await handleSessionFinish({ sessionId, text, usage, conversationMessages })
      },
    })
  } catch (error) {
    console.error('[chat] streamChat error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Upstream error: ${message}`, { status: 502 })
  }
}
