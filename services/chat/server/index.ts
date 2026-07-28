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
import { resolveMediaContext, stripMediaMarkers } from './media-context'
import { handleSessionFinish } from '@/services/crm/session'
import { getAdminClient } from '@/services/auth/supabase-admin'
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
 * Registers a listener that fires the instant `signal` aborts — hooked
 * directly to the signal itself, not to any AI SDK callback, so it fires for
 * BOTH a pre-response abort and a mid-stream one (streamText's `onFinish`
 * deliberately never runs on either — see the Stop / interrupted-turn
 * protocol section in CLAUDE.md). Writes a plain, unambiguous fact directly
 * to the DB: this is diagnostic ground truth for whether the server-side
 * abort handler actually ran, checkable without any log access — populated
 * `server_abort_confirmed_at` means it fired; null means it didn't.
 * Fire-and-forget (same pattern as services/audit/audit.ts's logEvent);
 * always overwritten, not self-guarded, so each test run reflects the latest
 * attempt. No-ops when there's no session to attribute the write to.
 */
function confirmServerAbort(
  signal: AbortSignal | undefined,
  sessionId: string | null,
  tenantId: string | null,
): void {
  if (!signal || !sessionId || !tenantId) return
  signal.addEventListener(
    'abort',
    () => {
      void getAdminClient()
        .from('chat_sessions')
        .update({ server_abort_confirmed_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('tenant_id', tenantId)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.error('[chat] server_abort_confirmed_at write failed:', error.message)
        })
    },
    { once: true },
  )
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

  // Registered up front, before any async work — so it's armed even if the
  // client aborts before the system-prompt/model-config Promise.all below
  // has settled.
  confirmServerAbort(req.signal, sessionId, tenantId)

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

  const memberId =
    typeof req.memberId === 'string' && req.memberId.length > 0 ? req.memberId : null

  const [basePrompt, bookingSection, config, memberPrimer, mediaContext] = await Promise.all([
    getSystemPrompt(tenantId),
    tenantId ? getBookingCardSection(tenantId) : Promise.resolve(''),
    resolveModelConfig(tenantId),
    (sessionId || memberId)
      ? getMemberPrimer(sessionId, tenantId, memberId)
      : Promise.resolve(null),
    resolveMediaContext(req.mediaItems, tenantId, memberId),
  ])

  console.log('[chat] memberPrimer', memberPrimer !== null
    ? `found (${memberPrimer.length} chars)`
    : 'null — not injected'
  )

  const systemPrompt = [
    basePrompt,
    bookingSection,
    memberPrimer ? `MEMBER CONTEXT:\n${memberPrimer}` : '',
    mediaContext,
    questionMode ? QUESTION_MODE_CONTEXT : '',
  ]
    .filter(segment => segment.length > 0)
    .join('\n\n')

  const messagesForModel = stripMediaMarkers(conversationMessages)

  try {
    return await runChatStream({
      config,
      system: systemPrompt,
      messages: messagesForModel,
      abortSignal: req.signal,
      onFinish: async ({ text, usage }) => {
        if (!tenantId) return
        await handleSessionFinish({ sessionId, tenantId, text, usage, visitorText: lastVisitorText })
      },
    })
  } catch (error) {
    // The client disconnected (Stop, or the tab closing) before the
    // Anthropic call even started streaming back — req.signal fired and
    // streamText threw before returning a Response. This is an expected,
    // client-initiated cancellation, not an upstream failure: log it quietly
    // and skip the "Upstream error" 502, which nothing is listening for
    // anyway since the client already closed its own fetch.
    if (isAbortError(error)) {
      console.log('[chat] streamChat aborted by client disconnect')
      return new Response(null, { status: 499 })
    }
    console.error('[chat] streamChat error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Upstream error: ${message}`, { status: 502 })
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
