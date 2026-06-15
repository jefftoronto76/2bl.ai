// services/crm/sessions.ts
//
// Anonymous visitor session writes (create + update). The one justified
// server-role use: the tenant is always derived from the Host header in the
// route and never trusted from the client, and every write is scoped by both
// id AND tenant_id so a visitor on tenant A can never touch tenant B's session
// (cross-tenant IDOR). The app/api/sessions/* route handlers are thin
// consumers — tenant resolution, request parsing, and HTTP response mapping
// only. Logic moved verbatim from those routes — behavior unchanged.

import { createClient } from '@supabase/supabase-js'

// Local service-role client. Kept here (rather than @/services/auth's shared
// factory) to preserve the routes' env-check logging verbatim; centralizing on
// services/auth would drop those debug logs, which is a separate change.
function getAdminClient(label: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log(`${label} env check — url present:`, !!url, '| service key present:', !!key)
  return createClient(url!, key!)
}

export type SessionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

/**
 * POST /api/sessions — create a new prospect session for the tenant. When a
 * signed-in user's id is supplied it is linked via `user_id`, making the
 * session recoverable across devices; anonymous creates leave `user_id` null
 * (unchanged behavior).
 */
export async function createSession(
  tenantId: string,
  userId?: string | null,
): Promise<SessionResult<{ id: string }>> {
  const supabase = getAdminClient('[sessions/route]')

  const row: {
    tenant_id: string
    messages: never[]
    status: string
    session_type: string
    user_id?: string
  } = {
    tenant_id: tenantId,
    messages: [],
    status: 'active',
    session_type: 'prospect',
  }
  if (userId) row.user_id = userId

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error('[sessions/route] insert error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[sessions/route] created session:', data.id, '| tenant_id:', tenantId, '| user_id:', userId ?? null)
  return { ok: true, data: { id: data.id } }
}

export interface SessionUpdateInput {
  messages: unknown
  visitorName: unknown
  /**
   * Visitor phone + email from the Heirloom contact card (visitor provides
   * either or both). Each writes to its own column (`chat_sessions.phone` /
   * `chat_sessions.email`); only non-empty values are written. Optional: the
   * jefflougheed PATCH path never sends them.
   */
  phone?: unknown
  email?: unknown
  /** AI-generated or user-set session title. Written only when non-empty. */
  title?: unknown
  /** User-set star flag. Written only when a boolean is supplied. */
  starred?: unknown
}

/**
 * A chat session row for the signed-in recovery + Recent list. `messages` is
 * opaque jsonb at this layer (the Heirloom client narrows it to its own message
 * shape and revives timestamps) — the CRM service stays agnostic of the UI's
 * message type, so it must not depend on app/heirloom.
 */
export interface ChatSessionSummary {
  id: string
  messages: unknown
  updated_at: string
  visitor_name: string | null
  title: string | null
  starred: boolean
}

/**
 * GET /api/sessions — list a signed-in user's sessions for this tenant, newest
 * first. Scoped by BOTH user_id AND the host-derived tenant_id, so a user can
 * only ever see their own sessions on the current tenant. Backs cross-device
 * recovery and the Recent sidebar.
 */
export async function listSessions(
  tenantId: string,
  userId: string,
): Promise<SessionResult<ChatSessionSummary[]>> {
  const supabase = getAdminClient('[sessions/route GET]')

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, messages, updated_at, visitor_name, title, starred')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[sessions/route GET] list error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[sessions/route GET] listed sessions:', data?.length ?? 0, '| user_id:', userId, '| tenant_id:', tenantId)
  return { ok: true, data: (data ?? []) as ChatSessionSummary[] }
}

/**
 * PATCH /api/sessions/[id] — persist the visitor's messages (and visitor_name
 * when the client sends a non-empty one) and mark the session in_progress. The
 * write is scoped by BOTH id and the host-derived tenant_id; a session that
 * belongs to another tenant simply matches no row → 404, so the endpoint can't
 * be used to probe or mutate other tenants' sessions.
 */
