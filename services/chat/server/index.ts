// services/chat/server/index.ts
//
// Public server interface for the chat service. streamChat resolves the
// system prompt through the traffic cop (turn-context/, resolveTurnPrompt),
// resolves per-tenant model config, and runs one streamed turn — returning the Vercel AI SDK
// data-stream Response (the frozen /api/sage wire format). The HTTP route
// adapter (app/api/sage/route.ts) and product consumers (e.g. Heirloom)
// import from here; tenancy/auth resolution and the ANTHROPIC_API_KEY guard
// stay in the caller.

import { runChatStream, resolveModelConfig } from './stream'
import { stripMediaMarkers } from './media-context'
import { resolveTurnPrompt } from './turn-context'
import { runShadowTurn } from './turn-context/shadow'
import type { TurnContextRequest } from './turn-context/types'
import { handleSessionFinish } from '@/services/crm/session'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent } from '@/services/audit'
import { AuditAction } from '@/services/audit/types'
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

/** How often to poll chat_sessions.stop_requested_at while a turn streams. */
const STOP_POLL_INTERVAL_MS = 500

/**
 * Builds the AbortController actually passed to streamText/runChatStream.
 * Two independent triggers can fire it:
 *
 * 1. `requestSignal` (the inbound `/api/sage` request's own `req.signal`) —
 *    a best-effort fast path, kept because it's free if this deployment's
 *    request pipeline ever does propagate the client's disconnect onto it.
 *    Confirmed NOT reliable here: the client correctly observes and records
 *    every Stop (`chat_sessions.last_error_type = 'user_stopped'`), but the
 *    server kept generating regardless — this signal is not load-bearing.
 * 2. Polling `chat_sessions.stop_requested_at` — the reliable path.
 *    `useChatTurn.ts`'s `stop()` explicitly PATCHes this the instant Stop is
 *    clicked: an ordinary new HTTP request, not a connection-level signal,
 *    so it doesn't depend on whatever the edge→function hop does or doesn't
 *    preserve. Compared against `turnStartedAt` (this turn's own start time)
 *    rather than requiring a reset write, so a stale flag left over from an
 *    earlier stopped turn can never false-trigger a later, unrelated one.
 *
 * Whichever trigger fires first writes `chat_sessions.server_abort_confirmed_at`
 * — the DB-checkable proof the abort actually happened — and stops the other
 * trigger from doing anything further (the poll included, so it doesn't keep
 * querying after the turn is already cancelled).
 */
