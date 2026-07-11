// POST /api/admin/members/invite/resend
// Tenant-admin scoped. Regenerates the invite token for a member that belongs to the
// authenticated admin's tenant. Promotes waitlist → invited on resend. The tenant_id
// guard prevents a tenant admin from regenerating invites for another tenant. Also
// resets invite-tracking fields (opened_at, opens, revoked_at) and stamps a fresh
// expires_at so the new link starts clean.

import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { randomBytes } from 'crypto'
import { logEvent, AuditAction } from '@/services/audit'
import { INVITE_TTL_DAYS } from '@/app/admin/members/constants'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.warn('[admin/members/invite/resend] 401 — auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { owner_id: actorId, tenant_id: tenantId } = authCtx

  let body: { member_id?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { member_id } = body
  if (!member_id) {
    return Response.json({ error: 'member_id is required' }, { status: 400 })
  }

  console.log('[admin/members/invite/resend] POST entry', { actorId, tenantId, memberId: member_id })

  const supabase = getAdminClient()
  const newToken = randomBytes(24).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Scope update to the admin's own tenant to prevent cross-tenant token regeneration.
  // Resets tracking fields so the new link starts with a clean lifecycle.
  const { data, error } = await supabase
    .from('members')
    .update({
      token: newToken,
      status: 'invited',
      used_at: null,
      opened_at: null,
      opens: 0,
      revoked_at: null,
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    })
    .eq('id', member_id)
    .eq('tenant_id', tenantId)
    .in('status', ['invited', 'waitlist'])
    .select('id, token')
    .maybeSingle()

  if (error) {
    console.error('[admin/members/invite/resend] update failed:', error.message, { actorId, tenantId, memberId: member_id })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_RESENT,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: 'user',
      outcome: 'failure',
      target_type: 'member',
      target_id: member_id,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: error.message },
    })
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    console.warn('[admin/members/invite/resend] member not found or wrong tenant', { tenantId, memberId: member_id })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_RESENT,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: 'user',
      outcome: 'failure',
      target_type: 'member',
      target_id: member_id,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: 'not_found_or_wrong_tenant' },
    })
    return Response.json({ error: 'Member not found (must be invited or waitlist in your tenant)' }, { status: 404 })
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_RESENT,
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'user',
    outcome: 'success',
    target_type: 'member',
    target_id: (data as { id: string }).id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  console.log('[admin/members/invite/resend] success', { actorId, tenantId, memberId: (data as { id: string }).id })

  return Response.json({ token: (data as { id: string; token: string }).token })
}
