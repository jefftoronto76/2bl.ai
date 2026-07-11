// POST /api/platform/members/invite/resend
// Platform admin only. Regenerates the invite token for an existing 'invited'
// members row (identified by member_id). Returns the new token so the client
// can rebuild the invite URL. Also resets invite-tracking fields (opened_at,
// opens, revoked_at) and stamps a fresh expires_at so the new link starts clean.

import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { randomBytes } from 'crypto'
import { logEvent, logAuthEvent, AuditAction, AuthEventType } from '@/services/audit'
import { INVITE_TTL_DAYS } from '@/app/admin/members/constants'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    console.warn('[platform/members/invite/resend] 401 — no session')
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      outcome: 'failure',
      failure_reason: 'no_session',
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { path: '/api/platform/members/invite/resend' },
    })
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    console.warn('[platform/members/invite/resend] 403 — not platform admin', { providerUserId: user.providerUserId })
    void logAuthEvent({
      event_type: AuthEventType.ADMIN_ACCESS_FAILED,
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      failure_reason: 'not_platform_admin',
      ip_address: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { path: '/api/platform/members/invite/resend' },
    })
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  console.log('[platform/members/invite/resend] POST entry', { providerUserId: user.providerUserId, memberId: member_id })

  const supabase = getAdminClient()

  // Resolve actor's Supabase user id for audit attribution.
  const { data: actorRow } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', user.providerUserId)
    .maybeSingle()
  const actorId = (actorRow as { id: string } | null)?.id ?? null

  const newToken = randomBytes(24).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Allow 'waitlist' as well — sending an invite to a waitlist member promotes them to 'invited'.
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
    .in('status', ['invited', 'waitlist'])
    .select('id, token')
    .maybeSingle()

  if (error) {
    console.error('[platform/members/invite/resend] update failed:', error.message, { providerUserId: user.providerUserId, memberId: member_id })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_RESENT,
      actor_id: actorId,
      actor_type: 'user',
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      target_type: 'member',
      target_id: member_id,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: error.message },
    })
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    console.warn('[platform/members/invite/resend] member not found', { providerUserId: user.providerUserId, memberId: member_id })
    void logEvent({
      action: AuditAction.MEMBER_INVITE_RESENT,
      actor_id: actorId,
      actor_type: 'user',
      clerk_user_id: user.providerUserId,
      outcome: 'failure',
      target_type: 'member',
      target_id: member_id,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { error: 'not_found' },
    })
    return Response.json({ error: 'Member not found (must be invited or waitlist)' }, { status: 404 })
  }

  void logEvent({
    action: AuditAction.MEMBER_INVITE_RESENT,
    actor_id: actorId,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    outcome: 'success',
    target_type: 'member',
    target_id: (data as { id: string }).id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  console.log('[platform/members/invite/resend] success', { providerUserId: user.providerUserId, memberId: (data as { id: string }).id })

  return Response.json({ token: (data as { id: string; token: string }).token })
}