export async function updateSession(
  tenantId: string,
  id: string,
  input: SessionUpdateInput,
): Promise<SessionResult<null>> {
  const supabase = getAdminClient('[sessions/[id]/route]')

  // Only write visitor_name when the client sends a non-empty string. The
  // server-side name extractor in /api/sage may have already populated it
  // from Sage's response, and client PATCHes still send `visitorName: null`
  // until front-end name capture lands — so unconditionally writing would
  // clobber the server's value.
  const { messages, visitorName, phone, email, title, starred } = input
  const trimmedName = typeof visitorName === 'string' ? visitorName.trim() : ''
  // Contact card → dedicated columns. The visitor may supply phone, email, or
  // both; each non-empty value writes to its own column (no more funneling
  // phone into email).
  const trimmedPhone = typeof phone === 'string' ? phone.trim() : ''
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  const trimmedTitle = typeof title === 'string' ? title.trim() : ''

  // Build the update with only the fields actually supplied, so a contact-only
  // PATCH (contact value, no messages) never clobbers the persisted transcript.
  const update: {
    updated_at: string
    status: 'in_progress'
    messages?: unknown
    visitor_name?: string
    phone?: string
    email?: string
    title?: string
    starred?: boolean
  } = {
    updated_at: new Date().toISOString(),
    status: 'in_progress',
  }
  if (messages !== undefined) update.messages = messages
  if (trimmedName.length > 0) update.visitor_name = trimmedName
  if (trimmedPhone.length > 0) update.phone = trimmedPhone
  if (trimmedEmail.length > 0) update.email = trimmedEmail
  if (trimmedTitle.length > 0) update.title = trimmedTitle
  if (typeof starred === 'boolean') update.starred = starred

  const { data, error } = await supabase
    .from('chat_sessions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')

  if (error) {
    console.error('[sessions/[id]/route] update error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  if (!data || data.length === 0) {
    console.warn('[sessions/[id]/route] no session matched id + tenant:', { id, tenant_id: tenantId })
    return { ok: false, status: 404, error: 'Session not found' }
  }

  console.log('[sessions/[id]/route] updated session:', id, '| tenant_id:', tenantId)
  return { ok: true, data: null }
}

export interface TransferSessionRow {
  id: string
  prev_user_id: string | null
}

/**
 * PATCH /api/admin/sessions/transfer — bulk-reassign chat_sessions.user_id to a
 * new owner. Scoped by tenant_id so only the caller's sessions are touched.
 * Returns the before-state rows so the route can emit per-session audit events.
 */
export async function transferSessions(
  tenantId: string,
  sessionIds: string[],
  targetUserId: string,
): Promise<SessionResult<{ transferred: number; sessions: TransferSessionRow[] }>> {
  const supabase = getAdminClient('[sessions/transfer]')

  // Capture before-state + enforce tenant scope (cross-tenant IDs simply won't match)
  const { data: before, error: selectError } = await supabase
    .from('chat_sessions')
    .select('id, user_id')
    .in('id', sessionIds)
    .eq('tenant_id', tenantId)

  if (selectError) {
    console.error('[sessions/transfer] select error:', JSON.stringify(selectError))
    return { ok: false, status: 500, error: selectError.message }
  }

  const found = (before ?? []) as Array<{ id: string; user_id: string | null }>
  if (found.length === 0) {
    return { ok: false, status: 404, error: 'No matching sessions found' }
  }

  const eligibleIds = found.map((s) => s.id)

  const { error: updateError } = await supabase
    .from('chat_sessions')
    .update({ user_id: targetUserId })
    .in('id', eligibleIds)
    .eq('tenant_id', tenantId)

  if (updateError) {
    console.error('[sessions/transfer] update error:', JSON.stringify(updateError))
    return { ok: false, status: 500, error: updateError.message }
  }

  console.log(
    '[sessions/transfer] transferred',
    eligibleIds.length,
    'sessions → user_id:',
    targetUserId,
    '| tenant_id:',
    tenantId,
  )
  return {
    ok: true,
    data: {
      transferred: eligibleIds.length,
      sessions: found.map((s) => ({ id: s.id, prev_user_id: s.user_id })),
    },
  }
}

/**
 * POST /api/sessions/[id]/claim — link an anonymous session to a now-signed-in
 * user. The `userId` is resolved server-side from the Clerk session (never a
 * client-supplied value), and the write is scoped by `id` + host-derived
 * `tenant_id`. Idempotent: re-claiming a session the same user already owns is a
 * no-op; a session owned by a different user is refused (403); unowned sessions
 * are claimed.
 */
export async function claimSession(
  tenantId: string,
  id: string,
  userId: string,
): Promise<SessionResult<null>> {
  const supabase = getAdminClient('[sessions/[id]/claim]')

  const { data: existing, error: selectError } = await supabase
    .from('chat_sessions')
    .select('user_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (selectError) {
    console.error('[sessions/[id]/claim] select error:', JSON.stringify(selectError))
    return { ok: false, status: 500, error: selectError.message }
  }
  if (!existing) {
    console.warn('[sessions/[id]/claim] no session matched id + tenant:', { id, tenant_id: tenantId })
    return { ok: false, status: 404, error: 'Session not found' }
  }
  if (existing.user_id && existing.user_id !== userId) {
    console.warn('[sessions/[id]/claim] session owned by another user:', { id })
    return { ok: false, status: 403, error: 'Session already claimed' }
  }
  if (existing.user_id === userId) {
    return { ok: true, data: null }
  }

  const { error: updateError } = await supabase
    .from('chat_sessions')
    .update({ user_id: userId })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('user_id', null)

  if (updateError) {
    console.error('[sessions/[id]/claim] update error:', JSON.stringify(updateError))
    return { ok: false, status: 500, error: updateError.message }
  }

  console.log('[sessions/[id]/claim] claimed session:', id, '| user_id:', userId)
  return { ok: true, data: null }
}

/**
 * DELETE /api/sessions/[id] — soft-delete a session by setting status to
 * 'deleted'. Scoped by id + host-derived tenant_id. The session is excluded
 * from listSessions() queries (which filter .neq('status', 'deleted')) so it
 * disappears from the Recent sidebar and cross-device recovery immediately.
 */
export async function softDeleteSession(
  tenantId: string,
  id: string,
): Promise<SessionResult<null>> {
  const supabase = getAdminClient('[sessions/[id]/route DELETE]')

  const { data, error } = await supabase
    .from('chat_sessions')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')

  if (error) {
    console.error('[sessions/[id]/route DELETE] update error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  if (!data || data.length === 0) {
    console.warn('[sessions/[id]/route DELETE] no session matched id + tenant:', { id, tenant_id: tenantId })
    return { ok: false, status: 404, error: 'Session not found' }
  }

  console.log('[sessions/[id]/route DELETE] soft-deleted session:', id, '| tenant_id:', tenantId)
  return { ok: true, data: null }
}
