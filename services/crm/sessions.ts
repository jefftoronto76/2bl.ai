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

/** POST /api/sessions — create a new prospect session for the tenant. */
export async function createSession(tenantId: string): Promise<SessionResult<{ id: string }>> {
  const supabase = getAdminClient('[sessions/route]')

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      tenant_id: tenantId,
      messages: [],
      status: 'active',
      session_type: 'prospect',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sessions/route] insert error:', JSON.stringify(error))
    return { ok: false, status: 500, error: error.message }
  }

  console.log('[sessions/route] created session:', data.id, '| tenant_id:', tenantId)
  return { ok: true, data: { id: data.id } }
}

export interface SessionUpdateInput {
  messages: unknown
  visitorName: unknown
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
  const { messages, visitorName } = input
  const supabase = getAdminClient('[sessions/[id]/route]')

  // Only write visitor_name when the client sends a non-empty string. The
  // server-side name extractor in /api/sage may have already populated it
  // from Sage's response, and client PATCHes still send `visitorName: null`
  // until front-end name capture lands — so unconditionally writing would
  // clobber the server's value.
  const trimmedName = typeof visitorName === 'string' ? visitorName.trim() : ''
  const baseUpdate = {
    messages,
    updated_at: new Date().toISOString(),
    status: 'in_progress' as const,
  }
  const update = trimmedName.length > 0
    ? { ...baseUpdate, visitor_name: trimmedName }
    : baseUpdate

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
