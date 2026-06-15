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
import { getMemberPrimer } from './member-context'
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

  // The latest visitor message for this turn, raw as typed — handed to the
  // session-finish contact watcher, which scans it (not Sage's reply) for a
  // phone/email. Falls back to null (skips the watcher) when there is no user
  // turn yet (e.g. the synthetic greeting).
  const lastVisitorText =
    [...conversationMessages].reverse().find(m => m.role === 'user')?.content ?? null

  const [basePrompt, bookingSection, config, memberPrimer] = await Promise.all([
    getSystemPrompt(tenantId),
    tenantId ? getBookingCardSection(tenantId) : Promise.resolve(''),
    resolveModelConfig(tenantId),
    sessionId ? getMemberPrimer(sessionId, tenantId) : Promise.resolve(null),
  ])

  console.log('[chat] memberPrimer', memberPrimer !== null
    ? `found (${memberPrimer.length} chars)`
    : 'null — not injected'
  )

  const systemPrompt = [
    basePrompt,
    bookingSection,
    memberPrimer ? `MEMBER CONTEXT:\n${memberPrimer}` : '',
    questionMode ? QUESTION_MODE_CONTEXT : '',
  ]
    .filter(segment => segment.length > 0)
    .join('\n\n')

  try {
    return await runChatStream({
      config,
      system: systemPrompt,
      messages: conversationMessages,
      onFinish: async ({ text, usage }) => {
        await handleSessionFinish({ sessionId, text, usage, visitorText: lastVisitorText })
      },
    })
  } catch (error) {
    console.error('[chat] streamChat error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Upstream error: ${message}`, { status: 502 })
  }
}
