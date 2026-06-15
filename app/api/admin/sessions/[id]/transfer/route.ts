import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { transferSessions } from '@/services/crm/sessions'
import { logEvent, AuditAction } from '@/services/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const correlationId = req.headers.get('x-correlation-id')

  let authCtx: Awaited<ReturnType<typeof getAuthContext>>
  try {
    authCtx = await getAuthContext()
  } catch {
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      actor_type: 'anonymous',
      target_type: 'session',
      target_id: id,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: { reason: 'unauthorized' },
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_type: 'user',
      target_type: 'session',
      target_id: id,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: { reason: 'invalid_json' },
    })
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).target_user_id !== 'string'
  ) {
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_type: 'user',
      target_type: 'session',
      target_id: id,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: { reason: 'missing_target_user_id' },
    })
    return NextResponse.json({ error: 'target_user_id (string) required' }, { status: 400 })
  }

  const { target_user_id } = body as { target_user_id: string }

  // Verify target user exists and is active (prevents IDOR / orphaned sessions)
  const supabase = getAdminClient()
  const { data: targetUser, error: userLookupError } = await supabase
    .from('users')
    .select('id, name, email, status')
    .eq('id', target_user_id)
    .eq('status', 'active')
    .maybeSingle()

  if (userLookupError) {
    console.error('[sessions/[id]/transfer] user lookup error:', userLookupError.message)
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_type: 'user',
      target_type: 'session',
      target_id: id,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: { reason: 'user_lookup_error', target_user_id, error: userLookupError.message },
    })
    return NextResponse.json({ error: 'Failed to verify target user' }, { status: 500 })
  }

  if (!targetUser) {
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_type: 'user',
      target_type: 'session',
      target_id: id,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: { reason: 'target_user_not_found_or_inactive', target_user_id },
    })
    return NextResponse.json({ error: 'Target user not found or not active' }, { status: 404 })
  }

  const result = await transferSessions(authCtx.tenant_id, [id], target_user_id)

  if (!result.ok) {
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_type: 'user',
      target_type: 'session',
      target_id: id,
      outcome: 'failure',
      correlation_id: correlationId,
      metadata: { reason: 'transfer_failed', target_user_id, error: result.error },
    })
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })
  }

  for (const session of result.data.sessions) {
    void logEvent({
      action: AuditAction.CHAT_SESSION_TRANSFERRED,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      actor_type: 'user',
      target_type: 'session',
      target_id: session.id,
      outcome: 'success',
      correlation_id: correlationId,
      changes: {
        before: { user_id: session.prev_user_id },
        after: { user_id: target_user_id },
      },
      metadata: { target_user_id },
    })
  }

  console.log(
    `[sessions/[id]/transfer] session=${id} → user_id=${target_user_id} tenant=${authCtx.tenant_id}`,
  )
  return NextResponse.json({ ok: true })
}
