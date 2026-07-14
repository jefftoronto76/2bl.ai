// services/crm/feedback.ts
//
// message_feedback writes/reads — the thumbs-up/down rating + reason chips +
// note captured by MessageActions/FeedbackPopover (components/chat/). Mirrors
// services/crm/sessions.ts's shape: a local service-role client (kept local
// rather than the shared services/auth factory, to match that file's env-check
// logging convention), a discriminated FeedbackResult, and every write/read
// scoped by BOTH session_id AND host-derived tenant_id — the same cross-tenant
// IDOR guard updateSession uses. The app/api/sessions/[id]/feedback/route.ts
// handler is a thin consumer: tenant + member resolution, request parsing, and
// HTTP response mapping only.

import { createClient } from '@supabase/supabase-js'
import { getCurrentUserId } from '@/services/auth'

function getAdminClient(label: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log(`${label} env check — url present:`, !!url, '| service key present:', !!key)
  return createClient(url!, key!)
}

export type FeedbackResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface MessageFeedbackRow {
  message_index: number
  rating: 'up' | 'down' | null
  tags: string[]
  detail: string | null
}

export interface UpsertFeedbackInput {
  messageIndex: number
  rating: 'up' | 'down' | null
  tags?: string[]
  detail?: string | null
  /** Supabase members.id, already resolved by resolveMemberId — null for an
   *  anonymous jefflougheed visitor (no members table concept there). */
  memberId: string | null
}

/**
 * Resolves the acting member's Supabase `members.id` for this write. Prefers
 * the server-verified identity (Clerk session -> users.id -> members row for
 * this tenant) over the client-supplied id, and only falls back to the
 * client-supplied value when there is no Clerk session — the same
 * convenience-not-trust posture chatStore's getMemberId already uses for the
 * pre-auth invite-holder path (services/chat/ui/v1/core/useChatSession.ts).
 * A thumbs rating is low-stakes (not an identity- or payment-critical write),
 * so this mirrors the trust model the rest of this route family already
 * uses (e.g. the transcript PATCH accepts a client-supplied visitorName
 * without re-verification) rather than introducing a stricter one here.
 */
export async function resolveMemberId(
  tenantId: string,
  clientMemberId: string | null,
): Promise<string | null> {
  // Wrapped in try/catch: unlike PATCH/DELETE /api/sessions/[id] (pure
  // Host-header tenant resolution, no Clerk touch at all), this is the one
  // path in the feedback route that reaches into Clerk — and it runs
  // unconditionally, including for fully anonymous jefflougheed widget
  // visitors. If auth() ever throws for that anonymous-request shape (rather
  // than cleanly resolving to no session), the exception must not surface as
  // an uncaught 500 — it's just another way of having "no server-verified
  // identity", the same case the null-userId branch below already handles.
  let userId: string | null
  try {
    userId = await getCurrentUserId()
  } catch (err) {
    console.error('[sessions/feedback resolveMemberId] getCurrentUserId threw:', err)
    return clientMemberId
  }
  if (!userId) return clientMemberId

  const supabase = getAdminClient('[sessions/feedback resolveMemberId]')
  const { data, error } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    console.error('[sessions/feedback resolveMemberId] lookup error:', JSON.stringify(error))
    return clientMemberId
  }
  return data?.id ?? clientMemberId
}

/**
 * Upserts a message_feedback row keyed on (session_id, message_index).
 * `rating: null` clears the rating along with tags/detail — the toggle-off
 * case (re-tapping the already-active thumb).
 */
export async function upsertFeedback(
  tenantId: string,
  sessionId: string,
  input: UpsertFeedbackInput,
): Promise<FeedbackResult<null>> {
  const supabase = getAdminClient('[sessions/feedback]')

  // The session must belong to this tenant — same cross-tenant guard as
  // updateSession (services/crm/sessions.ts): a cross-tenant id simply
  // matches no row rather than leaking a 403 that would confirm it exists.
  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (sessionError) {
    console.error('[sessions/feedback] session lookup error:', JSON.stringify(sessionError))
    return { ok: false, status: 500, error: sessionError.message }
  }
  if (!session) {
    console.warn('[sessions/feedback] no session matched id + tenant:', { sessionId, tenantId })
    return { ok: false, status: 404, error: 'Session not found' }
  }

  const row = {
    session_id: sessionId,
    tenant_id: tenantId,
    member_id: input.memberId,
    message_index: input.messageIndex,
    rating: input.rating,
    tags: input.rating === null ? [] : input.tags ?? [],
    detail: input.rating === null ? null : input.detail ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('message_feedback')
    .upsert(row, { onConflict: 'session_id,message_index' })

  if (error) {
    console.error('[sessions/feedback] upsert error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  console.log(
    '[sessions/feedback] upserted:',
    { sessionId, messageIndex: input.messageIndex, rating: input.rating, memberId: input.memberId },
  )
  return { ok: true, data: null }
}

/**
 * Lists all feedback rows for a session, tenant-scoped. Used to hydrate the
 * thumbs/rating state on mount so a reloaded conversation shows previously-
 * set ratings.
 */
export async function listFeedback(
  tenantId: string,
  sessionId: string,
): Promise<FeedbackResult<MessageFeedbackRow[]>> {
  const supabase = getAdminClient('[sessions/feedback GET]')

  const { data, error } = await supabase
    .from('message_feedback')
    .select('message_index, rating, tags, detail')
    .eq('session_id', sessionId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[sessions/feedback GET] list error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: (data ?? []) as MessageFeedbackRow[] }
}