function createServerAbortController(
  requestSignal: AbortSignal | undefined,
  sessionId: string | null,
  tenantId: string | null,
  turnStartedAt: Date,
): { signal: AbortSignal; stopPolling: () => void } {
  const controller = new AbortController()
  let pollHandle: ReturnType<typeof setInterval> | null = null

  const stopPolling = () => {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
  }

  const confirmAbort = () => {
    if (!sessionId || !tenantId) return
    void getAdminClient()
      .from('chat_sessions')
      .update({ server_abort_confirmed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('[chat] server_abort_confirmed_at write failed:', error.message)
      })
  }

  const triggerAbort = () => {
    if (controller.signal.aborted) return
    controller.abort()
    stopPolling()
    confirmAbort()
  }

  requestSignal?.addEventListener('abort', triggerAbort, { once: true })

  if (sessionId && tenantId) {
    pollHandle = setInterval(() => {
      void getAdminClient()
        .from('chat_sessions')
        .select('stop_requested_at')
        .eq('id', sessionId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
        .then(({ data }: { data: { stop_requested_at: string | null } | null }) => {
          if (data?.stop_requested_at && new Date(data.stop_requested_at) > turnStartedAt) {
            triggerAbort()
          }
        })
    }, STOP_POLL_INTERVAL_MS)
  }

  return { signal: controller.signal, stopPolling }
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
  const turnStartedAt = new Date()

  // Built up front, before any async work — so the poll is armed even if the
  // system-prompt/model-config Promise.all below hasn't settled yet.
  const { signal: abortSignal, stopPolling } = createServerAbortController(
    req.signal,
    sessionId,
    tenantId,
    turnStartedAt,
  )

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

  // Traffic Cop Phase 3a (Design Handovers/september_2026/
  // traffic_cop_design_2026-09-05.md §7): the system prompt is whatever
  // resolveTurnPrompt assembles. It derives isFirstTurn from req.messages
  // with the same rule this function used to apply inline (a non-empty
  // assistant turn means a later turn; an empty failed-attempt placeholder
  // does not count) and runs the same six resolvers, fail-open.
  const turnRequest: TurnContextRequest = {
    tenantId,
    sessionId,
    memberId,
    memberStatus: req.memberStatus ?? null,
    messages: req.messages,
    mode: req.mode ?? null,
    mediaItems: req.mediaItems ?? null,
    correlationId: null,
  }

  const [resolved, config] = await Promise.all([
    resolveTurnPrompt(turnRequest),
    resolveModelConfig(tenantId),
  ])

  const mediaContext = resolved.blocks.find(b => b.id === 'media')?.body ?? ''

  void logEvent({
    action: AuditAction.CHAT_MEDIA_CONTEXT_RESOLVED,
    tenant_id: tenantId,
    actor_type: memberId ? 'user' : 'anonymous',
    target_type: 'chat_session',
    target_id: sessionId,
    outcome: 'success',
    metadata: {
      clientSentItems: req.mediaItems?.length ?? 0,
      contextLength: mediaContext.length,
      hasAttached: mediaContext.includes('ATTACHED MEDIA'),
      hasFailed: mediaContext.includes('ATTACHMENT FAILED'),
      hasInProgress: mediaContext.includes('ATTACHMENT IN PROGRESS'),
    },
  })

  const memberDecision = resolved.injections.find(d => d.id === 'member-context')
  console.log('[chat] memberContext', memberDecision?.status === 'injected'
    ? `injected (isFirstTurn=${resolved.isFirstTurn})`
    : `not injected (${memberDecision?.status ?? 'unregistered'}${memberDecision?.reason ? `: ${memberDecision.reason}` : ''})`
  )

  const systemPrompt = resolved.system

  const messagesForModel = stripMediaMarkers(conversationMessages)

  // Shadow comparison, kept past cutover for observability (retired in
  // Phase 6). It re-runs the six legacy resolvers, rebuilds the retired
  // concatenation, and records whether `systemPrompt` still matches it
  // byte-for-byte — nothing it produces reaches the model. Started here so
  // it runs concurrently with the model stream rather than ahead of it;
  // settled in onFinish below, after the visitor already has the full
  // reply. runShadowTurn never rejects and caps itself at
  // SHADOW_TIMEOUT_MS — the .catch is belt-and-braces so a future edit to
  // it still cannot reach this turn.
  const shadow = runShadowTurn({
    request: turnRequest,
    resolved,
    ctx: { tenantId, sessionId, memberId, correlationId: null },
  }).catch((err: unknown) => {
    console.error('[chat] shadow run rejected — contract violation, real turn unaffected:', err)
    return null
  })

  try {
    return await runChatStream({
      config,
      system: systemPrompt,
      messages: messagesForModel,
      abortSignal,
      onFinish: async ({ text, usage }) => {
        // Normal completion — the poll never had anything to catch, so it's
        // still running and needs to be told to stop.
        stopPolling()
        if (tenantId) {
          await handleSessionFinish({ sessionId, tenantId, text, usage, visitorText: lastVisitorText, memberId })
        }
        // Settle the shadow run last: the stream has already closed and
        // session persistence is done, so this can only wait (≤ its own
        // cap), never delay anything the visitor sees, and never throw.
        await shadow
      },
    })
  } catch (error) {
    stopPolling()
    // The client stopped (poll-detected `stop_requested_at`, or — best
    // effort — req.signal itself) before the Anthropic call even started
    // streaming back, so abortSignal fired and streamText threw before
    // returning a Response. This is an expected, client-initiated
    // cancellation, not an upstream failure: log it quietly and skip the
    // "Upstream error" 502, which nothing is listening for anyway since the
    // client already closed its own fetch.
    if (isAbortError(error)) {
      console.log('[chat] streamChat aborted (stop detected before first response byte)')
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
