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
   * either or both). Both temporarily land in the `email` column (no dedicated
   * phone column yet — future migration); when both are present, email wins.
   * Optional: the jefflougheed PATCH path never sends them.
   */
  phone?: unknown
  email?: unknown
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
    .select('id, messages, updated_at, visitor_name')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
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
  const { messages, visitorName, phone, email } = input
  const supabase = getAdminClient('[sessions/[id]/route]')

  // Only write visitor_name when the client sends a non-empty string. The
  // server-side name extractor in /api/sage may have already populated it
  // from Sage's response, and client PATCHes still send `visitorName: null`
  // until front-end name capture lands — so unconditionally writing would
  // clobber the server's value.
  const trimmedName = typeof visitorName === 'string' ? visitorName.trim() : ''
  // Contact card → email column (temporary reuse, no phone column yet). The
  // visitor may supply phone, email, or both; email wins when both are present.
  const trimmedPhone = typeof phone === 'string' ? phone.trim() : ''
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  const contactValue = trimmedEmail.length > 0 ? trimmedEmail : trimmedPhone

  // Build the update with only the fields actually supplied, so a contact-only
  // PATCH (contact value, no messages) never clobbers the persisted transcript.
  const update: {
    updated_at: string
    status: 'in_progress'
    messages?: unknown
    visitor_name?: string
    email?: string
  } = {
    updated_at: new Date().toISOString(),
    status: 'in_progress',
  }
  if (messages !== undefined) update.messages = messages
  if (trimmedName.length > 0) update.visitor_name = trimmedName
  if (contactValue.length > 0) update.email = contactValue

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
